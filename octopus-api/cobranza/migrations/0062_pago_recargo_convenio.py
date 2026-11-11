import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('cobranza', '0061_episodio_recargo_convenio'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.AddField(
            model_name='recargoconvenio', name='pago',
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                                      related_name='recargo_convenio_liquidado', to='cobranza.pago'),
        ),
        migrations.AddField(model_name='recargoconvenio', name='pagado_en',
                            field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(
            model_name='recargoconvenio', name='pagado_por',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                    related_name='+', to=settings.AUTH_USER_MODEL),
        ),
    ]
