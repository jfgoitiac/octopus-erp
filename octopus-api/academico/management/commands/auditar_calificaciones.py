"""Auditoría read-only previa a activar el motor canónico."""

import json

from django.core.management.base import BaseCommand
from django.db.models import F, Q

from academico.models import (
    ConfiguracionCalificacion,
    Nota,
    NotaItemEvaluacion,
    PlanEvaluacion,
)


class Command(BaseCommand):
    help = 'Reporta conflictos y datos que requieren reconciliación; no modifica la base.'

    def add_arguments(self, parser):
        parser.add_argument('--json', action='store_true', dest='como_json')

    def handle(self, *args, **options):
        pares_legacy = set(Nota.objects.values_list('materia_id', 'lapso_id').distinct())
        pares_plan = set(PlanEvaluacion.objects.values_list('materia_id', 'lapso_id').distinct())
        coexistencias = sorted(pares_legacy & pares_plan)

        parciales_legacy = Nota.objects.filter(
            Q(evaluacion_1__isnull=True) | Q(evaluacion_2__isnull=True)
            | Q(evaluacion_3__isnull=True) | Q(evaluacion_4__isnull=True)
        ).count()
        con_observaciones = Nota.objects.exclude(observaciones='').count()
        fuera_rango_legacy = Nota.objects.filter(
            Q(evaluacion_1__lt=0) | Q(evaluacion_1__gt=20)
            | Q(evaluacion_2__lt=0) | Q(evaluacion_2__gt=20)
            | Q(evaluacion_3__lt=0) | Q(evaluacion_3__gt=20)
            | Q(evaluacion_4__lt=0) | Q(evaluacion_4__gt=20)
        ).count()
        fuera_rango_plan = NotaItemEvaluacion.objects.filter(
            Q(valor_numerico__lt=0)
            | Q(item__valor_maximo__isnull=False, valor_numerico__gt=F('item__valor_maximo'))
        ).count()
        valores_ambiguos = NotaItemEvaluacion.objects.filter(
            Q(valor_numerico__isnull=True, valor_letra__isnull=True)
            | Q(valor_numerico__isnull=False, valor_letra__isnull=False)
        ).count()
        alumnos_fuera_seccion = Nota.objects.exclude(
            alumno__grado_seccion=F('materia__grado_seccion')
        ).count()
        alumnos_fuera_sede = Nota.objects.exclude(
            alumno__sede_id=F('materia__sede_id')
        ).count()
        fuentes_sin_resolver = ConfiguracionCalificacion.objects.filter(motor__isnull=True).count()

        reporte = {
            'pares_legacy': len(pares_legacy),
            'pares_plan': len(pares_plan),
            'coexistencias': [
                {'materia_id': materia_id, 'lapso_id': lapso_id}
                for materia_id, lapso_id in coexistencias
            ],
            'legacy_parciales': parciales_legacy,
            'legacy_con_observaciones': con_observaciones,
            'legacy_fuera_rango': fuera_rango_legacy,
            'plan_fuera_rango': fuera_rango_plan,
            'plan_valores_ambiguos': valores_ambiguos,
            'alumnos_fuera_seccion': alumnos_fuera_seccion,
            'alumnos_fuera_sede': alumnos_fuera_sede,
            'fuentes_sin_resolver': fuentes_sin_resolver,
        }
        if options['como_json']:
            self.stdout.write(json.dumps(reporte, ensure_ascii=False, indent=2))
            return

        self.stdout.write(self.style.MIGRATE_HEADING('Auditoría de calificaciones (solo lectura)'))
        for clave, valor in reporte.items():
            if clave == 'coexistencias':
                self.stdout.write(f'{clave}: {len(valor)}')
                for par in valor:
                    self.stdout.write(f"  materia={par['materia_id']} lapso={par['lapso_id']}")
            else:
                self.stdout.write(f'{clave}: {valor}')

