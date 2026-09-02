"""
Comando/cron para generar los cargos especiales pendientes del período
escolar activo (ver cobranza/services.py::generar_cargos_especiales_pendientes
y cobranza/models.py::TipoCargoEspecial).

Uso típico:

    python manage.py generar_cargos_especiales              # período activo
    python manage.py generar_cargos_especiales --periodo 2026-2027

Idempotente: los representantes/cuotas que ya existen para un TipoCargoEspecial
activo no se tocan (misma clave completa que los 7 puntos de escritura de
CuotaProyectoInversion: representante + periodo_escolar + tipo_concepto +
numero_cuota). Pensado para correr diario vía cron/Celery beat, igual que
generar_mensualidades.
"""
from django.core.management.base import BaseCommand, CommandError

from cobranza.services import configuracion_activa, generar_cargos_especiales_pendientes


class Command(BaseCommand):
    help = (
        "Genera los cargos especiales faltantes (TipoCargoEspecial activos) "
        "del período escolar indicado, por representante (idempotente)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--periodo',
            help="Período escolar, ej: 2026-2027 (default: periodo_escolar_activo).",
        )

    def handle(self, *args, **options):
        periodo = options['periodo']
        if not periodo:
            config = configuracion_activa()
            periodo = config.periodo_escolar_activo if config else None
            if not periodo:
                raise CommandError(
                    "No hay período escolar activo configurado. "
                    "Use --periodo AAAA-AAAA para indicarlo explícitamente."
                )

        creadas = generar_cargos_especiales_pendientes(periodo_escolar=periodo)
        self.stdout.write(self.style.SUCCESS(
            f"Listo: {creadas} cuotas de cargos especiales creadas para el período {periodo}."
        ))
