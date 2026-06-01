# Generated manually — portal app initial migration

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('cobranza', '0007_pago_vuelto'),
        ('secretaria', '0006_configuracionsistema_datos_colegio'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='RepresentanteUser',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('esta_activo', models.BooleanField(default=True, verbose_name='Está activo')),
                ('fecha_creacion', models.DateTimeField(auto_now_add=True)),
                ('representante', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='portal_user',
                    to='secretaria.representante',
                    verbose_name='Representante',
                )),
                ('user', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='representante_portal',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='Usuario Django',
                )),
            ],
            options={
                'verbose_name': 'Usuario del Portal',
                'verbose_name_plural': 'Usuarios del Portal',
            },
        ),
        migrations.CreateModel(
            name='ComprobantePago',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('archivo', models.FileField(upload_to='comprobantes/', verbose_name='Archivo del comprobante')),
                ('fecha_subida', models.DateTimeField(auto_now_add=True, verbose_name='Fecha de subida')),
                ('estatus', models.CharField(
                    choices=[
                        ('pendiente', 'Pendiente de revisión'),
                        ('aprobado', 'Aprobado'),
                        ('rechazado', 'Rechazado'),
                    ],
                    default='pendiente',
                    max_length=15,
                    verbose_name='Estatus',
                )),
                ('observaciones', models.TextField(blank=True, null=True, verbose_name='Observaciones del revisor')),
                ('subido_por_ip', models.CharField(blank=True, max_length=45, null=True, verbose_name='IP de quien subió el comprobante')),
                ('mensualidad', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='comprobantes',
                    to='cobranza.mensualidad',
                    verbose_name='Mensualidad',
                )),
            ],
            options={
                'verbose_name': 'Comprobante de Pago',
                'verbose_name_plural': 'Comprobantes de Pago',
                'ordering': ['-fecha_subida'],
            },
        ),
    ]
