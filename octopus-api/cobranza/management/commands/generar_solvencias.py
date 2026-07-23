"""
Genera el cargo de Solvencia del período indicado para todos los alumnos
activos que aún no lo tengan. El monto por defecto es $0 (no exigible);
se asigna un monto específico por alumno editando el registro `CuotaSolvencia`
correspondiente cuando aplique un cobro real. Es idempotente: si el alumno ya
tiene una CuotaSolvencia para el período, no se toca.

Uso:
    python manage.py generar_solvencias --periodo 2025-2026
    python manage.py generar_solvencias --periodo 2025-2026 --dry-run
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError

from cobranza.models import CuotaSolvencia
from secretaria.models import Alumno


class Command(BaseCommand):
    help = "Genera el cargo de Solvencia del período dado para los alumnos activos que aún no lo tengan."

    def add_arguments(self, parser):
        parser.add_argument(
            '--periodo',
            required=True,
            help="Período escolar, ej: 2025-2026",
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help="Muestra cuántos cargos se crearían sin escribir nada.",
        )

    def handle(self, *args, **options):
        periodo = options['periodo'].strip()
        if not periodo:
            raise CommandError("Debe indicar --periodo, ej: 2025-2026")

        alumnos = Alumno.objects.filter(activo=True)
        existentes = set(
            CuotaSolvencia.objects
            .filter(alumno_id__in=alumnos.values_list('pk', flat=True), periodo_escolar=periodo)
            .values_list('alumno_id', flat=True)
        )
        faltantes = [a for a in alumnos if a.pk not in existentes]

        self.stdout.write(
            f"Período {periodo} | Alumnos activos: {alumnos.count()} | "
            f"Ya tienen solvencia: {len(existentes)} | Por crear: {len(faltantes)}"
        )

        if options['dry_run']:
            self.stdout.write(self.style.WARNING(
                f"[DRY-RUN] Se crearían {len(faltantes)} registros de CuotaSolvencia. Nada fue escrito."
            ))
            return

        # bulk_create no pasa por save(), así que pagado=True se fija a mano
        # acá para el caso $0 (no exigible) — igual al criterio que save()
        # aplicaría normalmente (ver CuotaSolvencia.save() en models.py).
        CuotaSolvencia.objects.bulk_create([
            CuotaSolvencia(alumno=a, periodo_escolar=periodo, monto_usd=Decimal('0.00'), pagado=True)
            for a in faltantes
        ])

        self.stdout.write(self.style.SUCCESS(
            f"Listo: {len(faltantes)} registros de CuotaSolvencia creados para el período {periodo} (monto $0, editar por alumno para exigir cobro)."
        ))
