"""Tests de clientes generales (personal/otros) en cuentas por cobrar de Cantina."""
from decimal import Decimal

from rest_framework import status

from secretaria.models import Representante

from . import services_cxc
from .models import (
    AbonoCantina,
    CargoCantina,
    CategoriaProducto,
    ClienteCantina,
    ProductoCantina,
    VentaCantina,
)
from .tests_cxc import BASE, CxcBase


class ClientesBase(CxcBase):
    def setUp(self):
        super().setUp()
        self.cliente = ClienteCantina.objects.create(
            nombre='Pedro', apellido='Docente', documento='V-111', tipo='personal',
        )
        categoria = CategoriaProducto.objects.create(nombre='Snacks CxC')
        self.producto = ProductoCantina.objects.create(
            nombre='Jugo CxC', categoria=categoria, codigo_barras='7599999999991',
            precio=Decimal('5.00'), stock_actual=50, stock_minimo=1, area='cantina',
        )

    def cargo_cliente(self, monto, cliente=None):
        cliente = cliente or self.cliente
        venta = VentaCantina.objects.create(
            cajero=self.cajero, metodo_pago='credito_representante', area='cantina',
            cliente=cliente, total_usd=Decimal(monto), tasa_aplicada=Decimal('40'),
            total_ves=Decimal(monto) * 40,
        )
        return services_cxc.crear_cargo_por_venta(venta)

    def abonar(self, monto, cliente=None, client=None, **extra):
        body = {
            'cliente_id': (cliente or self.cliente).id,
            'lineas': [{'metodo_pago': 'efectivo', 'monto_usd': str(monto)}],
        }
        body.update(extra)
        return (client or self.client_cajero).post(BASE + 'abonos/', body, format='json')

    def vender(self, **extra):
        body = {
            'items': [{'producto_id': self.producto.id, 'cantidad': 1}],
            'metodo_pago': 'credito_representante',
        }
        body.update(extra)
        return self.client_cajero.post('/api/cantina/ventas/registrar/', body, format='json')


