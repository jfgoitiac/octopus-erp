"""
Tests de las dos cajas (Cantina / Librería, D1–D3), del POS con métodos de
cobranza (D7), del cargo a cuenta del representante y del cierre por área
(D11). Los servicios de `services_cxc` (los implementa otro agente) se
reemplazan con `unittest.mock.patch` para aislar el contrato de las vistas.
"""
import uuid
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.test import APIClient

from cobranza.models import BancoInstitucional, TasaCambio
from secretaria.models import Alumno, Representante

from .models import (
    AbonoCantina,
    AperturaCajaCantina,
    CategoriaProducto,
    CierreCajaCantina,
    ProductoCantina,
    RecargaTarjeta,
    TarjetaPrepago,
    VentaCantina,
)

User = get_user_model()

URL_APERTURA = '/api/cantina/apertura-caja/'
URL_VENTA = '/api/cantina/ventas/registrar/'
URL_CIERRE = '/api/cantina/cierre-caja/'


def _usuario(username, rol):
    user = User.objects.create_user(username=username, password='password123')
    user.perfil.rol = rol
    user.perfil.esta_activo = True
    user.perfil.save()
    return user


class AreasTestsBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.cajero = _usuario('cajero_areas', 'cajero')
        self.cajero_b = _usuario('cajero_areas_b', 'cajero')
        self.admin = _usuario('admin_areas', 'administrador')

        self.cat_cantina = CategoriaProducto.objects.create(nombre='Snacks', area='cantina')
        self.cat_libreria = CategoriaProducto.objects.create(nombre='Papelería', area='libreria')
        self.jugo = ProductoCantina.objects.create(
            nombre='Jugo', categoria=self.cat_cantina, precio=Decimal('2.00'), stock_actual=10, area='cantina',
        )
        self.cuaderno = ProductoCantina.objects.create(
            nombre='Cuaderno', categoria=self.cat_libreria, precio=Decimal('3.00'), stock_actual=10, area='libreria',
        )

        self.representante = Representante.objects.create(
            cedula='V-1234567', nombre='Laura', apellido='Pérez',
            telefono='0412-1234567', correo='laura@example.com', direccion='Calle 1',
        )
        self.hijo = Alumno.objects.create(
            nombre='Luis', apellido='Pérez', representante=self.representante, grado_seccion='3ro A',
        )
        otra = Representante.objects.create(
            cedula='V-7654321', nombre='Marta', apellido='Rojas',
            telefono='0412-7654321', correo='marta@example.com', direccion='Calle 2',
        )
        self.hijo_ajeno = Alumno.objects.create(
            nombre='Mario', apellido='Rojas', representante=otra, grado_seccion='4to B',
        )

        self.banco = BancoInstitucional.objects.create(nombre='Banesco', tipos=['transferencia', 'pago_movil', 'zelle'])
        self.tasa = TasaCambio.objects.create(valor_bs=Decimal('40.0000'))

    def abrir(self, cajero, area, monto='0.00'):
        return AperturaCajaCantina.objects.create(cajero=cajero, area=area, monto_inicial=Decimal(monto))

    def vender(self, cajero, producto, metodo='efectivo', cantidad=1, **extra):
        self.client.force_authenticate(user=cajero)
        payload = {'items': [{'producto_id': producto.id, 'cantidad': cantidad}], 'metodo_pago': metodo}
        payload.update(extra)
        return self.client.post(URL_VENTA, payload, format='json')


