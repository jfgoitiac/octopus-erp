"""
Migración antifraude: agrega referencia_bancaria y hash_archivo al modelo
ComprobantePago, más un UniqueConstraint que impide reutilizar la misma
referencia en comprobantes activos (pendiente / aprobado).
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portal', '0002_rol_representante_usuarios_portal'),
    ]

    operations = [
        migrations.AddField(
            model_name='comprobantepago',
            name='referencia_bancaria',
            field=models.CharField(
                blank=True,
                help_text='Número de confirmación, referencia de pago móvil o N° de transferencia',
                max_length=100,
                null=True,
                verbose_name='Referencia / N° de transacción',
            ),
        ),
        migrations.AddField(
            model_name='comprobantepago',
            name='hash_archivo',
            field=models.CharField(
                blank=True,
                help_text='Huella digital del archivo para detectar duplicados exactos',
                max_length=64,
                null=True,
                verbose_name='Hash SHA-256 del archivo',
            ),
        ),
        migrations.AddConstraint(
            model_name='comprobantepago',
            constraint=models.UniqueConstraint(
                condition=models.Q(estatus__in=['pendiente', 'aprobado']),
                fields=['referencia_bancaria'],
                name='unique_referencia_comprobante_activo',
            ),
        ),
    ]
