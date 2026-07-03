"""
Comando de corrección/backfill de mensualidades.

Uso típico (data ya cargada en el servidor, sin mensualidades generadas):

    python manage.py generar_mensualidades              # mes actual → julio
    python manage.py generar_mensualidades --dry-run    # solo muestra qué haría
    python manage.py generar_mensualidades --desde 2026-05   # backfill desde mayo

Genera las mensualidades faltantes del período escolar vigente (Sep–Jul) para
todos los alumnos activos no becados. Es idempotente: los meses que ya existen
no se tocan. No dispara emails al crear (bulk_create no ejecuta señales); las
notificaciones salen luego por la tarea diaria de revisión de vencimientos.
"""
from datetime import date

from django.core.management.base import BaseCommand, CommandError

from cobranza.services import (
    generar_mensualidades,
    meses_periodo_escolar,
    monto_mensualidad_defecto,
    periodo_escolar_de_fecha,
)
from secretaria.models import Alumno


class Command(BaseCommand):
    help = (
        "Genera las mensualidades faltantes del período escolar vigente "
        "para todos los alumnos activos no becados (idempotente)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--desde',
            help="Mes inicial en formato YYYY-MM (default: mes actual). "
                 "Debe pertenecer al período escolar vigente.",
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help="Muestra cuántas mensualidades se crearían sin escribir nada.",
        )

    def handle(self, *args, **options):
        hoy = date.today()

        if options['desde']:
            try:
                anio_desde, mes_desde = (int(p) for p in options['desde'].split('-'))
                date(anio_desde, mes_desde, 1)
            except (ValueError, TypeError):
                raise CommandError("Formato inválido para --desde. Use YYYY-MM, ej: 2026-05")
        else:
            anio_desde, mes_desde = hoy.year, hoy.month

        anio_inicio, anio_fin = periodo_escolar_de_fecha(hoy)
        meses = [
            (m, a) for (m, a) in meses_periodo_escolar(anio_inicio, anio_fin)
            if (a, m) >= (anio_desde, mes_desde)
        ]

        if not meses:
            self.stdout.write(self.style.WARNING(
                f"No hay meses que generar desde {mes_desde}/{anio_desde} "
                f"dentro del período {anio_inicio}-{anio_fin} (¿vacaciones de agosto "
                f"o fecha fuera del período?)."
            ))
            return

        alumnos = Alumno.objects.filter(activo=True).exclude(estatus_financiero='becado')
        total_alumnos = alumnos.count()
        monto = monto_mensualidad_defecto()

        rango = f"{meses[0][0]}/{meses[0][1]} → {meses[-1][0]}/{meses[-1][1]}"
        self.stdout.write(
            f"Período escolar {anio_inicio}-{anio_fin} | Meses: {rango} | "
            f"Alumnos activos no becados: {total_alumnos} | Monto: ${monto}"
        )

        if options['dry_run']:
            # Mismo cálculo que el servicio, sin escribir
            from cobranza.models import Mensualidad
            alumno_ids = list(alumnos.values_list('pk', flat=True))
            existentes = set(
                Mensualidad.objects
                .filter(alumno_id__in=alumno_ids, anio__in={a for (_, a) in meses})
                .values_list('alumno_id', 'mes', 'anio')
            )
            faltantes = sum(
                1
                for alumno_id in alumno_ids
                for (mes, anio) in meses
                if (alumno_id, mes, anio) not in existentes
            )
            self.stdout.write(self.style.WARNING(
                f"[DRY-RUN] Se crearían {faltantes} mensualidades. Nada fue escrito."
            ))
            return

        creadas = generar_mensualidades(alumnos, meses, monto=monto)
        self.stdout.write(self.style.SUCCESS(
            f"Listo: {creadas} mensualidades creadas "
            f"({total_alumnos} alumnos × {len(meses)} meses, los existentes se conservaron)."
        ))
        self.stdout.write(
            "La tarea diaria 'verificar-solvencia-diaria' sincronizará el estatus "
            "esta noche, o ejecute la verificación manualmente si necesita ver la "
            "mora de inmediato."
        )
