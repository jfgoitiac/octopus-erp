"""
Comando de corrección/backfill de cuotas de inscripción.

Uso típico (período ya promovido antes del fix, sin cuotas de inscripción
generadas para ese período):

    python manage.py generar_cuotas_inscripcion              # período activo
    python manage.py generar_cuotas_inscripcion --dry-run    # solo muestra qué haría
    python manage.py generar_cuotas_inscripcion --periodo 2026-2027
    python manage.py generar_cuotas_inscripcion --solo-mora  # solo alumnos/representantes en mora

Genera las CuotaInscripcion faltantes del período escolar indicado (por
defecto, ConfiguracionSistema.periodo_escolar_activo) para todos los
alumnos activos, usando el monto del ParametroGlobal
MONTO_INSCRIPCION_DEFECTO (o $50.00 si no está configurado). Es idempotente:
gracias a unique_together=('alumno', 'periodo_escolar') en el modelo, los
alumnos que ya tienen cuota para ese período no se tocan.

También genera la CuotaProyectoInversion faltante por REPRESENTANTE (una
sola vez aunque tenga varios hijos), igual que hacen ConfiguracionSistemaView
y CargarCuotasInscripcionView al abrir inscripciones o cargar cuotas
manualmente. Antes este comando solo generaba CuotaInscripcion, dejando a los
representantes backfileados con esta herramienta sin la deuda de proyecto de
inversión en ningún lado del sistema (portal, cobranza, morosos).

Con --solo-mora, el backfill se limita a los alumnos que están EN MORA según
el criterio canónico (cobranza/mora.py::annotate_en_mora): no se le crea la
cuota a un representante solvente que nunca debió tenerla generada. Útil para
el "push" de corrección en producción sin afectar a nadie que esté al día.
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError

from cobranza.models import CuotaInscripcion, CuotaProyectoInversion, ParametroGlobal
from cobranza.services import monto_proyecto_inversion_defecto, tipo_cargo_proyecto_inversion
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
        parser.add_argument(
            '--solo-mora',
            action='store_true',
            help="Limita el backfill a alumnos en mora (criterio canónico de cobranza/mora.py).",
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
        if options['solo_mora']:
            from cobranza.mora import annotate_en_mora
            alumnos = annotate_en_mora(alumnos).filter(en_mora=True)
        alumnos = list(alumnos)
        total_alumnos = len(alumnos)

        existentes = set(
            CuotaInscripcion.objects
            .filter(periodo_escolar=periodo, alumno_id__in=[a.id for a in alumnos])
            .values_list('alumno_id', flat=True)
        )
        faltantes = [alumno for alumno in alumnos if alumno.id not in existentes]

        # CuotaProyectoInversion: una por representante (no por alumno). Se
        # calcula independientemente de `faltantes` (CuotaInscripcion): un
        # representante puede ya tener todas sus cuotas de inscripción y aun
        # así faltarle la de proyecto de inversión (p.ej. si se generaron por
        # separado), así que no basta con mirar si `faltantes` está vacío.
        monto_proyecto = monto_proyecto_inversion_defecto()
        representantes_ids = {alumno.representante_id for alumno in alumnos}
        representantes_existentes = set(
            CuotaProyectoInversion.objects
            .filter(periodo_escolar=periodo, representante_id__in=representantes_ids)
            .values_list('representante_id', flat=True)
        )
        representantes_faltantes = representantes_ids - representantes_existentes

        self.stdout.write(
            f"Período: {periodo} | Alumnos activos: {total_alumnos} | "
            f"Ya tienen cuota inscripción: {len(existentes)} | Faltantes inscripción: {len(faltantes)} | "
            f"Faltantes proyecto de inversión (representantes): {len(representantes_faltantes)} | Monto: ${monto}"
        )

        if not faltantes and not representantes_faltantes:
            self.stdout.write(self.style.SUCCESS("Nada que hacer, todos los alumnos y representantes ya tienen sus cuotas."))
            return

        if options['dry_run']:
            self.stdout.write(self.style.WARNING(
                f"[DRY-RUN] Se crearían {len(faltantes)} cuotas de inscripción y "
                f"{len(representantes_faltantes)} cuotas de proyecto de inversión. Nada fue escrito."
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

        tipo_proyecto = tipo_cargo_proyecto_inversion()
        proyectos_nuevos = [
            CuotaProyectoInversion(
                representante_id=representante_id,
                periodo_escolar=periodo,
                tipo_concepto=tipo_proyecto,
                numero_cuota=1,
                monto_usd=monto_proyecto,
                pagado=False,
            )
            for representante_id in representantes_faltantes
        ]
        CuotaProyectoInversion.objects.bulk_create(proyectos_nuevos, ignore_conflicts=True)

        self.stdout.write(self.style.SUCCESS(
            f"Listo: {len(cuotas_nuevas)} cuotas de inscripción y "
            f"{len(proyectos_nuevos)} cuotas de proyecto de inversión creadas "
            f"para el período {periodo}."
        ))
