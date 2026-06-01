import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('secretaria', '0006_configuracionsistema_datos_colegio'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── Materia ──────────────────────────────────────────────────────────
        migrations.CreateModel(
            name='Materia',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre', models.CharField(max_length=100, verbose_name='Nombre')),
                ('codigo', models.CharField(blank=True, max_length=20, unique=True, verbose_name='Código')),
                ('grado_seccion', models.CharField(max_length=50, verbose_name='Grado / Sección')),
                ('activa', models.BooleanField(default=True, verbose_name='Activa')),
                ('docente', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='materias',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='Docente',
                )),
            ],
            options={
                'verbose_name': 'Materia',
                'verbose_name_plural': 'Materias',
                'ordering': ['grado_seccion', 'nombre'],
                'unique_together': {('nombre', 'grado_seccion')},
            },
        ),

        # ── Lapso ─────────────────────────────────────────────────────────────
        migrations.CreateModel(
            name='Lapso',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre', models.CharField(
                    choices=[
                        ('1er Lapso', '1er Lapso'),
                        ('2do Lapso', '2do Lapso'),
                        ('3er Lapso', '3er Lapso'),
                    ],
                    max_length=20,
                    verbose_name='Nombre',
                )),
                ('periodo_escolar', models.CharField(default='2025-2026', max_length=20, verbose_name='Período Escolar')),
                ('fecha_inicio', models.DateField(verbose_name='Fecha de Inicio')),
                ('fecha_fin', models.DateField(verbose_name='Fecha de Fin')),
                ('activo', models.BooleanField(default=True, verbose_name='Activo')),
            ],
            options={
                'verbose_name': 'Lapso',
                'verbose_name_plural': 'Lapsos',
                'ordering': ['periodo_escolar', 'nombre'],
                'unique_together': {('nombre', 'periodo_escolar')},
            },
        ),

        # ── Nota ──────────────────────────────────────────────────────────────
        migrations.CreateModel(
            name='Nota',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('evaluacion_1', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True, verbose_name='Evaluación 1')),
                ('evaluacion_2', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True, verbose_name='Evaluación 2')),
                ('evaluacion_3', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True, verbose_name='Evaluación 3')),
                ('evaluacion_4', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True, verbose_name='Evaluación 4')),
                ('definitiva', models.DecimalField(decimal_places=2, editable=False, max_digits=5, null=True, verbose_name='Definitiva')),
                ('observaciones', models.TextField(blank=True, verbose_name='Observaciones')),
                ('alumno', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='notas',
                    to='secretaria.alumno',
                    verbose_name='Alumno',
                )),
                ('lapso', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='notas',
                    to='academico.lapso',
                    verbose_name='Lapso',
                )),
                ('materia', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='notas',
                    to='academico.materia',
                    verbose_name='Materia',
                )),
            ],
            options={
                'verbose_name': 'Nota',
                'verbose_name_plural': 'Notas',
                'unique_together': {('alumno', 'materia', 'lapso')},
            },
        ),

        # ── Asistencia ────────────────────────────────────────────────────────
        migrations.CreateModel(
            name='Asistencia',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('fecha', models.DateField(verbose_name='Fecha')),
                ('presente', models.BooleanField(default=True, verbose_name='Presente')),
                ('justificada', models.BooleanField(default=False, verbose_name='Justificada')),
                ('observacion', models.CharField(blank=True, max_length=200, verbose_name='Observación')),
                ('alumno', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='asistencias',
                    to='secretaria.alumno',
                    verbose_name='Alumno',
                )),
                ('registrado_por', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='asistencias_registradas',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='Registrado por',
                )),
            ],
            options={
                'verbose_name': 'Asistencia',
                'verbose_name_plural': 'Asistencias',
                'ordering': ['-fecha'],
                'unique_together': {('alumno', 'fecha')},
            },
        ),

        # ── HorarioClase ──────────────────────────────────────────────────────
        migrations.CreateModel(
            name='HorarioClase',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('dia_semana', models.CharField(
                    choices=[
                        ('lunes',     'Lunes'),
                        ('martes',    'Martes'),
                        ('miercoles', 'Miércoles'),
                        ('jueves',    'Jueves'),
                        ('viernes',   'Viernes'),
                    ],
                    max_length=10,
                    verbose_name='Día de la Semana',
                )),
                ('hora_inicio', models.TimeField(verbose_name='Hora de Inicio')),
                ('hora_fin', models.TimeField(verbose_name='Hora de Fin')),
                ('aula', models.CharField(blank=True, max_length=50, verbose_name='Aula')),
                ('materia', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='horarios',
                    to='academico.materia',
                    verbose_name='Materia',
                )),
            ],
            options={
                'verbose_name': 'Horario de Clase',
                'verbose_name_plural': 'Horarios de Clases',
                'ordering': ['dia_semana', 'hora_inicio'],
            },
        ),
    ]
