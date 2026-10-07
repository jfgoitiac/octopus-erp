from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('cobranza', '0046_bancoinstitucional_portal_metodos'),
        ('constancias', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='constanciaemitida',
            name='pago',
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                                        related_name='constancia_emitida', to='cobranza.pago'),
        ),
    ]
