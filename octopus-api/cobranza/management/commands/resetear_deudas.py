"""
Resetea a "pagado" toda la deuda pendiente de mensualidades, inscripciones y
solvencias de TODOS los alumnos (todos los colegios/sedes). No borra ni
modifica los registros de `Pago`: el historial de pagos reales queda intacto,
solo se marca la deuda pendiente como saldada.

Por seguridad, el comando corre en modo de solo-lectura (dry-run) por
defecto. Para aplicar los cambios hay que pasar --confirm explícitamente.

Uso:
    python manage.py resetear_deudas                  # solo reporta, no escribe nada
    python manage.py resetear_deudas --confirm         # aplica el reseteo real
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from cobranza.models import Mensualidad, CuotaInscripcion, CuotaSolvencia


class Command(BaseCommand):
    help = (
        "Marca como pagada toda la deuda pendiente (mensualidades, cuotas de "
        "inscripción y solvencias) de todos los alumnos, sin tocar el historial de Pagos."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm',
            action='store_true',
            help="Aplica el reseteo de verdad. Sin esta bandera solo se reporta lo que se haría.",
        )

    def handle(self, *args, **options):
        confirmar = options['confirm']

        pendientes_mensualidad = Mensualidad.objects.filter(pagado=False)
        pendientes_inscripcion = CuotaInscripcion.objects.filter(pagado=False)
        pendientes_solvencia = CuotaSolvencia.objects.filter(pagado=False)

        n_mensualidad = pendientes_mensualidad.count()
        n_inscripcion = pendientes_inscripcion.count()
        n_solvencia = pendientes_solvencia.count()
        total = n_mensualidad + n_inscripcion + n_solvencia

        self.stdout.write(
            f"Deuda pendiente encontrada -> "
            f"Mensualidades: {n_mensualidad} | "
            f"Cuotas de inscripción: {n_inscripcion} | "
            f"Cuotas de solvencia: {n_solvencia} | "
            f"Total: {total}"
        )

        if not confirmar:
            self.stdout.write(self.style.WARNING(
                "[DRY-RUN] No se escribió nada. Vuelve a correr con --confirm para aplicar el reseteo."
            ))
            return

        if total == 0:
            self.stdout.write(self.style.SUCCESS("No hay deuda pendiente que resetear."))
            return

        ahora = timezone.now()
        with transaction.atomic():
            actualizadas_mensualidad = pendientes_mensualidad.update(pagado=True, fecha_pago=ahora)
            actualizadas_inscripcion = pendientes_inscripcion.update(pagado=True, fecha_pago=ahora)
            # CuotaSolvencia deriva `pagado` de monto_pagado vs monto_usd en
            # save() (ver models.py): un bulk .update(pagado=True) sin tocar
            # monto_pagado quedaría desincronizado en el próximo save() de
            # cualquier código. Se iguala monto_pagado al monto total también.
            actualizadas_solvencia = pendientes_solvencia.update(
                pagado=True, fecha_pago=ahora, monto_pagado=F('monto_usd')
            )

        self.stdout.write(self.style.SUCCESS(
            f"Listo. Se marcaron como pagadas -> "
            f"Mensualidades: {actualizadas_mensualidad} | "
            f"Cuotas de inscripción: {actualizadas_inscripcion} | "
            f"Cuotas de solvencia: {actualizadas_solvencia}. "
            f"El historial de Pago no fue modificado."
        ))
