"""Tests del flujo "Nueva venta a crédito" (registro de CxC tipo POS).

La pantalla crea una venta REAL por POST ventas/registrar/ con
metodo_pago='credito_representante': inventario, caja abierta, bitácora de
descuento / venta manual, límite de crédito y bloqueo de la cuenta.
"""
from decimal import Decimal

from rest_framework import status

from secretaria.models import Representante

from . import services_cxc
from .auditoria.models import EventoAuditoriaCantina as EventoAuditoria
from .models import (
    CargoCantina,
    CategoriaProducto,
    ClienteCantina,
    CreditoRepresentanteCantina,
    DetalleVentaCantina,
    MovimientoInventario,
    ProductoCantina,
    VentaCantina,
)
from .tests_cxc import BASE, CxcBase

VENTAS = '/api/cantina/ventas/registrar/'


class VentaCreditoBase(CxcBase):
    def setUp(self):
        super().setUp()
        categoria = CategoriaProducto.objects.create(nombre='Snacks venta crédito')
        self.jugo = ProductoCantina.objects.create(
            nombre='Jugo crédito', categoria=categoria, codigo_barras='7598888888881',
            precio=Decimal('2.50'), costo=Decimal('1.00'), stock_actual=20, stock_minimo=1, area='cantina',
        )
        self.galleta = ProductoCantina.objects.create(
            nombre='Galleta crédito', categoria=categoria, codigo_barras='7598888888882',
            precio=Decimal('1.00'), costo=Decimal('0.40'), stock_actual=10, stock_minimo=1, area='cantina',
        )
        self.cuaderno = ProductoCantina.objects.create(
            nombre='Cuaderno librería', categoria=categoria, codigo_barras='7598888888883',
            precio=Decimal('3.00'), stock_actual=10, stock_minimo=1, area='libreria',
        )
        self.cliente = ClienteCantina.objects.create(nombre='Ana', apellido='Docente', documento='V-777', tipo='personal')

    def vender(self, items=None, **extra):
        body = {
            'items': items or [{'producto_id': self.jugo.id, 'cantidad': 2}, {'producto_id': self.galleta.id, 'cantidad': 1}],
            'metodo_pago': 'credito_representante',
            'origen_producto': 'manual',
        }
        body.update(extra)
        return self.client_cajero.post(VENTAS, body, format='json')


