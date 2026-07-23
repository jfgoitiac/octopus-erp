"""
Corrige en batch las CuotaProyectoInversion que quedaron con `pagado=True`
pero `monto_pagado < monto_usd`, producto del hardcodeo manual que existía
en views.py antes de que CuotaProyectoInversion.save() derivara `pagado`
automáticamente (ver cobranza/models.py). No toca `monto_pagado`: solo
re-guarda cada registro corrompido para que save() recalcule `pagado` y
`fecha_pago` a partir del monto realmente abonado. Es idempotente: si se
corre dos veces, la segunda vez no encuentra nada que corregir.

Por seguridad, corre en modo de solo-lectura (dry-run) por defecto. Para
aplicar los cambios hay que pasar --confirm explícitamente.

Uso:
    python manage.py sincronizar_proyectos_inversion              # dry-run
    python manage.py sincronizar_proyectos_inversion --confirm     # aplica
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import F

from cobranza.models import CuotaProyectoInversion


class Command(BaseCommand):
    help = (
        "Corrige CuotaProyectoInversion con pagado=True y monto_pagado < monto_usd "
        "(deuda real invisible por el hardcodeo manual que existía antes del fix)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm',
            action='store_true',
            help="Aplica la corrección real. Sin esta bandera solo se reporta lo que se haría.",
        )

    def handle(self, *args, **options):
        confirmar = options['confirm']

        cuotas_corrompidas = CuotaProyectoInversion.objects.filter(
            pagado=True, monto_pagado__lt=F('monto_usd')
        ).select_related('representante')

        total = cuotas_corrompidas.count()
        monto_total = sum(
            (c.monto_usd - c.monto_pagado for c in cuotas_corrompidas), start=0
        ) if total else 0

        self.stdout.write(
            f"CuotaProyectoInversion con pagado=True pero deuda real pendiente: {total} (${monto_total})"
        )

        if not confirmar:
            self.stdout.write(self.style.WARNING(
                "[DRY-RUN] No se escribió nada. Vuelve a correr con --confirm para aplicar."
            ))
            return

        if total == 0:
            self.stdout.write(self.style.SUCCESS("No hay nada que corregir."))
            return

        actualizadas = 0
        with transaction.atomic():
            for cuota in cuotas_corrompidas:
                # No se toca monto_pagado: solo se re-guarda para que
                # save() derive pagado/fecha_pago del monto real.
                cuota.save()
                actualizadas += 1

        self.stdout.write(self.style.SUCCESS(
            f"Listo: {actualizadas} CuotaProyectoInversion corregidas (pagado=False, deuda real visible)."
        ))
