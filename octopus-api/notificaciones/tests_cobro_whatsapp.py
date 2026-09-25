"""
Tests del módulo "Cobros por WhatsApp":
  - Render de variables con un hijo y con varios hijos agrupados.
  - Teléfono inválido -> previsualizar indica telefono_valido=False.
  - Anti-duplicado: segundo envío manual en <24h sin confirmar -> 409;
    con confirmar=True -> crea el log.
  - Permisos: usuario sin rol de cobranza -> 403.
  - Filtrado por sede: representante de otra sede -> 404.
  - Modo B: con plantilla Meta configurada (mockeando requests.post) y sin
    configurar (-> 400 sin llamar a requests.post).
"""
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from authentication.models import PerfilUsuario
from cobranza.models import Mensualidad
from multisede.models import Sede, PermisoSede
from secretaria.models import Alumno, Representante

from .models import ConfiguracionNotificaciones, NotificacionLog, PlantillaWhatsApp

User = get_user_model()


def crear_usuario_cobranza(username='cobranza_test', rol='cobranza'):
    user = User.objects.create_user(username=username, password='clave-segura-123')
    # Una señal en authentication/signals.py ya crea el PerfilUsuario por
    # defecto (rol='cajero') al crear el User -- lo actualizamos en vez de
    # crear uno nuevo para no chocar con el unique=True de user_id.
    PerfilUsuario.objects.update_or_create(user=user, defaults={'rol': rol, 'esta_activo': True})
    # La señal deja cacheado en `user.perfil` el objeto con rol='cajero' que
    # ella misma creó; refrescar evita que ese caché en memoria (no la BD)
    # oculte el rol real que acabamos de asignar arriba.
    user.refresh_from_db()
    return user


def crear_representante_con_deuda(cedula, telefono='04141234567', n_hijos=1, sede=None):
    rep = Representante.objects.create(
        cedula=cedula, nombre='Maria', apellido='Gonzalez',
        telefono=telefono, correo=f'{cedula}@example.com', direccion='Av. Principal',
    )
    hoy = date.today()
    mes_pasado = hoy.month - 1 or 12
    anio_mes_pasado = hoy.year if hoy.month > 1 else hoy.year - 1
    alumnos = []
    for i in range(n_hijos):
        alumno = Alumno.objects.create(
            nombre=f'Hijo{i}', apellido='Gonzalez',
            cedula_escolar=f'E{cedula}{i}', fecha_nacimiento=date(2015, 3, 10),
            representante=rep, activo=True, dia_limite_pago=5,
            sede=sede,
        )
        Mensualidad.objects.create(
            alumno=alumno, mes=mes_pasado, anio=anio_mes_pasado,
            monto_usd=Decimal('50.00'), pagado=False,
        )
        alumnos.append(alumno)
    return rep, alumnos


class CobroWhatsAppTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = crear_usuario_cobranza()
        self.client.force_authenticate(user=self.user)
        self.plantilla = PlantillaWhatsApp.objects.create(
            nombre='Recordatorio amable', tipo='recordatorio', predeterminada=True,
            cuerpo=(
                'Hola {{representante.nombre}}, debe {{monto}} por {{meses}} mes(es) '
                'de {{alumno.nombre}}. Atraso: {{dias_atraso}} días. {{colegio.nombre}} - {{portal.link}}'
            ),
        )

    def test_previsualizar_un_hijo(self):
        crear_representante_con_deuda('V1000001', n_hijos=1)
        resp = self.client.post('/api/notificaciones/cobro-whatsapp/previsualizar/', {
            'representante_cedula': 'V1000001', 'plantilla_id': self.plantilla.id,
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertIn('Maria Gonzalez', data['mensaje'])
        self.assertIn('Hijo0 Gonzalez', data['mensaje'])
        self.assertTrue(data['telefono_valido'])
        self.assertEqual(data['meses_total'], 1)

    def test_previsualizar_varios_hijos_agrupa_en_un_mensaje(self):
        crear_representante_con_deuda('V1000002', n_hijos=2)
        resp = self.client.post('/api/notificaciones/cobro-whatsapp/previsualizar/', {
            'representante_cedula': 'V1000002', 'plantilla_id': self.plantilla.id,
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertEqual(len(data['alumnos']), 2)
        self.assertIn('Hijo0 Gonzalez', data['mensaje'])
        self.assertIn('Hijo1 Gonzalez', data['mensaje'])
        self.assertIn(' y ', data['mensaje'])
        self.assertEqual(data['meses_total'], 2)
        self.assertEqual(Decimal(data['monto_total']), Decimal('100.00'))

    def test_telefono_invalido(self):
        crear_representante_con_deuda('V1000003', telefono='')
        resp = self.client.post('/api/notificaciones/cobro-whatsapp/previsualizar/', {
            'representante_cedula': 'V1000003', 'plantilla_id': self.plantilla.id,
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertFalse(data['telefono_valido'])
        self.assertIsNone(data['telefono'])

    def test_envio_manual_registra_log(self):
        crear_representante_con_deuda('V1000004')
        resp = self.client.post('/api/notificaciones/cobro-whatsapp/registrar-envio-manual/', {
            'representante_cedula': 'V1000004', 'plantilla_id': self.plantilla.id,
            'mensaje': 'Mensaje de prueba', 'confirmar': False,
        }, format='json')
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertTrue(
            NotificacionLog.objects.filter(
                canal='whatsapp', tipo='cobro_whatsapp', modo='manual',
                representante_cedula='V1000004',
            ).exists()
        )

    def test_envio_manual_duplicado_requiere_confirmacion(self):
        crear_representante_con_deuda('V1000005')
        payload = {
            'representante_cedula': 'V1000005', 'plantilla_id': self.plantilla.id,
            'mensaje': 'Mensaje de prueba',
        }
        primero = self.client.post(
            '/api/notificaciones/cobro-whatsapp/registrar-envio-manual/', payload, format='json')
        self.assertEqual(primero.status_code, 201, primero.content)

        segundo = self.client.post(
            '/api/notificaciones/cobro-whatsapp/registrar-envio-manual/', payload, format='json')
        self.assertEqual(segundo.status_code, 409, segundo.content)
        self.assertEqual(
            NotificacionLog.objects.filter(
                canal='whatsapp', tipo='cobro_whatsapp', representante_cedula='V1000005',
            ).count(),
            1,
        )

        tercero = self.client.post(
            '/api/notificaciones/cobro-whatsapp/registrar-envio-manual/',
            {**payload, 'confirmar': True}, format='json')
        self.assertEqual(tercero.status_code, 201, tercero.content)
        self.assertEqual(
            NotificacionLog.objects.filter(
                canal='whatsapp', tipo='cobro_whatsapp', representante_cedula='V1000005',
            ).count(),
            2,
        )

    def test_permisos_usuario_sin_rol_cobranza(self):
        crear_representante_con_deuda('V1000006')
        user_docente = crear_usuario_cobranza(username='docente_test', rol='docente')
        client_docente = APIClient()
        client_docente.force_authenticate(user=user_docente)
        resp = client_docente.post('/api/notificaciones/cobro-whatsapp/previsualizar/', {
            'representante_cedula': 'V1000006', 'plantilla_id': self.plantilla.id,
        }, format='json')
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_filtrado_por_sede(self):
        sede_propia = Sede.objects.create(nombre='Sede Norte', activa=True)
        sede_ajena = Sede.objects.create(nombre='Sede Sur', activa=True)
        PermisoSede.objects.create(user=self.user, sede=sede_propia, rol='cobranza', activo=True)

        crear_representante_con_deuda('V1000007', n_hijos=1, sede=sede_ajena)
        resp = self.client.post('/api/notificaciones/cobro-whatsapp/previsualizar/', {
            'representante_cedula': 'V1000007', 'plantilla_id': self.plantilla.id,
        }, format='json')
        self.assertEqual(resp.status_code, 404, resp.content)

    @patch('requests.post')
    def test_modo_b_sin_configurar_no_llama_requests(self, mock_post):
        # WhatsApp automático no está activo en ConfiguracionNotificaciones
        # (no se crea ninguna en este test) -> la vista debe rechazar antes
        # de intentar cualquier llamada HTTP.
        crear_representante_con_deuda('V1000008')
        self.plantilla.nombre_plantilla_meta = 'cobro_pendiente'
        self.plantilla.save()
        resp = self.client.post('/api/notificaciones/cobro-whatsapp/enviar/', {
            'representante_cedula': 'V1000008', 'plantilla_id': self.plantilla.id,
        }, format='json')
        self.assertEqual(resp.status_code, 400, resp.content)
        mock_post.assert_not_called()

    @patch('requests.post')
    def test_modo_b_con_plantilla_meta_configurada(self, mock_post):
        mock_post.return_value.raise_for_status.return_value = None
        ConfiguracionNotificaciones.objects.create(
            pk=1, whatsapp_activo=True, whatsapp_proveedor='meta',
            meta_whatsapp_token='token-fake', meta_whatsapp_phone_id='123456',
        )
        crear_representante_con_deuda('V1000009')
        self.plantilla.nombre_plantilla_meta = 'cobro_pendiente'
        self.plantilla.save()

        resp = self.client.post('/api/notificaciones/cobro-whatsapp/enviar/', {
            'representante_cedula': 'V1000009', 'plantilla_id': self.plantilla.id,
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        mock_post.assert_called_once()
        payload_enviado = mock_post.call_args.kwargs['json']
        self.assertEqual(payload_enviado['type'], 'template')
        self.assertTrue(
            NotificacionLog.objects.filter(
                canal='whatsapp', tipo='cobro_whatsapp', modo='automatico',
                representante_cedula='V1000009',
            ).exists()
        )
