import os
import django
from django.db import transaction

def create_director_user():
    # Configurar el entorno de Django para reconocer los modelos y settings
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    django.setup()

    from django.contrib.auth import get_user_model
    from authentication.models import PerfilUsuario

    User = get_user_model()
    username = 'director'
    password = 'director1234'
    email = 'director@octopus.com'
    rol = 'director'

    try:
        with transaction.atomic():
            # Forzar la creación: si el usuario existe, se elimina primero
            if User.objects.filter(username=username).exists():
                print(f"El usuario '{username}' ya existe. Eliminando para forzar creación...")
                User.objects.filter(username=username).delete()

            # Crear el nuevo usuario
            user = User.objects.create_user(username=username, email=email, password=password)
            
            # Obtener o crear el perfil y asignar el rol de director
            perfil, _ = PerfilUsuario.objects.get_or_create(user=user)
            perfil.rol = rol
            perfil.esta_activo = True
            perfil.save()

            print(f"Éxito: Usuario '{username}' creado con rol '{rol}'.")
    except Exception as e:
        print(f"Error al crear el usuario: {e}")

if __name__ == "__main__":
    create_director_user()