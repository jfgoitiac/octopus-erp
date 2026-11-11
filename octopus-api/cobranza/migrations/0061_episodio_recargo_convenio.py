from django.db import migrations, models


def completar_episodio_actual(apps, schema_editor):
    Recargo = apps.get_model('cobranza', 'RecargoConvenio')
    Convenio = apps.get_model('cobranza', 'ConvenioPago')
    alias = schema_editor.connection.alias
    for convenio in Convenio.objects.using(alias).filter(incumplido_en__isnull=False).iterator():
        # Solo el episodio actual tiene un ancla persistida. Los anteriores
        # conservan NULL: no se inventan fechas de incumplimiento históricas.
        Recargo.objects.using(alias).filter(
            convenio_id=convenio.pk, fecha_generada__gte=convenio.incumplido_en,
        ).update(episodio_iniciado_en=convenio.incumplido_en)


class Migration(migrations.Migration):
    dependencies = [('cobranza', '0060_vigencia_y_recargos_convenio')]
    operations = [
        migrations.AddField(
            model_name='recargoconvenio', name='episodio_iniciado_en',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(completar_episodio_actual, migrations.RunPython.noop),
    ]
