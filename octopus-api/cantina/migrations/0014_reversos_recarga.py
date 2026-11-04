import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cantina', '0013_cierrecajacantina_desglose'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='movimientotarjeta',
            name='tipo',
            field=models.CharField(choices=[
                ('recarga', 'Recarga'), ('consumo', 'Consumo'),
                ('ajuste', 'Ajuste manual'), ('reverso', 'Reverso'),
                ('anulacion_recarga', 'Anulación de recarga'),
            ], max_length=20),
        ),
        migrations.AlterField(
            model_name='recargatarjeta',
            name='estatus',
            field=models.CharField(choices=[
                ('pendiente', 'Pendiente de revisión'), ('aprobado', 'Aprobado'),
                ('rechazado', 'Rechazado'), ('anulado', 'Anulado'),
            ], default='pendiente', max_length=15),
        ),
        migrations.AddField(model_name='recargatarjeta', name='apertura', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='recargas', to='cantina.aperturacajacantina')),
        migrations.AddField(model_name='recargatarjeta', name='anulada_en', field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name='recargatarjeta', name='anulada_por', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='recargas_cantina_anuladas', to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name='recargatarjeta', name='motivo_anulacion', field=models.TextField(blank=True)),
        migrations.AddField(model_name='recargatarjeta', name='devolucion_dinero', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='recargatarjeta', name='apertura_reverso', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='reversos_recarga', to='cantina.aperturacajacantina')),
        migrations.AddField(model_name='recargatarjeta', name='cierre_afectado', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='recargas_anuladas_posteriormente', to='cantina.cierrecajacantina')),
        migrations.AddField(model_name='recargatarjeta', name='reemplaza_a', field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='recarga_correctiva', to='cantina.recargatarjeta')),
        migrations.AddIndex(model_name='recargatarjeta', index=models.Index(fields=['estatus', 'creado_en'], name='cantina_rec_estatus_66aac4_idx')),
        migrations.AlterField(
            model_name='eventoauditoriacantina',
            name='tipo',
            field=models.CharField(choices=[
                ('cambio_precio', 'Cambio de precio o costo'), ('producto_creado', 'Producto creado'),
                ('anulacion_venta', 'Anulación de venta'), ('anulacion_recarga', 'Anulación de recarga'),
                ('correccion_recarga', 'Corrección de recarga'), ('descuento_venta', 'Venta con descuento'),
                ('venta_manual', 'Venta manual'), ('movimiento_inventario', 'Entrada de inventario'),
                ('ajuste_inventario', 'Ajuste de inventario'), ('merma', 'Merma'),
                ('apertura_caja', 'Apertura de caja'), ('cierre_caja', 'Cierre de caja'),
                ('reapertura_caja', 'Reapertura de caja'), ('cierre_modificado', 'Modificación de cierre'),
                ('revision_cierre', 'Revisión de cierre'), ('adjunto_cierre', 'Adjunto en revisión de cierre'),
                ('alerta_atendida', 'Alerta atendida'), ('parametros_auditoria', 'Cambio de parámetros de auditoría'),
            ], db_index=True, max_length=30),
        ),
    ]
