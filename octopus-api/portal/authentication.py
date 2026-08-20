from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, AuthenticationFailed

# Único endpoint que un representante con debe_cambiar_password=True puede
# seguir usando — si no se exceptuara, quedaría sin forma de salir de ese estado.
RUTA_CAMBIAR_CONTRASENA = '/api/portal/cambiar-contrasena/'


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

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None
        user, validated_token = result

        # SEGURIDAD: si la contraseña actual fue asignada por un administrador
        # (activación o restablecimiento) y aún no fue cambiada, se bloquea el
        # resto del portal — salvo el propio endpoint de cambio de contraseña —
        # para no dejar una credencial elegida por un tercero vigente indefinidamente.
        rep_user = user.representante_portal
        if rep_user.debe_cambiar_password and request.path != RUTA_CAMBIAR_CONTRASENA:
            raise AuthenticationFailed({
                'code': 'debe_cambiar_password',
                'detail': 'Debe cambiar su contraseña antes de continuar.',
            })

        return user, validated_token
