from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='NotificacionLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('canal', models.CharField(choices=[('email', 'Email'), ('whatsapp', 'WhatsApp')], max_length=10)),
                ('tipo', models.CharField(
                    choices=[
                        ('mora_dia_0', 'Aviso factura (Dia 0)'),
                        ('mora_dia_5', 'Recordatorio (Dia 5)'),
                        ('mora_dia_10', 'Segundo aviso (Dia 10)'),
                        ('mora_dia_15', 'Alerta director (Dia 15)'),
                        ('comprobante', 'Comprobante subido'),
                        ('bienvenida', 'Bienvenida portal'),
                        ('pago_exitoso', 'Pago confirmado'),
                        ('prueba', 'Mensaje de prueba'),
                        ('otro', 'Otro'),
                    ],
                    default='otro',
                    max_length=20,
                )),
                ('destinatario', models.CharField(max_length=200)),
                ('asunto', models.CharField(blank=True, max_length=255)),
                ('mensaje', models.TextField(blank=True)),
                ('estado', models.CharField(
                    choices=[('enviado', 'Enviado'), ('fallido', 'Fallido'), ('pendiente', 'Pendiente')],
                    default='pendiente',
                    max_length=10,
                )),
                ('error_detalle', models.TextField(blank=True)),
                ('fecha_envio', models.DateTimeField(auto_now_add=True)),
                ('representante_cedula', models.CharField(blank=True, max_length=20)),
                ('alumno_nombre', models.CharField(blank=True, max_length=200)),
                ('proveedor', models.CharField(blank=True, max_length=20)),
            ],
            options={
                'verbose_name': 'Log de Notificacion',
                'verbose_name_plural': 'Logs de Notificaciones',
                'ordering': ['-fecha_envio'],
            },
        ),
    ]
