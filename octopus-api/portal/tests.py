"""
Tests del Portal de Representantes.

Cubren los flujos críticos:
  - Login del portal (token JWT separado del panel admin)
  - Aislamiento de datos entre representantes (IDOR)
  - Subida y validación de comprobantes de pago
  - Recordatorios de cobranza (días 0/5/10/15)
"""
from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.db import connection
from rest_framework.test import APIClient

from authentication.models import PerfilUsuario
from cobranza.models import Mensualidad, Pago, TasaCambio
from secretaria.models import Alumno, Representante

from .models import ComprobantePago, RepresentanteUser, asignar_rol_portal

User = get_user_model()

# PNG válido de 1x1 px (magic bytes reales)
PNG_BYTES = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
    b'\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01'
    b'\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
)


def crear_representante_con_portal(cedula, correo, password):
    """Helper: crea Representante + usuario Django + RepresentanteUser."""
    rep = Representante.objects.create(
        cedula=cedula,
        nombre='Maria',
        apellido='Gonzalez',
        telefono='04141234567',
        correo=correo,
        direccion='Av. Principal',
    )
    user = User.objects.create_user(username=cedula, password=password, email=correo)
    rep_user = RepresentanteUser.objects.create(representante=rep, user=user)
    asignar_rol_portal(user)  # mismo flujo que las vistas de activación
    return rep, user, rep_user


def asignar_rol(user, rol):
    """El signal create_perfil_usuario ya creó el perfil; solo cambia el rol."""
    user.perfil.rol = rol
    user.perfil.save(update_fields=['rol'])


def crear_alumno(representante, cedula_escolar, **kwargs):
    defaults = dict(
        nombre='Pedro',
        apellido='Gonzalez',
        fecha_nacimiento=date(2015, 3, 10),
        grado_seccion='1er Grado A',
    )
    defaults.update(kwargs)
    return Alumno.objects.create(
        representante=representante,
        cedula_escolar=cedula_escolar,
        **defaults,
    )


def crear_mensualidad(alumno, mes, anio, monto='35.00'):
    """Crea una mensualidad sin disparar la programación de notificaciones."""
    with mock.patch('notificaciones.tasks.programar_notificaciones_mensualidad'):
        return Mensualidad.objects.create(
            alumno=alumno, mes=mes, anio=anio, monto_usd=Decimal(monto)
        )


class PortalTestBase(TestCase):
    def setUp(self):
        cache.clear()  # evita que el throttle de login acumule entre tests
        self.client = APIClient()
        self.password = 'clave-segura-123'
        self.rep, self.user, self.rep_user = crear_representante_con_portal(
            'V11111111', 'rep1@example.com', self.password
        )
        self.alumno = crear_alumno(self.rep, 'E84000001')
        hoy = date.today()
        self.mensualidad = crear_mensualidad(self.alumno, hoy.month, hoy.year)

    def login_portal(self, cedula=None, password=None):
        resp = self.client.post('/api/portal/token/', {
            'cedula_o_email': cedula or self.rep.cedula,
            'contrasena': password or self.password,
        })
        return resp

    def auth_portal(self):
        resp = self.login_portal()
        assert resp.status_code == 200, resp.content
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}")


class PortalLoginTests(PortalTestBase):
    def test_login_con_cedula_ok(self):
        resp = self.login_portal()
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access', resp.data)
        # SEGURIDAD: el refresh token ya no viaja en el body — solo en la
        # cookie HttpOnly `portal_refresh_token` (ver portal/views.py).
        self.assertNotIn('refresh', resp.data)
        self.assertEqual(resp.data['cedula'], self.rep.cedula)

        cookie = resp.cookies.get('portal_refresh_token')
        self.assertIsNotNone(cookie)
        self.assertTrue(cookie['httponly'])
        self.assertEqual(cookie['path'], '/api/portal/')
        self.assertTrue(cookie.value)

    def test_login_con_correo_ok(self):
        resp = self.login_portal(cedula='rep1@example.com')
        self.assertEqual(resp.status_code, 200)

    def test_login_contrasena_incorrecta(self):
        resp = self.login_portal(password='incorrecta')
        self.assertEqual(resp.status_code, 400)

    def test_login_portal_desactivado(self):
        self.rep_user.esta_activo = False
        self.rep_user.save()
        resp = self.login_portal()
        self.assertEqual(resp.status_code, 400)

    def test_login_representante_sin_portal(self):
        Representante.objects.create(
            cedula='V22222222', nombre='Ana', apellido='Diaz',
            telefono='0414', correo='ana@example.com', direccion='X',
        )
        resp = self.login_portal(cedula='V22222222', password='loquesea123')
        self.assertEqual(resp.status_code, 400)


