"""
Tests de la Fase 1 (carril B1) de la Auditoría de Cantina: instrumentación
de la bitácora en los flujos existentes de `views.py` — productos, ventas
(descuento, venta manual, anulación con motivo), movimientos de inventario
(merma) y apertura/cierre de caja. Cada operación fallida no debe dejar
evento (la bitácora se escribe dentro de la misma transacción).
"""
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.test import APIClient

from cobranza.models import TasaCambio
from secretaria.models import Alumno, Representante

from .auditoria.bitacora import verificar_cadena
from .models import (
    AperturaCajaCantina,
    CargoCantina,
    CategoriaProducto,
    CierreCajaCantina,
    CreditoRepresentanteCantina,
    DetalleVentaCantina,
    EventoAuditoriaCantina,
    MovimientoInventario,
    ProductoCantina,
    TarjetaPrepago,
    VentaCantina,
)

User = get_user_model()

URL_PRODUCTOS = '/api/cantina/productos/'
URL_MOVIMIENTO = '/api/cantina/inventario/movimiento/'
URL_APERTURA = '/api/cantina/apertura-caja/'
URL_VENTA = '/api/cantina/ventas/registrar/'
URL_CIERRE = '/api/cantina/cierre-caja/'


def _usuario(username, rol):
    user = User.objects.create_user(username=username, password='password123')
    user.perfil.rol = rol
    user.perfil.esta_activo = True
    user.perfil.save()
    return user


def _eventos(tipo):
    return EventoAuditoriaCantina.objects.filter(tipo=tipo)


class InstrumentacionTestsBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.cajero = _usuario('cajero_b1', 'cajero')
        self.client.force_authenticate(user=self.cajero)

        self.categoria = CategoriaProducto.objects.create(nombre='Snacks')
        self.jugo = ProductoCantina.objects.create(
            nombre='Jugo natural', categoria=self.categoria, codigo_barras='7592222222221',
            precio=Decimal('1.50'), costo=Decimal('0.80'), stock_actual=10, stock_minimo=2,
        )
        self.empanada = ProductoCantina.objects.create(
            nombre='Empanada', categoria=self.categoria, codigo_barras='7592222222222',
            precio=Decimal('1.00'), stock_actual=10, stock_minimo=2,
        )

        self.representante = Representante.objects.create(
            cedula='V-8888888', nombre='Marta', apellido='Ríos',
            telefono='0412-8888888', correo='marta@example.com', direccion='Calle 8',
        )
        self.alumno = Alumno.objects.create(
            nombre='Luis', apellido='Ríos', representante=self.representante, grado_seccion='4to B',
        )
        self.tarjeta = TarjetaPrepago.objects.create(
            alumno=self.alumno, serial='L009-0001', codigo='CANT-BBBBBBBBBB',
            estado='activa', saldo=Decimal('10.00'), limite_credito=Decimal('0.00'),
        )
        TasaCambio.objects.create(valor_bs=Decimal('40.0000'))

    def abrir_caja(self, monto='20.00'):
        return self.client.post(URL_APERTURA, {'monto_inicial': monto, 'area': 'cantina'}, format='json')

    def vender(self, **extra):
        payload = {
            'items': [{'producto_id': self.jugo.id, 'cantidad': 2}],
            'metodo_pago': 'efectivo',
        }
        payload.update(extra)
        return self.client.post(URL_VENTA, payload, format='json')


# ─────────────────────────────────────────────
# Productos: creación y cambio de precio/costo
# ─────────────────────────────────────────────

