"""
Tests del Portal de Representantes.

Cubren los flujos críticos:
  - Login del portal (token JWT separado del panel admin)
  - Aislamiento de datos entre representantes (IDOR)
  - Subida y validación de comprobantes de pago
  - Webhook de Stripe (firma + registro del pago)
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
    with mock.patch('portal.tasks.programar_notificaciones_mensualidad'):
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
        self.assertIn('refresh', resp.data)
        self.assertEqual(resp.data['cedula'], self.rep.cedula)

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

    def test_no_puede_crear_checkout_de_mensualidad_ajena(self):
        self.auth_portal()
        with override_settings(STRIPE_SECRET_KEY='sk_test_falsa'):
            resp = self.client.post('/api/portal/stripe/checkout/', {
                'mensualidad_id': self.mensualidad2.id,
            })
        self.assertEqual(resp.status_code, 404)

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
        with mock.patch('portal.tasks.notificar_comprobante_subido.delay'):
            return self.client.post('/api/portal/comprobante/', {
                'mensualidad_id': mensualidad_id or self.mensualidad.id,
                'archivo': archivo,
            }, format='multipart')

    def test_subida_png_valido(self):
        self.auth_portal()
        archivo = SimpleUploadedFile('pago.png', PNG_BYTES, content_type='image/png')
        resp = self._subir(archivo)
        self.assertEqual(resp.status_code, 201, resp.content)
        comprobante = ComprobantePago.objects.get()
        self.assertEqual(comprobante.estatus, 'pendiente')
        self.assertEqual(comprobante.mensualidad_id, self.mensualidad.id)

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


@override_settings(STRIPE_SECRET_KEY='sk_test_falsa', STRIPE_WEBHOOK_SECRET='whsec_test')
class StripeWebhookTests(PortalTestBase):
    def setUp(self):
        super().setUp()
        # El webhook asigna el pago al primer superusuario como receptor
        self.superuser = User.objects.create_superuser(
            username='root', password='clave-root-789', email='root@example.com'
        )
        TasaCambio.objects.create(valor_bs=Decimal('40.00'))

    def _evento(self, mensualidad_id):
        return {
            'type': 'checkout.session.completed',
            'data': {'object': {
                'id': 'cs_test_123',
                'payment_intent': 'pi_test_123',
                'metadata': {'mensualidad_id': str(mensualidad_id)},
            }},
        }

    def test_firma_invalida_devuelve_400(self):
        resp = self.client.post(
            '/api/portal/stripe/webhook/', data='{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='firma-falsa',
        )
        self.assertEqual(resp.status_code, 400)

    def test_checkout_completado_registra_pago(self):
        with mock.patch('stripe.Webhook.construct_event', return_value=self._evento(self.mensualidad.id)):
            resp = self.client.post(
                '/api/portal/stripe/webhook/', data='{}',
                content_type='application/json',
                HTTP_STRIPE_SIGNATURE='t=1,v1=x',
            )
        self.assertEqual(resp.status_code, 200)

        self.mensualidad.refresh_from_db()
        self.assertTrue(self.mensualidad.pagado)

        pago = Pago.objects.get(referencia='pi_test_123')
        self.assertEqual(pago.metodo_pago, 'stripe')
        self.assertEqual(pago.estatus, 'completado')
        self.assertEqual(pago.monto_usd, Decimal('35.00'))
        self.assertEqual(pago.alumno_id, self.alumno.id)

    def test_webhook_idempotente(self):
        """Si Stripe reintenta el evento, no se duplica el pago."""
        evento = self._evento(self.mensualidad.id)
        with mock.patch('stripe.Webhook.construct_event', return_value=evento):
            for _ in range(2):
                self.client.post(
                    '/api/portal/stripe/webhook/', data='{}',
                    content_type='application/json',
                    HTTP_STRIPE_SIGNATURE='t=1,v1=x',
                )
        self.assertEqual(Pago.objects.filter(referencia='pi_test_123').count(), 1)


@override_settings(PORTAL_EMAIL_DIRECTOR='director@example.com')
class RecordatoriosCobranzaTests(PortalTestBase):
    """Flujo de recordatorios automáticos día 0/5/10/15."""

    def test_dia_0_envia_email_al_representante(self):
        from portal.tasks import enviar_notificacion_dia_0
        enviar_notificacion_dia_0.apply(args=[self.mensualidad.id])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.rep.correo, mail.outbox[0].to)

    def test_dia_0_omite_si_ya_pagada(self):
        from portal.tasks import enviar_notificacion_dia_0
        self.mensualidad.pagado = True
        self.mensualidad.save()
        enviar_notificacion_dia_0.apply(args=[self.mensualidad.id])
        self.assertEqual(len(mail.outbox), 0)

    def test_dia_15_alerta_al_director(self):
        from portal.tasks import enviar_notificacion_dia_15
        enviar_notificacion_dia_15.apply(args=[self.mensualidad.id])
        destinatarios = [d for m in mail.outbox for d in m.to]
        self.assertIn(self.rep.correo, destinatarios)
        self.assertIn('director@example.com', destinatarios)

    def test_beat_dispara_recordatorio_segun_dias_vencidos(self):
        """La task periódica dispara la notificación que corresponde (día 5)."""
        from portal.tasks import revisar_y_programar_notificaciones_pendientes

        vencimiento = date.today() - timedelta(days=5)
        self.alumno.dia_limite_pago = vencimiento.day
        self.alumno.save(update_fields=['dia_limite_pago'])
        Mensualidad.objects.filter(id=self.mensualidad.id).update(
            mes=vencimiento.month, anio=vencimiento.year
        )

        with mock.patch('portal.tasks.enviar_notificacion_dia_5.delay') as m5, \
             mock.patch('portal.tasks.enviar_notificacion_dia_0.delay') as m0, \
             mock.patch('portal.tasks.enviar_notificacion_dia_10.delay') as m10, \
             mock.patch('portal.tasks.enviar_notificacion_dia_15.delay') as m15:
            revisar_y_programar_notificaciones_pendientes()

        m5.assert_called_once_with(self.mensualidad.id)
        m0.assert_not_called()
        m10.assert_not_called()
        m15.assert_not_called()


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
