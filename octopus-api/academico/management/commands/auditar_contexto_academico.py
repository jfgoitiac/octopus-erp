import json

from django.core.management.base import BaseCommand
from django.db.models import F, Q

from academico.models import (
    Asistencia, GradoSeccion, HorarioClase, IncidenciaMigracionAcademica,
    Lapso, Materia, Nota, PeriodoEscolar,
)
from secretaria.models import ConfiguracionGrado, Inscripcion


class Command(BaseCommand):
    help = 'Emite un reporte JSON, sin modificar datos, sobre la normalización académica multi-sede.'

    def handle(self, *args, **options):
        reporte = {
            'periodos': PeriodoEscolar.objects.count(),
            'secciones': GradoSeccion.objects.count(),
            'pendientes': {
                'materias': Materia.objects.filter(Q(periodo__isnull=True) | Q(grado__isnull=True)).count(),
                'lapsos': Lapso.objects.filter(periodo__isnull=True).count(),
                'notas': Nota.objects.filter(periodo__isnull=True).count(),
                'asistencias': Asistencia.objects.filter(Q(periodo__isnull=True) | Q(grado__isnull=True)).count(),
                'horarios': HorarioClase.objects.filter(Q(periodo__isnull=True) | Q(grado__isnull=True)).count(),
                'inscripciones': Inscripcion.objects.filter(Q(periodo__isnull=True) | Q(grado__isnull=True) | Q(sede__isnull=True)).count(),
                'configuraciones_grado': ConfiguracionGrado.objects.filter(grado__isnull=True).count(),
            },
            'inconsistencias': {
                'materia_sede_periodo': Materia.objects.filter(periodo__isnull=False).exclude(sede_id=F('periodo__sede_id')).count(),
                'grado_periodo_materia': Materia.objects.filter(grado__isnull=False, periodo__isnull=False).exclude(grado__periodo_id=F('periodo_id')).count(),
                'inscripcion_sede_periodo': Inscripcion.objects.filter(sede__isnull=False, periodo__isnull=False).exclude(sede_id=F('periodo__sede_id')).count(),
            },
            'incidencias': {
                'abiertas': IncidenciaMigracionAcademica.objects.filter(resuelta=False).count(),
                'resueltas': IncidenciaMigracionAcademica.objects.filter(resuelta=True).count(),
            },
        }
        self.stdout.write(json.dumps(reporte, ensure_ascii=False, sort_keys=True))
