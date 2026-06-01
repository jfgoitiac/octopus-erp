from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('cobranza', '0009_pago_sede')]
    operations = [
        migrations.AlterField(
            model_name='pago',
            name='metodo_pago',
            field=models.CharField(max_length=20, choices=[
                ('transferencia', 'Transferencia Bancaria'),
                ('pago_movil', 'Pago Móvil'),
                ('punto_de_venta', 'Punto de Venta'),
                ('zelle', 'Zelle'),
                ('efectivo', 'Efectivo Divisas'),
                ('efectivo_ves', 'Efectivo Bolívares'),
                ('stripe', 'Stripe (Pago Online)'),
            ]),
        ),
    ]
