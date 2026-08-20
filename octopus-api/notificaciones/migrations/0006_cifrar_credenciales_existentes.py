from django.db import migrations

CAMPOS_SECRETOS = ['email_host_password', 'twilio_auth_token', 'meta_whatsapp_token']


def cifrar_credenciales_existentes(apps, schema_editor):
    """Re-guarda las credenciales existentes de ConfiguracionNotificaciones
    a través del nuevo EncryptedTextField, lo que las cifra al pasar por
    `get_prep_value`.

    Idempotente y segura de correr más de una vez: al leer cada fila, el
    campo intenta descifrar el valor guardado. Si es texto plano legado
    (aún no cifrado), `from_db_value` captura el fallo y devuelve el valor
    tal cual; si ya está cifrado, lo descifra a texto plano normalmente. En
    ambos casos terminamos con el texto plano en memoria, y al volver a
    guardarlo se cifra (o re-cifra) sin pérdida ni corrupción de datos.
    """
    ConfiguracionNotificaciones = apps.get_model('notificaciones', 'ConfiguracionNotificaciones')
    for config in ConfiguracionNotificaciones.objects.all():
        cambios = False
        for campo in CAMPOS_SECRETOS:
            valor = getattr(config, campo, '') or ''
            if not valor:
                continue
            setattr(config, campo, valor)
            cambios = True
        if cambios:
            config.save(update_fields=CAMPOS_SECRETOS)


def noop_reversa(apps, schema_editor):
    # No tiene sentido "desencriptar" en la reversa de esta data migration;
    # si se revierte el AlterField de la migración anterior, la columna
    # vuelve a ser un CharField/TextField plano y el valor cifrado quedaría
    # tal cual (se perdería la re-encriptación, no el dato).
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('notificaciones', '0005_encriptar_credenciales_configuracion'),
    ]

    operations = [
        migrations.RunPython(cifrar_credenciales_existentes, noop_reversa),
    ]