class ProductoAuditoriaTests(InstrumentacionTestsBase):
    def test_crear_producto_registra_producto_creado_y_acepta_costo(self):
        resp = self.client.post(URL_PRODUCTOS, {
            'nombre': 'Galleta', 'categoria': self.categoria.id, 'precio': '0.75',
            'costo': '0.40', 'stock_actual': 12, 'stock_minimo': 3,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['costo'], '0.40')

        evento = _eventos('producto_creado').get()
        self.assertEqual(evento.objeto_tipo, 'productocantina')
        self.assertEqual(evento.objeto_id, str(resp.data['id']))
        self.assertIsNone(evento.antes)
        self.assertEqual(evento.despues, {'precio': '0.75', 'costo': '0.40', 'stock_actual': 12})
        self.assertEqual(evento.usuario, self.cajero)
        self.assertEqual(evento.area, 'cantina')

    def test_crear_producto_invalido_no_deja_evento(self):
        resp = self.client.post(URL_PRODUCTOS, {
            'nombre': 'Galleta', 'categoria': self.categoria.id, 'precio': '0.75', 'costo': '-1.00',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('costo', resp.data)
        self.assertFalse(EventoAuditoriaCantina.objects.exists())

    def test_cambio_de_precio_registra_antes_y_despues_con_motivo(self):
        resp = self.client.patch(
            f'{URL_PRODUCTOS}{self.jugo.id}/', {'precio': '2.00', 'motivo': 'Nueva lista'}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)

        evento = _eventos('cambio_precio').get()
        self.assertEqual(evento.antes, {'precio': '1.50', 'costo': '0.80'})
        self.assertEqual(evento.despues, {'precio': '2.00', 'costo': '0.80'})
        self.assertEqual(evento.motivo, 'Nueva lista')
        self.assertEqual(evento.objeto_id, str(self.jugo.id))

    def test_cambio_de_costo_con_put_registra_cambio_precio(self):
        resp = self.client.put(f'{URL_PRODUCTOS}{self.empanada.id}/', {
            'nombre': 'Empanada', 'categoria': self.categoria.id, 'precio': '1.00',
            'costo': '0.55', 'stock_actual': 10, 'stock_minimo': 2,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        evento = _eventos('cambio_precio').get()
        self.assertEqual(evento.antes, {'precio': '1.00', 'costo': None})
        self.assertEqual(evento.despues, {'precio': '1.00', 'costo': '0.55'})

    def test_editar_sin_cambiar_precio_ni_costo_no_registra(self):
        resp = self.client.patch(
            f'{URL_PRODUCTOS}{self.jugo.id}/', {'nombre': 'Jugo de naranja', 'precio': '1.50'}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertFalse(EventoAuditoriaCantina.objects.exists())

    def test_cambio_de_precio_invalido_no_deja_evento(self):
        resp = self.client.patch(f'{URL_PRODUCTOS}{self.jugo.id}/', {'precio': '-3.00'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(EventoAuditoriaCantina.objects.exists())
        self.jugo.refresh_from_db()
        self.assertEqual(self.jugo.precio, Decimal('1.50'))


# ─────────────────────────────────────────────
# Movimientos de inventario (entrada / ajuste / merma)
# ─────────────────────────────────────────────

class InventarioAuditoriaTests(InstrumentacionTestsBase):
    def mover(self, tipo, cantidad, motivo=None):
        payload = {'producto': self.jugo.id, 'tipo': tipo, 'cantidad': cantidad}
        if motivo is not None:
            payload['motivo'] = motivo
        return self.client.post(URL_MOVIMIENTO, payload, format='json')

    def test_entrada_registra_movimiento_inventario(self):
        resp = self.mover('entrada', 5)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        evento = _eventos('movimiento_inventario').get()
        self.assertEqual(evento.antes, {'stock': 10})
        self.assertEqual(evento.despues['stock'], 15)
        self.assertEqual(evento.despues['movimiento_id'], resp.data['id'])
        self.assertEqual(evento.objeto_id, str(self.jugo.id))

    def test_merma_resta_stock_y_registra_merma(self):
        resp = self.mover('merma', 3, 'Vencido')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['tipo'], 'merma')
        self.jugo.refresh_from_db()
        self.assertEqual(self.jugo.stock_actual, 7)

        evento = _eventos('merma').get()
        self.assertEqual(evento.antes, {'stock': 10})
        self.assertEqual(evento.despues['stock'], 7)
        self.assertEqual(evento.despues['cantidad'], 3)
        self.assertEqual(evento.motivo, 'Vencido')

    def test_ajuste_registra_ajuste_inventario(self):
        resp = self.mover('ajuste', -2, 'Conteo físico')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        evento = _eventos('ajuste_inventario').get()
        self.assertEqual(evento.antes, {'stock': 10})
        self.assertEqual(evento.despues['stock'], 8)
        self.assertEqual(evento.motivo, 'Conteo físico')

    def test_merma_y_ajuste_exigen_motivo(self):
        for tipo, cantidad in (('merma', 1), ('ajuste', -1)):
            for motivo in (None, '', '   '):
                resp = self.mover(tipo, cantidad, motivo)
                self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, (tipo, motivo))
                self.assertIn('motivo', resp.data['detail'])
        self.assertFalse(MovimientoInventario.objects.exists())
        self.assertFalse(EventoAuditoriaCantina.objects.exists())

    def test_tipo_invalido_devuelve_400(self):
        resp = self.mover('robo', 1, 'x')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(EventoAuditoriaCantina.objects.exists())

    def test_merma_no_positiva_devuelve_400(self):
        resp = self.mover('merma', -2, 'Vencido')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(EventoAuditoriaCantina.objects.exists())

    def test_merma_que_deja_stock_negativo_no_deja_evento(self):
        resp = self.mover('merma', 50, 'Vencido')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.jugo.refresh_from_db()
        self.assertEqual(self.jugo.stock_actual, 10)
        self.assertFalse(MovimientoInventario.objects.exists())
        self.assertFalse(EventoAuditoriaCantina.objects.exists())


# ─────────────────────────────────────────────
# Apertura y cierre de caja
# ─────────────────────────────────────────────

class CajaAuditoriaTests(InstrumentacionTestsBase):
    def test_apertura_registra_apertura_caja(self):
        resp = self.abrir_caja('20')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        evento = _eventos('apertura_caja').get()
        self.assertEqual(evento.objeto_tipo, 'aperturacajacantina')
        self.assertEqual(evento.objeto_id, str(resp.data['id']))
        self.assertEqual(evento.despues, {'monto_inicial': '20.00', 'area': 'cantina'})
        self.assertEqual(evento.area, 'cantina')

    def test_apertura_rechazada_no_deja_evento(self):
        AperturaCajaCantina.objects.create(cajero=self.cajero, monto_inicial=Decimal('0.00'))
        resp = self.abrir_caja()
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(EventoAuditoriaCantina.objects.exists())

    def test_cierre_registra_cierre_caja_con_totales_netos(self):
        self.abrir_caja('20.00')
        resp = self.vender(descuento_usd='0.50', motivo_descuento='Promoción')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

        resp = self.client.post(URL_CIERRE, {'conteo_fisico': '22.00', 'observaciones': 'Sin novedad'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

        # El efectivo esperado usa el NETO de la venta: 20 + (3.00 − 0.50) = 22.50.
        cierre = CierreCajaCantina.objects.get()
        self.assertEqual(cierre.total_ventas, Decimal('2.50'))
        self.assertEqual(cierre.diferencia, Decimal('-0.50'))

        evento = _eventos('cierre_caja').get()
        self.assertEqual(evento.objeto_id, str(cierre.id))
        self.assertEqual(evento.despues, {
            'total_ventas': '2.50', 'total_efectivo': '2.50',
            'conteo_fisico': '22.00', 'diferencia': '-0.50',
        })
        self.assertEqual(evento.motivo, 'Sin novedad')

    def test_cierre_invalido_no_deja_evento(self):
        self.abrir_caja()
        resp = self.client.post(URL_CIERRE, {'conteo_fisico': 'abc'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(_eventos('cierre_caja').exists())


# ─────────────────────────────────────────────
# Registrar venta: descuento, venta manual y costo
# ─────────────────────────────────────────────

class VentaAuditoriaTests(InstrumentacionTestsBase):
    def setUp(self):
        super().setUp()
        self.abrir_caja()

    def test_venta_normal_no_registra_eventos_y_copia_costo(self):
        resp = self.vender()
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertFalse(resp.data['es_manual'])
        self.assertEqual(resp.data['origen_producto'], 'escaner')
        self.assertEqual(resp.data['origen_alumno'], 'no_aplica')
        self.assertEqual(resp.data['descuento_usd'], '0.00')
        self.assertEqual(resp.data['motivo_descuento'], '')
        self.assertFalse(_eventos('descuento_venta').exists())
        self.assertFalse(_eventos('venta_manual').exists())

        detalle = DetalleVentaCantina.objects.get(venta_id=resp.data['id'])
        self.assertEqual(detalle.costo_unitario, Decimal('0.80'))

    def test_costo_desconocido_queda_null_en_el_detalle(self):
        resp = self.vender(items=[{'producto_id': self.empanada.id, 'cantidad': 1}])
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIsNone(DetalleVentaCantina.objects.get(venta_id=resp.data['id']).costo_unitario)

    def test_descuento_guarda_total_neto_y_registra_evento(self):
        resp = self.vender(descuento_usd='0.50', motivo_descuento='Cliente frecuente')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['total_usd'], '2.50')
        self.assertEqual(resp.data['subtotal_usd'], '3.00')
        self.assertEqual(resp.data['descuento_usd'], '0.50')
        self.assertEqual(resp.data['motivo_descuento'], 'Cliente frecuente')
        self.assertEqual(Decimal(resp.data['total_ves']), Decimal('100.00'))

        evento = _eventos('descuento_venta').get()
        self.assertEqual(evento.objeto_tipo, 'ventacantina')
        self.assertEqual(evento.objeto_id, str(resp.data['id']))
        self.assertEqual(evento.despues, {'subtotal_usd': '3.00', 'descuento_usd': '0.50', 'total_usd': '2.50'})
        self.assertEqual(evento.motivo, 'Cliente frecuente')

    def test_descuento_con_tarjeta_cobra_el_neto(self):
        resp = self.vender(
            metodo_pago='tarjeta_prepago', tarjeta_codigo=self.tarjeta.codigo,
            descuento_usd='1.00', motivo_descuento='Promoción', origen_alumno='escaner',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, Decimal('8.00'))  # 10 − (3.00 − 1.00)
        self.assertEqual(resp.data['saldo_tarjeta_despues'], '8.00')

    def test_descuento_hace_caber_la_venta_en_el_saldo_de_la_tarjeta(self):
        # Subtotal 12.00 > saldo 10.00 (sin crédito), pero el neto 9.00 sí alcanza.
        resp = self.vender(
            items=[{'producto_id': self.jugo.id, 'cantidad': 8}],
            metodo_pago='tarjeta_prepago', tarjeta_codigo=self.tarjeta.codigo,
            descuento_usd='3.00', motivo_descuento='Combo',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, Decimal('1.00'))

    def test_descuento_con_credito_carga_el_neto_al_representante(self):
        CreditoRepresentanteCantina.objects.create(representante=self.representante, limite_usd=Decimal('50.00'))
        resp = self.vender(
            metodo_pago='credito_representante', representante_id=self.representante.id,
            descuento_usd='0.75', motivo_descuento='Promoción',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(CargoCantina.objects.get(venta_id=resp.data['id']).monto_usd, Decimal('2.25'))

    def test_descuento_total_a_credito_devuelve_400(self):
        resp = self.vender(
            metodo_pago='credito_representante', representante_id=self.representante.id,
            descuento_usd='3.00', motivo_descuento='Cortesía',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(VentaCantina.objects.exists())

    def test_descuento_total_en_efectivo_se_permite(self):
        resp = self.vender(descuento_usd='3.00', motivo_descuento='Cortesía de dirección')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['total_usd'], '0.00')

    def test_validaciones_de_descuento_devuelven_400(self):
        casos = [
            {'descuento_usd': '0.50'},                                   # sin motivo
            {'descuento_usd': '0.50', 'motivo_descuento': '   '},        # motivo vacío
            {'descuento_usd': '-0.10', 'motivo_descuento': 'x'},         # negativo
            {'descuento_usd': '3.01', 'motivo_descuento': 'x'},          # mayor al subtotal
            {'descuento_usd': 'abc', 'motivo_descuento': 'x'},           # no numérico
            {'descuento_usd': 'NaN', 'motivo_descuento': 'x'},           # no finito
            {'descuento_usd': {'a': 1}, 'motivo_descuento': 'x'},        # tipo inválido
            {'descuento_usd': '0.50', 'motivo_descuento': 'x' * 201},    # motivo largo
        ]
        for extra in casos:
            resp = self.vender(**extra)
            self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, extra)
            self.assertIn('error', resp.data)
        self.assertFalse(VentaCantina.objects.exists())
        self.assertFalse(_eventos('descuento_venta').exists())
        self.jugo.refresh_from_db()
        self.assertEqual(self.jugo.stock_actual, 10)

    def test_descuento_cero_ignora_el_motivo(self):
        resp = self.vender(descuento_usd='0', motivo_descuento='No aplica')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['motivo_descuento'], '')
        self.assertFalse(_eventos('descuento_venta').exists())

    def test_producto_por_busqueda_marca_venta_manual(self):
        resp = self.vender(origen_producto='manual')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertTrue(resp.data['es_manual'])
        evento = _eventos('venta_manual').get()
        self.assertEqual(evento.despues, {'origen_producto': 'manual', 'origen_alumno': 'no_aplica', 'total_usd': '3.00'})

    def test_origen_mixto_es_manual(self):
        resp = self.vender(origen_producto='mixto')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertTrue(VentaCantina.objects.get(pk=resp.data['id']).es_manual)

    def test_alumno_por_busqueda_marca_venta_manual(self):
        resp = self.vender(
            metodo_pago='tarjeta_prepago', tarjeta_codigo=self.tarjeta.codigo, origen_alumno='manual',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertTrue(resp.data['es_manual'])
        self.assertEqual(resp.data['origen_alumno'], 'manual')
        self.assertEqual(_eventos('venta_manual').count(), 1)

    def test_alumno_por_escaner_no_es_manual(self):
        resp = self.vender(
            metodo_pago='tarjeta_prepago', tarjeta_codigo=self.tarjeta.codigo, origen_alumno='escaner',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertFalse(resp.data['es_manual'])
        self.assertFalse(_eventos('venta_manual').exists())

    def test_venta_manual_con_descuento_registra_ambos_eventos(self):
        resp = self.vender(origen_producto='manual', descuento_usd='1.00', motivo_descuento='Promo')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(_eventos('descuento_venta').count(), 1)
        self.assertEqual(_eventos('venta_manual').count(), 1)
        self.assertEqual(_eventos('venta_manual').get().despues['total_usd'], '2.00')

    def test_origen_invalido_devuelve_400(self):
        for extra in ({'origen_producto': 'telepatia'}, {'origen_alumno': 'otro'}, {'origen_producto': ['manual']}):
            resp = self.vender(**extra)
            self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, extra)
        self.assertFalse(VentaCantina.objects.exists())

    def test_venta_fallida_no_deja_eventos(self):
        error = drf_serializers.ValidationError('El representante excede su límite de crédito.')
        with mock.patch('cantina.services_cxc.crear_cargo_por_venta', side_effect=error):
            resp = self.vender(
                metodo_pago='credito_representante', representante_id=self.representante.id,
                origen_producto='manual', descuento_usd='0.50', motivo_descuento='Promo',
            )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(VentaCantina.objects.exists())
        self.assertFalse(_eventos('descuento_venta').exists())
        self.assertFalse(_eventos('venta_manual').exists())


# ─────────────────────────────────────────────
# Anulación con motivo obligatorio
# ─────────────────────────────────────────────

class AnulacionAuditoriaTests(InstrumentacionTestsBase):
    def setUp(self):
        super().setUp()
        self.abrir_caja()
        resp = self.vender(metodo_pago='tarjeta_prepago', tarjeta_codigo=self.tarjeta.codigo)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.venta_id = resp.data['id']
        self.url = f'/api/cantina/ventas/{self.venta_id}/anular/'

    def test_anular_sin_motivo_devuelve_400_y_no_cambia_nada(self):
        for body in ({}, {'motivo': ''}, {'motivo': '   '}, {'motivo': {'a': 1}}):
            resp = self.client.post(self.url, body, format='json')
            self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, body)
            self.assertIn('motivo', resp.data['error'])
        venta = VentaCantina.objects.get(pk=self.venta_id)
        self.assertEqual(venta.estado, 'completada')
        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, Decimal('7.00'))
        self.assertFalse(_eventos('anulacion_venta').exists())

    def test_anular_con_motivo_guarda_motivo_y_registra_evento(self):
        resp = self.client.post(self.url, {'motivo': 'Cliente desistió'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data['estado'], 'anulada')
        self.assertEqual(resp.data['motivo_anulacion'], 'Cliente desistió')
        self.assertEqual(VentaCantina.objects.get(pk=self.venta_id).motivo_anulacion, 'Cliente desistió')

        evento = _eventos('anulacion_venta').get()
        self.assertEqual(evento.objeto_id, str(self.venta_id))
        self.assertEqual(evento.antes, {'estado': 'completada', 'total_usd': '3.00', 'metodo_pago': 'tarjeta_prepago'})
        self.assertEqual(evento.despues, {'estado': 'anulada', 'total_usd': '3.00', 'metodo_pago': 'tarjeta_prepago'})
        self.assertEqual(evento.motivo, 'Cliente desistió')
        self.assertEqual(evento.usuario, self.cajero)

    def test_anular_venta_con_descuento_reversa_el_neto(self):
        resp = self.vender(
            metodo_pago='tarjeta_prepago', tarjeta_codigo=self.tarjeta.codigo,
            descuento_usd='1.00', motivo_descuento='Promo',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.tarjeta.refresh_from_db()
        saldo_previo = self.tarjeta.saldo
        resp = self.client.post(f'/api/cantina/ventas/{resp.data["id"]}/anular/', {'motivo': 'Error'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, saldo_previo + Decimal('2.00'))

    def test_anulacion_fallida_no_deja_evento(self):
        error = drf_serializers.ValidationError('Error simulado al reversar.')
        with mock.patch('cantina.views.aplicar_movimiento_tarjeta', side_effect=error):
            resp = self.client.post(self.url, {'motivo': 'Error de cobro'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        venta = VentaCantina.objects.get(pk=self.venta_id)
        self.assertEqual(venta.estado, 'completada')
        self.assertEqual(venta.motivo_anulacion, '')
        self.assertFalse(_eventos('anulacion_venta').exists())

    def test_segunda_anulacion_no_registra_otro_evento(self):
        self.client.post(self.url, {'motivo': 'Primera'}, format='json')
        resp = self.client.post(self.url, {'motivo': 'Segunda'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(_eventos('anulacion_venta').count(), 1)

    def test_anulacion_concurrente_no_reversa_dos_veces(self):
        # Simula la carrera: la segunda petición leyó la venta ANTES de que
        # la primera la anulara (copia vieja en 'completada'). El chequeo
        # bajo select_for_update dentro de la transacción debe frenarla.
        from .models import MovimientoTarjeta
        copia_vieja = VentaCantina.objects.select_related('tarjeta').get(pk=self.venta_id)
        resp = self.client.post(self.url, {'motivo': 'Primera'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.tarjeta.refresh_from_db()
        saldo_tras_primera = self.tarjeta.saldo

        with mock.patch('cantina.views.get_object_or_404', return_value=copia_vieja):
            resp = self.client.post(self.url, {'motivo': 'Segunda simultánea'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, saldo_tras_primera)
        self.assertEqual(_eventos('anulacion_venta').count(), 1)
        self.assertEqual(
            MovimientoTarjeta.objects.filter(venta_id=self.venta_id, tipo='reverso').count(), 1,
        )


class CadenaBitacoraTests(InstrumentacionTestsBase):
    def test_flujo_completo_deja_cadena_valida(self):
        self.abrir_caja()
        self.client.patch(f'{URL_PRODUCTOS}{self.jugo.id}/', {'precio': '1.60'}, format='json')
        self.client.post(
            URL_MOVIMIENTO, {'producto': self.jugo.id, 'tipo': 'merma', 'cantidad': 1, 'motivo': 'Roto'}, format='json',
        )
        venta = self.vender(origen_producto='manual', descuento_usd='0.20', motivo_descuento='Promo').data
        self.client.post(f'/api/cantina/ventas/{venta["id"]}/anular/', {'motivo': 'Error'}, format='json')
        self.client.post(URL_CIERRE, {'conteo_fisico': '20.00'}, format='json')

        tipos = list(EventoAuditoriaCantina.objects.order_by('id').values_list('tipo', flat=True))
        self.assertEqual(tipos, [
            'apertura_caja', 'cambio_precio', 'merma', 'descuento_venta',
            'venta_manual', 'anulacion_venta', 'cierre_caja',
        ])
        self.assertTrue(verificar_cadena()['ok'])
