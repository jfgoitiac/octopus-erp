from django.db import migrations, models
import django.db.models.deletion
import decimal


class Migration(migrations.Migration):

    dependencies = [
        ('contenttypes', '0002_remove_content_type_name'),
        ('cobranza', '0055_metabanco_periodicidad'),
    ]

    operations = [
        migrations.CreateModel(
            name='AplicacionPago',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('object_id', models.PositiveIntegerField()),
                ('monto_nominal_usd', models.DecimalField(decimal_places=2, max_digits=10)),
                ('monto_abonado_usd', models.DecimalField(decimal_places=2, max_digits=10)),
                ('monto_ajuste_usd', models.DecimalField(decimal_places=2, default=decimal.Decimal('0.00'), help_text='Crédito no cobrado, por ejemplo un descuento aprobado.', max_digits=10)),
                ('saldo_resultante_usd', models.DecimalField(decimal_places=2, help_text='Saldo de la deuda inmediatamente después de esta aplicación.', max_digits=10)),
                ('creada_en', models.DateTimeField(auto_now_add=True)),
                ('anulada_en', models.DateTimeField(blank=True, null=True)),
                ('content_type', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='contenttypes.contenttype')),
                ('pago', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='aplicaciones', to='cobranza.pago')),
            ],
            options={'ordering': ('id',)},
        ),
        migrations.AddConstraint(
            model_name='aplicacionpago',
            constraint=models.UniqueConstraint(fields=('pago', 'content_type', 'object_id'), name='aplicacion_unica_por_pago_y_deuda'),
        ),
        migrations.AddConstraint(
            model_name='aplicacionpago',
            constraint=models.CheckConstraint(condition=models.Q(('monto_abonado_usd__gte', 0), ('monto_ajuste_usd__gte', 0)), name='aplicacion_montos_no_negativos'),
        ),
    ]
