"""
Comando de corrección/backfill de cuotas de inscripción.

Uso típico (período ya promovido antes del fix, sin cuotas de inscripción
generadas para ese período):

    python manage.py generar_cuotas_inscripcion              # período activo
    python manage.py generar_cuotas_inscripcion --dry-run    # solo muestra qué haría
    python manage.py generar_cuotas_inscripcion --periodo 2026-2027

Genera las CuotaInscripcion faltantes del período escolar indicado (por
defecto, ConfiguracionSistema.periodo_escolar_activo) para todos los
alumnos activos, usando el monto del ParametroGlobal
MONTO_INSCRIPCION_DEFECTO (o $50.00 si no está configurado). Es idempotente:
gracias a unique_together=('alumno', 'periodo_escolar') en el modelo, los
alumnos que ya tienen cuota para ese período no se tocan.
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError

from cobranza.models import CuotaInscripcion, ParametroGlobal
from secretaria.models import Alumno, ConfiguracionSistema


class Command(BaseCommand):
    help = (
        "Genera las CuotaInscripcion faltantes de un período escolar "
        "para todos los alumnos activos (idempotente)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--periodo',
            help="Período escolar, ej: 2026-2027 (default: periodo_escolar_activo).",
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help="Muestra cuántas cuotas se crearían sin escribir nada.",
        )

    def handle(self, *args, **options):
        if options['periodo']:
            periodo = options['periodo']
        else:
            config = ConfiguracionSistema.objects.first()
            if not config or not config.periodo_escolar_activo:
                raise CommandError(
                    "No hay período escolar activo configurado. "
                    "Use --periodo AAAA-AAAA para indicarlo explícitamente."
                )
            periodo = config.periodo_escolar_activo

        param = ParametroGlobal.objects.filter(clave="MONTO_INSCRIPCION_DEFECTO").first()
        monto = Decimal(param.valor) if param and param.valor else Decimal('50.00')

        alumnos = Alumno.objects.filter(activo=True)
        total_alumnos = alumnos.count()

        existentes = set(
            CuotaInscripcion.objects
            .filter(periodo_escolar=periodo, alumno_id__in=alumnos.values_list('pk', flat=True))
            .values_list('alumno_id', flat=True)
        )
        faltantes = [alumno for alumno in alumnos if alumno.id not in existentes]

        self.stdout.write(
            f"Período: {periodo} | Alumnos activos: {total_alumnos} | "
            f"Ya tienen cuota: {len(existentes)} | Faltantes: {len(faltantes)} | Monto: ${monto}"
        )

        if not faltantes:
            self.stdout.write(self.style.SUCCESS("Nada que hacer, todos los alumnos activos ya tienen cuota."))
            return

        if options['dry_run']:
            self.stdout.write(self.style.WARNING(
                f"[DRY-RUN] Se crearían {len(faltantes)} cuotas de inscripción. Nada fue escrito."
            ))
            return

        cuotas_nuevas = [
            CuotaInscripcion(
                alumno=alumno,
                periodo_escolar=periodo,
                monto_usd=monto,
                pagado=False,
            )
            for alumno in faltantes
        ]
        CuotaInscripcion.objects.bulk_create(cuotas_nuevas, ignore_conflicts=True)

        self.stdout.write(self.style.SUCCESS(
            f"Listo: {len(cuotas_nuevas)} cuotas de inscripción creadas para el período {periodo}."
        ))
