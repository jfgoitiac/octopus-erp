from django.db import migrations, models


ORIGEN = 'migracion_fase1'


def preparar_motor_canonico(apps, schema_editor):
    Configuracion = apps.get_model('academico', 'ConfiguracionCalificacion')
    Observacion = apps.get_model('academico', 'ObservacionCalificacion')
    Nota = apps.get_model('academico', 'Nota')
    Plan = apps.get_model('academico', 'PlanEvaluacion')
    NotaItem = apps.get_model('academico', 'NotaItemEvaluacion')

    ambiguas = NotaItem.objects.filter(
        models.Q(valor_numerico__isnull=True, valor_letra__isnull=True)
        | models.Q(valor_numerico__isnull=False, valor_letra__isnull=False)
        | models.Q(valor_numerico__lt=0)
    ).count()
    if ambiguas:
        raise RuntimeError(
            f'No se pueden activar los constraints: existen {ambiguas} notas de item ambiguas. '
            'Ejecute manage.py auditar_calificaciones --json y reconcilie los datos.'
        )

    pares_legacy = set(Nota.objects.values_list('materia_id', 'lapso_id').distinct())
    pares_plan = set(Plan.objects.values_list('materia_id', 'lapso_id').distinct())
    for materia_id, lapso_id in pares_legacy | pares_plan:
        if (materia_id, lapso_id) in pares_legacy and (materia_id, lapso_id) in pares_plan:
            motor = None
        elif (materia_id, lapso_id) in pares_plan:
            motor = 'plan'
        else:
            motor = 'legacy'
        Configuracion.objects.get_or_create(
            materia_id=materia_id,
            lapso_id=lapso_id,
            defaults={
                'motor': motor,
                'evaluaciones_esperadas': 4,
                'origen': ORIGEN,
            },
        )

    for nota in Nota.objects.exclude(observaciones='').iterator():
        Observacion.objects.get_or_create(
            alumno_id=nota.alumno_id,
            materia_id=nota.materia_id,
            lapso_id=nota.lapso_id,
            defaults={'texto': nota.observaciones, 'origen': ORIGEN},
        )


def revertir_datos_generados(apps, schema_editor):
    # Las tablas legacy nunca se tocaron. Solo se retiran filas generadas por
    # este backfill; observaciones/configuraciones manuales quedan intactas.
    apps.get_model('academico', 'ObservacionCalificacion').objects.filter(origen=ORIGEN).delete()
    apps.get_model('academico', 'ConfiguracionCalificacion').objects.filter(origen=ORIGEN).delete()


class Migration(migrations.Migration):
    dependencies = [('academico', '0018_motor_calificaciones_canonico')]

    operations = [
        migrations.RunPython(preparar_motor_canonico, revertir_datos_generados),
        migrations.AddConstraint(
            model_name='notaitemevaluacion',
            constraint=models.CheckConstraint(
                condition=(
                    (models.Q(valor_numerico__isnull=False) & models.Q(valor_letra__isnull=True))
                    | (models.Q(valor_numerico__isnull=True) & models.Q(valor_letra__isnull=False))
                ),
                name='academico_nota_item_un_solo_valor',
            ),
        ),
        migrations.AddConstraint(
            model_name='notaitemevaluacion',
            constraint=models.CheckConstraint(
                condition=models.Q(valor_numerico__isnull=True) | models.Q(valor_numerico__gte=0),
                name='academico_nota_item_numerica_no_negativa',
            ),
        ),
    ]
