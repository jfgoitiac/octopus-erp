"""
Agrupa retroactivamente pagos históricos que se registraron con varios
métodos de pago (transferencia + pago móvil + efectivo, etc.) en una misma
transacción, pero que antes del fix de RegistrarPagoView (ver
cobranza/views.py) quedaron guardados cada uno con su propio
`operacion_uuid` aleatorio en vez de compartir uno solo. Eso hacía que
ConsultaComprobantesView los mostrara como recibos separados en vez de un
único comprobante, aunque el representante hizo un solo pago.

No hay una relación explícita en la BD entre esos pagos "hermanos", así que
se agrupan con una heurística: pagos del MISMO alumno, registrados por el
MISMO cajero, con el MISMO concepto, cuyo fecha_pago (auto_now_add) cae
dentro de una ventana de pocos segundos entre sí. En la práctica esos campos
se generan en el mismo request/loop (ver RegistrarPagoView.post), así que
quedan a milisegundos de diferencia.

Es idempotente y NO toca pagos que:
  - Sean el único de su grupo (no hay nada que agrupar).
  - Ya compartan operacion_uuid con el resto del grupo.

Por seguridad, corre en modo de solo-lectura (dry-run) por defecto. Para
aplicar los cambios hay que pasar --confirm explícitamente.

Uso:
    python manage.py agrupar_pagos_historicos                       # dry-run, ventana 5s
    python manage.py agrupar_pagos_historicos --ventana-segundos 3
    python manage.py agrupar_pagos_historicos --confirm
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from cobranza.models import Pago


class Command(BaseCommand):
    help = (
        "Agrupa bajo un mismo operacion_uuid los pagos históricos que se "
        "dividieron en varios métodos de pago dentro de una misma transacción, "
        "para que aparezcan como un solo comprobante en vez de varios."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--ventana-segundos',
            type=int,
            default=5,
            help="Tolerancia máxima (segundos) entre fecha_pago de pagos consecutivos "
                 "del mismo alumno/cajero/concepto para considerarlos parte de la misma "
                 "operación. Por defecto 5.",
        )
        parser.add_argument(
            '--confirm',
            action='store_true',
            help="Aplica el reagrupamiento real. Sin esta bandera solo se reporta lo que se haría.",
        )

    def handle(self, *args, **options):
        confirmar = options['confirm']
        ventana = options['ventana_segundos']

        pagos = list(
            Pago.objects.order_by('alumno_id', 'usuario_receptor_id', 'concepto', 'fecha_pago')
            .values('id', 'alumno_id', 'usuario_receptor_id', 'concepto', 'fecha_pago', 'operacion_uuid')
        )

        grupos = []
        cluster = []

        def cierra_cluster():
            if len(cluster) > 1:
                grupos.append(list(cluster))
            cluster.clear()

        anterior = None
        for p in pagos:
            clave = (p['alumno_id'], p['usuario_receptor_id'], p['concepto'])
            if anterior is None:
                cluster.append(p)
            else:
                clave_anterior = (anterior['alumno_id'], anterior['usuario_receptor_id'], anterior['concepto'])
                delta = (p['fecha_pago'] - anterior['fecha_pago']).total_seconds()
                if clave == clave_anterior and delta <= ventana:
                    cluster.append(p)
                else:
                    cierra_cluster()
                    cluster.append(p)
            anterior = p
        cierra_cluster()

        # Solo interesan los clusters que de verdad mezclan operacion_uuid
        # distintos: si ya comparten uno, no hay nada que hacer.
        grupos_a_fusionar = [g for g in grupos if len({p['operacion_uuid'] for p in g}) > 1]

        total_pagos_afectados = sum(len(g) for g in grupos_a_fusionar)

        self.stdout.write(
            f"Pagos analizados: {len(pagos)} | "
            f"Grupos candidatos (>1 pago, misma ventana): {len(grupos)} | "
            f"Grupos con operacion_uuid mezclados a fusionar: {len(grupos_a_fusionar)} | "
            f"Pagos que cambiarían de operacion_uuid: {total_pagos_afectados}"
        )

        for g in grupos_a_fusionar[:20]:
            ids = [p['id'] for p in g]
            uuid_destino = min(g, key=lambda p: p['id'])['operacion_uuid']
            self.stdout.write(
                f"  alumno_id={g[0]['alumno_id']} cajero_id={g[0]['usuario_receptor_id']} "
                f"concepto={g[0]['concepto']} pagos={ids} -> operacion_uuid={uuid_destino}"
            )
        if len(grupos_a_fusionar) > 20:
            self.stdout.write(f"  ... y {len(grupos_a_fusionar) - 20} grupos más.")

        if not confirmar:
            self.stdout.write(self.style.WARNING(
                "[DRY-RUN] No se escribió nada. Revisa el listado y vuelve a correr con --confirm para aplicar."
            ))
            return

        if not grupos_a_fusionar:
            self.stdout.write(self.style.SUCCESS("No hay nada que fusionar."))
            return

        actualizados = 0
        with transaction.atomic():
            for g in grupos_a_fusionar:
                uuid_destino = min(g, key=lambda p: p['id'])['operacion_uuid']
                ids = [p['id'] for p in g if p['operacion_uuid'] != uuid_destino]
                if not ids:
                    continue
                actualizados += Pago.objects.filter(id__in=ids).update(operacion_uuid=uuid_destino)

        self.stdout.write(self.style.SUCCESS(
            f"Listo: {actualizados} pagos reasignados a la operacion_uuid de su grupo "
            f"({len(grupos_a_fusionar)} operaciones fusionadas)."
        ))
