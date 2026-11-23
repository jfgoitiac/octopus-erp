"""Audita y repara saldos demostrables desde AplicacionPago.

Dry-run por defecto. ``--confirm`` solo incrementa ``monto_pagado`` cuando la
suma de aplicaciones activas demuestra un abono mayor al acumulado actual, o
sincroniza el booleano ``pagado`` con un saldo ya cubierto. Nunca reduce saldos
ni inventa la distribución de pagos históricos sin aplicaciones.
"""
from collections import defaultdict
import csv
from decimal import Decimal
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from cobranza.models import AplicacionPago, Pago


ZERO = Decimal('0.00')


class Command(BaseCommand):
    help = 'Audita y sincroniza deudas usando aplicaciones de pago inequívocas.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm', action='store_true',
            help='Aplica reparaciones seguras. Sin esta opción solo informa.',
        )
        parser.add_argument(
            '--output',
            help='Ruta opcional de un CSV con casos REPARABLE/REVISAR.',
        )

    def handle(self, *args, **options):
        confirmar = options['confirm']
        acumulados = defaultdict(lambda: ZERO)
        aplicaciones = AplicacionPago.objects.filter(
            anulada_en__isnull=True,
        ).select_related('content_type').order_by('content_type_id', 'object_id', 'id')

        for aplicacion in aplicaciones.iterator():
            clave = (aplicacion.content_type_id, aplicacion.object_id)
            acumulados[clave] += aplicacion.monto_abonado_usd + aplicacion.monto_ajuste_usd

        reparables = []
        ambiguas = []
        reporte = []
        correctas = 0
        for (content_type_id, object_id), demostrado in acumulados.items():
            aplicacion = AplicacionPago.objects.filter(
                content_type_id=content_type_id, object_id=object_id,
            ).select_related('content_type').first()
            modelo = aplicacion.content_type.model_class() if aplicacion else None
            if modelo is None or not hasattr(modelo, 'monto_pagado'):
                ambiguas.append((content_type_id, object_id, 'modelo no reparable'))
                continue
            deuda = modelo.objects.filter(pk=object_id).first()
            if deuda is None:
                ambiguas.append((content_type_id, object_id, 'deuda eliminada'))
                continue

            actual = deuda.monto_pagado or ZERO
            objetivo = min(deuda.monto_usd or ZERO, demostrado)
            flag_esperado = (deuda.monto_usd or ZERO) <= ZERO or actual >= deuda.monto_usd
            if deuda.pagado and not flag_esperado:
                # Compatibilidad histórica: un True con monto_pagado menor
                # puede representar un pago legado anterior al libro auxiliar.
                # Nunca se degrada automáticamente a pendiente.
                ambiguas.append((content_type_id, object_id, 'pagado=True con acumulado menor al nominal'))
            elif objetivo > actual or (flag_esperado and not deuda.pagado):
                reparables.append((deuda, actual, objetivo, demostrado))
                reporte.append({
                    'clasificacion': 'REPARABLE', 'pago_id': '', 'factura_id': '',
                    'operacion_uuid': '', 'deuda': f'{deuda._meta.label}#{deuda.pk}',
                    'monto_recibido_usd': '', 'monto_aplicado_usd': str(demostrado),
                    'saldo_almacenado_usd': str((deuda.monto_usd or ZERO) - actual),
                    'motivo': 'Aplicaciones activas superan el monto_pagado almacenado',
                })
            elif demostrado < actual:
                # Puede haber pagos históricos anteriores a AplicacionPago. No
                # se reduce automáticamente porque perderíamos dinero aplicado.
                ambiguas.append((content_type_id, object_id, 'acumulado actual supera aplicaciones'))
            else:
                correctas += 1

        # Auditoría histórica por operación. El M2M prueba que una deuda
        # participó, pero no cuánto recibió; si falta AplicacionPago se lista
        # para revisión manual y jamás se repara adivinando una distribución.
        operaciones_revisadas = set()
        pagos = Pago.objects.filter(estatus='completado').order_by('operacion_uuid', 'id')
        for pago in pagos.iterator():
            clave_operacion = pago.operacion_uuid or f'pago:{pago.id}'
            if clave_operacion in operaciones_revisadas:
                continue
            operaciones_revisadas.add(clave_operacion)
            hermanos = list(Pago.objects.filter(
                operacion_uuid=pago.operacion_uuid,
            ).order_by('id')) if pago.operacion_uuid else [pago]
            principal = hermanos[0]
            ids_pagos = [p.id for p in hermanos]
            aplicaciones_op = AplicacionPago.objects.filter(
                pago_id__in=ids_pagos, anulada_en__isnull=True,
            )
            aplicado = sum(
                (a.monto_abonado_usd for a in aplicaciones_op), ZERO
            )
            recargos = sum(
                (r.monto_usd for r in principal.lineas_recargo.all()), ZERO
            )
            recibido = sum((p.monto_usd for p in hermanos), ZERO)
            # Ambos campos representan el mismo monto en monedas distintas;
            # se toma el mayor equivalente, igual que en RegistrarPagoView.
            # Esto evita falsos descuadres en operaciones históricas que solo
            # guardaron la contrapartida en bolívares.
            vuelto = sum((
                max(
                    p.vuelto_usd or ZERO,
                    ((p.vuelto_ves or ZERO) / p.tasa_aplicada).quantize(Decimal('0.01'))
                    if p.tasa_aplicada else ZERO,
                ) for p in hermanos
            ), ZERO)
            excedente = sum((
                max(
                    p.excedente_usd or ZERO,
                    ((p.excedente_ves or ZERO) / p.tasa_aplicada).quantize(Decimal('0.01'))
                    if p.tasa_aplicada else ZERO,
                ) for p in hermanos
            ), ZERO)
            diferencia = (recibido - vuelto) - (aplicado + recargos + excedente)
            disponible_sin_aplicar = diferencia
            tolerancia = Decimal('0.01') + Decimal('0.005') * len(hermanos)

            if aplicaciones_op.exists() and abs(diferencia) > tolerancia:
                motivo = (
                    f'Operación descuadrada: diferencia {diferencia:+.2f} USD '
                    f'(recibido={recibido}, aplicado={aplicado}, recargos={recargos}, '
                    f'excedente={excedente}, vuelto={vuelto})'
                )
                ambiguas.append(('', principal.id, motivo))
                reporte.append({
                    'clasificacion': 'REVISAR', 'pago_id': principal.id,
                    'factura_id': principal.factura_id,
                    'operacion_uuid': str(principal.operacion_uuid or ''), 'deuda': '',
                    'monto_recibido_usd': str(recibido - vuelto),
                    'monto_aplicado_usd': str(aplicado + recargos),
                    'saldo_almacenado_usd': '', 'motivo': motivo,
                })

            deudas_m2m = []
            for campo in (
                'mensualidades_pagadas', 'cuotas_inscripcion_pagadas',
                'cuotas_solvencia_pagadas', 'proyectos_inversion_pagados',
            ):
                deudas_m2m.extend(list(getattr(principal, campo).all()))
            deudas_vinculadas = ' | '.join(
                f'{deuda._meta.label}#{deuda.pk}' for deuda in deudas_m2m
            )
            deudas_estado = ' | '.join(
                (
                    f'{deuda._meta.label}#{deuda.pk}:'
                    f'nominal=${deuda.monto_usd or ZERO},'
                    f'pagado=${deuda.monto_pagado or ZERO},'
                    f'saldo=${max((deuda.monto_usd or ZERO) - (deuda.monto_pagado or ZERO), ZERO)},'
                    f'estado={"PAGADA" if deuda.pagado else "ABIERTA"}'
                )
                for deuda in deudas_m2m
            )
            pagos_relacionados_deudas = ' | '.join(
                (
                    f'{deuda._meta.label}#{deuda.pk}=>['
                    + ';'.join(
                        f'pago#{rel.pk}/factura={rel.factura_id or "N/A"}/monto=${rel.monto_usd}'
                        for rel in deuda.pagos.filter(estatus='completado').order_by('fecha_pago', 'id')
                    )
                    + ']'
                )
                for deuda in deudas_m2m
            )
            aplicaciones_existentes = ' | '.join(
                f'{a.content_type.app_label}.{a.content_type.model}#{a.object_id}=${a.monto_abonado_usd}'
                for a in aplicaciones_op.select_related('content_type')
            )
            aplicaciones_claves = set(
                aplicaciones_op.values_list('content_type_id', 'object_id')
            )
            for deuda in deudas_m2m:
                from django.contrib.contenttypes.models import ContentType
                ct_id = ContentType.objects.get_for_model(
                    deuda, for_concrete_model=False,
                ).id
                if (ct_id, deuda.pk) in aplicaciones_claves:
                    continue
                if getattr(deuda, 'pagado', False):
                    continue
                motivo = 'Pago/recibo enlazado a deuda abierta sin AplicacionPago; distribución ambigua'
                ambiguas.append((ct_id, deuda.pk, motivo))
                reporte.append({
                    'clasificacion': 'REVISAR', 'pago_id': principal.id,
                    'factura_id': principal.factura_id,
                    'operacion_uuid': str(principal.operacion_uuid or ''),
                    'deuda': f'{deuda._meta.label}#{deuda.pk}',
                    'monto_recibido_usd': str(recibido - vuelto),
                    'monto_aplicado_usd': '',
                    'saldo_almacenado_usd': str(
                        (deuda.monto_usd or ZERO) - (deuda.monto_pagado or ZERO)
                    ),
                    'motivo': motivo,
                    'alumno_id': principal.alumno_id,
                    'alumno': str(principal.alumno),
                    'representante': principal.representante_nombre or '',
                    'representante_documento': principal.representante_documento or '',
                    'fecha_pago': principal.fecha_pago.isoformat(),
                    'metodos_pago': ' | '.join(
                        f'{p.metodo_pago}=${p.monto_usd}' for p in hermanos
                    ),
                    'referencias': ' | '.join(
                        f'{p.metodo_pago}:{p.referencia or "SIN-REFERENCIA"}' for p in hermanos
                    ),
                    'total_operacion_usd': str(recibido),
                    'total_aplicado_existente_usd': str(aplicado),
                    'recargos_usd': str(recargos),
                    'excedente_usd': str(excedente),
                    'vuelto_usd': str(vuelto),
                    'disponible_sin_aplicar_usd': str(disponible_sin_aplicar),
                    'deudas_vinculadas': deudas_vinculadas,
                    'deudas_estado': deudas_estado,
                    'pagos_relacionados_deudas': pagos_relacionados_deudas,
                    'aplicaciones_existentes': aplicaciones_existentes,
                })

        self.stdout.write(
            f'Modo: {"APLICAR" if confirmar else "DRY-RUN"} | '
            f'correctas={correctas} reparables={len(reparables)} ambiguas={len(ambiguas)}'
        )
        for deuda, actual, objetivo, demostrado in reparables:
            self.stdout.write(
                f'REPARABLE {deuda._meta.label}#{deuda.pk}: '
                f'monto_pagado {actual} -> {max(actual, objetivo)} '
                f'(aplicaciones activas={demostrado})'
            )
        for content_type_id, object_id, motivo in ambiguas[:100]:
            self.stdout.write(
                f'REVISAR content_type={content_type_id} objeto={object_id}: {motivo}'
            )

        if confirmar and reparables:
            with transaction.atomic():
                alumnos_sincronizar = set()
                for deuda, actual, objetivo, _ in reparables:
                    if objetivo > actual:
                        deuda.monto_pagado = objetivo
                    # Fuerza la derivación canónica del modelo; en modelos con
                    # compatibilidad legado hay que limpiar primero un True
                    # incorrecto para que save() no convierta un parcial en total.
                    deuda.pagado = (deuda.monto_usd or ZERO) <= ZERO or deuda.monto_pagado >= deuda.monto_usd
                    if deuda.pagado and hasattr(deuda, 'fecha_pago') and not deuda.fecha_pago:
                        ultima = AplicacionPago.objects.filter(
                            content_type__model=deuda._meta.model_name,
                            object_id=deuda.pk, anulada_en__isnull=True,
                        ).select_related('pago').order_by('-pago__fecha_pago').first()
                        if ultima:
                            deuda.fecha_pago = ultima.pago.fecha_pago
                    deuda.save()
                    if getattr(deuda, 'alumno_id', None):
                        alumnos_sincronizar.add(deuda.alumno_id)
                if alumnos_sincronizar:
                    from secretaria.models import Alumno
                    from cobranza.mora import sincronizar_estatus_alumno
                    for alumno in Alumno.objects.filter(id__in=alumnos_sincronizar):
                        sincronizar_estatus_alumno(alumno)
            self.stdout.write(self.style.SUCCESS(f'Reparadas {len(reparables)} deudas.'))
        elif not confirmar:
            self.stdout.write('No se modificó nada. Use --confirm para aplicar solo las reparaciones listadas.')

        if options.get('output'):
            ruta = Path(options['output']).resolve()
            ruta.parent.mkdir(parents=True, exist_ok=True)
            campos = [
                'clasificacion', 'pago_id', 'factura_id', 'operacion_uuid',
                'deuda', 'monto_recibido_usd', 'monto_aplicado_usd',
                'saldo_almacenado_usd', 'motivo', 'alumno_id', 'alumno',
                'representante', 'representante_documento', 'fecha_pago',
                'metodos_pago', 'referencias', 'total_operacion_usd',
                'total_aplicado_existente_usd', 'recargos_usd',
                'excedente_usd', 'vuelto_usd', 'disponible_sin_aplicar_usd',
                'deudas_vinculadas', 'deudas_estado',
                'pagos_relacionados_deudas', 'aplicaciones_existentes',
            ]
            with ruta.open('w', newline='', encoding='utf-8-sig') as archivo:
                escritor = csv.DictWriter(archivo, fieldnames=campos)
                escritor.writeheader()
                escritor.writerows(reporte)
            self.stdout.write(self.style.SUCCESS(f'Reporte CSV: {ruta}'))
