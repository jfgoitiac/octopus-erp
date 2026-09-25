from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cobranza', '0045_cuotainscripcion_monto_pagado'),
    ]

    operations = [
        migrations.AddField(
            model_name='bancoinstitucional',
            name='portal_metodos',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
