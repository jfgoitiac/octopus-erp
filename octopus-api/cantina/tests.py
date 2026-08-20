from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from authentication.models import PerfilUsuario
from cobranza.models import TasaCambio
from secretaria.models import Alumno, Representante

from . import mora_cantina, notificaciones_cantina
from .models import CategoriaProducto, MovimientoInventario, ProductoCantina, RecargaTarjeta, TarjetaPrepago

User = get_user_model()


class CantinaFase1ViewsTests(TestCase):
    """
    Cubre las vistas de Fase 1 (inventario) de cantina: productos,
    búsqueda por código de barras, movimientos de inventario y reporte de
    stock crítico. Ver §8 FASE 1 / §10 checklist de cantina.md.
    """

    def setUp(self):
        self.client = APIClient()

        # Nota: `authentication/signals.py` crea un PerfilUsuario automáticamente
        # vía post_save al crear un User (rol 'cajero' por defecto) y además
        # cachea `instance.perfil` en el propio objeto User durante ese mismo
        # signal. Como `force_authenticate` reutiliza el objeto Python del
        # usuario tal cual (no lo vuelve a leer de la BD), hay que mutar ese
        # `perfil` ya cacheado y guardarlo — un `.filter(...).update(...)` por
        # queryset no lo actualizaría (el objeto en memoria seguiría con el
        # rol viejo 'cajero' cuando la vista lea `request.user.perfil`).
        self.admin_user = User.objects.create_user(username='admin_cantina', password='password123')
        self.admin_user.perfil.rol = 'administrador'
        self.admin_user.perfil.esta_activo = True
        self.admin_user.perfil.save()

        self.cajero_user = User.objects.create_user(username='cajero_cantina', password='password123')
        self.cajero_user.perfil.rol = 'cajero'
        self.cajero_user.perfil.esta_activo = True
        self.cajero_user.perfil.save()

        self.docente_user = User.objects.create_user(username='docente_cantina', password='password123')
        self.docente_user.perfil.rol = 'docente'
        self.docente_user.perfil.esta_activo = True
        self.docente_user.perfil.save()

        self.categoria = CategoriaProducto.objects.create(nombre='Snacks')
        self.producto = ProductoCantina.objects.create(
            nombre='Galletas',
            categoria=self.categoria,
            codigo_barras='7591234567890',
            precio=Decimal('1.50'),
            stock_actual=10,
            stock_minimo=5,
        )

    # --- Categorías / productos ---

    def test_admin_puede_crear_categoria(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.post('/api/cantina/categorias/', {'nombre': 'Bebidas', 'orden': 1})
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(CategoriaProducto.objects.filter(nombre='Bebidas').count(), 1)

    def test_admin_puede_crear_producto(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = {
            'nombre': 'Jugo natural',
            'categoria': self.categoria.id,
            'codigo_barras': '7591234500001',
            'precio': '1.00',
            'stock_actual': 20,
            'stock_minimo': 3,
        }
        resp = self.client.post('/api/cantina/productos/', payload)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertTrue(ProductoCantina.objects.filter(nombre='Jugo natural').exists())

    def test_cajero_puede_crear_producto(self):
        # Decisión de negocio confirmada por el cliente: el cajero tiene el
        # mismo nivel de acceso que administrador/director en todo el
        # módulo cantina (EsCajeroOAdmin reemplazó a EsAdminCantina en las
        # vistas de gestión) — ya no se le restringe a solo listar/vender.
        self.client.force_authenticate(user=self.cajero_user)
        payload = {
            'nombre': 'Empanada',
            'categoria': self.categoria.id,
            'precio': '1.00',
        }
        resp = self.client.post('/api/cantina/productos/', payload)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

    def test_cajero_puede_listar_productos(self):
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get('/api/cantina/productos/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)

    def test_rol_sin_acceso_no_puede_listar_productos(self):
        self.client.force_authenticate(user=self.docente_user)
        resp = self.client.get('/api/cantina/productos/')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_precio_negativo_es_rechazado(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = {
            'nombre': 'Producto inválido',
            'categoria': self.categoria.id,
            'precio': '-1.00',
        }
        resp = self.client.post('/api/cantina/productos/', payload)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # --- Buscar por código de barras ---

    def test_buscar_producto_por_codigo_encontrado(self):
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get('/api/cantina/productos/buscar-codigo/', {'codigo': '7591234567890'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['nombre'], 'Galletas')

    def test_buscar_producto_por_codigo_no_encontrado(self):
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get('/api/cantina/productos/buscar-codigo/', {'codigo': '0000000000000'})
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # --- Movimiento de inventario ---

    def test_registrar_movimiento_entrada_valido(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = {'producto': self.producto.id, 'tipo': 'entrada', 'cantidad': 5, 'motivo': 'compra a proveedor'}
        resp = self.client.post('/api/cantina/inventario/movimiento/', payload)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock_actual, 15)
        self.assertEqual(resp.data['stock_antes'], 10)
        self.assertEqual(resp.data['stock_despues'], 15)
        self.assertEqual(MovimientoInventario.objects.count(), 1)

    def test_registrar_movimiento_que_dejaria_stock_negativo_devuelve_400(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = {'producto': self.producto.id, 'tipo': 'salida', 'cantidad': 999}
        resp = self.client.post('/api/cantina/inventario/movimiento/', payload)

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.data)
        self.assertIn('detail', resp.data)

        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock_actual, 10)
        self.assertEqual(MovimientoInventario.objects.count(), 0)

    def test_cajero_puede_registrar_movimiento(self):
        # Mismo criterio que test_cajero_puede_crear_producto: el cajero ya
        # no está restringido en la gestión de inventario.
        self.client.force_authenticate(user=self.cajero_user)
        payload = {'producto': self.producto.id, 'tipo': 'entrada', 'cantidad': 1}
        resp = self.client.post('/api/cantina/inventario/movimiento/', payload)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

    # --- Reporte de stock crítico ---

    def test_reporte_stock_critico(self):
        # Producto con stock por debajo del mínimo
        ProductoCantina.objects.create(
            nombre='Chicle',
            categoria=self.categoria,
            precio=Decimal('0.50'),
            stock_actual=1,
            stock_minimo=5,
        )
        # Producto inactivo con stock crítico — no debe salir en el reporte
        ProductoCantina.objects.create(
            nombre='Producto inactivo',
            categoria=self.categoria,
            precio=Decimal('0.50'),
            stock_actual=0,
            stock_minimo=5,
            activo=False,
        )

        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get('/api/cantina/reportes/stock-critico/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        nombres = {p['nombre'] for p in resp.data}
        self.assertIn('Chicle', nombres)
        self.assertNotIn('Galletas', nombres)  # 10 > 5, no está crítico
        self.assertNotIn('Producto inactivo', nombres)


class MoraCantinaTests(TestCase):
    """
    Fase 6 -- SS5.3 de cantina.md: criterio de saldo negativo sostenido.
    No usa la BD, `dias_en_negativo`/`debe_notificarse_hoy` solo leen
    atributos de la instancia -- se usa un objeto liviano en vez de crear
    una TarjetaPrepago real, salvo donde ya hay una fixture a mano.
    """

    class _TarjetaFalsa:
        def __init__(self, saldo_negativo_desde):
            self.saldo_negativo_desde = saldo_negativo_desde

    def test_dias_en_negativo_sin_fecha_es_cero(self):
        tarjeta = self._TarjetaFalsa(saldo_negativo_desde=None)
        self.assertEqual(mora_cantina.dias_en_negativo(tarjeta), 0)

    def test_dias_en_negativo_con_fecha_pasada(self):
        tarjeta = self._TarjetaFalsa(saldo_negativo_desde=date.today() - timedelta(days=5))
        self.assertEqual(mora_cantina.dias_en_negativo(tarjeta), 5)

    def test_dias_en_negativo_con_fecha_de_hoy_es_cero(self):
        tarjeta = self._TarjetaFalsa(saldo_negativo_desde=date.today())
        self.assertEqual(mora_cantina.dias_en_negativo(tarjeta), 0)

    def test_debe_notificarse_hoy_dentro_de_la_configuracion(self):
        tarjeta = self._TarjetaFalsa(saldo_negativo_desde=date.today() - timedelta(days=3))
        self.assertTrue(mora_cantina.debe_notificarse_hoy(tarjeta, [1, 3, 7]))

    def test_debe_notificarse_hoy_fuera_de_la_configuracion(self):
        tarjeta = self._TarjetaFalsa(saldo_negativo_desde=date.today() - timedelta(days=2))
        self.assertFalse(mora_cantina.debe_notificarse_hoy(tarjeta, [1, 3, 7]))

    def test_debe_notificarse_hoy_lista_vacia_nunca_notifica(self):
        tarjeta = self._TarjetaFalsa(saldo_negativo_desde=date.today() - timedelta(days=1))
        self.assertFalse(mora_cantina.debe_notificarse_hoy(tarjeta, []))

    def test_parsear_dias_configurados_string_normal(self):
        self.assertEqual(mora_cantina.parsear_dias_configurados('1,3,7'), [1, 3, 7])

    def test_parsear_dias_configurados_con_espacios_y_token_vacio(self):
        self.assertEqual(mora_cantina.parsear_dias_configurados('1, 3,7,'), [1, 3, 7])

    def test_parsear_dias_configurados_ignora_basura_sin_lanzar_excepcion(self):
        self.assertEqual(mora_cantina.parsear_dias_configurados('1,abc,7'), [1, 7])

    def test_parsear_dias_configurados_cadena_vacia(self):
        self.assertEqual(mora_cantina.parsear_dias_configurados(''), [])

    def test_parsear_dias_configurados_none(self):
        self.assertEqual(mora_cantina.parsear_dias_configurados(None), [])


class NotificacionesCantinaContenidoTests(TestCase):
    """
    Fase 6 -- SS5.4 de cantina.md: contenido de `notificar_recarga_aprobada` /
    `notificar_saldo_negativo`. Mockea `enviar_email`/`_push_representante`
    (nunca el backend SMTP real), igual que se hace en `notificaciones/tests.py`
    y en `cantina/tests_notificaciones.py` para las tareas de Celery.
    """

    def setUp(self):
        self.representante = Representante.objects.create(
            cedula='V-6666666', nombre='Andres', apellido='Pinto',
            telefono='0412-6666666', correo='andres.pinto@example.com', direccion='Av. Sucre',
        )
        self.alumno = Alumno.objects.create(
            nombre='Sofia', apellido='Pinto', representante=self.representante, grado_seccion='3ro B',
        )
        self.tarjeta = TarjetaPrepago.objects.create(
            alumno=self.alumno, serial='L011-0001', codigo='CANT-QQQQQQQQQQ',
            estado='activa', saldo=Decimal('-3.00'), limite_credito=Decimal('5.00'),
            saldo_negativo_desde=date.today() - timedelta(days=3),
        )
        TasaCambio.objects.create(valor_bs=Decimal('40.0000'))

    def _crear_recarga(self):
        tasa = TasaCambio.objects.latest('fecha')
        monto_usd = Decimal('12.50')
        return RecargaTarjeta.objects.create(
            tarjeta=self.tarjeta, metodo_pago='pago_movil',
            monto_usd=monto_usd, tasa_aplicada=tasa.valor_bs,
            monto_ves=(monto_usd * tasa.valor_bs).quantize(Decimal('0.01')),
            referencia='888010', estatus='aprobado', registrado_por_portal=True,
        )

    @patch('cantina.notificaciones_cantina._push_representante')
    @patch('cantina.notificaciones_cantina._usuario_portal_de')
    @patch('cantina.notificaciones_cantina.enviar_email')
    def test_notificar_recarga_aprobada_envia_email_con_datos_correctos(
        self, mock_enviar_email, mock_usuario_portal_de, mock_push,
    ):
        mock_usuario_portal_de.return_value = None
        recarga = self._crear_recarga()

        notificaciones_cantina.notificar_recarga_aprobada(recarga)

        mock_enviar_email.assert_called_once()
        args, kwargs = mock_enviar_email.call_args
        self.assertEqual(args[0], self.representante.correo)
        self.assertEqual(args[1], 'Recarga de cantina aprobada')
        self.assertEqual(kwargs['representante_cedula'], self.representante.cedula)
        self.assertEqual(kwargs['alumno_nombre'], 'Sofia Pinto')
        mock_push.assert_not_called()

    @patch('cantina.notificaciones_cantina._push_representante')
    @patch('cantina.notificaciones_cantina._usuario_portal_de')
    @patch('cantina.notificaciones_cantina.enviar_email')
    def test_notificar_recarga_aprobada_envia_push_si_hay_usuario_portal(
        self, mock_enviar_email, mock_usuario_portal_de, mock_push,
    ):
        usuario_portal_falso = object()
        mock_usuario_portal_de.return_value = usuario_portal_falso
        recarga = self._crear_recarga()

        notificaciones_cantina.notificar_recarga_aprobada(recarga)

        mock_push.assert_called_once()
        args, kwargs = mock_push.call_args
        self.assertEqual(args[0], usuario_portal_falso)
        self.assertIn('12.50', args[3])
        self.assertEqual(kwargs['representante_cedula'], self.representante.cedula)

    @patch('cantina.notificaciones_cantina._push_representante')
    @patch('cantina.notificaciones_cantina._usuario_portal_de')
    @patch('cantina.notificaciones_cantina.enviar_email')
    def test_notificar_recarga_aprobada_sin_correo_no_envia_email(
        self, mock_enviar_email, mock_usuario_portal_de, mock_push,
    ):
        self.representante.correo = ''
        self.representante.save(update_fields=['correo'])
        mock_usuario_portal_de.return_value = None
        recarga = self._crear_recarga()

        notificaciones_cantina.notificar_recarga_aprobada(recarga)

        mock_enviar_email.assert_not_called()

    @patch('cantina.notificaciones_cantina._push_representante')
    @patch('cantina.notificaciones_cantina._usuario_portal_de')
    @patch('cantina.notificaciones_cantina.enviar_email')
    def test_notificar_saldo_negativo_envia_email_con_datos_correctos(
        self, mock_enviar_email, mock_usuario_portal_de, mock_push,
    ):
        mock_usuario_portal_de.return_value = object()

        notificaciones_cantina.notificar_saldo_negativo(self.tarjeta, dias_mora=3)

        mock_enviar_email.assert_called_once()
        args, kwargs = mock_enviar_email.call_args
        self.assertEqual(args[0], self.representante.correo)
        self.assertEqual(args[1], 'Saldo de cantina en negativo -- Sofia Pinto')
        self.assertEqual(kwargs['representante_cedula'], self.representante.cedula)
        self.assertEqual(kwargs['alumno_nombre'], 'Sofia Pinto')
        mock_push.assert_called_once()

    @patch('cantina.notificaciones_cantina._push_representante')
    @patch('cantina.notificaciones_cantina._usuario_portal_de')
    @patch('cantina.notificaciones_cantina.enviar_email')
    def test_notificar_saldo_negativo_sin_correo_no_envia_email_pero_si_push(
        self, mock_enviar_email, mock_usuario_portal_de, mock_push,
    ):
        self.representante.correo = ''
        self.representante.save(update_fields=['correo'])
        usuario_portal_falso = object()
        mock_usuario_portal_de.return_value = usuario_portal_falso

        notificaciones_cantina.notificar_saldo_negativo(self.tarjeta, dias_mora=7)

        mock_enviar_email.assert_not_called()
        mock_push.assert_called_once()
        args, kwargs = mock_push.call_args
        self.assertIn('Sofia Pinto', args[3])
