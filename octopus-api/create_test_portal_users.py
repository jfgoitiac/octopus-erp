"""
Crea usuarios de prueba para:
- Portal de Representantes (login por cédula/email + contraseña)
- Portal de Docente (login unificado por username + contraseña)

Uso:
    cd octopus-api
    python create_test_portal_users.py
"""
import os
import django
from django.db import transaction


def crear_representante_test():
    from django.contrib.auth import get_user_model
    from authentication.models import PerfilUsuario
    from secretaria.models import Representante
    from portal.models import RepresentanteUser

    User = get_user_model()
    username = 'rep_test'
    password = 'RepTest123!'
    email = 'representante.test@octopus.com'
    cedula = 'V-00000001'

    with transaction.atomic():
        if User.objects.filter(username=username).exists():
            print(f"Usuario '{username}' ya existe. Eliminando para forzar creación...")
            User.objects.filter(username=username).delete()

        representante, creado = Representante.objects.update_or_create(
            cedula=cedula,
            defaults=dict(
                nombre='Representante',
                apellido='De Prueba',
                telefono='0000-0000000',
                correo=email,
                direccion='Dirección de prueba',
                activo=True,
            ),
        )

        user = User.objects.create_user(username=username, email=email, password=password)
        perfil, _ = PerfilUsuario.objects.get_or_create(user=user)
        perfil.rol = 'representante'
        perfil.esta_activo = True
        perfil.save()

        RepresentanteUser.objects.update_or_create(
            representante=representante,
            defaults=dict(user=user, esta_activo=True, debe_cambiar_password=False),
        )

    print("── Portal de Representantes ──")
    print(f"  cédula o email: {cedula}  /  {email}")
    print(f"  contraseña:     {password}")
    print("  NOTA: este representante no tiene alumnos ni facturas asociadas.")
    print("        el dashboard se verá vacío hasta que se le vincule un Alumno real.")


def crear_docente_test():
    from django.contrib.auth import get_user_model
    from authentication.models import PerfilUsuario
    from academico.models import Docente

    User = get_user_model()
    username = 'docente_test'
    password = 'DocenteTest123!'
    email = 'docente.test@octopus.com'

    with transaction.atomic():
        if User.objects.filter(username=username).exists():
            print(f"Usuario '{username}' ya existe. Eliminando para forzar creación...")
            User.objects.filter(username=username).delete()

        user = User.objects.create_user(username=username, email=email, password=password)
        perfil, _ = PerfilUsuario.objects.get_or_create(user=user)
        perfil.rol = 'docente'
        perfil.esta_activo = True
        perfil.save()

        Docente.objects.update_or_create(
            user=user,
            defaults=dict(
                titulo_academico='Licenciado en Educación',
                especialidad='Prueba',
                activo=True,
            ),
        )

    print("── Portal de Docente ──")
    print(f"  usuario:    {username}")
    print(f"  contraseña: {password}")
    print("  NOTA: este docente no tiene materias/secciones asignadas.")


if __name__ == "__main__":
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    django.setup()
    crear_representante_test()
    crear_docente_test()