class AperturaPorAreaTests(AreasTestsBase):
    def test_apertura_sin_area_es_rechazada(self):
        self.client.force_authenticate(user=self.cajero)
        resp = self.client.post(URL_APERTURA, {'monto_inicial': '10.00'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('area', resp.data['detail'])

    def test_apertura_con_area_invalida_es_rechazada(self):
        self.client.force_authenticate(user=self.cajero)
        resp = self.client.post(URL_APERTURA, {'monto_inicial': '10.00', 'area': 'gimnasio'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_apertura_devuelve_el_area(self):
        self.client.force_authenticate(user=self.cajero)
        resp = self.client.post(URL_APERTURA, {'monto_inicial': '10.00', 'area': 'libreria'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['area'], 'libreria')
        resp_get = self.client.get(URL_APERTURA)
        self.assertEqual(resp_get.data['apertura']['area'], 'libreria')

    def test_limite_de_tres_cajas_se_cuenta_por_area(self):
        for i in range(3):
            self.abrir(_usuario(f'cajero_lib_{i}', 'cajero'), 'libreria')

        # La caja de Librería está llena...
        self.client.force_authenticate(user=self.cajero)
        resp = self.client.post(URL_APERTURA, {'monto_inicial': '1.00', 'area': 'libreria'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

        # ...pero Cantina sigue disponible.
        resp = self.client.post(URL_APERTURA, {'monto_inicial': '1.00', 'area': 'cantina'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

    def test_un_cajero_sigue_limitado_a_una_apertura_abierta(self):
        self.abrir(self.cajero, 'cantina')
        self.client.force_authenticate(user=self.cajero)
        resp = self.client.post(URL_APERTURA, {'monto_inicial': '1.00', 'area': 'libreria'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class ProductosPorAreaTests(AreasTestsBase):
    def test_listado_de_productos_filtra_por_area(self):
        self.client.force_authenticate(user=self.cajero)
        resp = self.client.get('/api/cantina/productos/?area=libreria')
        self.assertEqual([p['nombre'] for p in resp.data], ['Cuaderno'])
        self.assertEqual(resp.data[0]['area'], 'libreria')
        resp = self.client.get('/api/cantina/productos/')
        self.assertEqual(len(resp.data), 2)

    def test_listado_de_categorias_filtra_por_area(self):
        self.client.force_authenticate(user=self.cajero)
        resp = self.client.get('/api/cantina/categorias/?area=cantina')
        self.assertEqual([c['nombre'] for c in resp.data], ['Snacks'])

    def test_crear_producto_con_area(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post('/api/cantina/productos/', {
            'nombre': 'Lápiz', 'categoria': self.cat_libreria.id, 'precio': '0.50',
            'stock_actual': 5, 'stock_minimo': 1, 'area': 'libreria',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['area'], 'libreria')

    def test_crear_categoria_con_area(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post('/api/cantina/categorias/', {'nombre': 'Útiles', 'area': 'libreria'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['area'], 'libreria')


class VentaPorAreaTests(AreasTestsBase):
    def test_la_venta_hereda_el_area_de_la_apertura(self):
        self.abrir(self.cajero, 'libreria')
        resp = self.vender(self.cajero, self.cuaderno)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['area'], 'libreria')
        self.assertEqual(VentaCantina.objects.get(pk=resp.data['id']).area, 'libreria')

    def test_el_area_del_request_se_ignora(self):
        self.abrir(self.cajero, 'cantina')
        resp = self.vender(self.cajero, self.jugo, area='libreria')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['area'], 'cantina')

    def test_producto_de_otra_area_es_rechazado_sin_tocar_stock(self):
        self.abrir(self.cajero, 'cantina')
        resp = self.vender(self.cajero, self.cuaderno)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', resp.data)
        self.cuaderno.refresh_from_db()
        self.assertEqual(self.cuaderno.stock_actual, 10)
        self.assertEqual(VentaCantina.objects.count(), 0)

    def test_ticket_pdf_de_libreria(self):
        self.abrir(self.cajero, 'libreria')
        venta_id = self.vender(self.cajero, self.cuaderno).data['id']
        resp = self.client.get(f'/api/cantina/ventas/{venta_id}/recibo/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp['Content-Type'], 'application/pdf')


class VentaMetodosCobranzaTests(AreasTestsBase):
    def setUp(self):
        super().setUp()
        self.abrir(self.cajero, 'cantina')

    def test_zelle_sin_referencia_es_rechazado(self):
        resp = self.vender(self.cajero, self.jugo, 'zelle')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('referencia', resp.data['errores'])
        self.assertEqual(VentaCantina.objects.count(), 0)

    def test_pago_movil_exige_banco_y_referencia_de_6_digitos(self):
        resp = self.vender(self.cajero, self.jugo, 'pago_movil', referencia='123')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        resp = self.vender(self.cajero, self.jugo, 'pago_movil', referencia='123456')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('banco_receptor', resp.data['errores'])

    def test_pago_movil_guarda_los_datos_bancarios(self):
        resp = self.vender(
            self.cajero, self.jugo, 'pago_movil', referencia='123456',
            banco_receptor=self.banco.id, banco_procedencia='Mercantil',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        venta = VentaCantina.objects.get(pk=resp.data['id'])
        self.assertEqual(venta.metodo_pago, 'pago_movil')
        self.assertEqual(venta.referencia, '123456')
        self.assertEqual(venta.banco_receptor_id, self.banco.id)
        self.assertEqual(venta.banco_procedencia, 'Mercantil')
        self.assertIsNone(venta.tarjeta_id)

    def test_punto_de_venta_exige_lote_de_4_digitos(self):
        resp = self.vender(self.cajero, self.jugo, 'punto_de_venta', referencia='1234')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('numero_lote', resp.data['errores'])
        resp = self.vender(self.cajero, self.jugo, 'punto_de_venta', referencia='1234', numero_lote='0001')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(VentaCantina.objects.get(pk=resp.data['id']).numero_lote, '0001')

    def test_referencia_duplicada_contra_una_recarga_es_rechazada(self):
        tarjeta = TarjetaPrepago.objects.create(
            serial='L001-0009', codigo='CANT-ZZZZZZZZZZ', estado='activa', saldo=Decimal('0.00'),
        )
        RecargaTarjeta.objects.create(
            tarjeta=tarjeta, metodo_pago='pago_movil', monto_usd=Decimal('5.00'),
            tasa_aplicada=Decimal('40.0000'), monto_ves=Decimal('200.00'),
            banco_receptor=self.banco, referencia='999888', estatus='aprobado',
        )
        resp = self.vender(
            self.cajero, self.jugo, 'pago_movil', referencia='999888', banco_receptor=self.banco.id,
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('ya está en uso', resp.data['error'])

    def test_efectivo_no_toca_tarjeta_ni_guarda_datos_bancarios(self):
        resp = self.vender(self.cajero, self.jugo, 'efectivo', referencia='555', banco_receptor=self.banco.id)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        venta = VentaCantina.objects.get(pk=resp.data['id'])
        self.assertIsNone(venta.referencia)
        self.assertIsNone(venta.banco_receptor_id)
        self.assertEqual(venta.movimientos.count(), 0)


class VentaCreditoRepresentanteTests(AreasTestsBase):
    def setUp(self):
        super().setUp()
        self.abrir(self.cajero, 'cantina')

    def test_requiere_representante_id(self):
        resp = self.vender(self.cajero, self.jugo, 'credito_representante')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('representante_id', resp.data['error'])

    def test_representante_inexistente_o_inactivo(self):
        resp = self.vender(self.cajero, self.jugo, 'credito_representante', representante_id=99999)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.representante.activo = False
        self.representante.save()
        resp = self.vender(self.cajero, self.jugo, 'credito_representante', representante_id=self.representante.id)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_alumno_de_otro_representante_es_rechazado(self):
        with mock.patch('cantina.services_cxc.crear_cargo_por_venta') as crear:
            resp = self.vender(
                self.cajero, self.jugo, 'credito_representante',
                representante_id=self.representante.id, alumno_id=self.hijo_ajeno.id,
            )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        crear.assert_not_called()
        self.assertEqual(VentaCantina.objects.count(), 0)

    def test_venta_a_credito_llama_al_servicio_dentro_de_la_transaccion(self):
        with mock.patch('cantina.services_cxc.crear_cargo_por_venta') as crear:
            resp = self.vender(
                self.cajero, self.jugo, 'credito_representante',
                representante_id=self.representante.id, alumno_id=self.hijo.id,
            )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        crear.assert_called_once()
        venta = crear.call_args.args[0]
        self.assertEqual(venta.representante_id, self.representante.id)
        self.assertEqual(venta.alumno_id, self.hijo.id)
        self.assertEqual(venta.metodo_pago, 'credito_representante')
        self.assertEqual(resp.data['representante'], self.representante.id)
        self.assertEqual(resp.data['representante_nombre'], 'Laura Pérez')
        self.jugo.refresh_from_db()
        self.assertEqual(self.jugo.stock_actual, 9)

    def test_credito_excedido_revierte_toda_la_venta(self):
        error = drf_serializers.ValidationError('El representante excede su límite de crédito.')
        with mock.patch('cantina.services_cxc.crear_cargo_por_venta', side_effect=error):
            resp = self.vender(
                self.cajero, self.jugo, 'credito_representante', representante_id=self.representante.id,
            )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('límite de crédito', resp.data['error'])
        self.assertEqual(VentaCantina.objects.count(), 0)
        self.jugo.refresh_from_db()
        self.assertEqual(self.jugo.stock_actual, 10)


class AnularVentaCreditoTests(AreasTestsBase):
    def setUp(self):
        super().setUp()
        self.abrir(self.cajero, 'cantina')
        with mock.patch('cantina.services_cxc.crear_cargo_por_venta'):
            resp = self.vender(
                self.cajero, self.jugo, 'credito_representante', representante_id=self.representante.id,
            )
        self.venta_id = resp.data['id']
        self.url = f'/api/cantina/ventas/{self.venta_id}/anular/'

    def test_cajero_no_puede_anular_venta_a_credito(self):
        self.client.force_authenticate(user=self.cajero)
        with mock.patch('cantina.services_cxc.anular_cargo_por_venta') as anular:
            resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        anular.assert_not_called()

    def test_admin_anula_la_venta_y_su_cargo(self):
        self.client.force_authenticate(user=self.admin)
        with mock.patch('cantina.services_cxc.anular_cargo_por_venta') as anular:
            resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        anular.assert_called_once()
        self.assertEqual(anular.call_args.args[0].pk, self.venta_id)
        self.assertEqual(anular.call_args.args[1], self.admin)
        self.assertEqual(resp.data['estado'], 'anulada')
        self.jugo.refresh_from_db()
        self.assertEqual(self.jugo.stock_actual, 10)

    def test_si_el_cargo_tiene_abonos_la_anulacion_se_rechaza_y_nada_cambia(self):
        self.client.force_authenticate(user=self.admin)
        error = drf_serializers.ValidationError('El cargo tiene abonos: anule primero el abono.')
        with mock.patch('cantina.services_cxc.anular_cargo_por_venta', side_effect=error):
            resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('anule primero el abono', resp.data['error'])
        self.assertEqual(VentaCantina.objects.get(pk=self.venta_id).estado, 'completada')
        self.jugo.refresh_from_db()
        self.assertEqual(self.jugo.stock_actual, 9)


class CierrePorAreaTests(AreasTestsBase):
    def test_cierre_con_totales_por_metodo_y_area(self):
        apertura = self.abrir(self.cajero, 'libreria', '10.00')
        # Venta en efectivo (3 USD) y venta zelle (3 USD) de Librería.
        self.assertEqual(self.vender(self.cajero, self.cuaderno, 'efectivo').status_code, 201)
        resp = self.vender(
            self.cajero, self.cuaderno, 'zelle', referencia='ZL-1001', banco_receptor=self.banco.id,
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        # Abono en efectivo (5 USD) y en pago móvil (2 USD) bajo esta apertura.
        op = uuid.uuid4()
        for metodo, usd in (('efectivo', '5.00'), ('pago_movil', '2.00')):
            AbonoCantina.objects.create(
                operacion_uuid=op, representante=self.representante, area='libreria', apertura=apertura,
                metodo_pago=metodo, monto_usd=Decimal(usd), tasa_aplicada=Decimal('40.0000'),
                monto_ves=Decimal(usd) * 40, cajero=self.cajero,
            )
        # Abono anulado: no cuenta.
        AbonoCantina.objects.create(
            operacion_uuid=uuid.uuid4(), representante=self.representante, area='libreria', apertura=apertura,
            metodo_pago='efectivo', monto_usd=Decimal('99.00'), tasa_aplicada=Decimal('40.0000'),
            monto_ves=Decimal('3960.00'), cajero=self.cajero, estatus='anulado',
        )
        # Abono retroactivo (sin apertura): no cuenta.
        AbonoCantina.objects.create(
            operacion_uuid=uuid.uuid4(), representante=self.representante, area='libreria', apertura=None,
            metodo_pago='efectivo', monto_usd=Decimal('50.00'), tasa_aplicada=Decimal('40.0000'),
            monto_ves=Decimal('2000.00'), cajero=self.admin, es_retroactivo=True,
        )
        # Recarga en efectivo (4 USD) del cajero.
        tarjeta = TarjetaPrepago.objects.create(serial='L009-0001', codigo='CANT-QQQQQQQQQQ', estado='activa')
        RecargaTarjeta.objects.create(
            tarjeta=tarjeta, metodo_pago='efectivo', monto_usd=Decimal('4.00'),
            tasa_aplicada=Decimal('40.0000'), monto_ves=Decimal('160.00'), estatus='aprobado', cajero=self.cajero,
        )

        self.client.force_authenticate(user=self.cajero)
        resp = self.client.get(URL_CIERRE)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data['area'], 'libreria')
        tpm = resp.data['totales_por_metodo']
        self.assertEqual(Decimal(tpm['efectivo']['ventas']), Decimal('3.00'))
        self.assertEqual(Decimal(tpm['efectivo']['abonos']), Decimal('5.00'))
        self.assertEqual(Decimal(tpm['efectivo']['recargas']), Decimal('4.00'))
        self.assertEqual(Decimal(tpm['efectivo']['total_usd']), Decimal('12.00'))
        self.assertEqual(Decimal(tpm['pago_movil']['abonos']), Decimal('2.00'))
        self.assertEqual(Decimal(tpm['zelle']['ventas']), Decimal('3.00'))
        # efectivo esperado = 10 inicial + 3 ventas + 5 abonos + 4 recargas
        self.assertEqual(Decimal(resp.data['efectivo_esperado']), Decimal('22.00'))

        resp = self.client.post(URL_CIERRE, {'conteo_fisico': '21.00'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(Decimal(resp.data['diferencia']), Decimal('-1.00'))
        self.assertEqual(resp.data['area'], 'libreria')
        cierre = CierreCajaCantina.objects.get(apertura=apertura)
        self.assertEqual(cierre.area, 'libreria')
        self.assertEqual(Decimal(cierre.totales_por_metodo['efectivo']['abonos']), Decimal('5.00'))

    def test_el_cierre_de_un_area_no_mezcla_la_otra_caja(self):
        self.abrir(self.cajero, 'cantina')
        self.abrir(self.cajero_b, 'libreria')
        self.assertEqual(self.vender(self.cajero_b, self.cuaderno, 'efectivo').status_code, 201)
        self.client.force_authenticate(user=self.cajero)
        resp = self.client.get(URL_CIERRE)
        self.assertEqual(resp.data['area'], 'cantina')
        self.assertEqual(Decimal(resp.data['total_ventas']), Decimal('0.00'))
        self.assertEqual(resp.data['totales_por_metodo'], {})


class ReportesPorAreaTests(AreasTestsBase):
    def setUp(self):
        super().setUp()
        self.abrir(self.cajero, 'cantina')
        self.abrir(self.cajero_b, 'libreria')
        self.vender(self.cajero, self.jugo, 'efectivo')
        self.vender(self.cajero_b, self.cuaderno, 'efectivo')
        self.client.force_authenticate(user=self.admin)

    def test_sin_filtros_trae_ambas_cajas(self):
        resp = self.client.get('/api/cantina/reportes/ventas/')
        self.assertEqual(resp.data['totales']['cantidad_ventas'], 2)

    def test_filtro_por_area(self):
        resp = self.client.get('/api/cantina/reportes/ventas/?area=libreria')
        self.assertEqual(resp.data['totales']['cantidad_ventas'], 1)
        self.assertEqual(resp.data['ventas'][0]['area'], 'libreria')
        self.assertEqual(Decimal(resp.data['totales']['total_vendido_usd']), Decimal('3.00'))

    def test_filtro_por_cajero(self):
        resp = self.client.get(f'/api/cantina/reportes/ventas/?cajero={self.cajero.id}')
        self.assertEqual(resp.data['totales']['cantidad_ventas'], 1)
        self.assertEqual(resp.data['ventas'][0]['cajero'], self.cajero.id)

    def test_filtro_combinado_sin_resultados(self):
        resp = self.client.get(f'/api/cantina/reportes/ventas/?area=libreria&cajero={self.cajero.id}')
        self.assertEqual(resp.data['totales']['cantidad_ventas'], 0)

    def test_excel_acepta_los_filtros(self):
        resp = self.client.get(f'/api/cantina/reportes/ventas/excel/?area=cantina&cajero={self.cajero.id}')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
