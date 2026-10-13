from django.db import migrations, models


def poblar_mensualidades(apps, schema_editor):
    """Cada comprobante existente cubre exactamente su mensualidad principal."""
    ComprobantePago = apps.get_model('portal', 'ComprobantePago')
    Relacion = ComprobantePago.mensualidades.through
    Relacion.objects.bulk_create(
        [
            Relacion(comprobantepago_id=c_id, mensualidad_id=m_id)
            for c_id, m_id in ComprobantePago.objects.values_list('id', 'mensualidad_id')
        ],
        batch_size=1000,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('portal', '0006_remove_comprobantepago_unique_referencia_comprobante_activo_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='comprobantepago',
            name='mensualidades',
            field=models.ManyToManyField(blank=True, help_text='Todas las mensualidades que paga este comprobante (incluye la principal).', related_name='comprobantes_cubiertos', to='cobranza.mensualidad', verbose_name='Mensualidades cubiertas'),
        ),
        migrations.RunPython(poblar_mensualidades, migrations.RunPython.noop),
    ]