class RegistroVentaCreditoTests(VentaCreditoBase):
    def test_carrito_a_representante_crea_venta_detalles_cargo_e_inventario(self):
        resp = self.vender(representante_id=self.rep.id, alumno_id=self.alumno.id)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        # 2 x 2.50 + 1 x 1.00
        self.assertEqual(Decimal(resp.data['total_usd']), Decimal('6.00'))
        self.assertEqual(Decimal(resp.data['total_ves']), Decimal('240.00'))  # tasa vigente 40
        self.assertEqual(len(resp.data['detalles']), 2)

        venta = VentaCantina.objects.get(pk=resp.data['id'])
        self.assertEqual(venta.apertura_id, self.apertura_cantina.id)
        self.assertEqual(venta.area, 'cantina')
        self.assertTrue(venta.es_manual)
        self.assertEqual(DetalleVentaCantina.objects.filter(venta=venta).count(), 2)

        cargo = CargoCantina.objects.get(venta=venta)
        self.assertEqual(cargo.representante_id, self.rep.id)
        self.assertEqual(cargo.alumno_id, self.alumno.id)
        self.assertEqual(cargo.monto_usd, Decimal('6.00'))
        self.assertEqual(cargo.estado, 'pendiente')
        self.assertEqual(services_cxc.saldo_titular(self.rep), Decimal('6.00'))

        self.jugo.refresh_from_db()
        self.galleta.refresh_from_db()
        self.assertEqual((self.jugo.stock_actual, self.galleta.stock_actual), (18, 9))
        self.assertEqual(MovimientoInventario.objects.filter(venta=venta, tipo='salida').count(), 2)

    def test_carrito_a_cliente_general(self):
        resp = self.vender(cliente_id=self.cliente.id)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        cargo = CargoCantina.objects.get(venta_id=resp.data['id'])
        self.assertEqual(cargo.cliente_id, self.cliente.id)
        self.assertIsNone(cargo.representante_id)

    def test_aparece_en_el_estado_de_cuenta_con_detalle(self):
        self.vender(representante_id=self.rep.id)
        resp = self.client_cajero.get(f'{BASE}representantes/{self.rep.id}/estado-cuenta/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(resp.data['saldo_usd']), Decimal('6.00'))
        self.assertEqual(Decimal(resp.data['saldo_ves_tasa_vigente']), Decimal('240.00'))
        self.assertEqual(len(resp.data['cargos']), 1)
        self.assertEqual(len(resp.data['cargos'][0]['detalle']), 2)

    def test_descuento_baja_el_cargo_y_queda_en_bitacora(self):
        resp = self.vender(
            representante_id=self.rep.id, descuento_usd='1.00', motivo_descuento='Empaque dañado',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(Decimal(resp.data['total_usd']), Decimal('5.00'))
        cargo = CargoCantina.objects.get(venta_id=resp.data['id'])
        self.assertEqual(cargo.monto_usd, Decimal('5.00'))
        self.assertTrue(EventoAuditoria.objects.filter(tipo='descuento_venta').exists())
        self.assertTrue(EventoAuditoria.objects.filter(tipo='venta_manual').exists())

    def test_descuento_sin_motivo_rechazado(self):
        resp = self.vender(representante_id=self.rep.id, descuento_usd='1.00')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(VentaCantina.objects.exists())

    def test_sin_caja_abierta_rechazado(self):
        self.apertura_cantina.estado = 'cerrada'
        self.apertura_cantina.save(update_fields=['estado'])
        resp = self.vender(representante_id=self.rep.id)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(CargoCantina.objects.exists())

    def test_producto_de_otra_area_rechazado(self):
        resp = self.vender(
            items=[{'producto_id': self.cuaderno.id, 'cantidad': 1}], representante_id=self.rep.id,
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(CargoCantina.objects.exists())

    def test_excede_limite_revierte_inventario_y_venta(self):
        # Límite por defecto $20: el carrito de $30 no cabe.
        resp = self.vender(items=[{'producto_id': self.jugo.id, 'cantidad': 12}], representante_id=self.rep.id)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('límite', resp.data['error'])
        self.assertFalse(VentaCantina.objects.exists())
        self.assertFalse(CargoCantina.objects.exists())
        self.jugo.refresh_from_db()
        self.assertEqual(self.jugo.stock_actual, 20)

    def test_cuenta_bloqueada_revierte_todo(self):
        CreditoRepresentanteCantina.objects.create(representante=self.rep, bloqueado=True)
        resp = self.vender(representante_id=self.rep.id)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('bloqueada', resp.data['error'])
        self.assertFalse(VentaCantina.objects.exists())
        self.jugo.refresh_from_db()
        self.assertEqual(self.jugo.stock_actual, 20)

    def test_limite_considera_la_deuda_previa(self):
        self.crear_cargo('18.00')
        resp = self.vender(representante_id=self.rep.id)  # +$6 → $24 > $20
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(services_cxc.saldo_titular(self.rep), Decimal('18.00'))

    def test_stock_insuficiente_rechazado(self):
        resp = self.vender(items=[{'producto_id': self.galleta.id, 'cantidad': 11}], representante_id=self.rep.id)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(VentaCantina.objects.exists())

    def test_abono_posterior_salda_la_venta_a_credito(self):
        self.vender(representante_id=self.rep.id)
        resp = self.client_cajero.post(BASE + 'abonos/', {
            'representante_id': self.rep.id,
            'lineas': [{'metodo_pago': 'efectivo', 'monto_usd': '6.00'}],
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(services_cxc.saldo_titular(self.rep), Decimal('0.00'))

    def test_recibo_pdf_de_la_venta_a_credito(self):
        venta_id = self.vender(representante_id=self.rep.id).data['id']
        resp = self.client_cajero.get(f'/api/cantina/ventas/{venta_id}/recibo/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)


class BuscadorParaVentaTests(VentaCreditoBase):
    def test_representante_inactivo_no_aparece_para_venta(self):
        Representante.objects.filter(pk=self.rep.pk).update(activo=False)
        resp = self.client_cajero.get(BASE + 'buscar/', {'q': 'maria', 'para_venta': '1'})
        self.assertEqual(resp.data, [])

    def test_representante_inactivo_con_deuda_sigue_apareciendo_para_cobrar(self):
        self.crear_cargo('5.00')
        Representante.objects.filter(pk=self.rep.pk).update(activo=False)
        resp = self.client_cajero.get(BASE + 'buscar/', {'q': 'maria'})
        self.assertEqual([r['id'] for r in resp.data], [self.rep.id])

    def test_activo_aparece_para_venta(self):
        resp = self.client_cajero.get(BASE + 'buscar/', {'q': 'maria', 'para_venta': '1'})
        self.assertEqual([r['id'] for r in resp.data], [self.rep.id])
