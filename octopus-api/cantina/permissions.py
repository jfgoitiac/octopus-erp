"""
Permisos de la app cantina.

Sigue exactamente el patrón ya usado en `authentication/views.py`
(`EsPersonalCobranza`): el rol vive en `request.user.perfil.rol`, con
`perfil.esta_activo` como flag, y el superusuario siempre pasa. NO se usa
`getattr(request.user, 'rol', None)` — ese atributo no existe en el modelo
de usuario real del proyecto (el borrador original de cantina.md asumía
un esquema distinto al que ya está en producción).
"""
from rest_framework import permissions


class EsCajeroOAdmin(permissions.BasePermission):
    """Cajero de cantina, administrador o director."""
    ROLES = {'director', 'administrador', 'cajero'}

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        try:
            return request.user.perfil.esta_activo and request.user.perfil.rol in self.ROLES
        except Exception:
            return False


class EsAdminCantina(permissions.BasePermission):
    """Solo administrador o director — gestión de inventario, tarjetas y reportes."""
    ROLES = {'director', 'administrador'}

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        try:
            return request.user.perfil.esta_activo and request.user.perfil.rol in self.ROLES
        except Exception:
            return False
