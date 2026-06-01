# Generated manually — django-simple-history audit tables for Pago and Mensualidad
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import simple_history.models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('cobranza', '0007_pago_vuelto'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── HistoricalPago ──────────────────────────────────────────────────
        migrations.CreateModel(
            name='HistoricalPago',
            fields=[
                ('history_id', models.UUIDField(
                    default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                )),
                ('history_date', models.DateTimeField(db_index=True)),
                ('history_change_reason', models.CharField(max_length=100, null=True)),
                ('history_type', models.CharField(
                    choices=[('+', 'Created'), ('~', 'Changed'), ('-', 'Deleted')],
                    max_length=1
                )),
                # Espejo de campos de Pago (FKs como _id)
                ('id', models.IntegerField(blank=True, db_index=True)),
                ('alumno_id', models.IntegerField(blank=True, db_index=True, null=True)),
                ('usuario_receptor_id', models.IntegerField(blank=True, db_index=True, null=True)),
                ('operacion_uuid', models.UUIDField(blank=True, db_index=True, null=True)),
                ('factura_id', models.CharField(blank=True, db_index=True, max_length=20, null=True)),
                ('banco_receptor_id', models.IntegerField(blank=True, db_index=True, null=True)),
                ('metodo_pago', models.CharField(max_length=20)),
                ('concepto', models.CharField(max_length=20)),
                ('monto_usd', models.DecimalField(decimal_places=2, max_digits=10)),
                ('tasa_aplicada', models.DecimalField(decimal_places=4, max_digits=12)),
                ('monto_ves', models.DecimalField(decimal_places=2, max_digits=20)),
                ('fecha_pago', models.DateTimeField(blank=True, null=True)),
                ('referencia', models.CharField(blank=True, max_length=100, null=True)),
                ('observaciones', models.TextField(blank=True, null=True)),
                ('representante_documento', models.CharField(blank=True, max_length=30, null=True)),
                ('estatus', models.CharField(db_index=True, max_length=20)),
                ('representante_nombre', models.CharField(blank=True, max_length=150, null=True)),
                ('vuelto_usd', models.DecimalField(
                    blank=True, decimal_places=2, default='0.00', max_digits=10, null=True
                )),
                ('vuelto_ves', models.DecimalField(
                    blank=True, decimal_places=2, default='0.00', max_digits=20, null=True
                )),
                ('history_user', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'historical pago',
                'verbose_name_plural': 'historical pagos',
                'ordering': ['-history_date', '-history_id'],
                'get_latest_by': ('history_date', 'history_id'),
            },
            bases=(simple_history.models.HistoricalChanges, models.Model),
        ),

        # ── HistoricalMensualidad ───────────────────────────────────────────
        # Nota: simple_history ignora M2MFields (pagos), solo audita campos escalares
        migrations.CreateModel(
            name='HistoricalMensualidad',
            fields=[
                ('history_id', models.UUIDField(
                    default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                )),
                ('history_date', models.DateTimeField(db_index=True)),
                ('history_change_reason', models.CharField(max_length=100, null=True)),
                ('history_type', models.CharField(
                    choices=[('+', 'Created'), ('~', 'Changed'), ('-', 'Deleted')],
                    max_length=1
                )),
                ('id', models.IntegerField(blank=True, db_index=True)),
                ('alumno_id', models.IntegerField(blank=True, db_index=True, null=True)),
                ('mes', models.PositiveSmallIntegerField()),
                ('anio', models.PositiveSmallIntegerField()),
                ('monto_usd', models.DecimalField(decimal_places=2, max_digits=10)),
                ('pagado', models.BooleanField(default=False)),
                ('fecha_pago', models.DateTimeField(blank=True, null=True)),
                ('history_user', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'historical mensualidad',
                'verbose_name_plural': 'historical mensualidades',
                'ordering': ['-history_date', '-history_id'],
                'get_latest_by': ('history_date', 'history_id'),
            },
            bases=(simple_history.models.HistoricalChanges, models.Model),
        ),
    ]
