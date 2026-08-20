from rest_framework import permissions


class IsDirectorOrSistemas(permissions.BasePermission):
    """
    Permite el acceso a superusuarios de Django o a usuarios activos
    con rol 'director' o 'sistemas'. Mismo esqueleto que
    authentication.views.IsSystemAdminOrDirector, pero sin 'administrador':
    el contrato de sitio (SITIO_CONTRATO_API.md §0) restringe la gestión
    del CMS institucional a director/sistemas únicamente.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        # El superusuario siempre tiene acceso por diseño de seguridad
        if request.user.is_superuser:
            return True

        try:
            perfil = request.user.perfil
            return perfil.esta_activo and perfil.rol in ['director', 'sistemas']
        except Exception:
            return False
