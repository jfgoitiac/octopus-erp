import calendar
from datetime import date

import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def fijar_vencimientos_existentes(apps, schema_editor):
    Mensualidad = apps.get_model('cobranza', 'Mensualidad')
    for mensualidad in Mensualidad.objects.select_related('alumno').filter(fecha_vencimiento__isnull=True).iterator():
        dia = min(mensualidad.alumno.dia_limite_pago or 5, calendar.monthrange(mensualidad.anio, mensualidad.mes)[1])
        mensualidad.fecha_vencimiento = date(mensualidad.anio, mensualidad.mes, dia)
        mensualidad.save(update_fields=['fecha_vencimiento'])


class Migration(migrations.Migration):
    dependencies = [('cobranza', '0055_metabanco_periodicidad')]

    operations = [
        migrations.AddField(model_name='mensualidad', name='fecha_vencimiento', field=models.DateField(blank=True, db_index=True, null=True)),
        migrations.AddField(model_name='reglarecargopago', name='ancla_recargo', field=models.CharField(choices=[('dia_mes', 'Día del mes de la cuota (compatibilidad)'), ('vencimiento', 'Fecha de vencimiento de la cuota')], default='dia_mes', help_text='Solo recargo. Define si la regla usa día de mes o vencimiento.', max_length=20)),
        migrations.AddField(model_name='reglarecargopago', name='dias_desde_vencimiento', field=models.PositiveSmallIntegerField(blank=True, help_text='Solo recargo anclado al vencimiento. 0 cobra el mismo día.', null=True, validators=[django.core.validators.MinValueValidator(0)])),
        migrations.AddField(model_name='reglarecargopago', name='frecuencia_recargo', field=models.CharField(choices=[('unico', 'Un solo cargo'), ('recurrente', 'Cargo recurrente')], default='unico', help_text='Solo recargo. Recurrente vuelve a devengar mientras exista saldo.', max_length=15)),
        migrations.AddField(model_name='reglarecargopago', name='cada_dias', field=models.PositiveSmallIntegerField(blank=True, help_text='Solo recargo recurrente: intervalo entre cargos en días.', null=True, validators=[django.core.validators.MinValueValidator(1)])),
        migrations.AddField(model_name='linearecargopago', name='fecha_referencia', field=models.DateField(blank=True, null=True)),
        migrations.AddField(model_name='linearecargopago', name='periodo_desde', field=models.PositiveIntegerField(blank=True, null=True)),
        migrations.AddField(model_name='linearecargopago', name='periodo_hasta', field=models.PositiveIntegerField(blank=True, null=True)),
        migrations.AddField(model_name='pago', name='comprobante_retroactivo', field=models.FileField(blank=True, null=True, upload_to='pagos/retroactivos/%Y/%m/')),
        migrations.AddField(model_name='pago', name='comprobante_retroactivo_subido_en', field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name='pago', name='comprobante_retroactivo_subido_por', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
        migrations.RunPython(fijar_vencimientos_existentes, migrations.RunPython.noop),
    ]
