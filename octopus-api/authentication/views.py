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

# --- PERMISOS PERSONALIZADOS ---
class EsPersonalCobranza(permissions.BasePermission):
    """Permite acceso solo a roles autorizados para registrar pagos."""
    ROLES = {'director', 'administrador', 'cajero', 'cobranza', 'sistemas'}

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        try:
            return request.user.perfil.esta_activo and request.user.perfil.rol in self.ROLES
        except Exception:
            return False


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
        # Excluir usuarios del portal de representantes — no son operadores del sistema
        qs = (
            User.objects
            .filter(representante_portal__isnull=True)
            .select_related('perfil')
            .order_by('-id')
        )
        activo = self.request.query_params.get('activo')
        if activo == 'false':
            qs = qs.filter(is_active=False)
        elif activo == 'todos':
            pass  # Sin filtro — devolver todos
        else:
            # Por defecto (activo=true o sin parámetro) mostrar solo activos
            qs = qs.filter(is_active=True)
        return qs

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
        Restringido a roles director, administrador y sistemas.
        """
        rol = getattr(request.user.perfil, 'rol', None) if hasattr(request.user, 'perfil') else None
        if not (request.user.is_superuser or rol in ('director', 'administrador', 'sistemas')):
            return Response(
                {"error": "No tienes permisos para generar un respaldo."},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            # Aseguramos que db_path sea un string, ya que en settings se define como un objeto Path
            db_path = str(settings.DATABASES['default']['NAME'])
            backup_dir = os.path.join(settings.MEDIA_ROOT, 'backups')
            
            if not os.path.exists(backup_dir):
                os.makedirs(backup_dir, exist_ok=True)

            fecha_str = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"backup_{fecha_str}.sql"
            file_path = os.path.join(backup_dir, filename)

            # Ejecutar el dump de SQLite hacia el archivo de destino
            with open(file_path, 'w', encoding='utf-8') as f:
                # Usamos shell=False por seguridad y verificamos que el comando exista
                subprocess.run(['sqlite3', db_path, '.dump'], stdout=f, check=True, shell=False)

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
        """Soft delete: desactiva el usuario en lugar de borrarlo de la BD."""
        user_to_delete = self.get_object()

        # Evitar la auto-desactivación accidental
        if request.user.id == user_to_delete.id:
            return Response(
                {"error": "No puedes desactivar tu propia cuenta administrativa"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not user_to_delete.is_active:
            return Response(
                {"error": "El usuario ya se encuentra desactivado."},
                status=status.HTTP_400_BAD_REQUEST
            )

        username = user_to_delete.username

        # Soft delete: desactivar en lugar de borrar
        user_to_delete.is_active = False
        user_to_delete.save()

        # También desactivar el perfil si existe
        if hasattr(user_to_delete, 'perfil'):
            user_to_delete.perfil.esta_activo = False
            user_to_delete.perfil.save()

        import logging
        logging.getLogger(__name__).info(
            f'Usuario {username} desactivado por {request.user.username}'
        )

        LogAuditoria.objects.create(
            usuario=request.user,
            accion="DESACTIVACION_USUARIO",
            modulo="SEGURIDAD",
            detalles=f"El usuario {username} fue desactivado (soft delete) por {request.user.username}."
        )

        return Response(
            {"mensaje": f"Usuario {username} desactivado correctamente."},
            status=status.HTTP_200_OK
        )

    @transaction.atomic
    def partial_update(self, request, *args, **kwargs):
        """
        PATCH /api/auth/users/{pk}/
        Maneja dos acciones exclusivas vía campo 'accion':
          - 'reactivar': reactiva un usuario desactivado.
          - 'cambiar_rol': asigna un nuevo rol al perfil del usuario.
        """
        user = self.get_object()
        accion = request.data.get('accion')
        nuevo_rol = request.data.get('rol')

        ROLES_VALIDOS = (
            'director', 'sistemas', 'administrador',
            'cajero', 'secretaria', 'cobranza', 'directivo_red'
        )

        if accion == 'reactivar':
            if user.is_active:
                return Response(
                    {"error": "El usuario ya se encuentra activo."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            user.is_active = True
            user.save()
            if hasattr(user, 'perfil'):
                user.perfil.esta_activo = True
                user.perfil.save()

            import logging
            logging.getLogger(__name__).info(
                f'Usuario {user.username} reactivado por {request.user.username}'
            )
            LogAuditoria.objects.create(
                usuario=request.user,
                accion="REACTIVACION_USUARIO",
                modulo="SEGURIDAD",
                detalles=f"El usuario {user.username} fue reactivado por {request.user.username}."
            )
            return Response({"mensaje": f"Usuario {user.username} reactivado correctamente."})

        if accion == 'cambiar_rol':
            if not nuevo_rol:
                return Response(
                    {"error": "Se requiere el campo 'rol'."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if nuevo_rol not in ROLES_VALIDOS:
                return Response(
                    {"error": f"Rol inválido. Roles válidos: {ROLES_VALIDOS}"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if not hasattr(user, 'perfil'):
                return Response(
                    {"error": "El usuario no tiene perfil configurado."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            rol_anterior = user.perfil.rol
            user.perfil.rol = nuevo_rol
            user.perfil.save()

            LogAuditoria.objects.create(
                usuario=request.user,
                accion="CAMBIO_ROL_USUARIO",
                modulo="SEGURIDAD",
                detalles=f"Rol de {user.username} cambiado de '{rol_anterior}' a '{nuevo_rol}' por {request.user.username}."
            )
            return Response({"mensaje": f"Rol de {user.username} cambiado a '{nuevo_rol}'."})

        return Response(
            {"error": "El campo 'accion' debe ser 'reactivar' o 'cambiar_rol'."},
            status=status.HTTP_400_BAD_REQUEST
        )


class ActivarPortalMasivoView(APIView):
    """
    Activa el portal para todos los representantes que aún no tienen acceso.
    Solo roles: director, sistemas.
    POST /api/auth/activar-portal-masivo/
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        rol = getattr(getattr(request.user, 'perfil', None), 'rol', '')
        if rol not in ('director', 'sistemas'):
            return Response({'error': 'Sin permiso.'}, status=403)

        from secretaria.models import Representante
        from portal.models import RepresentanteUser
        from django.contrib.auth import get_user_model
        User = get_user_model()

        creados, errores = 0, []
        for rep in Representante.objects.all():
            if RepresentanteUser.objects.filter(representante=rep).exists():
                continue
            try:
                user, created = User.objects.get_or_create(
                    username=rep.cedula,
                    defaults={
                        'email': rep.correo,
                        'first_name': rep.nombre,
                        'last_name': rep.apellido,
                    }
                )
                if created:
                    user.set_password(rep.cedula)
                    user.save()
                RepresentanteUser.objects.create(representante=rep, user=user)
                creados += 1
            except Exception as e:
                errores.append(f'{rep.cedula}: {str(e)}')

        return Response({'creados': creados, 'errores': errores})