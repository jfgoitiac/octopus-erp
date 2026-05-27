from django.db import migrations, models
from decimal import Decimal


class Migration(migrations.Migration):

    dependencies = [
        ('cobranza', '0006_cuota_inscripcion'),
    ]

    operations = [
        migrations.AddField(
            model_name='pago',
            name='vuelto_usd',
            field=models.DecimalField(
                blank=True, decimal_places=2, default=Decimal('0.00'),
                help_text='Vuelto entregado al representante en USD',
                max_digits=10, null=True,
            ),
        ),
        migrations.AddField(
            model_name='pago',
            name='vuelto_ves',
            field=models.DecimalField(
                blank=True, decimal_places=2, default=Decimal('0.00'),
                help_text='Vuelto entregado al representante en Bolívares',
                max_digits=20, null=True,
            ),
        ),
    ]
