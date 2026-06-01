from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('multisede', '0001_initial'),
        ('cobranza', '0008_historical_pago_mensualidad'),
    ]

    operations = [
        migrations.AddField(
            model_name='pago',
            name='sede',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='pagos',
                to='multisede.sede',
                verbose_name='Sede',
            ),
        ),
        migrations.AddField(
            model_name='historicalpago',
            name='sede',
            field=models.ForeignKey(
                blank=True,
                db_constraint=False,
                null=True,
                on_delete=django.db.models.deletion.DO_NOTHING,
                related_name='+',
                to='multisede.sede',
                verbose_name='Sede',
            ),
        ),
    ]
