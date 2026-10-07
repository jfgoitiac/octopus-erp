from rest_framework.permissions import BasePermission


def rol(usuario):
    try: return usuario.perfil.rol if usuario.perfil.esta_activo else None
    except Exception: return None


class PuedeVerCxP(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and (request.user.is_superuser or rol(request.user) in ('administrador','director','directivo_red','sistemas','cajero')))


class PuedeEscribirCxP(PuedeVerCxP):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and (request.user.is_superuser or rol(request.user) in ('administrador','cajero'))


class PuedeGestionarCxP(PuedeVerCxP):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and (request.user.is_superuser or rol(request.user) in ('administrador','director'))
