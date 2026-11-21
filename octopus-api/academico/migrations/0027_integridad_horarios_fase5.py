from django.db import migrations, models
from django.db.models import Count, Q


def reconciliar_horarios(apps, schema_editor):
    Horario = apps.get_model('academico', 'HorarioClase')
    Incidencia = apps.get_model('academico', 'IncidenciaMigracionAcademica')

    duplicados = list(
        Horario.objects.filter(bloque_id__isnull=False, grado_id__isnull=False)
        .values('bloque_id', 'grado_id')
        .annotate(total=Count('id'))
        .filter(total__gt=1)
    )
    if duplicados:
        raise RuntimeError(
            'No se puede activar la unicidad de horarios: existen bloques '
            'duplicados por sección. Ejecute la auditoría académica y '
            'reconcilie esas filas antes de reintentar la migración.'
        )

    for horario in Horario.objects.filter(bloque_id__isnull=False).select_related(
        'bloque__paquete', 'materia', 'grado'
    ).iterator():
        bloque = horario.bloque
        paquete = bloque.paquete
        cambios = []
        for campo, valor in (
            ('dia_semana', bloque.dia_semana),
            ('hora_inicio', bloque.hora_inicio),
            ('hora_fin', bloque.hora_fin),
        ):
            if getattr(horario, campo) != valor:
                setattr(horario, campo, valor)
                cambios.append(campo)
        if cambios:
            horario.save(update_fields=cambios)

        grado_id = horario.grado_id or horario.materia.grado_id
        pertenece = grado_id and paquete.grados.filter(grado_id=grado_id).exists()
        if not pertenece:
            Incidencia.objects.get_or_create(
                tipo='horario_fuera_paquete',
                modelo='academico.HorarioClase',
                objeto_id=horario.pk,
                defaults={'detalle': {
                    'bloque_id': horario.bloque_id,
                    'paquete_id': paquete.pk,
                    'grado_id': grado_id,
                }},
            )


class Migration(migrations.Migration):
    dependencies = [('academico', '0026_jornadaasistencia_asistencia_jornada_and_more')]

    operations = [
        migrations.RunPython(reconciliar_horarios, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name='horarioclase',
            constraint=models.UniqueConstraint(
                fields=('bloque', 'grado'),
                condition=Q(bloque__isnull=False, grado__isnull=False),
                name='academico_horario_bloque_grado_unico',
            ),
        ),
    ]
