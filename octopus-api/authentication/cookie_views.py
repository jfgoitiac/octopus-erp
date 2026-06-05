"""
Vistas JWT con refresh token en cookie HttpOnly.
El access token se sigue devolviendo en el body JSON (vida corta: 60 min).
El refresh token viaja SOLO via cookie HttpOnly;Secure — nunca en JSON.
"""
from django.conf import settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from authentication.serializers import MyTokenObtainPairSerializer

REFRESH_COOKIE = 'refresh_token'

def _cookie_settings():
    return {
        'httponly': True,
        'secure': not settings.DEBUG,
        'samesite': 'Lax',
        'max_age': int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
        'path': '/api/token/',
    }


class CookieTokenObtainPairView(TokenObtainPairView):
    """Login: devuelve access en body y guarda refresh en cookie HttpOnly."""
    serializer_class = MyTokenObtainPairSerializer

    def finalize_response(self, request, response, *args, **kwargs):
        if response.status_code == 200 and 'refresh' in response.data:
            refresh = response.data.pop('refresh')
            response.set_cookie(REFRESH_COOKIE, refresh, **_cookie_settings())
        return super().finalize_response(request, response, *args, **kwargs)


class CookieTokenRefreshView(TokenRefreshView):
    """Refresh: lee el refresh token desde la cookie HttpOnly, no del body."""

    def post(self, request, *args, **kwargs):
        refresh = request.COOKIES.get(REFRESH_COOKIE)
        if not refresh:
            return Response(
                {'detail': 'Sesion expirada. Inicia sesion nuevamente.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        serializer = self.get_serializer(data={'refresh': refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as e:
            raise InvalidToken(e.args[0])
        return Response(serializer.validated_data, status=status.HTTP_200_OK)

    def finalize_response(self, request, response, *args, **kwargs):
        # Si simplejwt rota el refresh, actualizar la cookie
        if response.status_code == 200 and 'refresh' in response.data:
            new_refresh = response.data.pop('refresh')
            response.set_cookie(REFRESH_COOKIE, new_refresh, **_cookie_settings())
        return super().finalize_response(request, response, *args, **kwargs)
