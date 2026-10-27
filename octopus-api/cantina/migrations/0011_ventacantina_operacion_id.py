import uuid

from django.db import migrations, models


def asignar_operaciones_unicas(apps, schema_editor):
    VentaCantina = apps.get_model('cantina', 'VentaCantina')
    for venta_id in VentaCantina.objects.filter(operacion_id__isnull=True).values_list('pk', flat=True).iterator():
        VentaCantina.objects.filter(pk=venta_id).update(operacion_id=uuid.uuid4())


class Migration(migrations.Migration):

    dependencies = [
        ('cantina', '0010_plantillas_venta'),
    ]

    operations = [
        migrations.AddField(
            model_name='ventacantina',
            name='operacion_id',
            field=models.UUIDField(editable=False, null=True),
        ),
        migrations.RunPython(asignar_operaciones_unicas, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='ventacantina',
            name='operacion_id',
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
    ]
