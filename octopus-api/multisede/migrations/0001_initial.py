from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('secretaria', '0006_configuracionsistema_datos_colegio'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Sede',
            fields=[
                ('id',             models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre',         models.CharField(max_length=200, unique=True)),
                ('rif',            models.CharField(blank=True, max_length=20)),
                ('direccion',      models.TextField(blank=True)),
                ('telefono',       models.CharField(blank=True, max_length=20)),
                ('correo',         models.EmailField(blank=True, max_length=254)),
                ('municipio',      models.CharField(blank=True, max_length=100)),
                ('estado',         models.CharField(blank=True, max_length=100)),
                ('activa',         models.BooleanField(default=True)),
                ('fecha_creacion', models.DateTimeField(auto_now_add=True)),
                ('configuracion',  models.OneToOneField(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='sede',
                    to='secretaria.configuracionsistema',
                )),
            ],
            options={
                'verbose_name': 'Sede',
                'verbose_name_plural': 'Sedes',
                'ordering': ['nombre'],
            },
        ),
        migrations.CreateModel(
            name='PermisoSede',
            fields=[
                ('id',               models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('rol',              models.CharField(
                    max_length=20,
                    choices=[
                        ('directivo_red', 'Directivo de Red (todas las sedes)'),
                        ('director',      'Director de Sede'),
                        ('sistemas',      'Sistemas'),
                        ('administrador', 'Administrador'),
                        ('cajero',        'Cajero'),
                        ('secretaria',    'Secretaria'),
                        ('cobranza',      'Cobranza'),
                    ],
                )),
                ('activo',           models.BooleanField(default=True)),
                ('fecha_asignacion', models.DateTimeField(auto_now_add=True)),
                ('sede', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='permisos',
                    to='multisede.sede',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='permisos_sede',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'Permiso de Sede',
                'verbose_name_plural': 'Permisos de Sede',
                'ordering': ['sede__nombre', 'rol'],
                'unique_together': {('user', 'sede')},
            },
        ),
    ]
