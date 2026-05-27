from django.db import migrations, models
from django.utils import timezone


def generate_factura_ids(apps, schema_editor):
    Pago = apps.get_model('cobranza', 'Pago')
    for pago in Pago.objects.filter(factura_id__isnull=True).order_by('id'):
        year = pago.fecha_pago.year if pago.fecha_pago else timezone.now().year
        pago.factura_id = f"REC-{year}-{pago.id:06d}"
        pago.save(update_fields=['factura_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('cobranza', '0004_bancoinstitucional_tipo'),
    ]

    operations = [
        migrations.AddField(
            model_name='pago',
            name='factura_id',
            field=models.CharField(blank=True, db_index=True, max_length=20, null=True, unique=True),
        ),
        migrations.RunPython(generate_factura_ids, migrations.RunPython.noop),
    ]
