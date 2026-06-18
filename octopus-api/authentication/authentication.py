"""
Autenticación JWT del panel administrativo.

Los usuarios del portal de representantes obtienen tokens SimpleJWT estándar,
por lo que sin este filtro podrían consumir cualquier endpoint del panel que
solo exija IsAuthenticated (o cuyo chequeo de rol incluya el rol por defecto
'cajero' que el signal create_perfil_usuario asigna a todo usuario nuevo).

AdminJWTAuthentication es la clase por defecto de DRF (ver settings.py) y
rechaza los tokens cuyo usuario tiene rol 'representante'. Es el espejo de
PortalJWTAuthentication, que a su vez rechaza usuarios administrativos en
los endpoints del portal.
"""
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed


class AdminJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)

        # RelatedObjectDoesNotExist hereda de AttributeError → getattr devuelve None
        perfil = getattr(user, 'perfil', None)
        if (
            perfil is not None
            and perfil.rol == 'representante'
            and not user.is_superuser
        ):
            raise AuthenticationFailed(
                'Las credenciales del portal de representantes no son válidas '
                'en el panel administrativo.'
            )
        return user
