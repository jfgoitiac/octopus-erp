from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, AuthenticationFailed


class PortalJWTAuthentication(JWTAuthentication):
    """
    Autenticación JWT extendida para el portal de representantes.
    Verifica que el usuario autenticado tenga un RepresentanteUser asociado
    y activo, impidiendo que usuarios administrativos accedan a las vistas
    del portal usando sus propios tokens.
    """

    def get_user(self, validated_token):
        user = super().get_user(validated_token)

        # Verificar que el usuario tiene un RepresentanteUser activo
        try:
            rep_user = user.representante_portal
        except Exception:
            raise AuthenticationFailed(
                'Este token no corresponde a un usuario del portal de representantes.'
            )

        if not rep_user.esta_activo:
            raise AuthenticationFailed(
                'El acceso al portal está desactivado para este representante.'
            )

        return user
