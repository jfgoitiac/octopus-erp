"""
Antifraude — amplía el UniqueConstraint de referencia de pago:
antes solo cubría estatus='completado'; ahora cubre también 'en_revision'
para impedir que una referencia duplicada entre al sistema aunque el pago
todavía esté en revisión.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cobranza', '0011_alter_historicalmensualidad_options_and_more'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='pago',
            name='unique_referencia_pago_completado',
        ),
        migrations.AddConstraint(
            model_name='pago',
            constraint=models.UniqueConstraint(
                condition=models.Q(estatus__in=['completado', 'en_revision']),
                fields=['referencia'],
                name='unique_referencia_pago_activo',
            ),
        ),
    ]
