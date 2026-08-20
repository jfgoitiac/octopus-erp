from django.db import migrations

import notificaciones.crypto_fields


class Migration(migrations.Migration):

    dependencies = [
        ('notificaciones', '0004_alter_notificacionlog_canal_suscripcionpush'),
    ]

    operations = [
        migrations.AlterField(
            model_name='configuracionnotificaciones',
            name='email_host_password',
            field=notificaciones.crypto_fields.EncryptedTextField(blank=True, default=''),
        ),
        migrations.AlterField(
            model_name='configuracionnotificaciones',
            name='twilio_auth_token',
            field=notificaciones.crypto_fields.EncryptedTextField(blank=True, default=''),
        ),
        migrations.AlterField(
            model_name='configuracionnotificaciones',
            name='meta_whatsapp_token',
            field=notificaciones.crypto_fields.EncryptedTextField(blank=True, default=''),
        ),
    ]
