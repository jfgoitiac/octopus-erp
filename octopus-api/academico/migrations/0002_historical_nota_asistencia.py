# Generated manually — django-simple-history audit tables for Nota and Asistencia
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import simple_history.models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('academico', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── HistoricalNota ──────────────────────────────────────────────────
        migrations.CreateModel(
            name='HistoricalNota',
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
                # Espejo de campos de Nota (FKs como _id enteros)
                ('id', models.IntegerField(blank=True, db_index=True)),
                ('alumno_id', models.IntegerField(blank=True, db_index=True, null=True)),
                ('materia_id', models.IntegerField(blank=True, db_index=True, null=True)),
                ('lapso_id', models.IntegerField(blank=True, db_index=True, null=True)),
                ('evaluacion_1', models.DecimalField(
                    blank=True, decimal_places=2, max_digits=5, null=True
                )),
                ('evaluacion_2', models.DecimalField(
                    blank=True, decimal_places=2, max_digits=5, null=True
                )),
                ('evaluacion_3', models.DecimalField(
                    blank=True, decimal_places=2, max_digits=5, null=True
                )),
                ('evaluacion_4', models.DecimalField(
                    blank=True, decimal_places=2, max_digits=5, null=True
                )),
                ('definitiva', models.DecimalField(
                    blank=True, decimal_places=2, max_digits=5, null=True
                )),
                ('observaciones', models.TextField(blank=True)),
                ('history_user', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'historical nota',
                'verbose_name_plural': 'historical notas',
                'ordering': ['-history_date', '-history_id'],
                'get_latest_by': ('history_date', 'history_id'),
            },
            bases=(simple_history.models.HistoricalChanges, models.Model),
        ),

        # ── HistoricalAsistencia ────────────────────────────────────────────
        migrations.CreateModel(
            name='HistoricalAsistencia',
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
                # Espejo de campos de Asistencia
                ('id', models.IntegerField(blank=True, db_index=True)),
                ('alumno_id', models.IntegerField(blank=True, db_index=True, null=True)),
                ('fecha', models.DateField()),
                ('presente', models.BooleanField(default=True)),
                ('justificada', models.BooleanField(default=False)),
                ('observacion', models.CharField(blank=True, max_length=200)),
                ('registrado_por_id', models.IntegerField(blank=True, db_index=True, null=True)),
                ('history_user', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'historical asistencia',
                'verbose_name_plural': 'historical asistencias',
                'ordering': ['-history_date', '-history_id'],
                'get_latest_by': ('history_date', 'history_id'),
            },
            bases=(simple_history.models.HistoricalChanges, models.Model),
        ),
    ]
