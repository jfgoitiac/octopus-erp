from rest_framework import generics, permissions
from .models import LogAuditoria
from .serializers import LogAuditoriaSerializer

class AuditoriaListView(generics.ListAPIView):
    queryset = LogAuditoria.objects.all().order_by('-fecha_hora')
    serializer_class = LogAuditoriaSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Restricción de seguridad: Solo el director puede ver logs
        perfil = getattr(self.request.user, 'perfil', None)
        if not self.request.user.is_superuser and (not perfil or perfil.rol != 'director'):
            return LogAuditoria.objects.none()
        
        # Opcional: Filtrar por módulo o usuario mediante parámetros URL
        modulo = self.request.query_params.get('modulo')
        if modulo:
            return LogAuditoria.objects.filter(modulo=modulo).order_by('-fecha_hora')
        return super().get_queryset()

# Removed UserListView, UserCreateView, UserDeleteView, UserResetPasswordView
# These are now handled by authentication.views.UserManagementViewSet

# DatabaseBackupView eliminada: duplicaba (de forma insegura) el backup que ya
# provee authentication.views.UserManagementViewSet.backup. Esta versión
# interpolaba el parámetro `fecha`, sin sanear, en una ruta de archivo del
# servidor (path traversal — permitía escribir/leer archivos arbitrarios,
# incluyendo el dump completo de la base de datos). Usar
# POST /api/authentication/users/backup/ en su lugar.