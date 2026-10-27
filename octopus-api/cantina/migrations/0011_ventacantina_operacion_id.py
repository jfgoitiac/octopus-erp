import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cantina', '0010_plantillas_venta'),
    ]

    operations = [
        migrations.AddField(
            model_name='ventacantina',
            name='operacion_id',
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
    ]
