"""
Tests de Fase 4 de cantina: POS y ventas — RegistrarVentaView,
AnularVentaView, ReciboVentaPDFView (§5.6/§5.9/§8 FASE 4/§10 checklist de
cantina.md). Sigue el mismo estilo que tests.py/tests_tarjetas.py/
tests_recargas.py (APIClient + perfil.rol/perfil.esta_activo).
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from cobranza.models import TasaCambio
from secretaria.models import Alumno, Representante

from .models import CategoriaProducto, MovimientoInventario, MovimientoTarjeta, ProductoCantina, TarjetaPrepago, VentaCantina

User = get_user_model()


class VentaCantinaTestsBase(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.admin_user = User.objects.create_user(username='admin_ventas', password='password123')
        self.admin_user.perfil.rol = 'administrador'
        self.admin_user.perfil.esta_activo = True
        self.admin_user.perfil.save()

        self.cajero_user = User.objects.create_user(username='cajero_ventas', password='password123')
        self.cajero_user.perfil.rol = 'cajero'
        self.cajero_user.perfil.esta_activo = True
        self.cajero_user.perfil.save()

        self.categoria = CategoriaProducto.objects.create(nombre='Snacks')
        self.jugo = ProductoCantina.objects.create(
            nombre='Jugo natural', categoria=self.categoria, codigo_barras='7591111111111',
            precio=Decimal('1.50'), stock_actual=10, stock_minimo=2,
        )
        self.empanada = ProductoCantina.objects.create(
            nombre='Empanada', categoria=self.categoria, codigo_barras='7591111111112',
            precio=Decimal('1.00'), stock_actual=10, stock_minimo=2,
        )

        self.representante = Representante.objects.create(
            cedula='V-7777777', nombre='Pedro', apellido='Salas',
            telefono='0412-7777777', correo='pedro@example.com', direccion='Calle 7',
        )
        self.alumno = Alumno.objects.create(
            nombre='Ana', apellido='Salas', representante=self.representante, grado_seccion='5to A',
        )
        self.tarjeta = TarjetaPrepago.objects.create(
            alumno=self.alumno, serial='L001-0001', codigo='CANT-AAAAAAAAAA',
            estado='activa', saldo=Decimal('10.00'), limite_credito=Decimal('5.00'),
        )

        TasaCambio.objects.create(valor_bs=Decimal('40.0000'))


class RegistrarVentaViewTests(VentaCantinaTestsBase):
    def test_venta_efectivo_sin_datos_de_cliente(self):
        """Camino rápido por defecto (§7.2): efectivo no exige alumno/tarjeta."""
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/ventas/registrar/', {
            'items': [{'producto_id': self.jugo.id, 'cantidad': 2}],
            'metodo_pago': 'efectivo',
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIsNone(resp.data['alumno'])
        self.assertIsNone(resp.data['tarjeta'])
        self.assertEqual(Decimal(resp.data['total_usd']), Decimal('3.00'))
        self.assertEqual(Decimal(resp.data['total_ves']), Decimal('120.00'))
        self.assertEqual(resp.data['estado'], 'completada')
        self.assertEqual(len(resp.data['detalles']), 1)
        self.assertEqual(resp.data['detalles'][0]['producto']['nombre'], 'Jugo natural')

        self.jugo.refresh_from_db()
        self.assertEqual(self.jugo.stock_actual, 8)
        self.assertEqual(MovimientoInventario.objects.filter(producto=self.jugo, tipo='salida').count(), 1)

    def test_venta_efectivo_ves_tambien_sin_datos_de_cliente(self):
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/ventas/registrar/', {
            'items': [{'producto_id': self.empanada.id, 'cantidad': 1}],
            'metodo_pago': 'efectivo_ves',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIsNone(resp.data['tarjeta'])

    def test_venta_con_tarjeta_descuenta_stock_y_saldo(self):
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/ventas/registrar/', {
            'items': [
                {'producto_id': self.jugo.id, 'cantidad': 1},
                {'producto_id': self.empanada.id, 'cantidad': 2},
            ],
            'metodo_pago': 'tarjeta_prepago',
            'tarjeta_codigo': self.tarjeta.codigo,
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['alumno'], self.alumno.id)
        self.assertEqual(resp.data['tarjeta'], self.tarjeta.id)
        # 1*1.50 + 2*1.00 = 3.50
        self.assertEqual(Decimal(resp.data['total_usd']), Decimal('3.50'))
        self.assertEqual(Decimal(resp.data['saldo_tarjeta_despues']), Decimal('6.50'))

        self.jugo.refresh_from_db()
        self.empanada.refresh_from_db()
        self.assertEqual(self.jugo.stock_actual, 9)
        self.assertEqual(self.empanada.stock_actual, 8)

        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, Decimal('6.50'))
        self.assertEqual(MovimientoTarjeta.objects.filter(tarjeta=self.tarjeta, tipo='consumo').count(), 1)

    def test_venta_tarjeta_sin_tarjeta_codigo_es_rechazada(self):
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/ventas/registrar/', {
            'items': [{'producto_id': self.jugo.id, 'cantidad': 1}],
            'metodo_pago': 'tarjeta_prepago',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', resp.data)

    def test_venta_tarjeta_saldo_insuficiente_mas_alla_del_limite_es_rechazada_sin_tocar_nada(self):
        # saldo 10.00, límite 5.00 -> disponible 15.00. Pedimos 20.00 (excede).
        self.jugo.precio = Decimal('20.00')
        self.jugo.save(update_fields=['precio'])

        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/ventas/registrar/', {
            'items': [{'producto_id': self.jugo.id, 'cantidad': 1}],
            'metodo_pago': 'tarjeta_prepago',
            'tarjeta_codigo': self.tarjeta.codigo,
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', resp.data)

        self.jugo.refresh_from_db()
        self.tarjeta.refresh_from_db()
        self.assertEqual(self.jugo.stock_actual, 10)  # stock intacto
        self.assertEqual(self.tarjeta.saldo, Decimal('10.00'))  # saldo intacto
        self.assertEqual(VentaCantina.objects.count(), 0)
        self.assertEqual(MovimientoInventario.objects.count(), 0)
        self.assertEqual(MovimientoTarjeta.objects.count(), 0)

    def test_venta_tarjeta_que_deja_saldo_negativo_dentro_del_limite_se_permite(self):
        # saldo 10.00, límite 5.00 -> disponible 15.00. Pedimos 12.00 (dentro del límite, queda -2.00).
        self.jugo.precio = Decimal('12.00')
        self.jugo.save(update_fields=['precio'])

        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/ventas/registrar/', {
            'items': [{'producto_id': self.jugo.id, 'cantidad': 1}],
            'metodo_pago': 'tarjeta_prepago',
            'tarjeta_codigo': self.tarjeta.codigo,
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, Decimal('-2.00'))
        self.assertEqual(Decimal(resp.data['saldo_tarjeta_despues']), Decimal('-2.00'))

    def test_venta_stock_insuficiente_no_toca_saldo_de_tarjeta(self):
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/ventas/registrar/', {
            'items': [{'producto_id': self.jugo.id, 'cantidad': 999}],
            'metodo_pago': 'tarjeta_prepago',
            'tarjeta_codigo': self.tarjeta.codigo,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, Decimal('10.00'))
        self.assertEqual(VentaCantina.objects.count(), 0)

    def test_cajero_no_autenticado_rechazado(self):
        resp = self.client.post('/api/cantina/ventas/registrar/', {
            'items': [{'producto_id': self.jugo.id, 'cantidad': 1}],
            'metodo_pago': 'efectivo',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class AnularVentaViewTests(VentaCantinaTestsBase):
    def _crear_venta_tarjeta(self):
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/ventas/registrar/', {
            'items': [
                {'producto_id': self.jugo.id, 'cantidad': 2},
                {'producto_id': self.empanada.id, 'cantidad': 1},
            ],
            'metodo_pago': 'tarjeta_prepago',
            'tarjeta_codigo': self.tarjeta.codigo,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        return resp.data['id']

    def test_anular_venta_revierte_stock_y_saldo(self):
        venta_id = self._crear_venta_tarjeta()
        self.jugo.refresh_from_db()
        self.empanada.refresh_from_db()
        self.tarjeta.refresh_from_db()
        stock_jugo_post_venta = self.jugo.stock_actual
        stock_empanada_post_venta = self.empanada.stock_actual
        saldo_post_venta = self.tarjeta.saldo

        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.post(f'/api/cantina/ventas/{venta_id}/anular/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data['estado'], 'anulada')

        self.jugo.refresh_from_db()
        self.empanada.refresh_from_db()
        self.tarjeta.refresh_from_db()
        self.assertEqual(self.jugo.stock_actual, stock_jugo_post_venta + 2)
        self.assertEqual(self.empanada.stock_actual, stock_empanada_post_venta + 1)
        self.assertEqual(self.tarjeta.saldo, saldo_post_venta + Decimal('4.00'))  # 2*1.50 + 1*1.00

        venta = VentaCantina.objects.get(pk=venta_id)
        self.assertIsNotNone(venta.anulada_en)
        self.assertEqual(venta.anulada_por, self.admin_user)

    def test_no_se_puede_anular_dos_veces(self):
        venta_id = self._crear_venta_tarjeta()
        self.client.force_authenticate(user=self.admin_user)

        resp1 = self.client.post(f'/api/cantina/ventas/{venta_id}/anular/')
        self.assertEqual(resp1.status_code, status.HTTP_200_OK)

        self.tarjeta.refresh_from_db()
        saldo_tras_primera_anulacion = self.tarjeta.saldo

        resp2 = self.client.post(f'/api/cantina/ventas/{venta_id}/anular/')
        self.assertEqual(resp2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', resp2.data)

        # El segundo intento no debe haber reversado el saldo otra vez.
        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, saldo_tras_primera_anulacion)

    def test_cajero_puede_anular(self):
        # Decisión de negocio confirmada por el cliente: el cajero tiene el
        # mismo nivel de acceso que administrador/director en todo el
        # módulo cantina, incluida la anulación de ventas (antes exclusiva
        # de EsAdminCantina) — ver AnularVentaView.
        venta_id = self._crear_venta_tarjeta()
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post(f'/api/cantina/ventas/{venta_id}/anular/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)


class ReciboVentaPDFViewTests(VentaCantinaTestsBase):
    def _crear_venta_efectivo(self):
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/ventas/registrar/', {
            'items': [{'producto_id': self.jugo.id, 'cantidad': 1}],
            'metodo_pago': 'efectivo',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        return resp.data['id']

    def test_recibo_pdf_para_venta_activa(self):
        venta_id = self._crear_venta_efectivo()
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get(f'/api/cantina/ventas/{venta_id}/recibo/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp['Content-Type'], 'application/pdf')
        contenido = b''.join(resp.streaming_content) if resp.streaming else resp.content
        self.assertTrue(contenido.startswith(b'%PDF'))

    def test_recibo_pdf_para_venta_anulada(self):
        venta_id = self._crear_venta_efectivo()
        venta = VentaCantina.objects.get(pk=venta_id)
        venta.estado = 'anulada'
        venta.save(update_fields=['estado'])

        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get(f'/api/cantina/ventas/{venta_id}/recibo/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp['Content-Type'], 'application/pdf')
        contenido = b''.join(resp.streaming_content) if resp.streaming else resp.content
        self.assertTrue(contenido.startswith(b'%PDF'))
