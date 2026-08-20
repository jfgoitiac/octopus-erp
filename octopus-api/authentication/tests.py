from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


class LoginUnificadoStaffTests(TestCase):
    """
    Cubre POST /api/token/ (CookieTokenObtainPairView) como login único de
    todo el staff del colegio (director, administrador, secretaria,
    cobranza, cajero, sistemas, docente) — antes docente y cajero solo
    podían entrar por /api/portal-docente/login/ y /api/cantina/login/
    respectivamente (ya eliminados). El portal de representantes no se ve
    afectado por este endpoint.
    """

    def setUp(self):
        from django.core.cache import cache
        cache.clear()  # evita que el throttle de login acumule entre tests
        self.client = APIClient()

    def _crear_usuario(self, username, rol, password='password123'):
        user = User.objects.create_user(username=username, password=password)
        user.perfil.rol = rol
        user.perfil.esta_activo = True
        user.perfil.save()
        return user

    def test_docente_puede_entrar_por_login_unico(self):
        self._crear_usuario('docente_unico', 'docente', 'clave-docente-123')

        resp = self.client.post('/api/token/', {
            'username': 'docente_unico',
            'password': 'clave-docente-123',
        })

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data['rol'], 'docente')
        self.assertIn('access', resp.data)
        # El refresh viaja en cookie httpOnly, no en el body.
        self.assertNotIn('refresh', resp.data)
        self.assertIn('refresh_token', resp.cookies)

    def test_cajero_puede_entrar_por_login_unico(self):
        self._crear_usuario('cajero_unico', 'cajero', 'clave-cajero-123')

        resp = self.client.post('/api/token/', {
            'username': 'cajero_unico',
            'password': 'clave-cajero-123',
        })

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data['rol'], 'cajero')

    def test_access_token_incluye_claim_nombre(self):
        user = self._crear_usuario('con_nombre', 'secretaria', 'clave-secretaria-123')
        user.first_name = 'Ana'
        user.last_name = 'Pérez'
        user.save()

        resp = self.client.post('/api/token/', {
            'username': 'con_nombre',
            'password': 'clave-secretaria-123',
        })

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)

        from jwt import decode as jwt_decode
        payload = jwt_decode(resp.data['access'], options={'verify_signature': False})
        self.assertEqual(payload['nombre'], 'Ana Pérez')

    def test_login_rechaza_credenciales_invalidas(self):
        self._crear_usuario('con_clave', 'director', 'clave-director-123')

        resp = self.client.post('/api/token/', {
            'username': 'con_clave',
            'password': 'clave-incorrecta',
        })

        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
