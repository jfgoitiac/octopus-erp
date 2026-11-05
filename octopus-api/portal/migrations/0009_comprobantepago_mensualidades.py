from django.db import migrations, models


def copiar_mensualidad_ancla(apps, schema_editor):
    ComprobantePago = apps.get_model('portal', 'ComprobantePago')
    through = ComprobantePago.mensualidades.through
    through.objects.bulk_create([
        through(
            comprobantepago_id=comprobante.id,
            mensualidad_id=comprobante.mensualidad_id,
        )
        for comprobante in ComprobantePago.objects.only('id', 'mensualidad_id').iterator()
    ], ignore_conflicts=True)


class Migration(migrations.Migration):

    dependencies = [
        ('cobranza', '0059_pago_excedente'),
        ('portal', '0008_semilla_motivos_rechazo'),
    ]

    operations = [
        migrations.AddField(
            model_name='comprobantepago',
            name='mensualidades',
            field=models.ManyToManyField(
                blank=True,
                help_text=(
                    'Cuotas vencidas respaldadas por el mismo archivo. El campo '
                    '`mensualidad` se conserva como ancla para comprobantes históricos.'
                ),
                related_name='comprobantes_grupales',
                to='cobranza.mensualidad',
                verbose_name='Mensualidades incluidas',
            ),
        ),
        migrations.RunPython(copiar_mensualidad_ancla, migrations.RunPython.noop),
    ]
