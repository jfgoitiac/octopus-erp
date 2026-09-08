from rest_framework import permissions


# ---------------------------------------------------------------------------
# Permisos
# ---------------------------------------------------------------------------

class EsRolConstancias(permissions.BasePermission):
    """director, administrador o secretaria — mismo patrón try/except de rol
    que el resto del proyecto (ver secretaria/views.py::IsSecretariaOrAbove),
    pero sin incluir 'sistemas' (el contrato de constancias no lo lista)."""
    ROLES_PERMITIDOS = ('director', 'administrador', 'secretaria')

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        try:
            perfil = request.user.perfil
            return perfil.esta_activo and perfil.rol in self.ROLES_PERMITIDOS
        except Exception:
            return False


NOMBRE_GRUPO_FIRMA_DELEGADA = 'ConstanciasFirmaDelegada'


def puede_firmar_como_director(user) -> bool:
    """Permiso INDEPENDIENTE del rol: quien emite (típicamente secretaria)
    puede o no tener delegada la firma del director. Sin este permiso la
    constancia se emite igual, solo que sin firma estampada (ver EmitirView,
    Fase 4/agente 4B). Se usa django.contrib.auth.models.Group en vez de un
    campo nuevo en PerfilUsuario para no requerir migración (fuera del
    alcance de este agente — solo 2A/migraciones puede crear migraciones,
    ver PROMPT_MODULO_CONSTANCIAS.md §O.2)."""
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    try:
        if user.perfil.rol == 'director' and user.perfil.esta_activo:
            return True
    except Exception:
        pass
    return user.groups.filter(name=NOMBRE_GRUPO_FIRMA_DELEGADA).exists()
