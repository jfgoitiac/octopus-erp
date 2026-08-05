from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.parsers import MultiPartParser
from rest_framework import viewsets
from django.db import transaction
from django.http import FileResponse
from django.utils import timezone
import logging
import uuid
from decimal import Decimal, InvalidOperation
from .tasks import sincronizar_tasa_con_blindaje
from django.db.models import Min, Q
from .models import BancoInstitucional, CuotaInscripcion, CuotaProyectoInversion, CuotaSolvencia, LoteRevisionCaja, Mensualidad, ParametroGlobal, Pago, SolvenciaRepresentante, TasaCambio, TransferenciaInterna
from .serializers import BancoInstitucionalSerializer, ComprobanteSerializer, DashboardStatsSerializer, LoteRevisionCajaSerializer, PagoCreateSerializer, PagoSerializer, SolvenciaRepresentanteSerializer
from .solvencia import emitir_solvencia_manual, generar_o_verificar_solvencia
from .conciliacion import extraer_tabla_pdf, PdfSinTablaError
from .utils import generar_pdf_recibo
from authentication.views import IsSystemAdminOrDirector, EsPersonalCobranza, IsDirector
from usuarios.models import LogAuditoria
from config.pagination import StandardResultsPagination

logger = logging.getLogger(__name__)


