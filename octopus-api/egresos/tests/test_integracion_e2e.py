"""Flujos de integración de Egresos contra las rutas y servicios públicos."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from cobranza.models import TasaCambio
from egresos.models import Egreso
from egresos.services import crear_desde_cuenta_pagada
from finanzas.models import CategoriaGasto, Proveedor


class FlujosEgresosE2ETests(TestCase):
    def setUp(self):
        self.usuario = get_user_model().objects.create_user(username='directora-egresos', password='clave')
        self.usuario.perfil.rol = 'director'
        self.usuario.perfil.esta_activo = True
        self.usuario.perfil.save()
        self.api = APIClient()
        self.api.force_authenticate(self.usuario)
        self.categoria = CategoriaGasto.objects.create(nombre='Limpieza')
        self.proveedor = Proveedor.objects.create(razon_social='Proveedor E2E', rif='J-12345678-9')
        TasaCambio.objects.create(valor_bs=Decimal('100.0000'))

    def _factura_contado(self):
        hoy = timezone.localdate().isoformat()
        return {
            'proveedor': self.proveedor.id, 'categoria': self.categoria.id,
            'tipo_documento': 'factura', 'numero_documento': 'E2E-CONT-1',
            'fecha_emision': hoy, 'fecha_egreso': hoy, 'moneda': 'VES',
            'tasa_aplicada': '100.0000', 'subtotal': '5000.00',
            'porcentaje_iva': '16.0000', 'total_documento': '5800.00',
            'condicion': 'contado', 'metodo_pago': 'transferencia',
            'renglones': [{'descripcion': 'Jabón', 'cantidad': '10.00', 'precio_unitario': '500.00', 'descuento': '0.00'}],
        }

    def test_contado_bs_comprobante_relacion_y_anulacion(self):
        creado = self.api.post('/api/egresos/', self._factura_contado(), format='json')
        self.assertEqual(creado.status_code, 201, creado.data)
        egreso_id = creado.data['id']
        confirmado = self.api.post('/api/egresos/%s/guardar/' % egreso_id, self._factura_contado(), format='json')
        self.assertEqual(confirmado.status_code, 200, confirmado.data)
        self.assertEqual(confirmado.data['estado'], 'registrado')
        self.assertEqual(confirmado.data['monto_ves'], '5800.00')
        self.assertEqual(confirmado.data['monto_usd'], '58.00')

        comprobante = SimpleUploadedFile('factura.pdf', b'%PDF-1.4 comprobante', content_type='application/pdf')
        respuesta_comprobante = self.api.post('/api/egresos/%s/comprobantes/' % egreso_id, {'archivo': comprobante, 'tipo': 'documento'}, format='multipart')
        self.assertEqual(respuesta_comprobante.status_code, 201, respuesta_comprobante.data)
        relacion = self.api.get('/api/egresos/', {'origen': 'factura'})
        self.assertEqual(relacion.status_code, 200)
        filas = relacion.data['results'] if isinstance(relacion.data, dict) else relacion.data
        self.assertEqual(filas[0]['fecha_egreso'], timezone.localdate().isoformat())

        anulacion = self.api.post('/api/egresos/%s/anular/' % egreso_id, {'motivo': 'Corrección E2E'}, format='json')
        self.assertEqual(anulacion.status_code, 200, anulacion.data)
        self.assertEqual(anulacion.data['estado'], 'anulado')
        self.assertEqual(Egreso.objects.get(pk=egreso_id).bitacora.filter(accion='anulado').count(), 1)

    def test_cxp_saldada_genera_un_solo_egreso_con_abonos_y_comprobantes(self):
        hoy = timezone.localdate()
        cuenta = {
            'proveedor': self.proveedor, 'categoria': self.categoria, 'sede': None,
            'tipo_documento': 'factura', 'numero_documento': 'E2E-CXP-1',
            'fecha_emision': hoy, 'moneda': 'VES', 'tasa_aplicada': Decimal('100.0000'),
            'total_documento': Decimal('5000.00'),
        }
        abonos = [
            {'fecha_pago': hoy - timedelta(days=1), 'moneda': 'VES', 'tasa_aplicada': '100.0000', 'metodo_pago': 'transferencia', 'banco': 'Banco Uno', 'referencia': 'AB-1', 'monto_documento': '2500.00', 'monto_usd': '25.00', 'monto_ves': '2500.00', 'comprobantes': [{'ruta': 'abono-1.pdf', 'nombre': 'abono-1.pdf'}]},
            {'fecha_pago': hoy, 'moneda': 'USD', 'tasa_aplicada': '100.0000', 'metodo_pago': 'zelle', 'banco': '', 'referencia': 'AB-2', 'monto_documento': '25.00', 'monto_usd': '25.00', 'monto_ves': '2500.00', 'comprobantes': [{'ruta': 'abono-2.pdf', 'nombre': 'abono-2.pdf'}]},
        ]
        resultado = crear_desde_cuenta_pagada(7001, cuenta, abonos)
        self.assertTrue(resultado['creado'])
        self.assertEqual(resultado['abonos'], 2)
        self.assertEqual(resultado['monto_usd_pagado'], '50.00')
        self.assertEqual(resultado['monto_ves_pagado'], '5000.00')

        detalle = self.api.get('/api/egresos/%s/' % resultado['egreso_id'])
        self.assertEqual(detalle.status_code, 200, detalle.data)
        self.assertEqual(detalle.data['origen'], 'cuenta_por_pagar')
        self.assertEqual(detalle.data['fecha_egreso'], hoy.isoformat())
        self.assertEqual(detalle.data['monto_usd'], '50.00')
        self.assertEqual(detalle.data['monto_ves'], '5000.00')
        self.assertEqual(len(detalle.data['pagos_cuenta_por_pagar']), 2)
        self.assertEqual(detalle.data['pagos_cuenta_por_pagar'][0]['comprobantes'][0]['nombre'], 'abono-1.pdf')
        self.assertEqual(detalle.data['pagos_cuenta_por_pagar'][1]['comprobantes'][0]['nombre'], 'abono-2.pdf')
        self.assertEqual(Egreso.objects.filter(origen='cuenta_por_pagar', cuenta_por_pagar_id=7001).count(), 1)

    def test_egresos_rechaza_credito_y_roles_fuera_de_alcance(self):
        credito = self._factura_contado()
        credito['condicion'] = 'credito'
        self.assertEqual(self.api.post('/api/egresos/', credito, format='json').status_code, 400)
        self.usuario.perfil.rol = 'cajero'
        self.usuario.perfil.save()
        self.assertEqual(self.api.get('/api/egresos/').status_code, 403)
