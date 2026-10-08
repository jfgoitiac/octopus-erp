from rest_framework.permissions import BasePermission


# CxP es de uso exclusivo de administrador y director.
ROLES_CXP = ('administrador', 'director')


def rol(usuario):
    try: return usuario.perfil.rol if usuario.perfil.esta_activo else None
    except Exception: return None


class PuedeVerCxP(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and (request.user.is_superuser or rol(request.user) in ROLES_CXP))


class PuedeEscribirCxP(PuedeVerCxP):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and (request.user.is_superuser or rol(request.user) in ROLES_CXP)


class PuedeGestionarCxP(PuedeVerCxP):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and (request.user.is_superuser or rol(request.user) in ROLES_CXP)
