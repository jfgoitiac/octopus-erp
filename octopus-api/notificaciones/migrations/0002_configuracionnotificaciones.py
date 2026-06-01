from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notificaciones', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='ConfiguracionNotificaciones',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email_activo', models.BooleanField(default=False, verbose_name='Email activo')),
                ('email_host', models.CharField(blank=True, default='smtp.gmail.com', max_length=200)),
                ('email_port', models.PositiveIntegerField(default=587)),
                ('email_use_tls', models.BooleanField(default=True)),
                ('email_host_user', models.CharField(blank=True, default='', max_length=200)),
                ('email_host_password', models.CharField(blank=True, default='', max_length=500)),
                ('email_from', models.CharField(blank=True, default='', help_text='Ej: Colegio <noreply@colegio.edu.ve>', max_length=200)),
                ('director_email', models.EmailField(blank=True, default='')),
                ('whatsapp_activo', models.BooleanField(default=False, verbose_name='WhatsApp activo')),
                ('whatsapp_proveedor', models.CharField(blank=True, choices=[('', 'No configurado'), ('twilio', 'Twilio'), ('meta', 'Meta Business API')], default='', max_length=10)),
                ('twilio_account_sid', models.CharField(blank=True, default='', max_length=100)),
                ('twilio_auth_token', models.CharField(blank=True, default='', max_length=100)),
                ('twilio_whatsapp_from', models.CharField(blank=True, default='', help_text='Ej: +14155238886', max_length=30)),
                ('meta_whatsapp_token', models.CharField(blank=True, default='', max_length=500)),
                ('meta_whatsapp_phone_id', models.CharField(blank=True, default='', max_length=50)),
                ('director_whatsapp', models.CharField(blank=True, default='', help_text='Número del director para alertas de mora día 15', max_length=30)),
            ],
            options={
                'verbose_name': 'Configuración de Notificaciones',
            },
        ),
    ]
