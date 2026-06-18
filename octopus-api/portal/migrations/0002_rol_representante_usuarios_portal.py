"""
Data migration: los usuarios del portal creados antes del fix de roles
quedaron con el rol por defecto 'cajero' (asignado por el signal
create_perfil_usuario), lo que les daba acceso a endpoints administrativos.

Se reasigna a 'representante' solo cuando el usuario fue creado por los
flujos del portal (username == cédula del representante) y conserva el rol
por defecto, para no degradar a personal administrativo real que además
sea representante.
"""
from django.db import migrations


def asignar_rol_representante(apps, schema_editor):
    RepresentanteUser = apps.get_model('portal', 'RepresentanteUser')
    PerfilUsuario = apps.get_model('authentication', 'PerfilUsuario')

    for ru in RepresentanteUser.objects.select_related('user', 'representante'):
        if ru.user.username != ru.representante.cedula:
            continue  # usuario preexistente vinculado manualmente — no tocar
        if ru.user.is_superuser or ru.user.is_staff:
            continue
        PerfilUsuario.objects.filter(user=ru.user, rol='cajero').update(
            rol='representante'
        )


def revertir(apps, schema_editor):
    RepresentanteUser = apps.get_model('portal', 'RepresentanteUser')
    PerfilUsuario = apps.get_model('authentication', 'PerfilUsuario')
    user_ids = RepresentanteUser.objects.values_list('user_id', flat=True)
    PerfilUsuario.objects.filter(user_id__in=user_ids, rol='representante').update(
        rol='cajero'
    )


class Migration(migrations.Migration):
    dependencies = [
        ('portal', '0001_initial'),
        ('authentication', '0003_alter_perfilusuario_options_alter_perfilusuario_rol'),
    ]

    operations = [
        migrations.RunPython(asignar_rol_representante, revertir),
    ]