class AltaClienteTests(ClientesBase):
    def test_cajero_crea_cliente(self):
        resp = self.client_cajero.post(BASE + 'clientes/', {
            'nombre': 'Ana', 'apellido': 'Otra', 'documento': 'e-222', 'telefono': '0414',
            'email': 'ana@example.com', 'tipo': 'otro',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['tipo'], 'otro')
        self.assertEqual(resp.data['cedula'], 'E-222')
        self.assertEqual(Decimal(resp.data['saldo_usd']), Decimal('0.00'))

    def test_documento_duplicado_rechazado(self):
        resp = self.client_cajero.post(BASE + 'clientes/', {'nombre': 'Otro', 'documento': 'v-111'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('documento', resp.data)

    def test_varios_clientes_sin_documento(self):
        for nombre in ('Uno', 'Dos'):
            resp = self.client_cajero.post(BASE + 'clientes/', {'nombre': nombre, 'documento': ''}, format='json')
            self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(ClienteCantina.objects.filter(documento__isnull=True).count(), 2)

    def test_editar_y_desactivar(self):
        resp = self.client_cajero.patch(
            BASE + f'clientes/{self.cliente.id}/', {'telefono': '0412', 'activo': False}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.cliente.refresh_from_db()
        self.assertEqual(self.cliente.telefono, '0412')
        self.assertFalse(self.cliente.activo)

    def test_editar_documento_a_uno_ajeno_falla(self):
        otro = ClienteCantina.objects.create(nombre='Otro', documento='V-999')
        resp = self.client_cajero.patch(BASE + f'clientes/{otro.id}/', {'documento': 'V-111'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_listado_filtra_por_tipo(self):
        ClienteCantina.objects.create(nombre='Zed', tipo='otro')
        resp = self.client_cajero.get(BASE + 'clientes/', {'tipo': 'personal'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual([c['nombre'] for c in resp.data['results']], ['Pedro'])

    def test_limite_y_bloqueo_solo_admin(self):
        url = BASE + f'clientes/{self.cliente.id}/credito/'
        self.assertEqual(
            self.client_cajero.patch(url, {'bloqueado': True}, format='json').status_code, status.HTTP_403_FORBIDDEN,
        )
        resp = self.client_admin.patch(url, {'limite_usd': '50.00', 'bloqueado': True}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.cliente.refresh_from_db()
        self.assertEqual(self.cliente.limite_usd, Decimal('50.00'))
        self.assertTrue(self.cliente.bloqueado)


class BuscadorClientesTests(ClientesBase):
    def test_busqueda_unificada_con_tipo(self):
        resp = self.client_cajero.get(BASE + 'buscar/', {'q': 'maria'})
        self.assertEqual([(r['tipo'], r['id']) for r in resp.data], [('representante', self.rep.id)])
        resp = self.client_cajero.get(BASE + 'buscar/', {'q': 'docente'})
        self.assertEqual([(r['tipo'], r['id']) for r in resp.data], [('personal', self.cliente.id)])

    def test_inactivo_excluido_para_venta(self):
        ClienteCantina.objects.filter(pk=self.cliente.pk).update(activo=False)
        resp = self.client_cajero.get(BASE + 'buscar/', {'q': 'docente', 'para_venta': '1'})
        self.assertEqual(resp.data, [])

    def test_inactivo_con_saldo_aparece_para_cobrar(self):
        self.cargo_cliente('5.00')
        ClienteCantina.objects.filter(pk=self.cliente.pk).update(activo=False)
        resp = self.client_cajero.get(BASE + 'buscar/', {'q': 'docente'})
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(Decimal(resp.data[0]['saldo_usd']), Decimal('5.00'))


class VentaCreditoClienteTests(ClientesBase):
    def test_venta_a_credito_crea_cargo_del_cliente(self):
        resp = self.vender(cliente_id=self.cliente.id)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['cliente'], self.cliente.id)
        self.assertEqual(resp.data['cliente_nombre'], 'Pedro Docente')
        cargo = CargoCantina.objects.get(venta_id=resp.data['id'])
        self.assertEqual(cargo.cliente_id, self.cliente.id)
        self.assertIsNone(cargo.representante_id)
        self.assertEqual(services_cxc.saldo_titular(self.cliente), Decimal('5.00'))

    def test_exige_exactamente_un_titular(self):
        self.assertEqual(self.vender().status_code, status.HTTP_400_BAD_REQUEST)
        resp = self.vender(cliente_id=self.cliente.id, representante_id=self.rep.id)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cliente_inactivo_no_admite_ventas(self):
        ClienteCantina.objects.filter(pk=self.cliente.pk).update(activo=False)
        self.assertEqual(self.vender(cliente_id=self.cliente.id).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(VentaCantina.objects.filter(cliente=self.cliente).exists())

    def test_limite_por_defecto_aplica_a_clientes(self):
        # Default de ParametroCantina = 20.00 → 4 ventas de $5 caben, la 5ª no.
        for _ in range(4):
            self.assertEqual(self.vender(cliente_id=self.cliente.id).status_code, status.HTTP_201_CREATED)
        resp = self.vender(cliente_id=self.cliente.id)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('límite', resp.data['error'])
        self.assertEqual(VentaCantina.objects.filter(cliente=self.cliente).count(), 4)

    def test_limite_personalizado(self):
        ClienteCantina.objects.filter(pk=self.cliente.pk).update(limite_usd=Decimal('5.00'))
        self.assertEqual(self.vender(cliente_id=self.cliente.id).status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.vender(cliente_id=self.cliente.id).status_code, status.HTTP_400_BAD_REQUEST)

    def test_bloqueado_no_admite_ventas(self):
        ClienteCantina.objects.filter(pk=self.cliente.pk).update(bloqueado=True)
        resp = self.vender(cliente_id=self.cliente.id)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('bloqueada', resp.data['error'])

    def test_anular_venta_anula_cargo_y_devuelve_stock(self):
        venta_id = self.vender(cliente_id=self.cliente.id).data['id']
        resp = self.client_admin.post(f'/api/cantina/ventas/{venta_id}/anular/', {'motivo': 'Error de captura en la venta'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(CargoCantina.objects.get(venta_id=venta_id).estado, 'anulado')
        self.assertEqual(services_cxc.saldo_titular(self.cliente), Decimal('0.00'))
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock_actual, 50)

    def test_anular_venta_a_cliente_es_solo_admin(self):
        venta_id = self.vender(cliente_id=self.cliente.id).data['id']
        resp = self.client_cajero.post(f'/api/cantina/ventas/{venta_id}/anular/', {'motivo': 'Error de captura en la venta'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_anular_venta_con_abono_aplicado_falla(self):
        venta_id = self.vender(cliente_id=self.cliente.id).data['id']
        self.assertEqual(self.abonar('2.00').status_code, status.HTTP_201_CREATED)
        resp = self.client_admin.post(f'/api/cantina/ventas/{venta_id}/anular/', {'motivo': 'Error de captura en la venta'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_no_regresion_venta_a_representante(self):
        resp = self.vender(representante_id=self.rep.id, alumno_id=self.alumno.id)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        cargo = CargoCantina.objects.get(venta_id=resp.data['id'])
        self.assertEqual(cargo.representante_id, self.rep.id)
        self.assertIsNone(cargo.cliente_id)

    def test_alumno_con_cliente_rechazado(self):
        resp = self.vender(cliente_id=self.cliente.id, alumno_id=self.alumno.id)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class AbonosClienteTests(ClientesBase):
    def test_abono_parcial_se_aplica_al_cargo_mas_antiguo(self):
        c1 = self.cargo_cliente('6.00')
        c2 = self.cargo_cliente('4.00')
        CargoCantina.objects.filter(pk=c1.pk).update(creado_en=c1.creado_en.replace(year=c1.creado_en.year - 1))
        resp = self.abonar('7.00')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['cliente_id'], self.cliente.id)
        self.assertIsNone(resp.data['representante_id'])
        self.assertEqual(Decimal(resp.data['saldo_usd']), Decimal('3.00'))
        c1.refresh_from_db()
        c2.refresh_from_db()
        self.assertEqual((c1.estado, c1.monto_pagado), ('pagado', Decimal('6.00')))
        self.assertEqual((c2.estado, c2.monto_pagado), ('pendiente', Decimal('1.00')))

    def test_abono_total_salda_la_cuenta(self):
        self.cargo_cliente('6.00')
        self.cargo_cliente('4.00')
        resp = self.abonar('10.00')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(Decimal(resp.data['saldo_usd']), Decimal('0.00'))
        self.assertFalse(CargoCantina.objects.filter(cliente=self.cliente, estado='pendiente').exists())

    def test_abono_mayor_a_la_deuda_rechazado(self):
        self.cargo_cliente('3.00')
        resp = self.abonar('5.00')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_abono_sin_deuda_rechazado(self):
        resp = self.abonar('1.00')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_abono_exige_exactamente_un_titular(self):
        self.cargo_cliente('3.00')
        body = {
            'cliente_id': self.cliente.id, 'representante_id': self.rep.id,
            'lineas': [{'metodo_pago': 'efectivo', 'monto_usd': '1.00'}],
        }
        self.assertEqual(self.client_cajero.post(BASE + 'abonos/', body, format='json').status_code, 400)
        body = {'lineas': [{'metodo_pago': 'efectivo', 'monto_usd': '1.00'}]}
        self.assertEqual(self.client_cajero.post(BASE + 'abonos/', body, format='json').status_code, 400)

    def test_abono_a_cliente_no_toca_deuda_de_representante(self):
        cargo_rep = self.crear_cargo('8.00')
        self.cargo_cliente('3.00')
        self.assertEqual(self.abonar('3.00').status_code, status.HTTP_201_CREATED)
        cargo_rep.refresh_from_db()
        self.assertEqual(cargo_rep.monto_pagado, Decimal('0.00'))
        self.assertEqual(services_cxc.saldo_titular(self.rep), Decimal('8.00'))

    def test_anular_abono_restituye_deuda(self):
        cargo = self.cargo_cliente('6.00')
        op = self.abonar('4.00').data['operacion_uuid']
        resp = self.client_admin.post(BASE + f'abonos/{op}/anular/', {'motivo': 'Error de captura'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(Decimal(resp.data['saldo_usd']), Decimal('6.00'))
        cargo.refresh_from_db()
        self.assertEqual(cargo.monto_pagado, Decimal('0.00'))
        self.assertEqual(AbonoCantina.objects.get(operacion_uuid=op).estatus, 'anulado')

    def test_recibo_pdf_de_cliente(self):
        self.cargo_cliente('6.00')
        op = self.abonar('4.00').data['operacion_uuid']
        resp = self.client_cajero.get(BASE + f'abonos/{op}/recibo/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp['Content-Type'], 'application/pdf')


class EstadoCuentaClienteTests(ClientesBase):
    def test_estado_de_cuenta_por_cliente(self):
        self.cargo_cliente('6.00')
        self.abonar('2.00')
        resp = self.client_cajero.get(BASE + f'clientes/{self.cliente.id}/estado-cuenta/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(Decimal(resp.data['saldo_usd']), Decimal('4.00'))
        self.assertEqual(resp.data['saldo_ves_tasa_vigente'], '160.00')
        self.assertEqual(resp.data['tipo'], 'personal')
        self.assertEqual(resp.data['limite_usd'], '20.00')
        self.assertEqual(len(resp.data['cargos']), 1)
        self.assertEqual(resp.data['cargos'][0]['saldo_usd'], '4.00')
        self.assertEqual(len(resp.data['abonos']), 1)

    def test_cuentas_unifica_y_filtra_por_tipo(self):
        self.crear_cargo('8.00')
        self.cargo_cliente('3.00')
        otro = ClienteCantina.objects.create(nombre='Zeta', tipo='otro')
        self.cargo_cliente('1.00', otro)

        resp = self.client_cajero.get(BASE + 'cuentas/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual([(r['tipo'], Decimal(r['saldo_usd'])) for r in resp.data['results']], [
            ('representante', Decimal('8')), ('personal', Decimal('3')), ('otro', Decimal('1')),
        ])
        for tipo, esperado in (('representante', 1), ('personal', 1), ('otro', 1)):
            r = self.client_cajero.get(BASE + 'cuentas/', {'tipo': tipo})
            self.assertEqual(len(r.data['results']), esperado, tipo)
        self.assertEqual(self.client_cajero.get(BASE + 'cuentas/', {'tipo': 'xx'}).status_code, 400)

    def test_excel_incluye_clientes(self):
        self.cargo_cliente('3.00')
        resp = self.client_admin.get(BASE + 'cuentas/excel/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)


class MorososClientesTests(ClientesBase):
    def test_clientes_entran_al_listado_sin_avisos(self):
        self.crear_cargo('8.00', creado_hace_dias=12)
        cargo = self.cargo_cliente('3.00')
        CargoCantina.objects.filter(pk=cargo.pk).update(
            creado_en=cargo.creado_en.replace(year=cargo.creado_en.year - 1),
        )
        resp = self.client_cajero.get('/api/cantina/reportes/morosos/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        filas = {(f['tipo'], f['id']): f for f in resp.data['cuentas_cxc']}
        self.assertFalse(filas[('personal', self.cliente.id)]['recibe_avisos'])
        self.assertTrue(filas[('representante', self.rep.id)]['recibe_avisos'])
        self.assertEqual(filas[('representante', self.rep.id)]['dias_deuda_mas_antigua'], 12)

        resp = self.client_cajero.get('/api/cantina/reportes/morosos/', {'dias_min': 100})
        self.assertEqual([f['tipo'] for f in resp.data['cuentas_cxc']], ['personal'])


class RestriccionesModeloTests(ClientesBase):
    def test_cargo_exige_exactamente_un_titular(self):
        from django.db import IntegrityError, transaction
        venta = VentaCantina.objects.create(
            cajero=self.cajero, metodo_pago='credito_representante', area='cantina',
            total_usd=Decimal('1'), tasa_aplicada=Decimal('40'), total_ves=Decimal('40'),
        )
        for kw in ({}, {'representante': self.rep, 'cliente': self.cliente}):
            with self.assertRaises(IntegrityError), transaction.atomic():
                CargoCantina.objects.create(venta=venta, area='cantina', monto_usd=Decimal('1'), **kw)

    def test_representante_sin_cuenta_espejo(self):
        self.assertEqual(ClienteCantina.objects.filter(tipo__in=['representante']).count(), 0)
        self.assertEqual(Representante.objects.count(), 1)
