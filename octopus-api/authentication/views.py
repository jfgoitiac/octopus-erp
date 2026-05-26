import os
import subprocess
from datetime import datetime
from django.conf import settings
from django.http import FileResponse
from django.contrib.auth import get_user_model
from django.db import transaction
from django.core.exceptions import ValidationError as DjangoValidationError
from django.contrib.auth.password_validation import validate_password
from rest_framework import viewsets, status, permissions
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from .models import PerfilUsuario
from usuarios.models import LogAuditoria
from .serializers import UserSerializer, MyTokenObtainPairSerializer

# --- PERMISO PERSONALIZADO ---
class IsSystemAdminOrDirector(permissions.BasePermission):
    """
    Permite el acceso a superusuarios de Django o a usuarios activos
    con roles de director, sistemas o administrador.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # El superusuario siempre tiene acceso por diseño de seguridad
        if request.user.is_superuser:
            return True
            
        try:
            perfil = request.user.perfil
            return perfil.esta_activo and perfil.rol in ['director', 'sistemas', 'administrador']
        except PerfilUsuario.DoesNotExist:
            return False

# --- VISTA DE LOGIN (JWT) ---
class LoginView(TokenObtainPairView):
    """
    Maneja el inicio de sesión devolviendo el token y registrando el movimiento.
    """
    serializer_class = MyTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Optimización: SimpleJWT ya guardó al usuario validado en el serializador
        user = serializer.user
        
        LogAuditoria.objects.create(
            usuario=user,
            accion="INICIO_SESION",
            modulo="SEGURIDAD",
            detalles=f"El usuario {user.username} ha ingresado al sistema con éxito."
        )

        return Response(serializer.validated_data, status=status.HTTP_200_OK)

# --- GESTIÓN DE USUARIOS (SISTEMAS) ---
class UserManagementViewSet(viewsets.ModelViewSet):
    """
    API para la administración de usuarios del sistema.
    Asegura validaciones de contraseña y logs de auditoría completos.
    """
    serializer_class = UserSerializer
    permission_classes = [IsSystemAdminOrDirector]

    def get_queryset(self):
        User = get_user_model()
        return User.objects.all().select_related('perfil').order_by('-id')

    @transaction.atomic
    def perform_create(self, serializer):
        # Guardamos el usuario y registramos el evento automáticamente
        user = serializer.save()
        rol = getattr(user.perfil, 'rol', 'No asignado') if hasattr(user, 'perfil') else 'Sin perfil'
        
        LogAuditoria.objects.create(
            usuario=self.request.user,
            accion="CREACION_USUARIO",
            modulo="SEGURIDAD",
            detalles=f"Se creó el usuario administrativo: {user.username} (Rol: {rol})."
        )

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def reset_password(self, request, pk=None):
        """
        Resetea la contraseña de un usuario específico validando las políticas del sistema.
        """
        user = self.get_object()
        new_password = request.data.get('new_password')

        if not new_password:
            return Response({"error": "La nueva contraseña es requerida"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Validar complejidad de contraseña según settings.py
            validate_password(new_password, user=user)
        except DjangoValidationError as e:
            return Response({"error": list(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()

        LogAuditoria.objects.create(
            usuario=request.user,
            accion="RESET_PASSWORD",
            modulo="SEGURIDAD",
            detalles=f"Se reseteó la contraseña del usuario {user.username}."
        )
        return Response({"message": "Contraseña reseteada exitosamente"}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def backup(self, request):
        """
        Genera un volcado SQL de la base de datos SQLite y lo sirve para descarga.
        Restringido exclusivamente a superusuarios.
        """
        if not request.user.is_superuser:
            return Response(
                {"error": "Esta acción requiere privilegios de superusuario."}, 
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            db_path = settings.DATABASES['default']['NAME']
            backup_dir = os.path.join(settings.MEDIA_ROOT, 'backups')
            
            if not os.path.exists(backup_dir):
                os.makedirs(backup_dir, exist_ok=True)

            filename = f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.sql"
            file_path = os.path.join(backup_dir, filename)

            # Ejecutar el dump de SQLite hacia el archivo de destino
            with open(file_path, 'w', encoding='utf-8') as f:
                subprocess.run(['sqlite3', db_path, '.dump'], stdout=f, check=True)

            LogAuditoria.objects.create(
                usuario=request.user,
                accion="GENERACION_BACKUP",
                modulo="SEGURIDAD",
                detalles=f"Respaldo generado exitosamente: {filename}"
            )

            # Retornar el archivo como descarga
            response = FileResponse(open(file_path, 'rb'), content_type='application/sql')
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response

        except Exception as e:
            return Response(
                {"error": f"Fallo al generar el respaldo: {str(e)}"}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        user_to_delete = self.get_object()
        
        # Evitar el bloqueo accidental de la sesión actual
        if request.user.id == user_to_delete.id:
            return Response(
                {"error": "No puedes eliminar tu propia cuenta administrativa"}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        username = user_to_delete.username
        response = super().destroy(request, *args, **kwargs)
        
        if response.status_code == 204:
            LogAuditoria.objects.create(
                usuario=request.user,
                accion="ELIMINACION_USUARIO",
                modulo="SEGURIDAD",
                detalles=f"Se eliminó el acceso al sistema del usuario {username}."
            )
        return response