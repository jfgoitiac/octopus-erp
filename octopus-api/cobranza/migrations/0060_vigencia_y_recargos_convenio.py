from decimal import Decimal

import django.core.validators
import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models
from django.db.models import Max


def _fecha_local(valor):
    if valor is None:
        return django.utils.timezone.localdate()
    if django.utils.timezone.is_aware(valor):
        return django.utils.timezone.localtime(valor).date()
    return valor.date()


def completar_datos_historicos(apps, schema_editor):
    ReglaRecargoPago = apps.get_model('cobranza', 'ReglaRecargoPago')
    ConvenioPago = apps.get_model('cobranza', 'ConvenioPago')
    EventoCiclo = apps.get_model('cobranza', 'EventoCiclo')

    for regla in ReglaRecargoPago.objects.filter(vigente_desde__isnull=True).iterator():
        regla.vigente_desde = _fecha_local(regla.creada_en)
        regla.save(update_fields=['vigente_desde'])

    # Solo se reconstruyen fechas respaldadas por evidencia existente. Los
    # convenios cancelados antiguos no registraban evento ni updated_at; se
    # conserva NULL antes que inventar una fecha.
    for convenio in ConvenioPago.objects.filter(estado='cumplido').iterator():
        ultima = convenio.cuotas.aggregate(fecha=Max('pagada_en'))['fecha']
        if ultima:
            convenio.finalizado_en = ultima
            convenio.save(update_fields=['finalizado_en'])

    fechas_incumplimiento = {}
    for evento in EventoCiclo.objects.filter(tipo='convenio_incumplido').order_by('creado_en').iterator():
        convenio_id = (evento.detalle or {}).get('convenio')
        if convenio_id and convenio_id not in fechas_incumplimiento:
            fechas_incumplimiento[convenio_id] = evento.creado_en
    for convenio_id, momento in fechas_incumplimiento.items():
        ConvenioPago.objects.filter(pk=convenio_id, estado='incumplido').update(
            incumplido_en=momento,
            finalizado_en=momento,
        )


def revertir_datos_historicos(apps, schema_editor):
    apps.get_model('cobranza', 'ReglaRecargoPago').objects.update(vigente_desde=None)


class Migration(migrations.Migration):
    dependencies = [
        ('cobranza', '0059_pago_excedente'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='reglarecargopago',
            name='vigente_desde',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='conveniopago',
            name='aplicar_recargo_incumplimiento',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='conveniopago',
            name='exonera_recargos_durante_vigencia',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='conveniopago',
            name='finalizado_en',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='conveniopago',
            name='frecuencia_recargo',
            field=models.CharField(
                choices=[('unico', 'Un solo cargo'), ('recurrente', 'Cargo recurrente')],
                default='unico', max_length=15,
            ),
        ),
        migrations.AddField(
            model_name='conveniopago',
            name='incumplido_en',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='conveniopago',
            name='intervalo_cantidad',
            field=models.PositiveSmallIntegerField(
                default=1, validators=[django.core.validators.MinValueValidator(1)]),
        ),
        migrations.AddField(
            model_name='conveniopago',
            name='intervalo_unidad',
            field=models.CharField(
                choices=[('dia', 'Día'), ('semana', 'Semana'), ('mes', 'Mes')],
                default='mes', max_length=10,
            ),
        ),
        migrations.AddField(
            model_name='conveniopago',
            name='maximo_aplicaciones',
            field=models.PositiveSmallIntegerField(
                blank=True, null=True,
                validators=[django.core.validators.MinValueValidator(1)],
            ),
        ),
        migrations.AddField(
            model_name='conveniopago',
            name='modo_recargo',
            field=models.CharField(
                choices=[('monto_fijo_usd', 'Monto fijo (USD)'), ('porcentaje', 'Porcentaje')],
                default='monto_fijo_usd', max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='conveniopago',
            name='motivo_detencion_recargos',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='conveniopago',
            name='recargos_detenidos_en',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='conveniopago',
            name='recargos_detenidos_por',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='+', to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='conveniopago',
            name='reemplazado_por',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='convenios_reemplazados', to='cobranza.conveniopago',
            ),
        ),
        migrations.AddField(
            model_name='conveniopago',
            name='tope_recargo_usd',
            field=models.DecimalField(
                blank=True, decimal_places=2, max_digits=10, null=True,
                validators=[django.core.validators.MinValueValidator(Decimal('0.01'))],
            ),
        ),
        migrations.AddField(
            model_name='conveniopago',
            name='valor_recargo',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.CreateModel(
            name='IntervaloExoneracionRecargoConvenio',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('iniciado_en', models.DateTimeField()),
                ('finalizado_en', models.DateTimeField(blank=True, null=True)),
                ('motivo_finalizacion', models.CharField(blank=True, default='', max_length=30)),
                ('creado_en', models.DateTimeField(auto_now_add=True)),
                ('convenio', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='intervalos_exoneracion_recargos', to='cobranza.conveniopago')),
            ],
            options={
                'ordering': ['iniciado_en', 'id'],
                'constraints': [
                    models.UniqueConstraint(
                        condition=models.Q(('finalizado_en__isnull', True)),
                        fields=('convenio',), name='uniq_intervalo_exoneracion_abierto_convenio'),
                ],
            },
        ),
        migrations.CreateModel(
            name='RecargoConvenio',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('numero_periodo', models.PositiveIntegerField()),
                ('fecha_programada', models.DateField()),
                ('fecha_generada', models.DateTimeField(default=django.utils.timezone.now)),
                ('modo_calculo', models.CharField(
                    choices=[('monto_fijo_usd', 'Monto fijo (USD)'), ('porcentaje', 'Porcentaje')],
                    max_length=20)),
                ('valor_configurado', models.DecimalField(decimal_places=2, max_digits=10)),
                ('saldo_base_usd', models.DecimalField(decimal_places=2, max_digits=10)),
                ('monto_recargo_usd', models.DecimalField(decimal_places=2, max_digits=10)),
                ('estado', models.CharField(
                    choices=[('pendiente', 'Pendiente'), ('pagado', 'Pagado'), ('anulado', 'Anulado')],
                    db_index=True, default='pendiente', max_length=12)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('convenio', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='recargos_incumplimiento', to='cobranza.conveniopago')),
            ],
            options={
                'ordering': ['convenio_id', 'numero_periodo'],
                'constraints': [
                    models.UniqueConstraint(
                        fields=('convenio', 'numero_periodo'),
                        name='uniq_recargo_convenio_periodo'),
                ],
            },
        ),
        migrations.RunPython(completar_datos_historicos, revertir_datos_historicos),
        migrations.AlterField(
            model_name='reglarecargopago',
            name='vigente_desde',
            field=models.DateField(
                default=django.utils.timezone.localdate,
                help_text=(
                    'Primer día de vigencia de la regla. Las mensualidades de meses '
                    'anteriores quedan excluidas y ninguna aplicación puede generarse '
                    'antes de esta fecha.'
                ),
            ),
        ),
    ]
