from rest_framework.permissions import BasePermission


class EsAdministradorODirector(BasePermission):
    """Permiso deliberadamente más estricto que el administrativo general."""
    message = 'Solo administrador o director puede acceder a Egresos.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        try:
            return request.user.perfil.esta_activo and request.user.perfil.rol in ('administrador', 'director')
        except Exception:
            return False