class PortalResetPasswordTests(PortalTestBase):
    def _extraer_uid_token(self):
        """El link va en el cuerpo HTML del email; lo parseamos de la query string."""
        import re
        cuerpo_html = mail.outbox[-1].alternatives[0][0]
        # Django auto-escapa "&" a "&amp;" al renderizar el link en el template HTML.
        match = re.search(r'uid=([^&"]+)&(?:amp;)?token=([^&"]+)', cuerpo_html)
        self.assertIsNotNone(match, 'No se encontró el link de reset en el email.')
        return match.group(1), match.group(2)

    def test_solicitar_reset_cedula_existente_envia_email(self):
        resp = self.client.post('/api/portal/reset-password/solicitar/', {
            'cedula_o_email': self.rep.cedula,
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.rep.correo])

    def test_solicitar_reset_cedula_inexistente_no_revela_nada(self):
        """SEGURIDAD: misma respuesta 200 + mismo mensaje, sin enviar email —
        evita que alguien tantee qué cédulas tienen portal activo."""
        resp_existente = self.client.post('/api/portal/reset-password/solicitar/', {
            'cedula_o_email': self.rep.cedula,
        })
        cache.clear()  # no queremos que el throttle interfiera en esta comparación
        resp_inexistente = self.client.post('/api/portal/reset-password/solicitar/', {
            'cedula_o_email': 'V99999999',
        })
        self.assertEqual(resp_existente.status_code, resp_inexistente.status_code)
        self.assertEqual(resp_existente.data, resp_inexistente.data)
        self.assertEqual(len(mail.outbox), 1)  # solo el de la cédula real

    def test_solicitar_reset_portal_desactivado_no_envia_email(self):
        self.rep_user.esta_activo = False
        self.rep_user.save()
        resp = self.client.post('/api/portal/reset-password/solicitar/', {
            'cedula_o_email': self.rep.cedula,
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_confirmar_reset_con_token_valido_cambia_password(self):
        self.client.post('/api/portal/reset-password/solicitar/', {'cedula_o_email': self.rep.cedula})
        uid, token = self._extraer_uid_token()

        resp = self.client.post('/api/portal/reset-password/confirmar/', {
            'uid': uid, 'token': token,
            'contrasena_nueva': 'nueva-clave-456', 'confirmar': 'nueva-clave-456',
        })
        self.assertEqual(resp.status_code, 200)

        # La clave vieja ya no sirve, la nueva sí
        self.assertEqual(self.login_portal(password=self.password).status_code, 400)
        self.assertEqual(self.login_portal(password='nueva-clave-456').status_code, 200)

    def test_confirmar_reset_token_ya_usado_falla(self):
        self.client.post('/api/portal/reset-password/solicitar/', {'cedula_o_email': self.rep.cedula})
        uid, token = self._extraer_uid_token()
        datos = {'uid': uid, 'token': token, 'contrasena_nueva': 'clave-uno-123', 'confirmar': 'clave-uno-123'}

        primero = self.client.post('/api/portal/reset-password/confirmar/', datos)
        self.assertEqual(primero.status_code, 200)

        # El token de Django incorpora el hash de password: al cambiar la clave
        # arriba, reusar el mismo token ya debe fallar.
        segundo = self.client.post('/api/portal/reset-password/confirmar/', {
            **datos, 'contrasena_nueva': 'clave-dos-456', 'confirmar': 'clave-dos-456',
        })
        self.assertEqual(segundo.status_code, 400)

    def test_confirmar_reset_token_invalido_falla(self):
        resp = self.client.post('/api/portal/reset-password/confirmar/', {
            'uid': 'basura', 'token': 'basura',
            'contrasena_nueva': 'clave-uno-123', 'confirmar': 'clave-uno-123',
        })
        self.assertEqual(resp.status_code, 400)

    def test_confirmar_reset_passwords_no_coinciden_falla(self):
        self.client.post('/api/portal/reset-password/solicitar/', {'cedula_o_email': self.rep.cedula})
        uid, token = self._extraer_uid_token()
        resp = self.client.post('/api/portal/reset-password/confirmar/', {
            'uid': uid, 'token': token,
            'contrasena_nueva': 'clave-uno-123', 'confirmar': 'otra-clave-456',
        })
        self.assertEqual(resp.status_code, 400)


class PortalRefreshCookieTests(PortalTestBase):
    """
    Refresh y logout del portal ahora usan la cookie HttpOnly
    `portal_refresh_token` (path=/api/portal/) en vez de un refresh token en
    el body — mismo patrón que el panel admin (authentication/cookie_views.py).
    """

    def test_refresh_sin_cookie_devuelve_401(self):
        resp = self.client.post('/api/portal/token/refresh/', {})
        self.assertEqual(resp.status_code, 401)

    def test_refresh_con_cookie_emite_nuevo_access_y_rota_cookie(self):
        login_resp = self.login_portal()
        self.assertEqual(login_resp.status_code, 200)
        cookie_original = login_resp.cookies['portal_refresh_token'].value

        # El test client de Django re-envía las cookies recibidas en respuestas
        # anteriores en las siguientes peticiones del mismo client, igual que
        # haría el navegador con `withCredentials`.
        refresh_resp = self.client.post('/api/portal/token/refresh/', {})
        self.assertEqual(refresh_resp.status_code, 200, refresh_resp.content)
        self.assertIn('access', refresh_resp.data)
        self.assertNotIn('refresh', refresh_resp.data)

        # ROTATE_REFRESH_TOKENS=True: la cookie debe rotar a un valor distinto.
        nueva_cookie = refresh_resp.cookies.get('portal_refresh_token')
        self.assertIsNotNone(nueva_cookie)
        self.assertNotEqual(nueva_cookie.value, cookie_original)

    def test_logout_borra_la_cookie_y_blacklistea_el_refresh(self):
        login_resp = self.login_portal()
        self.assertEqual(login_resp.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_resp.data['access']}")

        logout_resp = self.client.post('/api/portal/logout/')
        self.assertEqual(logout_resp.status_code, 200)
        cookie = logout_resp.cookies.get('portal_refresh_token')
        # delete_cookie() responde con la cookie vacía y expirada, no ausente.
        self.assertIsNotNone(cookie)
        self.assertEqual(cookie.value, '')

        # El refresh original ya no debe servir tras el logout (blacklist).
        refresh_resp = self.client.post('/api/portal/token/refresh/', {})
        self.assertEqual(refresh_resp.status_code, 401)


class PortalDashboardTests(PortalTestBase):
    def test_dashboard_requiere_autenticacion(self):
        resp = self.client.get('/api/portal/dashboard/')
        self.assertEqual(resp.status_code, 401)

    def test_dashboard_ok(self):
        self.auth_portal()
        resp = self.client.get('/api/portal/dashboard/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['representante']['cedula'], self.rep.cedula)
        self.assertEqual(len(resp.data['alumnos']), 1)
        self.assertEqual(
            float(resp.data['resumen_financiero']['total_deuda_usd']), 35.0
        )

    def test_token_admin_no_sirve_en_portal(self):
        """Un usuario administrativo (sin RepresentanteUser) no puede usar el portal."""
        admin = User.objects.create_user(username='admin1', password='clave123456')
        asignar_rol(admin, 'director')
        from rest_framework_simplejwt.tokens import RefreshToken
        token = str(RefreshToken.for_user(admin).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        resp = self.client.get('/api/portal/dashboard/')
        self.assertEqual(resp.status_code, 401)


class PortalDashboardNPlusOneTest(PortalTestBase):
    """
    PortalDashboardView hacía 2 queries de Mensualidad por cada alumno del
    representante (N+1). Verifica que el nº de queries no escale con la
    cantidad de alumnos y que el resumen financiero siga siendo correcto.
    """

    def setUp(self):
        super().setUp()
        hoy = date.today()
        mes_pasado = hoy.month - 1 or 12
        anio_mes_pasado = hoy.year if hoy.month > 1 else hoy.year - 1

        # self.alumno (de PortalTestBase) ya tiene 1 mensualidad vencida (mes actual, $35).
        # Agregamos 2 alumnos más, cada uno con 1 vencida (mes anterior) y 3 futuras.
        self.alumno2 = crear_alumno(self.rep, 'E84000002', nombre='Ana', apellido='Gonzalez')
        self.alumno3 = crear_alumno(self.rep, 'E84000003', nombre='Luis', apellido='Gonzalez')

        for alumno in (self.alumno2, self.alumno3):
            crear_mensualidad(alumno, mes_pasado, anio_mes_pasado, monto='40.00')
            for i in range(1, 4):
                mes_futuro = hoy.month + i
                anio_futuro = hoy.year
                if mes_futuro > 12:
                    mes_futuro -= 12
                    anio_futuro += 1
                crear_mensualidad(alumno, mes_futuro, anio_futuro, monto='50.00')

    def test_totales_y_agrupacion_correctos_con_varios_alumnos(self):
        self.auth_portal()
        resp = self.client.get('/api/portal/dashboard/')
        self.assertEqual(resp.status_code, 200)

        # 1 vencida propia ($35) + 1 vencida por cada alumno nuevo ($40 x2) = 115
        self.assertEqual(float(resp.data['resumen_financiero']['total_deuda_usd']), 115.0)
        self.assertEqual(len(resp.data['resumen_financiero']['mensualidades_vencidas']), 3)

        # Cada alumno nuevo tiene 3 futuras pero el endpoint limita a 2 por alumno
        futuras = resp.data['resumen_financiero']['proximos_vencimientos']
        self.assertEqual(len(futuras), 4)  # 2 (alumno2) + 2 (alumno3), self.alumno no tiene futuras
        futuras_alumno2 = [f for f in futuras if f['alumno_id'] == self.alumno2.id]
        self.assertEqual(len(futuras_alumno2), 2)

    def test_query_count_no_escala_con_cantidad_de_alumnos(self):
        """El nº de queries con 3 alumnos debe ser el mismo que con 1 solo."""
        self.auth_portal()
        with CaptureQueriesContext(connection) as ctx_varios:
            resp = self.client.get('/api/portal/dashboard/')
        self.assertEqual(resp.status_code, 200)

        # Quita los 2 alumnos extra y sus mensualidades para medir la línea base.
        self.alumno2.delete()
        self.alumno3.delete()
        with CaptureQueriesContext(connection) as ctx_uno:
            resp = self.client.get('/api/portal/dashboard/')
        self.assertEqual(resp.status_code, 200)

        self.assertEqual(len(ctx_varios.captured_queries), len(ctx_uno.captured_queries))


class PortalIDORTests(PortalTestBase):
    """Un representante no debe acceder a datos de alumnos de otros representantes."""

    def setUp(self):
        super().setUp()
        self.rep2, self.user2, _ = crear_representante_con_portal(
            'V33333333', 'rep2@example.com', 'otra-clave-456'
        )
        self.alumno2 = crear_alumno(self.rep2, 'E84000002')
        hoy = date.today()
        self.mensualidad2 = crear_mensualidad(self.alumno2, hoy.month, hoy.year)

    def test_historial_de_alumno_ajeno_devuelve_404(self):
        self.auth_portal()
        resp = self.client.get(f'/api/portal/historial/?alumno_id={self.alumno2.id}')
        self.assertEqual(resp.status_code, 404)

    def test_no_puede_subir_comprobante_a_mensualidad_ajena(self):
        self.auth_portal()
        archivo = SimpleUploadedFile('pago.png', PNG_BYTES, content_type='image/png')
        resp = self.client.post('/api/portal/comprobante/', {
            'mensualidad_id': self.mensualidad2.id,
            'archivo': archivo,
        }, format='multipart')
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(ComprobantePago.objects.count(), 0)

    def test_representante_no_accede_a_endpoints_admin(self):
        self.auth_portal()
        resp = self.client.get('/api/portal/admin/comprobantes/')
        self.assertIn(resp.status_code, (401, 403))

    def test_token_portal_rechazado_en_panel_administrativo(self):
        """
        Escalación de privilegios: el perfil por defecto ('cajero') que el
        signal asigna a usuarios nuevos permitía a un representante consumir
        endpoints administrativos. AdminJWTAuthentication debe rechazarlo.
        """
        self.auth_portal()
        for url in (
            '/api/cobranza/stats/',
            '/api/cobranza/pagos/lista/',
            f'/api/cobranza/buscar/{self.rep2.cedula}/',
            '/api/cobranza/auditoria-diaria/',
        ):
            resp = self.client.get(url)
            self.assertEqual(resp.status_code, 401, f'{url} → {resp.status_code}')

    def test_usuario_portal_tiene_rol_representante(self):
        self.user.perfil.refresh_from_db()
        self.assertEqual(self.user.perfil.rol, 'representante')


class PortalComprobanteTests(PortalTestBase):
    def _subir(self, archivo, mensualidad_id=None):
        # 'transferencia' (default de metodo_pago cuando no se envía) exige
        # referencia_bancaria — sin esto, todas estas subidas fallaban con
        # 400 "referencia obligatoria" antes de siquiera llegar a validar lo
        # que cada test realmente quiere probar (extensión, content-type,
        # magic bytes, tamaño). Bug preexistente, no introducido por Fase 3
        # de cantina.md — la app real (ComprobantePagoModal.jsx) ya siempre
        # envía referencia, por eso nunca se notó en producción.
        with mock.patch('portal.tasks.notificar_comprobante_subido.delay'):
            return self.client.post('/api/portal/comprobante/', {
                'mensualidad_id': mensualidad_id or self.mensualidad.id,
                'archivo': archivo,
                'referencia_bancaria': '123456',
            }, format='multipart')

    def test_subida_png_valido(self):
        self.auth_portal()
        archivo = SimpleUploadedFile('pago.png', PNG_BYTES, content_type='image/png')
        resp = self._subir(archivo)
        self.assertEqual(resp.status_code, 201, resp.content)
        comprobante = ComprobantePago.objects.get()
        self.assertEqual(comprobante.estatus, 'pendiente')
        self.assertEqual(comprobante.mensualidad_id, self.mensualidad.id)

    def test_subida_sin_banco_receptor_es_valida(self):
        """El banco receptor es opcional en el portal — nunca bloquea el
        envío del comprobante, sin importar el método de pago."""
        self.auth_portal()
        archivo = SimpleUploadedFile('pago.png', PNG_BYTES, content_type='image/png')
        resp = self._subir(archivo)
        self.assertEqual(resp.status_code, 201, resp.content)
        comprobante = ComprobantePago.objects.get()
        self.assertIsNone(comprobante.banco_receptor_id)

    def test_dos_comprobantes_sin_banco_misma_referencia_y_metodo_el_segundo_se_rechaza(self):
        """Sin banco, dos comprobantes activos con la misma referencia y
        método NO chocan en el UniqueConstraint de BD (NULL != NULL), así
        que debe atraparlo la validación de la vista (antifraude 4)."""
        self.auth_portal()
        archivo1 = SimpleUploadedFile('pago1.png', PNG_BYTES, content_type='image/png')
        resp1 = self._subir(archivo1)
        self.assertEqual(resp1.status_code, 201, resp1.content)

        hoy = date.today()
        mes_siguiente = crear_mensualidad(
            self.alumno, (hoy.month % 12) + 1, hoy.year + (1 if hoy.month == 12 else 0)
        )
        archivo2 = SimpleUploadedFile('pago2.png', PNG_BYTES, content_type='image/png')
        resp2 = self.client.post('/api/portal/comprobante/', {
            'mensualidad_id': mes_siguiente.id,
            'archivo': archivo2,
            'referencia_bancaria': '123456',
        }, format='multipart')
        self.assertEqual(resp2.status_code, 409, resp2.content)
        self.assertEqual(ComprobantePago.objects.count(), 1)

    def test_rechaza_extension_invalida(self):
        self.auth_portal()
        archivo = SimpleUploadedFile('script.exe', b'MZ...', content_type='application/pdf')
        resp = self._subir(archivo)
        self.assertEqual(resp.status_code, 400)

    def test_rechaza_content_type_invalido(self):
        self.auth_portal()
        archivo = SimpleUploadedFile('pago.png', PNG_BYTES, content_type='text/html')
        resp = self._subir(archivo)
        self.assertEqual(resp.status_code, 400)

    def test_rechaza_magic_bytes_falsos(self):
        """Extensión y content-type de imagen pero contenido que no es imagen."""
        self.auth_portal()
        archivo = SimpleUploadedFile(
            'pago.png', b'<html>no soy un png</html>', content_type='image/png'
        )
        resp = self._subir(archivo)
        self.assertEqual(resp.status_code, 400)

    def test_rechaza_archivo_muy_grande(self):
        self.auth_portal()
        contenido = PNG_BYTES + b'\x00' * (10 * 1024 * 1024)  # > 10 MB
        archivo = SimpleUploadedFile('pago.png', contenido, content_type='image/png')
        resp = self._subir(archivo)
        self.assertEqual(resp.status_code, 400)

    def test_consulta_estado_comprobantes(self):
        self.auth_portal()
        ComprobantePago.objects.create(
            mensualidad=self.mensualidad,
            archivo=SimpleUploadedFile('pago.png', PNG_BYTES, content_type='image/png'),
        )
        resp = self.client.get('/api/portal/comprobante/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['estatus'], 'pendiente')

    def test_rechaza_referencia_ya_usada_en_recarga_de_cantina(self):
        """
        Validación cruzada (cantina.md §5.9): una referencia ya usada para
        recargar la tarjeta de cantina de un alumno no puede reciclarse para
        "pagar" una mensualidad por este endpoint. Antes de este fix,
        PortalComprobantePagoView solo miraba ComprobantePago/Pago (su propia
        antifraude 4) y no llamaba a pagos_comunes.buscar_referencia_duplicada,
        así que este caso cruzado pasaba sin detectarse.
        """
        from cantina.models import RecargaTarjeta, TarjetaPrepago

        tarjeta = TarjetaPrepago.objects.create(
            alumno=self.alumno, serial='L001-0001', codigo='CANT-TTTTTTTTTT',
            estado='activa', saldo=Decimal('0.00'), limite_credito=Decimal('5.00'),
        )
        # Comparten método ('transferencia', el default del endpoint de
        # comprobante cuando no se envía metodo_pago) y banco (ninguno de los
        # dos indica uno) para que la clave compuesta coincida y el caso
        # cruzado siga detectándose.
        RecargaTarjeta.objects.create(
            tarjeta=tarjeta, metodo_pago='transferencia', monto_usd=Decimal('10.00'),
            tasa_aplicada=Decimal('40.0000'), monto_ves=Decimal('400.00'),
            referencia='REF-YA-USADA', estatus='pendiente', registrado_por_portal=True,
        )

        self.auth_portal()
        archivo = SimpleUploadedFile('pago.png', PNG_BYTES, content_type='image/png')
        resp = self.client.post('/api/portal/comprobante/', {
            'mensualidad_id': self.mensualidad.id,
            'archivo': archivo,
            'referencia_bancaria': 'REF-YA-USADA',
            'metodo_pago': 'transferencia',
        }, format='multipart')

        self.assertEqual(resp.status_code, 409, resp.content)
        self.assertIn('cantina', resp.data['error'])
        self.assertEqual(ComprobantePago.objects.count(), 0)


class AdminComprobantesTests(PortalTestBase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(
            username='cobranza1', password='clave123456', email='cobranza@example.com'
        )
        asignar_rol(self.admin, 'cobranza')
        from rest_framework_simplejwt.tokens import RefreshToken
        self.admin_token = str(RefreshToken.for_user(self.admin).access_token)
        self.comprobante = ComprobantePago.objects.create(
            mensualidad=self.mensualidad,
            archivo=SimpleUploadedFile('pago.png', PNG_BYTES, content_type='image/png'),
        )

    def _auth_admin(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.admin_token}')

    def test_listar_pendientes(self):
        self._auth_admin()
        resp = self.client.get('/api/portal/admin/comprobantes/?estatus=pendiente')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

    def test_aprobar_marca_mensualidad_pagada(self):
        self._auth_admin()
        resp = self.client.patch(
            f'/api/portal/admin/comprobantes/{self.comprobante.id}/',
            {'estatus': 'aprobado'},
        )
        self.assertEqual(resp.status_code, 200)
        self.mensualidad.refresh_from_db()
        self.assertTrue(self.mensualidad.pagado)

    def test_aprobar_comprobante_sin_banco_no_revienta(self):
        """Regresión más probable del cambio a unicidad compuesta: el
        comprobante que llega del portal casi nunca trae banco_receptor
        (es opcional), y Pago.full_clean() ahora compara también método y
        banco — si esa comparación no maneja bien banco_receptor=None,
        aprobar CUALQUIER comprobante del portal revienta con un 500
        (ver portal/views.py:1362 y el comentario en Pago.clean())."""
        self.assertIsNone(self.comprobante.banco_receptor_id)
        self.assertIsNone(self.comprobante.metodo_pago)

        self._auth_admin()
        resp = self.client.patch(
            f'/api/portal/admin/comprobantes/{self.comprobante.id}/',
            {'estatus': 'aprobado'},
        )
        self.assertEqual(resp.status_code, 200, resp.content)

        self.mensualidad.refresh_from_db()
        self.assertTrue(self.mensualidad.pagado)
        pago_creado = self.mensualidad.pagos.get()
        self.assertEqual(pago_creado.estatus, 'completado')
        self.assertIsNone(pago_creado.banco_receptor_id)

    def test_rechazar_no_marca_pagada(self):
        self._auth_admin()
        resp = self.client.patch(
            f'/api/portal/admin/comprobantes/{self.comprobante.id}/',
            {'estatus': 'rechazado', 'observaciones': 'Ilegible'},
        )
        self.assertEqual(resp.status_code, 200)
        self.mensualidad.refresh_from_db()
        self.assertFalse(self.mensualidad.pagado)
        self.comprobante.refresh_from_db()
        self.assertEqual(self.comprobante.estatus, 'rechazado')


@override_settings(PORTAL_EMAIL_DIRECTOR='director@example.com')
class RecordatoriosCobranzaTests(PortalTestBase):
    """Flujo de recordatorios automáticos día 0/5/10/15."""

    def test_dia_0_envia_email_al_representante(self):
        from notificaciones.tasks import task_notificar_mora_programada
        task_notificar_mora_programada.apply(args=[self.mensualidad.id, 'mora_dia_0'])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.rep.correo, mail.outbox[0].to)

    def test_dia_0_omite_si_ya_pagada(self):
        from notificaciones.tasks import task_notificar_mora_programada
        self.mensualidad.pagado = True
        self.mensualidad.save()
        task_notificar_mora_programada.apply(args=[self.mensualidad.id, 'mora_dia_0'])
        self.assertEqual(len(mail.outbox), 0)

    def test_dia_15_alerta_al_director(self):
        # notificar_mora (notificaciones/services.py) envía la alerta de día 15
        # solo al director — el aviso al representante ocurre en los días 5/10.
        from notificaciones.tasks import task_notificar_mora_programada
        task_notificar_mora_programada.apply(args=[self.mensualidad.id, 'mora_dia_15'])
        destinatarios = [d for m in mail.outbox for d in m.to]
        self.assertIn('director@example.com', destinatarios)

    def test_dia_0_registra_en_notificacion_log(self):
        from notificaciones.tasks import task_notificar_mora_programada
        from notificaciones.models import NotificacionLog
        task_notificar_mora_programada.apply(args=[self.mensualidad.id, 'mora_dia_0'])
        self.assertTrue(
            NotificacionLog.objects.filter(tipo='mora_dia_0', destinatario=self.rep.correo).exists()
        )

    def test_beat_dispara_recordatorio_segun_dias_vencidos(self):
        """La task periódica dispara la notificación que corresponde (día 5)."""
        from notificaciones.tasks import revisar_y_programar_notificaciones_pendientes

        vencimiento = date.today() - timedelta(days=5)
        self.alumno.dia_limite_pago = vencimiento.day
        self.alumno.save(update_fields=['dia_limite_pago'])
        Mensualidad.objects.filter(id=self.mensualidad.id).update(
            mes=vencimiento.month, anio=vencimiento.year
        )

        with mock.patch('notificaciones.tasks.task_notificar_mora_programada.delay') as m:
            revisar_y_programar_notificaciones_pendientes()

        m.assert_called_once_with(self.mensualidad.id, 'mora_dia_5')


class ConfiguracionColegioPublicaCacheTest(TestCase):
    """
    ConfiguracionColegioPublicaView es pública y se pega en cada carga del
    portal. Verifica que la segunda llamada no golpee la BD, y que guardar
    ConfiguracionSistema desde el admin invalide el cache (secretaria/signals.py).
    """

    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def test_segunda_llamada_no_toca_la_bd(self):
        from secretaria.models import ConfiguracionSistema
        ConfiguracionSistema.objects.create(
            nombre_colegio='Colegio Test', color_primario='#111111',
            fecha_inicio_inscripciones=date.today(), fecha_fin_inscripciones=date.today(),
            fecha_inicio_ano_escolar=date.today(), fecha_fin_ano_escolar=date.today(),
        )
        resp1 = self.client.get('/api/portal/config-colegio/')
        self.assertEqual(resp1.data['nombre_colegio'], 'Colegio Test')

        with CaptureQueriesContext(connection) as ctx:
            resp2 = self.client.get('/api/portal/config-colegio/')
        self.assertEqual(resp2.data, resp1.data)
        self.assertEqual(len(ctx.captured_queries), 0)

    def test_guardar_configuracion_invalida_el_cache(self):
        from secretaria.models import ConfiguracionSistema
        config = ConfiguracionSistema.objects.create(
            nombre_colegio='Nombre Viejo', color_primario='#111111',
            fecha_inicio_inscripciones=date.today(), fecha_fin_inscripciones=date.today(),
            fecha_inicio_ano_escolar=date.today(), fecha_fin_ano_escolar=date.today(),
        )
        resp1 = self.client.get('/api/portal/config-colegio/')
        self.assertEqual(resp1.data['nombre_colegio'], 'Nombre Viejo')

        config.nombre_colegio = 'Nombre Nuevo'
        config.save(update_fields=['nombre_colegio'])

        resp2 = self.client.get('/api/portal/config-colegio/')
        self.assertEqual(resp2.data['nombre_colegio'], 'Nombre Nuevo')

    def test_payload_incluye_titulo_descripcion_y_favicon(self):
        from secretaria.models import ConfiguracionSistema
        ConfiguracionSistema.objects.create(
            nombre_colegio='Colegio Test', color_primario='#111111',
            titulo_web='Mi Colegio Web', descripcion_web='Descripción de prueba',
            favicon_url='https://ejemplo.com/favicon.png',
            fecha_inicio_inscripciones=date.today(), fecha_fin_inscripciones=date.today(),
            fecha_inicio_ano_escolar=date.today(), fecha_fin_ano_escolar=date.today(),
        )
        resp = self.client.get('/api/portal/config-colegio/')
        self.assertEqual(resp.data['titulo_web'], 'Mi Colegio Web')
        self.assertEqual(resp.data['descripcion_web'], 'Descripción de prueba')
        self.assertEqual(resp.data['favicon_url'], 'https://ejemplo.com/favicon.png')

    def test_guardar_titulo_o_favicon_invalida_el_cache(self):
        from secretaria.models import ConfiguracionSistema
        config = ConfiguracionSistema.objects.create(
            nombre_colegio='Colegio Test', color_primario='#111111',
            titulo_web='Título Viejo',
            fecha_inicio_inscripciones=date.today(), fecha_fin_inscripciones=date.today(),
            fecha_inicio_ano_escolar=date.today(), fecha_fin_ano_escolar=date.today(),
        )
        resp1 = self.client.get('/api/portal/config-colegio/')
        self.assertEqual(resp1.data['titulo_web'], 'Título Viejo')

        config.titulo_web = 'Título Nuevo'
        config.favicon_url = 'https://ejemplo.com/nuevo-favicon.png'
        config.save(update_fields=['titulo_web', 'favicon_url'])

        resp2 = self.client.get('/api/portal/config-colegio/')
        self.assertEqual(resp2.data['titulo_web'], 'Título Nuevo')
        self.assertEqual(resp2.data['favicon_url'], 'https://ejemplo.com/nuevo-favicon.png')
