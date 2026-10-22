import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('cobranza', '0056_recargos_recurrentes_y_evidencia_retroactiva')]
    operations = [
        migrations.AddField(model_name='historicalmensualidad', name='fecha_vencimiento', field=models.DateField(blank=True, db_index=True, null=True)),
        migrations.AddField(model_name='historicalpago', name='comprobante_retroactivo', field=models.TextField(blank=True, max_length=100, null=True)),
        migrations.AddField(model_name='historicalpago', name='comprobante_retroactivo_subido_en', field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name='historicalpago', name='comprobante_retroactivo_subido_por', field=models.ForeignKey(blank=True, db_constraint=False, null=True, on_delete=django.db.models.deletion.DO_NOTHING, related_name='+', to=settings.AUTH_USER_MODEL)),
    ]
