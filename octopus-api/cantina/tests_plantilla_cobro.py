"""Tests de la plantilla de cobro (PDF) de cuentas por cobrar de Cantina."""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from . import plantilla_cobro, services_cxc
from .models import (
    CargoCantina, CategoriaProducto, ClienteCantina, DetalleVentaCantina, ParametroCantina, ProductoCantina, TasaCantina, VentaCantina,
)
from .serializers_cxc import tasa_vigente_valor
from .tests_cxc import BASE, CxcBase, _usuario

URL = BASE + 'plantilla-cobro/'


class PlantillaCobroBase(CxcBase):
    def setUp(self):
        super().setUp()
        cat = CategoriaProducto.objects.create(nombre='Snacks PC')
        self.producto = ProductoCantina.objects.create(
            nombre='Jugo PC', categoria=cat, codigo_barras='7599999999777',
            precio=Decimal('1.33'), stock_actual=50, stock_minimo=1, area='cantina',
        )

    def cargo_con_detalle(self, cantidad, area='cantina', cliente=None, dias=0):
        total = Decimal('1.33') * cantidad
        venta = VentaCantina.objects.create(
            cajero=self.cajero, metodo_pago='credito_representante', area=area,
            representante=None if cliente else self.rep, cliente=cliente,
            total_usd=total, tasa_aplicada=Decimal('40'), total_ves=total * 40,
        )
        DetalleVentaCantina.objects.create(
            venta=venta, producto=self.producto, cantidad=cantidad,
            precio_unitario=Decimal('1.33'), subtotal=total,
        )
        cargo = services_cxc.crear_cargo_por_venta(venta)
        if dias:
            CargoCantina.objects.filter(pk=cargo.pk).update(creado_en=timezone.now() - timedelta(days=dias))
            cargo.refresh_from_db()
        return cargo


class DatosPlantillaTests(PlantillaCobroBase):
    def test_suma_de_lineas_igual_al_total(self):
        # Tasa con decimales que fuerza residuos de redondeo entre líneas.
        tasa = Decimal('36.3333')
        for n in (1, 3, 7):
            self.cargo_con_detalle(n)
        d = plantilla_cobro.datos_plantilla(self.rep, tasa)
        self.assertEqual(sum(l['saldo_bs'] for l in d['lineas']), d['total_bs'])
        self.assertEqual(d['total_bs'], (d['total_usd'] * tasa).quantize(Decimal('0.01')))
        self.assertEqual(d['total_cargos_bs'] - d['total_abonos_bs'], d['total_bs'])
        for linea in d['lineas']:
            self.assertEqual(linea['monto_bs'] - linea['abonado_bs'], linea['saldo_bs'])

    def test_abonos_reducen_el_saldo_y_cargo_pagado_se_excluye(self):
        pagado = self.cargo_con_detalle(1)
        CargoCantina.objects.filter(pk=pagado.pk).update(monto_pagado=pagado.monto_usd, estado='pagado')
        parcial = self.cargo_con_detalle(10)
        CargoCantina.objects.filter(pk=parcial.pk).update(monto_pagado=Decimal('5.00'))
        d = plantilla_cobro.datos_plantilla(self.rep, Decimal('40'))
        self.assertEqual(len(d['lineas']), 1)
        self.assertEqual(d['lineas'][0]['abonado_bs'], Decimal('200.00'))
        self.assertEqual(d['total_usd'], Decimal('8.30'))
        self.assertEqual(d['total_bs'], Decimal('332.00'))

    def test_sin_cargos_pendientes_lanza_error(self):
        with self.assertRaises(plantilla_cobro.PlantillaCobroError):
            plantilla_cobro.datos_plantilla(self.rep, Decimal('40'))

    def test_filtro_area_y_fechas(self):
        self.cargo_con_detalle(1, area='cantina', dias=10)
        self.cargo_con_detalle(2, area='libreria', dias=1)
        d = plantilla_cobro.datos_plantilla(self.rep, Decimal('40'), area='libreria')
        self.assertEqual([x['area'] for x in d['lineas']], ['libreria'])
        hoy = timezone.localdate()
        d = plantilla_cobro.datos_plantilla(self.rep, Decimal('40'), fecha_inicio=hoy - timedelta(days=3))
        self.assertEqual([x['area'] for x in d['lineas']], ['libreria'])
        d = plantilla_cobro.datos_plantilla(self.rep, Decimal('40'), fecha_fin=hoy - timedelta(days=3))
        self.assertEqual([x['area'] for x in d['lineas']], ['cantina'])

    def test_desglose_de_productos(self):
        self.cargo_con_detalle(3)
        d = plantilla_cobro.datos_plantilla(self.rep, Decimal('40'))
        prod = d['lineas'][0]['productos'][0]
        self.assertEqual((prod['cantidad'], prod['producto'], prod['precio_bs']), (3, 'Jugo PC', Decimal('53.20')))


class PlantillaCobroViewTests(PlantillaCobroBase):
    def test_pdf_representante(self):
        self.cargo_con_detalle(2)
        resp = self.client_cajero.get(URL, {'representante': self.rep.id})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp['Content-Type'], 'application/pdf')
        self.assertTrue(b''.join(resp.streaming_content).startswith(b'%PDF'))
        self.assertIn('Plantilla_Cobro_', resp['Content-Disposition'])

    def test_pdf_cliente_multipagina(self):
        cliente = ClienteCantina.objects.create(nombre='Pedro', apellido='Docente', documento='V-111', tipo='personal')
        ParametroCantina.objects.update(limite_credito_representante_default=Decimal('9999'))
        for _ in range(60):
            self.cargo_con_detalle(1, cliente=cliente)
        resp = self.client_admin.get(URL, {'cliente': cliente.id, 'area': 'cantina'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        contenido = b''.join(resp.streaming_content)
        self.assertGreater(contenido.count(b'/Type /Page\n'), 1)

    def test_usa_tasa_cantina_vigente(self):
        TasaCantina.objects.create(valor_bs=Decimal('50.0000'))
        self.cargo_con_detalle(1)
        self.assertEqual(tasa_vigente_valor(), Decimal('50.0000'))
        resp = self.client_cajero.get(URL, {'representante': self.rep.id})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_parametros_invalidos(self):
        self.cargo_con_detalle(1)
        c = self.client_cajero
        self.assertEqual(c.get(URL).status_code, 400)
        self.assertEqual(c.get(URL, {'representante': self.rep.id, 'cliente': 1}).status_code, 400)
        self.assertEqual(c.get(URL, {'representante': self.rep.id, 'area': 'x'}).status_code, 400)
        self.assertEqual(c.get(URL, {'representante': self.rep.id, 'fecha_inicio': 'ayer'}).status_code, 400)
        self.assertEqual(c.get(URL, {'representante': self.rep.id, 'fecha_inicio': '2026-02-02', 'fecha_fin': '2026-01-01'}).status_code, 400)
        self.assertEqual(c.get(URL, {'representante': 99999}).status_code, 404)

    def test_sin_cargos_devuelve_400(self):
        resp = self.client_cajero.get(URL, {'representante': self.rep.id})
        self.assertEqual(resp.status_code, 400)

    def test_requiere_autenticacion_y_rol(self):
        self.assertEqual(APIClient().get(URL, {'representante': self.rep.id}).status_code, 401)
        otro = APIClient()
        otro.force_authenticate(_usuario('profe_pc', 'docente'))
        self.assertEqual(otro.get(URL, {'representante': self.rep.id}).status_code, 403)
