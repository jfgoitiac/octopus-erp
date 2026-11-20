from django.db import migrations


def forwards(apps, schema_editor):
    Inscripcion = apps.get_model('secretaria', 'Inscripcion')
    ConfiguracionGrado = apps.get_model('secretaria', 'ConfiguracionGrado')
    GradoSeccion = apps.get_model('academico', 'GradoSeccion')

    for inscripcion in Inscripcion.objects.select_related('periodo', 'grado').iterator():
        cambios = []
        if inscripcion.periodo_id and not inscripcion.sede_id:
            inscripcion.sede_id = inscripcion.periodo.sede_id
            cambios.append('sede')
        if cambios:
            inscripcion.save(update_fields=cambios)

    for config in ConfiguracionGrado.objects.filter(grado__isnull=True).iterator():
        candidatos = list(GradoSeccion.objects.filter(nombre=config.grado_seccion).values_list('id', flat=True)[:2])
        if len(candidatos) == 1:
            config.grado_id = candidatos[0]
            config.save(update_fields=['grado'])


def backwards(apps, schema_editor):
    apps.get_model('secretaria', 'Inscripcion').objects.update(sede=None)
    apps.get_model('secretaria', 'ConfiguracionGrado').objects.update(grado=None)


class Migration(migrations.Migration):
    dependencies = [
        ('academico', '0024_alter_materia_codigo_and_more'),
        ('secretaria', '0034_configuraciongrado_grado_inscripcion_sede_and_more'),
    ]

    operations = [migrations.RunPython(forwards, backwards)]
