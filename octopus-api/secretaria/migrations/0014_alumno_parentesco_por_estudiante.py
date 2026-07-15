from django.db import migrations, models


def copiar_parentesco_a_alumnos(apps, schema_editor):
    """Copia el parentesco compartido del Representante a cada uno de sus
    alumnos, como punto de partida antes de que pase a ser editable por
    estudiante."""
    Alumno = apps.get_model('secretaria', 'Alumno')
    for alumno in Alumno.objects.select_related('representante').all():
        parentesco = alumno.representante.parentesco if alumno.representante_id else ''
        if parentesco:
            alumno.parentesco = parentesco
            alumno.save(update_fields=['parentesco'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('secretaria', '0013_representante_activo_representante_fecha_eliminacion'),
    ]

    operations = [
        migrations.AddField(
            model_name='alumno',
            name='parentesco',
            field=models.CharField(
                blank=True, default='', max_length=10,
                choices=[('padre', 'Padre'), ('madre', 'Madre'), ('tutor', 'Tutor'), ('otro', 'Otro')],
            ),
        ),
        migrations.RunPython(copiar_parentesco_a_alumnos, noop),
        migrations.RemoveField(
            model_name='representante',
            name='parentesco',
        ),
    ]
