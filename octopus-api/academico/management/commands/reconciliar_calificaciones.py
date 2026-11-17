from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from academico.calificaciones import validar_configuracion
from academico.models import ConfiguracionCalificacion, Lapso, Materia, Nota, PlanEvaluacion


class Command(BaseCommand):
    help = 'Selecciona explícitamente la fuente canónica para una materia y lapso coexistentes.'

    def add_arguments(self, parser):
        parser.add_argument('--materia', type=int, required=True)
        parser.add_argument('--lapso', type=int, required=True)
        parser.add_argument('--motor', choices=('legacy', 'plan'), required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        materia = Materia.objects.filter(pk=options['materia']).first()
        lapso = Lapso.objects.filter(pk=options['lapso']).first()
        if materia is None or lapso is None:
            raise CommandError('Materia o lapso inexistente.')

        motor = options['motor']
        if motor == 'legacy' and not Nota.objects.filter(materia=materia, lapso=lapso).exists():
            raise CommandError('No existen notas legacy para seleccionar esa fuente.')
        if motor == 'plan' and not PlanEvaluacion.objects.filter(
            materia=materia, lapso=lapso, bloques__items__isnull=False,
        ).exists():
            raise CommandError('No existe un plan con ítems para seleccionar esa fuente.')

        config, _ = ConfiguracionCalificacion.objects.update_or_create(
            materia=materia,
            lapso=lapso,
            defaults={'motor': motor, 'origen': 'reconciliacion_manual'},
        )
        inconsistencias = set(validar_configuracion(materia, lapso))
        # La coexistencia es precisamente el caso que este comando resuelve:
        # los datos sombra se preservan, pero solo una fuente queda autorizada.
        inconsistencias.discard('coexistencia_legacy_plan')
        if inconsistencias:
            raise CommandError(
                'La fuente no puede activarse mientras existan inconsistencias: '
                + ', '.join(sorted(inconsistencias))
            )
        self.stdout.write(self.style.SUCCESS(
            f'Fuente canónica actualizada: materia={materia.id}, lapso={lapso.id}, motor={config.motor}.'
        ))