class SincronizarTasaView(APIView):
    """
    Vista para la gestión y consulta de la tasa oficial.
    Implementa lógica defensiva contra valores nulos o en cero,
    con doble fuente de verdad: ParametroGlobal y TasaCambio.
    """
    def get_permissions(self):
        # POST (sincronizar): cualquier personal de cobranza/caja puede disparar
        # GET (consultar): solo admin/director/sistemas
        if self.request.method == 'POST':
            return [permissions.IsAuthenticated(), EsPersonalCobranza()]
        return [permissions.IsAuthenticated(), IsSystemAdminOrDirector()]

    def get(self, request):
        """
        Consulta la tasa actual con triple nivel de recuperación:
          1. ParametroGlobal (fuente rápida principal)
          2. TasaCambio (fallback si ParametroGlobal está en 0 o corrupto)
          3. Scraping síncrono (último recurso, bloquea una sola vez)
        Nunca devuelve 0 al frontend.
        """
        try:
            # --- Fuente 1: ParametroGlobal ---
            tasa_valor = Decimal('0')
            parametro = ParametroGlobal.objects.filter(clave="TASA_BCV_ACTUAL").first()

            if parametro and parametro.valor:
                try:
                    tasa_valor = Decimal(parametro.valor)
                except InvalidOperation:
                    logger.warning(
                        f"ParametroGlobal tiene un valor no numérico: '{parametro.valor}'. "
                        "Se procederá al fallback."
                    )
                    tasa_valor = Decimal('0')

            # --- Fuente 2: TasaCambio (fallback ante ParametroGlobal en 0) ---
            if tasa_valor <= Decimal('0'):
                ultima = TasaCambio.objects.order_by('-id').first()
                if ultima and ultima.valor_bs and ultima.valor_bs > Decimal('0'):
                    tasa_valor = ultima.valor_bs
                    logger.warning(
                        f"ParametroGlobal estaba en 0 o ausente. "
                        f"Recuperado desde TasaCambio: {tasa_valor}. "
                        "Activando corrección de consistencia..."
                    )
                    # Corrige la inconsistencia para la próxima consulta
                    ParametroGlobal.objects.update_or_create(
                        clave="TASA_BCV_ACTUAL",
                        defaults={
                            "valor": str(tasa_valor),
                            "descripcion": (
                                f"Corregido automáticamente por inconsistencia "
                                f"detectada en consulta GET"
                            )
                        }
                    )

            # --- Fuente 3: Scraping síncrono (último recurso) ---
            if tasa_valor <= Decimal('0'):
                logger.warning(
                    "Ambas fuentes internas en 0 o ausentes. "
                    "Iniciando rescate síncrono contra BCV..."
                )
                tasa_valor = sincronizar_tasa_con_blindaje()

            # --- Respuesta final ---
            if tasa_valor and tasa_valor > Decimal('0'):
                return Response({"valor": tasa_valor}, status=status.HTTP_200_OK)

            logger.error(
                "Las tres fuentes de recuperación fallaron. "
                "Respondiendo 503 al cliente."
            )
            return Response(
                {"error": "Tasa no disponible temporalmente. Intente en unos minutos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        except Exception as e:
            logger.error(f"Excepción crítica en consulta de tasa: {str(e)}")
            return Response(
                {"error": "Tasa no disponible temporalmente. Intente en unos minutos."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

    def post(self, request):
        """
        Disparador manual de emergencia.
        SEGURIDAD: Ignora request.data para evitar inyección de tasas falsas.
        """
        tasa = sincronizar_tasa_con_blindaje()

        if tasa is not None:
            # El frontend en sistemas.jsx espera una respuesta con la clave 'valor'
            return Response({"valor": tasa}, status=status.HTTP_200_OK)

        return Response(
            {"error": "No se pudo sincronizar la tasa cambiaria con el BCV ni sus fuentes de respaldo."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# ──────────────────────────────────────────────────────────────────────────────
# DASHBOARD STATS
# ──────────────────────────────────────────────────────────────────────────────

class DashboardStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from secretaria.models import Alumno, ConfiguracionGrado
        from django.db.models import Sum, Count

        from .mora import annotate_en_mora

        activos   = Alumno.objects.filter(activo=True)
        # Conteos en vivo con el criterio canónico de mora (coincide con la lista
        # de morosos y el módulo de alumnos, sin depender de la tarea Celery).
        activos_mora = annotate_en_mora(activos.exclude(estatus_financiero='becado'))
        morosos   = activos_mora.filter(en_mora=True).count()
        solventes = activos_mora.filter(en_mora=False).count()
        becados   = activos.filter(estatus_financiero='becado').count()
        masculino = activos.filter(genero='masculino').count()
        femenino  = activos.filter(genero='femenino').count()
        total_activos = activos.count()
        # Alumno.objects filtra activo=True por defecto; usar el manager completo
        inactivos = Alumno.todos.filter(activo=False).count()

        tasa_valor = Decimal('0')
        parametro = ParametroGlobal.objects.filter(clave="TASA_BCV_ACTUAL").first()
        if parametro and parametro.valor:
            try:
                tasa_valor = Decimal(parametro.valor)
            except InvalidOperation:
                pass

        if tasa_valor <= 0:
            ultima = TasaCambio.objects.order_by('-id').first()
            if ultima and ultima.valor_bs > 0:
                tasa_valor = ultima.valor_bs

        # Cobranza del día
        from datetime import date
        pagos_hoy = Pago.objects.filter(
            fecha_pago__date=date.today(),
            estatus='completado'
        )
        cobrado_hoy_usd = pagos_hoy.filter(
            metodo_pago__in=['efectivo', 'zelle']
        ).aggregate(t=Sum('monto_usd'))['t'] or Decimal('0')
        cobrado_hoy_ves = pagos_hoy.aggregate(t=Sum('monto_ves'))['t'] or Decimal('0')
        pagos_hoy_count = pagos_hoy.aggregate(c=Count('id'))['c'] or 0

        # Ocupación y morosidad por grado — antes 2 queries POR grado (una de
        # ellas con 4 Exists() anidados), ~30-40 queries pesadas por carga del
        # dashboard. Ahora 2 agregaciones totales, sin importar cuántos grados
        # existan.
        configs = ConfiguracionGrado.objects.order_by('grado_seccion')

        totales_por_grado = {
            row['grado_seccion']: row['total']
            for row in activos.values('grado_seccion').annotate(total=Count('id'))
        }
        morosos_por_grado = {
            row['grado_seccion']: row['morosos']
            for row in annotate_en_mora(activos.exclude(estatus_financiero='becado'))
                .values('grado_seccion')
                .annotate(morosos=Count('id', filter=Q(en_mora=True)))
        }

        grados = []
        for cfg in configs:
            grados.append({
                'grado':            cfg.grado_seccion,
                'cupos_maximos':    cfg.cupos_maximos,
                'cupos_utilizados': cfg.cupos_utilizados,
                'total_alumnos':    totales_por_grado.get(cfg.grado_seccion, 0),
                'morosos':          morosos_por_grado.get(cfg.grado_seccion, 0),
            })

        return Response({
            'total_activos':     total_activos,
            'inactivos':         inactivos,
            'solventes':         solventes,
            'morosos':           morosos,
            'becados':           becados,
            'masculino':         masculino,
            'femenino':          femenino,
            'tasa_bcv':          tasa_valor,
            'cobrado_hoy_usd':   cobrado_hoy_usd,
            'cobrado_hoy_ves':   cobrado_hoy_ves,
            'pagos_hoy_count':   pagos_hoy_count,
            'grados':            grados,
        })


# ──────────────────────────────────────────────────────────────────────────────
# BÚSQUEDA DE ALUMNO/REPRESENTANTE PARA COBRANZA
# ──────────────────────────────────────────────────────────────────────────────

MES_NOMBRES = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
    5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
    9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre',
}


class BuscarAlumnoCobranzaView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    MES_NOMBRES = MES_NOMBRES

    def _alumno_data(self, alumno):
        from datetime import date as _date
        hoy = _date.today()

        # Auto-crear los meses del año escolar activo que falten, mes actual
        # incluido (antes solo se creaban futuros y el mes en curso nunca
        # generaba deuda). Los becados totales no cargan mensualidades. El
        # rango de meses sale siempre de ConfiguracionSistema (fecha de inicio
        # y fin de clases), nunca de un rango fijo.
        if alumno.estatus_financiero != 'becado':
            from .services import generar_mensualidades, meses_ano_escolar, rango_ano_escolar
            rango = rango_ano_escolar()
            if rango:
                fecha_inicio, fecha_fin = rango
                meses_pendientes = [
                    (m, a) for (m, a) in meses_ano_escolar(fecha_inicio, fecha_fin)
                    if (a, m) >= (hoy.year, hoy.month)
                ]
                generar_mensualidades([alumno], meses_pendientes)

        def to_list(qs):
            return [
                {
                    'id':        row['id'],
                    'mes':       self.MES_NOMBRES.get(row['mes'], str(row['mes'])),
                    'anio':      row['anio'],
                    'monto_usd': str(row['monto_usd']),
                }
                for row in qs
            ]

        mensualidades = to_list(
            Mensualidad.objects.filter(alumno=alumno, pagado=False)
            .filter(Q(anio__lt=hoy.year) | Q(anio=hoy.year, mes__lte=hoy.month))
            .values('id', 'mes', 'anio', 'monto_usd')
            .order_by('anio', 'mes')
        )
        mensualidades_futuras = to_list(
            Mensualidad.objects.filter(alumno=alumno, pagado=False)
            .filter(Q(anio__gt=hoy.year) | Q(anio=hoy.year, mes__gt=hoy.month))
            .values('id', 'mes', 'anio', 'monto_usd')
            .order_by('anio', 'mes')
        )
        cuotas_inscripcion = list(
            CuotaInscripcion.objects.filter(alumno=alumno, pagado=False)
            .values('id', 'periodo_escolar', 'monto_usd')
            .order_by('-periodo_escolar')
        )
        cuotas_solvencia = list(
            CuotaSolvencia.objects.filter(alumno=alumno, pagado=False, monto_usd__gt=0)
            .values('id', 'periodo_escolar', 'monto_usd', 'concepto')
            .order_by('-periodo_escolar')
        )
        # Proyecto de Inversión: cuota del REPRESENTANTE (no del alumno), por
        # eso se filtra por alumno.representante en vez de por alumno.
        # Se expone `saldo` (monto_usd - monto_pagado) además del monto bruto:
        # tras un abono parcial la cuota sigue pendiente pero por menos de lo
        # original, y el frontend debe cobrar/mostrar el saldo, no el monto lleno.
        cuotas_proyecto_inversion = [
            {**c, 'saldo': c['monto_usd'] - c['monto_pagado']}
            for c in CuotaProyectoInversion.objects.filter(representante=alumno.representante, pagado=False)
            .values('id', 'periodo_escolar', 'monto_usd', 'monto_pagado')
            .order_by('-periodo_escolar')
        ]
        # Estatus EN VIVO con el criterio canónico (cobranza/mora.py), no el
        # campo persistido que solo se sincroniza con la corrida nocturna.
        from secretaria.models import Alumno as AlumnoModel
        from .mora import annotate_en_mora, estatus_financiero_actual
        alumno_anotado = annotate_en_mora(
            AlumnoModel.todos.filter(pk=alumno.pk), hoy
        ).first() or alumno

        return {
            'id':                            alumno.id,
            'nombre':                        alumno.nombre,
            'nombre_completo':               f"{alumno.nombre} {alumno.apellido}",
            'cedula_escolar':                alumno.cedula_escolar,
            'grado':                         alumno.grado_seccion or 'Sin grado',
            'estatus':                       estatus_financiero_actual(alumno_anotado),
            'mensualidades_pendientes':      mensualidades,
            'mensualidades_futuras':         mensualidades_futuras,
            'cuotas_inscripcion_pendientes': cuotas_inscripcion,
            'cuotas_solvencia_pendientes':   cuotas_solvencia,
            'cuotas_proyecto_inversion_pendientes': cuotas_proyecto_inversion,
        }

    def _rep_data(self, rep):
        return {
            'id':        rep.id,
            'nombre':    rep.nombre,
            'apellido':  rep.apellido,
            'cedula':    rep.cedula,
            'telefono':  rep.telefono,
            'correo':    rep.correo,
            'direccion': rep.direccion,
        }

    def get(self, request, cedula):
        from secretaria.models import Representante, Alumno

        # Intento 1: buscar como cédula de representante
        rep = Representante.objects.filter(cedula=cedula).first()
        if rep:
            alumnos = Alumno.objects.filter(
                representante=rep, activo=True
            ).select_related('representante')
            return Response({
                'representante': self._rep_data(rep),
                'alumnos':       [self._alumno_data(a) for a in alumnos],
            })

        # Intento 2: buscar como cédula escolar de alumno
        alumno = Alumno.objects.filter(cedula_escolar=cedula, activo=True).select_related('representante').first()
        if alumno:
            return Response({
                'representante': self._rep_data(alumno.representante) if alumno.representante else None,
                'alumnos':       [self._alumno_data(alumno)],
            })

        return Response({'representante': None, 'alumnos': []})


# ──────────────────────────────────────────────────────────────────────────────
# LISTADO DE BANCOS
# ──────────────────────────────────────────────────────────────────────────────

class BancosListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from django.core.cache import cache
        from .signals import CACHE_KEY_BANCOS_ACTIVOS

        data = cache.get(CACHE_KEY_BANCOS_ACTIVOS)
        if data is None:
            bancos = BancoInstitucional.objects.filter(activo=True).order_by('nombre')
            data = BancoInstitucionalSerializer(bancos, many=True).data
            # TTL de 5 min como red de seguridad además de la invalidación por
            # señal (cobranza/signals.py), por si corre con varios workers.
            cache.set(CACHE_KEY_BANCOS_ACTIVOS, data, timeout=300)
        return Response(data)


# ──────────────────────────────────────────────────────────────────────────────
# REGISTRO DE PAGO
# ──────────────────────────────────────────────────────────────────────────────

class RegistrarPagoView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    @transaction.atomic
    def post(self, request):
        serializer = PagoCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        alumno_titular    = data['alumno']
        alumnos_resueltos = data['alumnos_resueltos']
        tasa   = data['tasa']
        vuelto_usd = data.get('vuelto_usd', Decimal('0.00')) or Decimal('0.00')
        vuelto_ves = data.get('vuelto_ves', Decimal('0.00')) or Decimal('0.00')

        proyecto_inversion_ids = data.get('proyecto_inversion_ids', [])

        # El concepto se deriva de las deudas realmente seleccionadas (de
        # cualquiera de los alumnos incluidos en la operación), no del
        # selector manual: una misma transacción puede saldar cuotas de
        # distinto tipo a la vez (p. ej. mensualidad + proyecto de inversión),
        # y de varios hermanos simultáneamente. Si no se seleccionó ninguna
        # cuota estructurada (pago libre: materiales, multa, otro), se respeta
        # el concepto elegido manualmente en el form.
        grupos_presentes = []
        if any(a['mensualidad_ids'] or a['mensualidad_adelanto_ids'] for a in alumnos_resueltos):
            grupos_presentes.append('mensualidad')
        if any(a['cuota_inscripcion_ids'] for a in alumnos_resueltos):
            grupos_presentes.append('inscripcion')
        if any(a['cuota_solvencia_ids'] for a in alumnos_resueltos):
            grupos_presentes.append('solvencia')
        if proyecto_inversion_ids:
            grupos_presentes.append('proyecto_inversion')

        if len(grupos_presentes) == 1:
            concepto = grupos_presentes[0]
        elif len(grupos_presentes) > 1:
            concepto = 'mixto'
        else:
            concepto = data.get('concepto', 'mensualidad')

        operacion_uuid = data.get('operacion_uuid') or uuid.uuid4()

        pagos_creados = []
        for pago_item in data['pagos']:
            metodo    = pago_item['metodo_pago']
            monto_usd = pago_item['monto_usd']
            monto_ves = pago_item['monto_ves']

            if monto_usd > 0:
                monto_usd_final = monto_usd
                monto_ves_final = (monto_usd * tasa.valor_bs).quantize(Decimal('0.01'))
            elif monto_ves > 0:
                monto_ves_final = monto_ves
                monto_usd_final = (monto_ves / tasa.valor_bs).quantize(Decimal('0.01'))
            else:
                continue

            banco = None
            if pago_item.get('banco_receptor_id'):
                try:
                    banco = BancoInstitucional.objects.get(id=pago_item['banco_receptor_id'])
                except BancoInstitucional.DoesNotExist:
                    pass

            es_primer_pago = len(pagos_creados) == 0
            pago = Pago(
                alumno=alumno_titular,
                usuario_receptor=request.user,
                banco_receptor=banco,
                operacion_uuid=operacion_uuid,
                metodo_pago=metodo,
                concepto=concepto,
                monto_usd=monto_usd_final,
                tasa_aplicada=tasa.valor_bs,
                monto_ves=monto_ves_final,
                referencia=pago_item.get('referencia', '') or '',
                numero_lote=pago_item.get('numero_lote', '') or '',
                observaciones=pago_item.get('observaciones', '') or '',
                representante_documento=data.get('representante_documento', '') or '',
                representante_nombre=data.get('representante_nombre', '') or '',
                vuelto_usd=vuelto_usd if es_primer_pago else Decimal('0.00'),
                vuelto_ves=vuelto_ves if es_primer_pago else Decimal('0.00'),
            )
            pago.save()
            pagos_creados.append(pago)

        if not pagos_creados:
            return Response(
                {"error": "No se procesó ningún pago. Verifique los montos."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Mensualidades del mes en curso/atrasadas y adelantos de meses futuros
        # comparten el mismo tratamiento: ambas son filas de Mensualidad que hay
        # que marcar como pagadas. Se procesa alumno por alumno (cada hermano
        # incluido en la operación) para no filtrar por un único `alumno`.
        todas_mensualidades_qs = Mensualidad.objects.none()
        for a in alumnos_resueltos:
            ids = list(set(a['mensualidad_ids']) | set(a['mensualidad_adelanto_ids']))
            if not ids:
                continue
            Mensualidad.objects.filter(
                id__in=ids, alumno=a['alumno']
            ).update(pagado=True, fecha_pago=timezone.now())
            todas_mensualidades_qs |= Mensualidad.objects.filter(id__in=ids, alumno=a['alumno'])

        if todas_mensualidades_qs.exists():
            for pago in pagos_creados:
                pago.mensualidades_pagadas.set(todas_mensualidades_qs)

            # Recalcular con el criterio canónico: pagar un mes no implica
            # solvencia si quedan meses anteriores impagos. Se recalcula por
            # cada alumno que tuvo mensualidades en esta operación.
            from .mora import sincronizar_estatus_alumno
            for a in alumnos_resueltos:
                if a['mensualidad_ids'] or a['mensualidad_adelanto_ids']:
                    sincronizar_estatus_alumno(a['alumno'])

            # Correo de "pago confirmado" al representante, uno por cada pago
            # que quedó vinculado a una mensualidad (con recibo PDF adjunto).
            from notificaciones.tasks import task_notificar_pago_exitoso
            for pago in pagos_creados:
                mensualidad_ref = pago.mensualidades_pagadas.first()
                if mensualidad_ref:
                    task_notificar_pago_exitoso.delay(mensualidad_ref.id, pago.id)

        todas_cuotas_inscripcion_qs = CuotaInscripcion.objects.none()
        for a in alumnos_resueltos:
            if not a['cuota_inscripcion_ids']:
                continue
            CuotaInscripcion.objects.filter(
                id__in=a['cuota_inscripcion_ids'], alumno=a['alumno']
            ).update(pagado=True, fecha_pago=timezone.now())
            todas_cuotas_inscripcion_qs |= CuotaInscripcion.objects.filter(
                id__in=a['cuota_inscripcion_ids'], alumno=a['alumno']
            )

        if todas_cuotas_inscripcion_qs.exists():
            for pago in pagos_creados:
                pago.cuotas_inscripcion_pagadas.set(todas_cuotas_inscripcion_qs)

        todas_cuotas_solvencia_qs = CuotaSolvencia.objects.none()
        for a in alumnos_resueltos:
            if not a['cuota_solvencia_ids']:
                continue
            # Se guarda instancia por instancia (no bulk .update()) para que
            # save() derive `pagado`/`fecha_pago` a partir de monto_pagado —
            # ver CuotaSolvencia.save() en models.py.
            cuotas = CuotaSolvencia.objects.filter(
                id__in=a['cuota_solvencia_ids'], alumno=a['alumno']
            )
            for cuota in cuotas:
                cuota.monto_pagado = cuota.monto_usd
                cuota.save()
            todas_cuotas_solvencia_qs |= CuotaSolvencia.objects.filter(
                id__in=a['cuota_solvencia_ids'], alumno=a['alumno']
            )

        if todas_cuotas_solvencia_qs.exists():
            for pago in pagos_creados:
                pago.cuotas_solvencia_pagadas.set(todas_cuotas_solvencia_qs)

        # Proyecto de Inversión: cuota por REPRESENTANTE, no por alumno (todos
        # los alumnos de la operación comparten representante, validado en el
        # serializer). El pago se registra contra el alumno titular, pero la
        # cuota que se salda pertenece al representante.
        numero_solvencia = None
        if proyecto_inversion_ids:
            montos_proyecto_inversion = data.get('montos_proyecto_inversion') or {}
            cuotas_proyecto = CuotaProyectoInversion.objects.filter(
                id__in=proyecto_inversion_ids, representante=alumno_titular.representante
            )
            for cuota in cuotas_proyecto:
                saldo = cuota.monto_usd - cuota.monto_pagado
                abono = montos_proyecto_inversion.get(str(cuota.id), saldo)
                cuota.monto_pagado = min(cuota.monto_pagado + abono, cuota.monto_usd)
                # pagado/fecha_pago se derivan solos en CuotaProyectoInversion.save().
                cuota.save()

            for pago in pagos_creados:
                pago.proyectos_inversion_pagados.set(
                    CuotaProyectoInversion.objects.filter(id__in=proyecto_inversion_ids, representante=alumno_titular.representante)
                )

            # Al completar el proyecto de inversión, si el representante ya no
            # tiene deuda pendiente (inscripción + sin mora), se emite (o se
            # confirma) su número de solvencia, ligado a esta factura.
            solvencia = generar_o_verificar_solvencia(
                alumno_titular.representante, pago=pagos_creados[-1]
            )
            if solvencia:
                numero_solvencia = solvencia.numero

        LogAuditoria.objects.create(
            usuario=request.user,
            accion="REGISTRO_PAGO",
            modulo="COBRANZA",
            detalles={
                "alumno_id":                     alumno_titular.id,
                "nombre":                        f"{alumno_titular.nombre} {alumno_titular.apellido}",
                "alumnos": [
                    {
                        "alumno_id":                      a['alumno'].id,
                        "nombre":                         f"{a['alumno'].nombre} {a['alumno'].apellido}",
                        "mensualidades_pagadas":          a['mensualidad_ids'],
                        "mensualidades_adelanto_pagadas": a['mensualidad_adelanto_ids'],
                        "cuotas_inscripcion_pagadas":     a['cuota_inscripcion_ids'],
                        "cuotas_solvencia_pagadas":       a['cuota_solvencia_ids'],
                    }
                    for a in alumnos_resueltos
                ],
                "total_pagos":                   len(pagos_creados),
                "concepto":                      concepto,
                "proyectos_inversion_pagados":   proyecto_inversion_ids,
                "numero_solvencia_generado":     numero_solvencia,
            }
        )

        return Response(
            {
                'pagos': PagoSerializer(pagos_creados, many=True).data,
                'numero_solvencia': numero_solvencia,
            },
            status=status.HTTP_201_CREATED
        )


# ──────────────────────────────────────────────────────────────────────────────
# RECIBO PDF
# ──────────────────────────────────────────────────────────────────────────────

class ReciboView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pago_id):
        try:
            pago_ref = Pago.objects.get(id=pago_id)
        except Pago.DoesNotExist:
            return Response({"error": "Pago no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        pagos = list(
            Pago.objects.filter(operacion_uuid=pago_ref.operacion_uuid).select_related(
                'alumno', 'alumno__representante', 'usuario_receptor', 'banco_receptor'
            ).order_by('id')
        )

        try:
            pdf_buffer = generar_pdf_recibo(pagos)
            factura_label = pagos[0].factura_id or f"{pago_id:06d}"
            return FileResponse(
                pdf_buffer,
                as_attachment=False,
                filename=f"Recibo_{factura_label}.pdf",
                content_type='application/pdf'
            )
        except Exception as e:
            logger.error(f"Error generando PDF de recibo {pago_id}: {e}")
            return Response(
                {"error": "No se pudo generar el recibo PDF."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ──────────────────────────────────────────────────────────────────────────────
# AUDITORÍA DIARIA (resumen del día para Reportes/Auditoria)
# ──────────────────────────────────────────────────────────────────────────────

class AuditoriaDiariaView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from datetime import date, datetime
        from django.db.models import Sum, Count

        fi_str = request.query_params.get('fecha_inicio')
        ff_str = request.query_params.get('fecha_fin')
        try:
            fi = datetime.strptime(fi_str, '%Y-%m-%d').date() if fi_str else date.today()
            ff = datetime.strptime(ff_str, '%Y-%m-%d').date() if ff_str else date.today()
        except ValueError:
            return Response({"error": "Formato de fecha inválido. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)
        if fi > ff:
            return Response({"error": "fecha_inicio no puede ser posterior a fecha_fin."}, status=status.HTTP_400_BAD_REQUEST)

        pagos_hoy = Pago.objects.filter(
            fecha_pago__date__gte=fi,
            fecha_pago__date__lte=ff,
            estatus='completado'
        )

        def _usd(metodo):
            return pagos_hoy.filter(metodo_pago=metodo).aggregate(t=Sum('monto_usd'))['t'] or Decimal('0')

        def _ves(metodo):
            return pagos_hoy.filter(metodo_pago=metodo).aggregate(t=Sum('monto_ves'))['t'] or Decimal('0')

        efectivo_usd          = _usd('efectivo')
        zelle_usd             = _usd('zelle')
        transf_bancaria_ves   = _ves('transferencia')
        pago_movil_ves        = _ves('pago_movil')
        punto_venta_ves       = _ves('punto_de_venta')
        efectivo_bolivares_ves = _ves('efectivo_ves')

        total_usd         = efectivo_usd + zelle_usd
        transferencia_ves = transf_bancaria_ves + pago_movil_ves + punto_venta_ves + efectivo_bolivares_ves
        total_ves         = pagos_hoy.aggregate(t=Sum('monto_ves'))['t'] or Decimal('0')
        conteo            = pagos_hoy.aggregate(c=Count('id'))['c'] or 0

        return Response({
            'total_usd':              total_usd,
            'total_ves':              total_ves,
            'efectivo_usd':           efectivo_usd,
            'zelle_usd':              zelle_usd,
            'transferencia_ves':      transferencia_ves,
            'transf_bancaria_ves':    transf_bancaria_ves,
            'pago_movil_ves':         pago_movil_ves,
            'punto_venta_ves':        punto_venta_ves,
            'efectivo_bolivares_ves': efectivo_bolivares_ves,
            'conteo_pagos':           conteo,
        })


# ──────────────────────────────────────────────────────────────────────────────
# HISTÓRICO MENSUAL (desglose día a día)
# ──────────────────────────────────────────────────────────────────────────────

class HistoricoMensualView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        import calendar
        from datetime import date
        from django.db.models import Sum, Count, Case, When, DecimalField
        from django.db.models.functions import TruncDate

        try:
            today = date.today()
            year  = int(request.query_params.get('year',  today.year))
            month = int(request.query_params.get('month', today.month))
            if not (1 <= month <= 12):
                raise ValueError
        except (ValueError, TypeError):
            return Response({"error": "Parámetros inválidos. Envíe year y month como enteros."}, status=400)

        _, last_day = calendar.monthrange(year, month)
        fi = date(year, month, 1)
        ff = date(year, month, last_day)

        rows = (
            Pago.objects
            .filter(fecha_pago__date__gte=fi, fecha_pago__date__lte=ff, estatus='completado')
            .annotate(dia=TruncDate('fecha_pago'))
            .values('dia')
            .annotate(
                total_usd=Sum(
                    Case(When(metodo_pago__in=['efectivo', 'zelle'], then='monto_usd'),
                         default=Decimal('0'), output_field=DecimalField())
                ),
                efectivo_usd=Sum(
                    Case(When(metodo_pago='efectivo', then='monto_usd'),
                         default=Decimal('0'), output_field=DecimalField())
                ),
                transferencia_ves=Sum(
                    Case(When(metodo_pago__in=['transferencia', 'pago_movil', 'punto_de_venta', 'efectivo_ves'], then='monto_ves'),
                         default=Decimal('0'), output_field=DecimalField())
                ),
                conteo_pagos=Count('id'),
            )
            .order_by('dia')
        )

        dias = [
            {
                'fecha':             str(r['dia']),
                'total_usd':         str(r['total_usd']         or 0),
                'efectivo_usd':      str(r['efectivo_usd']      or 0),
                'transferencia_ves': str(r['transferencia_ves'] or 0),
                'conteo_pagos':      r['conteo_pagos'] or 0,
            }
            for r in rows
        ]

        return Response({'year': year, 'month': month, 'dias': dias})


# ──────────────────────────────────────────────────────────────────────────────
# EXPORTAR AUDITORÍA A EXCEL
# ──────────────────────────────────────────────────────────────────────────────

class ExportarAuditoriaExcelView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSystemAdminOrDirector]

    def get(self, request):
        from datetime import date, datetime
        from .exports import ExcelExporter

        fi_str = request.query_params.get('fecha_inicio')
        ff_str = request.query_params.get('fecha_fin')
        try:
            fi = datetime.strptime(fi_str, '%Y-%m-%d').date() if fi_str else date.today()
            ff = datetime.strptime(ff_str, '%Y-%m-%d').date() if ff_str else date.today()
        except ValueError:
            return Response({"error": "Formato inválido. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        from .services import alumnos_de_pago

        pagos = Pago.objects.filter(
            fecha_pago__date__gte=fi,
            fecha_pago__date__lte=ff,
        ).select_related('alumno', 'banco_receptor', 'usuario_receptor').prefetch_related(
            'mensualidades_pagadas__alumno',
            'cuotas_inscripcion_pagadas__alumno',
            'cuotas_solvencia_pagadas__alumno',
        ).order_by('-fecha_pago')

        # Un pago puede cubrir a varios hermanos en la misma transacción
        # (Pago.alumno solo guarda al "titular"): se listan todos los alumnos
        # realmente involucrados para no dar la impresión de que a los demás
        # no se les cobró (ver cobranza/services.py::alumnos_de_pago).
        columns = [
            ('Fecha',          lambda x: x.fecha_pago.strftime('%d/%m/%Y %H:%M')),
            ('Alumno',         lambda x: ', '.join(f"{a.nombre} {a.apellido}" for a in alumnos_de_pago(x))),
            ('Cédula Escolar', lambda x: ', '.join((a.cedula_escolar or '') for a in alumnos_de_pago(x))),
            ('Concepto',       lambda x: x.get_concepto_display()),
            ('Método',         lambda x: x.get_metodo_pago_display()),
            ('Monto USD',      'monto_usd'),
            ('Monto VES',      'monto_ves'),
            ('Tasa BCV',       'tasa_aplicada'),
            ('Banco',          lambda x: x.banco_receptor.nombre if x.banco_receptor else ''),
            ('Referencia',     'referencia'),
            ('Cajero',         lambda x: x.usuario_receptor.username if x.usuario_receptor else ''),
        ]

        return ExcelExporter.export(pagos, columns, f"auditoria_{fi}_{ff}")


# ──────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN DE COBRANZA (monto por defecto de mensualidades)
# ──────────────────────────────────────────────────────────────────────────────

class ConfiguracionCobranzaView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        param_mens = ParametroGlobal.objects.filter(clave="MONTO_MENSUALIDAD_DEFECTO").first()
        param_insc = ParametroGlobal.objects.filter(clave="MONTO_INSCRIPCION_DEFECTO").first()
        param_proyecto = ParametroGlobal.objects.filter(clave="MONTO_PROYECTO_INVERSION_DEFECTO").first()
        return Response({
            'monto_defecto': param_mens.valor if param_mens else '35.00',
            'monto_inscripcion': param_insc.valor if param_insc else '50.00',
            'monto_proyecto_inversion': param_proyecto.valor if param_proyecto else '0.00',
        })

    @transaction.atomic
    def post(self, request):
        monto = request.data.get('monto_defecto')
        monto_insc = request.data.get('monto_inscripcion')
        monto_proyecto = request.data.get('monto_proyecto_inversion')
        response_data = {}

        # Período escolar activo: las cuotas YA PAGADAS jamás se tocan (filtro
        # pagado=False). Solo las pendientes del período activo se sincronizan
        # con el nuevo monto por defecto, para que un cambio de configuración
        # sí se refleje en los representantes que aún no han pagado.
        from secretaria.models import ConfiguracionSistema
        config = ConfiguracionSistema.objects.first()
        periodo_activo = config.periodo_escolar_activo if config else None

        if monto is not None:
            ParametroGlobal.objects.update_or_create(
                clave="MONTO_MENSUALIDAD_DEFECTO",
                defaults={'valor': str(monto), 'descripcion': 'Monto base mensualidad por defecto'}
            )
            response_data['monto_defecto'] = monto
        if monto_insc is not None:
            ParametroGlobal.objects.update_or_create(
                clave="MONTO_INSCRIPCION_DEFECTO",
                defaults={'valor': str(monto_insc), 'descripcion': 'Monto base cuota de inscripción por defecto'}
            )
            response_data['monto_inscripcion'] = monto_insc
            if periodo_activo:
                CuotaInscripcion.objects.filter(
                    periodo_escolar=periodo_activo, pagado=False
                ).update(monto_usd=Decimal(str(monto_insc)))
        if monto_proyecto is not None:
            ParametroGlobal.objects.update_or_create(
                clave="MONTO_PROYECTO_INVERSION_DEFECTO",
                defaults={'valor': str(monto_proyecto), 'descripcion': 'Monto base Proyecto de Inversión por defecto (por representante)'}
            )
            response_data['monto_proyecto_inversion'] = monto_proyecto
            if periodo_activo:
                CuotaProyectoInversion.objects.filter(
                    periodo_escolar=periodo_activo, pagado=False
                ).update(monto_usd=Decimal(str(monto_proyecto)))
        return Response(response_data)


# ──────────────────────────────────────────────────────────────────────────────
# ACTUALIZACIÓN MASIVA DE MONTOS DE MENSUALIDADES
# ──────────────────────────────────────────────────────────────────────────────

class MensualidadesAlumnoView(APIView):
    """
    Devuelve las mensualidades pendientes de un alumno buscando directamente
    por su ID, igual que CuotaInscripcionAlumnoView: BuscarAlumnoCobranzaView
    depende de cedula_escolar y falla silenciosamente (devuelve lista vacía,
    sin error) cuando ese campo no está cargado.

    Replica también el auto-generado de meses pendientes del año escolar
    activo que hace BuscarAlumnoCobranzaView._alumno_data — si no se hace
    aquí, un alumno cuyo representante nunca fue buscado por cédula se queda
    sin mensualidades creadas y este endpoint (y el modal de Ajustar
    Mensualidades) lo muestra como si no tuviera nada pendiente.
    """
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def get(self, request, alumno_id):
        from datetime import date as _date
        from secretaria.models import Alumno
        from .services import generar_mensualidades, meses_ano_escolar, rango_ano_escolar

        try:
            alumno = Alumno.objects.get(id=alumno_id, activo=True)
        except Alumno.DoesNotExist:
            return Response({"error": "Alumno no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        if alumno.estatus_financiero != 'becado':
            hoy = _date.today()
            rango = rango_ano_escolar()
            if rango:
                fecha_inicio, fecha_fin = rango
                meses_pendientes = [
                    (m, a) for (m, a) in meses_ano_escolar(fecha_inicio, fecha_fin)
                    if (a, m) >= (hoy.year, hoy.month)
                ]
                generar_mensualidades([alumno], meses_pendientes)

        mensualidades = list(
            Mensualidad.objects.filter(alumno=alumno, pagado=False)
            .values('id', 'mes', 'anio', 'monto_usd')
            .order_by('anio', 'mes')
        )
        for m in mensualidades:
            m['mes'] = MES_NOMBRES.get(m['mes'], str(m['mes']))
            m['monto_usd'] = str(m['monto_usd'])

        total_deuda = sum((Decimal(m['monto_usd']) for m in mensualidades), Decimal('0.00'))
        return Response({
            'mensualidades_pendientes': mensualidades,
            'monto_total_deuda': str(total_deuda),
        })


class ActualizarMensualidadesView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    @transaction.atomic
    def patch(self, request):
        items = request.data.get('mensualidades', [])
        if not items:
            return Response(
                {"error": "No se enviaron mensualidades para actualizar."},
                status=status.HTTP_400_BAD_REQUEST
            )

        actualizadas = 0
        for item in items:
            mensualidad_id = item.get('id')
            monto = item.get('monto_usd')
            if mensualidad_id and monto is not None:
                Mensualidad.objects.filter(id=mensualidad_id).update(
                    monto_usd=Decimal(str(monto))
                )
                actualizadas += 1

        return Response({'actualizadas': actualizadas})


# ──────────────────────────────────────────────────────────────────────────────
# ACTUALIZACIÓN DE MONTO DE CUOTA(S) DE INSCRIPCIÓN (ajuste por alumno)
# ──────────────────────────────────────────────────────────────────────────────

class CuotaInscripcionAlumnoView(APIView):
    """
    Devuelve las cuotas de inscripción pendientes de un alumno buscando
    directamente por su ID (a diferencia de BuscarAlumnoCobranzaView, que
    depende de cedula_escolar y falla silenciosamente cuando ese campo está
    vacío, algo común en alumnos recién registrados).
    """
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    def get(self, request, alumno_id):
        from secretaria.models import Alumno

        try:
            alumno = Alumno.objects.get(id=alumno_id, activo=True)
        except Alumno.DoesNotExist:
            return Response({"error": "Alumno no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        cuotas = list(
            CuotaInscripcion.objects.filter(alumno=alumno, pagado=False)
            .values('id', 'periodo_escolar', 'monto_usd')
            .order_by('-periodo_escolar')
        )
        return Response({'cuotas_inscripcion_pendientes': cuotas})


class ActualizarCuotaInscripcionView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsPersonalCobranza]

    @transaction.atomic
    def patch(self, request):
        items = request.data.get('cuotas', [])
        if not items:
            return Response(
                {"error": "No se enviaron cuotas de inscripción para actualizar."},
                status=status.HTTP_400_BAD_REQUEST
            )

        actualizadas = 0
        for item in items:
            cuota_id = item.get('id')
            monto = item.get('monto_usd')
            if cuota_id and monto is not None:
                CuotaInscripcion.objects.filter(id=cuota_id).update(
                    monto_usd=Decimal(str(monto))
                )
                actualizadas += 1

        return Response({'actualizadas': actualizadas})


# ──────────────────────────────────────────────────────────────────────────────
# ADMINISTRACIÓN DE BANCOS (CRUD)
# ──────────────────────────────────────────────────────────────────────────────

class BancosAdminView(APIView):
    """Lista todos los bancos (activos e inactivos) y permite crear nuevos."""
    permission_classes = [permissions.IsAuthenticated, IsSystemAdminOrDirector]

    def get(self, request):
        bancos = BancoInstitucional.objects.all().order_by('nombre')
        serializer = BancoInstitucionalSerializer(bancos, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = BancoInstitucionalSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class BancoDetailView(APIView):
    """Recupera, actualiza o elimina un banco específico."""
    permission_classes = [permissions.IsAuthenticated, IsSystemAdminOrDirector]

    def _get_banco(self, pk):
        from django.shortcuts import get_object_or_404
        return get_object_or_404(BancoInstitucional, pk=pk)

    def get(self, request, pk):
        banco = self._get_banco(pk)
        serializer = BancoInstitucionalSerializer(banco)
        return Response(serializer.data)

    def patch(self, request, pk):
        banco = self._get_banco(pk)
        serializer = BancoInstitucionalSerializer(banco, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        banco = self._get_banco(pk)
        tiene_ref = (
            Pago.objects.filter(banco_receptor=banco).exists() or
            TransferenciaInterna.objects.filter(
                Q(banco_origen=banco) | Q(banco_destino=banco)
            ).exists()
        )
        if tiene_ref:
            banco.activo = False
            banco.save(update_fields=['activo'])
            return Response(
                {"detail": "Banco desactivado. Tiene registros asociados y no puede eliminarse permanentemente.",
                 "accion": "desactivado"},
                status=status.HTTP_200_OK
            )
        banco.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ──────────────────────────────────────────────────────────────────────────────
# CONSULTA DE COMPROBANTES / FACTURAS
# ──────────────────────────────────────────────────────────────────────────────

class ConsultaComprobantesView(APIView):
    """
    Módulo de consulta de comprobantes de pago con filtros y paginación.
    Soporta búsqueda por factura_id, alumno, cédula, fechas, método, concepto y estatus.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from datetime import datetime

        qs = Pago.objects.select_related(
            'alumno', 'alumno__representante', 'usuario_receptor', 'banco_receptor'
        ).order_by('-fecha_pago')

        factura_id = request.query_params.get('factura_id', '').strip()
        if factura_id:
            qs = qs.filter(factura_id__icontains=factura_id)

        cedula = request.query_params.get('cedula', '').strip()
        if cedula:
            qs = qs.filter(alumno__cedula_escolar__icontains=cedula)

        alumno_nombre = request.query_params.get('alumno_nombre', '').strip()
        if alumno_nombre:
            qs = qs.filter(
                Q(alumno__nombre__icontains=alumno_nombre) |
                Q(alumno__apellido__icontains=alumno_nombre)
            )

        fi_str = request.query_params.get('fecha_inicio', '').strip()
        ff_str = request.query_params.get('fecha_fin', '').strip()
        try:
            if fi_str:
                fi = datetime.strptime(fi_str, '%Y-%m-%d').date()
                qs = qs.filter(fecha_pago__date__gte=fi)
            if ff_str:
                ff = datetime.strptime(ff_str, '%Y-%m-%d').date()
                qs = qs.filter(fecha_pago__date__lte=ff)
        except ValueError:
            return Response(
                {"error": "Formato de fecha inválido. Use YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST
            )

        metodo = request.query_params.get('metodo_pago', '').strip()
        if metodo:
            qs = qs.filter(metodo_pago=metodo)

        concepto = request.query_params.get('concepto', '').strip()
        if concepto:
            qs = qs.filter(concepto=concepto)

        estatus = request.query_params.get('estatus', '').strip()
        if estatus:
            qs = qs.filter(estatus=estatus)

        try:
            page = max(1, int(request.query_params.get('page', 1)))
            page_size = min(100, max(1, int(request.query_params.get('page_size', 20))))
        except (ValueError, TypeError):
            page, page_size = 1, 20

        from django.db.models import Min, Max

        # Agrupa por operacion_uuid; un pago representante por operación
        groups = (
            qs.values('operacion_uuid')
            .annotate(rep_id=Min('id'), max_fecha=Max('fecha_pago'))
            .order_by('-max_fecha')
        )
        total = groups.count()
        offset = (page - 1) * page_size
        page_groups = groups[offset:offset + page_size]
        rep_ids = [g['rep_id'] for g in page_groups]

        pagos_dict = {
            p.id: p for p in Pago.objects.filter(id__in=rep_ids).select_related(
                'alumno', 'alumno__representante', 'usuario_receptor', 'banco_receptor'
            ).prefetch_related('solvencias_generadas')
            # prefetch evita que ComprobanteSerializer.get_numero_solvencia dispare
            # 1 query por fila (hasta 100 extra por página sin esto)
        }
        pagos = [pagos_dict[rid] for rid in rep_ids if rid in pagos_dict]

        return Response({
            'total': total,
            'page': page,
            'page_size': page_size,
            'total_pages': (total + page_size - 1) // page_size if total else 1,
            'results': ComprobanteSerializer(pagos, many=True).data,
        })


class ComprobanteDetalleView(APIView):
    """Retorna el detalle de un comprobante por su factura_id."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, factura_id):
        try:
            pago = Pago.objects.select_related(
                'alumno', 'alumno__representante', 'usuario_receptor', 'banco_receptor'
            ).get(factura_id=factura_id)
        except Pago.DoesNotExist:
            return Response({"error": "Comprobante no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ComprobanteSerializer(pago).data)


# ──────────────────────────────────────────────────────────────────────────────
# LISTADO DE PAGOS CON FILTROS AVANZADOS
# ──────────────────────────────────────────────────────────────────────────────

from .filters import MensualidadFilter, PagoFilter


class PagosListView(APIView):
    """
    Lista de pagos con filtros avanzados vía query params.

    Parámetros de filtro:
      alumno_id, grado_seccion, fecha_desde, fecha_hasta,
      metodo_pago, estatus, concepto, monto_min, monto_max,
      representante_documento

    Paginación:
      page (default 1), page_size (default 25, máx 100)

    Roles permitidos: director, sistemas, administrador, cobranza, cajero.
    """

    permission_classes = [permissions.IsAuthenticated]

    ROLES_PERMITIDOS = ('director', 'sistemas', 'administrador', 'cobranza', 'cajero')

    def get(self, request):
        rol = getattr(getattr(request.user, 'perfil', None), 'rol', '')
        if not request.user.is_superuser and rol not in self.ROLES_PERMITIDOS:
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)

        filterset = PagoFilter(
            request.query_params,
            queryset=Pago.objects.select_related(
                'alumno', 'banco_receptor', 'usuario_receptor',
            ).order_by('-fecha_pago'),
        )
        if not filterset.is_valid():
            return Response(filterset.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            page      = max(1, int(request.query_params.get('page', 1)))
            page_size = min(100, max(1, int(request.query_params.get('page_size', 25))))
        except (ValueError, TypeError):
            page, page_size = 1, 25

        qs    = filterset.qs
        total = qs.count()
        pagos = list(qs[(page - 1) * page_size: page * page_size])

        revisado_pago_ids = set(
            LoteRevisionCaja.pagos.through.objects
            .filter(pago_id__in=[p.id for p in pagos])
            .values_list('pago_id', flat=True)
        )

        return Response({
            'total':       total,
            'page':        page,
            'page_size':   page_size,
            'total_pages': max(1, (total + page_size - 1) // page_size),
            'results':     PagoSerializer(
                pagos, many=True,
                context={'revisado_pago_ids': revisado_pago_ids},
            ).data,
        })


class ResumenConciliacionView(APIView):
    """
    Resumen de transacciones agrupado y paginado por REPRESENTANTE (no por pago
    suelto ni por alumno), pensado para el checklist de conciliación con
    comprobantes físicos.

    Se agrupa por representante — y no por alumno — porque una misma operación
    (un solo comprobante físico) puede cubrir a varios hermanos del mismo
    representante (ver validación en PagoCreateSerializer: todos los alumnos
    de una transacción deben pertenecer al mismo representante). Agrupar por
    alumno partiría esa operación entre varias secciones.

    Los representantes se ordenan por 'orden de llegada' (fecha del primer
    pago del representante dentro del rango), y la paginación avanza de a
    page_size representantes, trayendo TODOS los pagos de sus alumnos en el
    rango (sin recortar a un tope fijo de filas como pagos/lista/).

    Parámetros:
      fecha_desde, fecha_hasta (default: hoy)
      buscar: nombre/apellido/cédula del alumno o del representante, o
              referencia — busca sobre TODO el rango (no solo la página
              cargada) y, si un representante matchea por cualquiera de sus
              pagos, se muestran todos sus pagos del rango.
      metodo_pago, estatus: filtros exactos, aplican a los pagos mostrados.
      page (default 1), page_size (default 15, máx 50 representantes por página)
    """
    permission_classes = [permissions.IsAuthenticated]
    ROLES_PERMITIDOS = ('director', 'sistemas', 'administrador', 'cobranza', 'cajero')

    def get(self, request):
        from datetime import date

        rol = getattr(getattr(request.user, 'perfil', None), 'rol', '')
        if not request.user.is_superuser and rol not in self.ROLES_PERMITIDOS:
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)

        fecha_desde = request.query_params.get('fecha_desde') or date.today().isoformat()
        fecha_hasta = request.query_params.get('fecha_hasta') or date.today().isoformat()
        buscar = (request.query_params.get('buscar') or '').strip()
        metodo_pago = request.query_params.get('metodo_pago')
        estatus = request.query_params.get('estatus')

        try:
            page = max(1, int(request.query_params.get('page', 1)))
            page_size = min(50, max(1, int(request.query_params.get('page_size', 15))))
        except (ValueError, TypeError):
            page, page_size = 1, 15

        base_qs = Pago.objects.filter(
            fecha_pago__date__gte=fecha_desde,
            fecha_pago__date__lte=fecha_hasta,
        )
        if metodo_pago:
            base_qs = base_qs.filter(metodo_pago=metodo_pago)
        if estatus:
            base_qs = base_qs.filter(estatus=estatus)

        qs_busqueda = base_qs
        if buscar:
            qs_busqueda = qs_busqueda.filter(
                Q(alumno__nombre__icontains=buscar) |
                Q(alumno__apellido__icontains=buscar) |
                Q(alumno__cedula_escolar__icontains=buscar) |
                Q(alumno__representante__nombre__icontains=buscar) |
                Q(alumno__representante__apellido__icontains=buscar) |
                Q(alumno__representante__cedula__icontains=buscar) |
                Q(referencia__icontains=buscar)
            )

        representantes_ordenados = list(
            qs_busqueda.values('alumno__representante_id')
            .annotate(primer_pago=Min('fecha_pago'))
            .order_by('primer_pago')
        )
        total_representantes = len(representantes_ordenados)
        pagina_representante_ids = [
            r['alumno__representante_id']
            for r in representantes_ordenados[(page - 1) * page_size: page * page_size]
        ]

        # Trae TODOS los pagos del rango para los representantes de esta página
        # (no solo los que matchearon la búsqueda), para no esconder métodos ni
        # alumnos del mismo representante.
        pagos_pagina = list(
            base_qs.filter(alumno__representante_id__in=pagina_representante_ids)
            .select_related('alumno__representante', 'banco_receptor', 'usuario_receptor')
            .order_by('fecha_pago')
        )

        revisado_pago_ids = set(
            LoteRevisionCaja.pagos.through.objects
            .filter(pago_id__in=[p.id for p in pagos_pagina])
            .values_list('pago_id', flat=True)
        )

        serializados = PagoSerializer(
            pagos_pagina, many=True,
            context={'revisado_pago_ids': revisado_pago_ids},
        ).data

        por_representante = {}
        representante_info = {}
        for pago_obj, p in zip(pagos_pagina, serializados):
            rid = p['representante_id']
            por_representante.setdefault(rid, []).append(p)

            rep = pago_obj.alumno.representante
            if rid not in representante_info:
                representante_info[rid] = {
                    'representante_id': rid,
                    'representante_nombre': f"{rep.nombre} {rep.apellido}".strip(),
                    'representante_cedula': rep.cedula,
                }

        # Los representados se traen TODOS los alumnos activos del representante
        # (no solo los que tienen pagos en el rango filtrado), para que el
        # desglose por representante muestre siempre a todos sus hijos.
        from secretaria.models import Alumno

        alumnos_por_representante = {}
        for a in (
            Alumno.objects.filter(representante_id__in=pagina_representante_ids)
            .order_by('nombre', 'apellido')
        ):
            alumnos_por_representante.setdefault(a.representante_id, []).append({
                'alumno_id': a.id,
                'nombre': a.nombre,
                'apellido': a.apellido,
                'cedula_escolar': a.cedula_escolar,
            })

        resultados = [
            {
                **representante_info.get(rid, {'representante_id': rid, 'representante_nombre': '', 'representante_cedula': ''}),
                'alumnos': alumnos_por_representante.get(rid, []),
                'pagos': por_representante.get(rid, []),
            }
            for rid in pagina_representante_ids
        ]

        return Response({
            'total_representantes': total_representantes,
            'page':          page,
            'page_size':     page_size,
            'total_pages':   max(1, (total_representantes + page_size - 1) // page_size),
            'results':       resultados,
        })


# ──────────────────────────────────────────────────────────────────────────────
# LOTES DE REVISIÓN DE CAJA (conciliación con comprobantes físicos)
# ──────────────────────────────────────────────────────────────────────────────

class LoteRevisionCajaListCreateView(APIView):
    """
    GET:  historial de lotes de conciliación finalizados (más recientes primero).
    POST: finaliza un nuevo lote con las operaciones marcadas por el operador.
          Body: { fecha_inicio, fecha_fin, pago_ids: [...], observaciones? }
    """
    permission_classes = [permissions.IsAuthenticated]
    ROLES_PERMITIDOS = ('director', 'sistemas', 'administrador', 'cobranza', 'cajero')

    def _check_permiso(self, request):
        rol = getattr(getattr(request.user, 'perfil', None), 'rol', '')
        return request.user.is_superuser or rol in self.ROLES_PERMITIDOS

    def get(self, request):
        if not self._check_permiso(request):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)

        lotes = LoteRevisionCaja.objects.select_related('usuario').all()[:100]
        return Response(LoteRevisionCajaSerializer(lotes, many=True).data)

    @transaction.atomic
    def post(self, request):
        if not self._check_permiso(request):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)

        pago_ids = request.data.get('pago_ids') or []
        fecha_inicio = request.data.get('fecha_inicio')
        fecha_fin = request.data.get('fecha_fin')

        if not pago_ids:
            return Response(
                {'error': 'Debe marcar al menos una transacción antes de finalizar.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not fecha_inicio or not fecha_fin:
            return Response(
                {'error': 'fecha_inicio y fecha_fin son requeridas.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pagos = Pago.objects.filter(id__in=pago_ids)
        if not pagos.exists():
            return Response({'error': 'Las transacciones indicadas no existen.'}, status=status.HTTP_400_BAD_REQUEST)

        lote = LoteRevisionCaja.objects.create(
            fecha_inicio=fecha_inicio,
            fecha_fin=fecha_fin,
            usuario=request.user,
            observaciones=(request.data.get('observaciones') or ''),
        )
        lote.pagos.set(pagos)

        return Response(LoteRevisionCajaSerializer(lote).data, status=status.HTTP_201_CREATED)


class LoteRevisionCajaDetailView(APIView):
    """Detalle de un lote de conciliación ya finalizado, incluyendo sus transacciones."""
    permission_classes = [permissions.IsAuthenticated]
    ROLES_PERMITIDOS = ('director', 'sistemas', 'administrador', 'cobranza', 'cajero')

    def get(self, request, pk):
        rol = getattr(getattr(request.user, 'perfil', None), 'rol', '')
        if not request.user.is_superuser and rol not in self.ROLES_PERMITIDOS:
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            lote = LoteRevisionCaja.objects.select_related('usuario').get(pk=pk)
        except LoteRevisionCaja.DoesNotExist:
            return Response({'error': 'Lote no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        pagos = lote.pagos.select_related('alumno', 'banco_receptor', 'usuario_receptor').order_by('-fecha_pago')

        data = LoteRevisionCajaSerializer(lote).data
        data['pagos'] = PagoSerializer(
            pagos, many=True,
            context={'revisado_pago_ids': set(p.id for p in pagos)},
        ).data
        return Response(data)


class ExtraerPdfConciliacionView(APIView):
    """
    Extrae la tabla de un estado de cuenta bancario en PDF (cualquier banco)
    y la devuelve como filas crudas para que el frontend (bankParsers.js)
    haga la misma detección de columnas que ya usa para Excel/CSV.
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser]
    ROLES_PERMITIDOS = ('director', 'sistemas', 'administrador', 'cobranza', 'cajero')
    TAMANO_MAXIMO_MB = 10

    def post(self, request):
        rol = getattr(getattr(request.user, 'perfil', None), 'rol', '')
        if not request.user.is_superuser and rol not in self.ROLES_PERMITIDOS:
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)

        archivo = request.FILES.get('archivo')
        if not archivo:
            return Response({'error': 'Debe adjuntar un archivo PDF.'}, status=status.HTTP_400_BAD_REQUEST)
        if not archivo.name.lower().endswith('.pdf'):
            return Response({'error': 'El archivo debe ser un PDF.'}, status=status.HTTP_400_BAD_REQUEST)
        if archivo.size > self.TAMANO_MAXIMO_MB * 1024 * 1024:
            return Response(
                {'error': f'El archivo excede el tamaño máximo de {self.TAMANO_MAXIMO_MB}MB.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            filas = extraer_tabla_pdf(archivo)
        except PdfSinTablaError as e:
            return Response({'error': str(e)}, status=422)
        except Exception:
            logger.exception('Error al procesar PDF de conciliación')
            return Response(
                {'error': 'No se pudo procesar el PDF. Verifica que no esté dañado o protegido con contraseña.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({'rows': filas})


# ──────────────────────────────────────────────────────────────────────────────
# PUNTUALIDAD DE PAGOS (atrasado / a tiempo / adelantado)
# ──────────────────────────────────────────────────────────────────────────────

class MensualidadesPuntualidadView(APIView):
    """
    Clasifica las mensualidades pagadas según cuándo se abonaron respecto
    al mes que corresponden:
      - adelantado: fecha_pago antes del mes de la mensualidad
      - a_tiempo:   fecha_pago dentro del mismo mes
      - atrasado:   fecha_pago después del mes de la mensualidad

    Parámetros:
      granularidad: 'dia' | 'mes' | 'anio'  (default: 'anio')
      fecha:  YYYY-MM-DD  (para granularidad=dia, default: hoy)
      anio:   YYYY        (para granularidad=mes o anio, default: año actual)
      mes:    1..12       (para granularidad=mes, default: mes actual)
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from django.db.models import (
            Case, When, Value, CharField, Count,
            ExpressionWrapper, IntegerField, F,
        )
        from django.db.models.functions import ExtractMonth, ExtractYear
        from datetime import date as _date, datetime

        granularidad = request.query_params.get('granularidad', 'anio')
        anio_param   = request.query_params.get('anio')
        mes_param    = request.query_params.get('mes')
        fecha_param  = request.query_params.get('fecha')

        hoy = _date.today()
        qs  = Mensualidad.objects.filter(pagado=True, fecha_pago__isnull=False)

        if granularidad == 'dia':
            if fecha_param:
                try:
                    fecha = datetime.strptime(fecha_param, '%Y-%m-%d').date()
                except ValueError:
                    return Response({"error": "Formato de fecha inválido. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)
            else:
                fecha = hoy
            qs = qs.filter(fecha_pago__date=fecha)

        elif granularidad == 'mes':
            try:
                anio = int(anio_param) if anio_param else hoy.year
                mes  = int(mes_param)  if mes_param  else hoy.month
                if not (1 <= mes <= 12):
                    raise ValueError
            except (ValueError, TypeError):
                return Response({"error": "anio y mes deben ser enteros válidos."}, status=status.HTTP_400_BAD_REQUEST)
            # Filtra por el período de la mensualidad, no por cuándo se pagó.
            # Así los adelantados aparecen en el mes al que corresponden.
            qs = qs.filter(anio=anio, mes=mes)

        else:  # anio
            try:
                anio = int(anio_param) if anio_param else hoy.year
            except (ValueError, TypeError):
                return Response({"error": "anio debe ser un entero."}, status=status.HTTP_400_BAD_REQUEST)
            # Ídem: filtra por el año de la mensualidad, no el año de pago.
            qs = qs.filter(anio=anio)

        qs = qs.annotate(
            payment_ym=ExpressionWrapper(
                ExtractYear('fecha_pago') * 12 + ExtractMonth('fecha_pago'),
                output_field=IntegerField(),
            ),
            due_ym=ExpressionWrapper(
                F('anio') * 12 + F('mes'),
                output_field=IntegerField(),
            ),
        ).annotate(
            tipo_pago=Case(
                When(payment_ym__lt=F('due_ym'), then=Value('adelantado')),
                When(payment_ym=F('due_ym'),     then=Value('a_tiempo')),
                default=Value('atrasado'),
                output_field=CharField(max_length=20),
            )
        )

        counts = {row['tipo_pago']: row['count'] for row in
                  qs.values('tipo_pago').annotate(count=Count('id'))}

        total      = sum(counts.values())
        atrasado   = counts.get('atrasado',   0)
        a_tiempo   = counts.get('a_tiempo',   0)
        adelantado = counts.get('adelantado', 0)

        return Response({
            'total':      total,
            'atrasado':   atrasado,
            'a_tiempo':   a_tiempo,
            'adelantado': adelantado,
        })


# ──────────────────────────────────────────────────────────────────────────────
# MOROSOS DINÁMICO — calculado desde mensualidades, sin depender de Celery
# ──────────────────────────────────────────────────────────────────────────────

class ListaMorososView(APIView):
    """
    Devuelve en tiempo real los alumnos con mensualidades vencidas.
    No usa el campo estatus_financiero (que depende de Celery) sino que
    consulta directamente las mensualidades para determinar mora:

      - Vencidas:   mensualidades de meses anteriores sin pagar.
      - Mes actual: sin pagar y hoy > dia_limite_pago del alumno.
      - Inscripción/solvencia impagas también cuentan como mora (ver cobranza/mora.py).

    Incluye monto_adeudado, meses_adeudados, monto_solvencia_adeudado y
    monto_proyecto_inversion_adeudado (estos dos últimos aparte, sin sumarse
    a monto_adeudado) por alumno, sin N+1 queries.
    """
    permission_classes = [permissions.IsAuthenticated]

    @staticmethod
    def _build_qs(hoy, buscar=''):
        from secretaria.models import Alumno
        from .mora import annotate_mora_detalle

        # Criterio de mora centralizado en cobranza/mora.py (fuente de verdad única
        # compartida con la tarea Celery y el módulo de alumnos).
        qs = (
            annotate_mora_detalle(
                Alumno.objects.filter(activo=True).exclude(estatus_financiero='becado'),
                hoy,
            )
            .filter(en_mora=True)
            .select_related('representante')
            .order_by('-monto_adeudado', 'apellido', 'nombre')
        )

        if buscar:
            qs = qs.filter(
                Q(nombre__icontains=buscar) |
                Q(apellido__icontains=buscar) |
                Q(cedula_escolar__icontains=buscar) |
                Q(representante__nombre__icontains=buscar) |
                Q(representante__cedula__icontains=buscar)
            )
        return qs

    def get(self, request):
        from datetime import date as _date
        from django.db.models import Sum
        hoy    = _date.today()
        buscar = request.query_params.get('buscar', '').strip()
        qs     = self._build_qs(hoy, buscar)

        # Totales sobre el queryset completo (no solo la página actual), para
        # que las tarjetas de resumen financiero no queden truncadas al paginar.
        agregados = qs.aggregate(
            total_deuda_usd=Sum('monto_adeudado'),
            total_solvencia_usd=Sum('monto_solvencia_adeudado'),
            total_proyecto_inversion_usd=Sum('monto_proyecto_inversion_adeudado'),
        )

        paginator = StandardResultsPagination()
        pagina = paginator.paginate_queryset(qs, request, view=self)

        results = [
            {
                'id':              a.id,
                'cedula_escolar':  a.cedula_escolar,
                'nombre':          a.nombre,
                'apellido':        a.apellido,
                'genero':          a.genero,
                'grado_seccion':   a.grado_seccion,
                'representante': {
                    'nombre':   a.representante.nombre,
                    'apellido': a.representante.apellido,
                    'cedula':   a.representante.cedula,
                    'telefono': a.representante.telefono,
                } if a.representante else None,
                'monto_adeudado':            str(a.monto_adeudado),
                'meses_adeudados':            a.meses_adeudados,
                'monto_solvencia_adeudado':   str(a.monto_solvencia_adeudado),
                'monto_proyecto_inversion_adeudado': str(a.monto_proyecto_inversion_adeudado),
            }
            for a in pagina
        ]
        response = paginator.get_paginated_response(results)
        response.data['total_deuda_usd'] = str(agregados['total_deuda_usd'] or 0)
        response.data['total_solvencia_usd'] = str(agregados['total_solvencia_usd'] or 0)
        response.data['total_proyecto_inversion_usd'] = str(agregados['total_proyecto_inversion_usd'] or 0)
        return response


class ExportarMorososExcelView(APIView):
    """
    Exporta la lista dinámica de morosos a Excel usando la misma lógica
    que ListaMorososView — sin depender de estatus_financiero.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from datetime import date as _date
        from cobranza.exports import ExcelExporter

        hoy    = _date.today()
        buscar = request.query_params.get('buscar', '').strip()
        qs     = ListaMorososView._build_qs(hoy, buscar)

        columns = [
            ('Nombre',              'nombre'),
            ('Apellido',            'apellido'),
            ('Cédula Escolar',      'cedula_escolar'),
            ('Grado / Sección',     'grado_seccion'),
            ('Representante',       lambda a: f"{a.representante.nombre} {a.representante.apellido}" if a.representante else ''),
            ('Tel. Representante',  lambda a: a.representante.telefono if a.representante else ''),
            ('Meses Adeudados',     'meses_adeudados'),
            ('Monto Adeudado (USD)','monto_adeudado'),
            ('Solvencia Adeudada (USD)', 'monto_solvencia_adeudado'),
            ('Proyecto de Inversión Adeudado (USD)', 'monto_proyecto_inversion_adeudado'),
        ]
        return ExcelExporter.export(qs, columns, f'morosos_{hoy}')


# ──────────────────────────────────────────────────────────────────────────────
# CONFIG NOMINA — almacenada en ParametroGlobal, no en localStorage del cliente
# ──────────────────────────────────────────────────────────────────────────────
import json as _json

class ConfigNominaView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSystemAdminOrDirector]
    CLAVE = 'NOMINA_CONFIG_JSON'

    def get(self, request):
        param = ParametroGlobal.objects.filter(clave=self.CLAVE).first()
        if not param or not param.valor:
            return Response({})
        try:
            return Response(_json.loads(param.valor))
        except Exception:
            return Response({})


# ──────────────────────────────────────────────────────────────────────────────
# SOLVENCIA DEL REPRESENTANTE
# ──────────────────────────────────────────────────────────────────────────────

class ConsultaSolvenciaView(APIView):
    """Busca la solvencia de un representante por su cédula. Es intransferible:
    solo existe (o no) una por representante, nunca por alumno."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        cedula = (request.query_params.get('cedula') or '').strip()
        if not cedula:
            return Response({"error": "Debe indicar la cédula del representante."}, status=status.HTTP_400_BAD_REQUEST)

        from secretaria.models import Representante
        representante = Representante.objects.filter(cedula=cedula).first()
        if not representante:
            return Response({"error": "No existe ningún representante con esa cédula."}, status=status.HTTP_404_NOT_FOUND)

        # No solo lee: también verifica en este momento si el representante ya
        # cumple el criterio (proyecto de inversión + inscripción pagados, sin
        # mora) y, de ser así, la emite. Esto cubre a quienes completaron su
        # pago antes de que existiera este mecanismo automático, o cuyo pago
        # se registró por una vía que no pasó por RegistrarPagoView.
        solvencia = generar_o_verificar_solvencia(representante)
        if not solvencia:
            return Response({
                "tiene_solvencia": False,
                "representante_cedula": representante.cedula,
                "representante_nombre": f"{representante.nombre} {representante.apellido}".strip(),
            }, status=status.HTTP_200_OK)

        data = SolvenciaRepresentanteSerializer(solvencia).data
        data["tiene_solvencia"] = True
        return Response(data, status=status.HTTP_200_OK)


class EmitirSolvenciaManualView(APIView):
    """Emisión manual de solvencia — exclusiva del rol Director. No valida
    elegibilidad automática (mora/pagos): es una excepción bajo su criterio."""
    permission_classes = [permissions.IsAuthenticated, IsDirector]

    def post(self, request):
        cedula = (request.data.get('cedula') or '').strip()
        observaciones = request.data.get('observaciones', '') or ''
        if not cedula:
            return Response({"error": "Debe indicar la cédula del representante."}, status=status.HTTP_400_BAD_REQUEST)

        from secretaria.models import Representante
        representante = Representante.objects.filter(cedula=cedula).first()
        if not representante:
            return Response({"error": "No existe ningún representante con esa cédula."}, status=status.HTTP_404_NOT_FOUND)

        solvencia, creada = emitir_solvencia_manual(representante, request.user, observaciones=observaciones)

        LogAuditoria.objects.create(
            usuario=request.user,
            accion="EMISION_SOLVENCIA_MANUAL",
            modulo="COBRANZA",
            detalles={
                "representante_cedula": representante.cedula,
                "numero_solvencia": solvencia.numero,
                "ya_existia": not creada,
                "observaciones": observaciones,
            }
        )

        data = SolvenciaRepresentanteSerializer(solvencia).data
        data["ya_existia"] = not creada
        return Response(data, status=status.HTTP_200_OK if not creada else status.HTTP_201_CREATED)

    def put(self, request):
        valor = _json.dumps(request.data)
        ParametroGlobal.objects.update_or_create(
            clave=self.CLAVE,
            defaults={'valor': valor, 'descripcion': 'Configuracion cesta ticket y nomina'},
        )
        return Response(request.data)