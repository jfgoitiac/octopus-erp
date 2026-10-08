"""Aprobación/rechazo de pagos por aprobar, inmutabilidad del monto y validación de comprobantes."""
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile

from cuentas_pagar import services
from cuentas_pagar.models import ConfiguracionRecordatorios, HistorialCxP, PagoCuentaPagar
from egresos.models import Egreso

from .test_flujo_egreso import BaseCxP


class AprobacionPagosTests(BaseCxP):
    def setUp(self):
        super().setUp()
        ConfiguracionRecordatorios.objects.create(requiere_aprobacion_pago_grande=True, umbral_aprobacion_usd=Decimal('50.00'))

    def test_pago_grande_queda_por_aprobar_y_no_toca_saldo(self):
        cuenta = self.cuenta()
        pago, cuenta, _ = self.pagar(cuenta, '60.00')
        self.assertEqual(pago.estado, 'por_aprobar')
        self.assertEqual(cuenta.saldo, Decimal('100.00'))

    def test_aprobar_salda_cuenta_y_crea_egreso(self):
        cuenta = self.cuenta()
        pago, _, _ = self.pagar(cuenta, '100.00')
        r = self.api.post(f'/api/cuentas-por-pagar/pagos/{pago.id}/aprobar/')
        self.assertEqual(r.status_code, 200, r.data)
        cuenta.refresh_from_db()
        self.assertEqual(cuenta.estado, 'pagada')
        self.assertTrue(Egreso.objects.filter(cuenta_por_pagar_id=cuenta.id).exists())
        self.assertTrue(HistorialCxP.objects.filter(cuenta=cuenta, accion='pago_aprobado').exists())
        self.assertEqual(self.api.post(f'/api/cuentas-por-pagar/pagos/{pago.id}/aprobar/').status_code, 400)

    def test_rechazar_libera_saldo_reservado(self):
        cuenta = self.cuenta()
        pago, _, _ = self.pagar(cuenta, '100.00')
        self.assertEqual(self.api.post(f'/api/cuentas-por-pagar/pagos/{pago.id}/rechazar/', {}).status_code, 400)
        r = self.api.post(f'/api/cuentas-por-pagar/pagos/{pago.id}/rechazar/', {'motivo': 'Duplicado'})
        self.assertEqual(r.status_code, 200, r.data)
        pago.refresh_from_db()
        self.assertEqual(pago.estado, 'anulado')
        self.pagar(cuenta, '100.00')  # ya no hay reserva
        self.assertTrue(HistorialCxP.objects.filter(cuenta=cuenta, accion='pago_rechazado').exists())

    def test_por_aprobar_reserva_saldo(self):
        cuenta = self.cuenta()
        self.pagar(cuenta, '60.00')
        with self.assertRaises(ValueError):
            self.pagar(cuenta, '60.00')
        self.assertEqual(PagoCuentaPagar.objects.filter(cuenta=cuenta).count(), 1)

    def test_aprobar_revalida_contra_saldo_vigente(self):
        cuenta = self.cuenta()
        pago, _, _ = self.pagar(cuenta, '60.00')
        PagoCuentaPagar.objects.filter(pk=pago.pk).update(monto_aplicado=Decimal('150.00'))
        with self.assertRaises(ValueError):
            services.aprobar_pago(pago.id, self.usuario)

    def test_aprobar_inexistente_404(self):
        self.assertEqual(self.api.post('/api/cuentas-por-pagar/pagos/9999/aprobar/').status_code, 404)


class MontoYComprobanteTests(BaseCxP):
    def test_patch_monto_documento_rechazado(self):
        cuenta = self.cuenta()
        r = self.api.patch(f'/api/cuentas-por-pagar/{cuenta.id}/', {'monto_documento': '999.00'}, format='json')
        self.assertEqual(r.status_code, 400)
        cuenta.refresh_from_db()
        self.assertEqual(cuenta.monto_documento, Decimal('100.00'))
        self.assertEqual(self.api.patch(f'/api/cuentas-por-pagar/{cuenta.id}/', {'concepto': 'Otro'}, format='json').status_code, 200)

    def test_actualizar_desde_egreso_ignora_campos_no_permitidos(self):
        cuenta = self.cuenta()
        services.actualizar_desde_egreso({'id': cuenta.id, 'concepto': 'Nuevo', 'saldo': Decimal('1'), 'monto_documento': Decimal('5')})
        cuenta.refresh_from_db()
        self.assertEqual((cuenta.concepto, cuenta.saldo, cuenta.monto_documento), ('Nuevo', Decimal('100.00'), Decimal('100.00')))

    def test_comprobante_con_firma_falsa_rechazado(self):
        cuenta = self.cuenta()
        pago, _, _ = self.pagar(cuenta, '10.00')
        falso = SimpleUploadedFile('virus.pdf', b'MZ\x90\x00 no es pdf', content_type='application/pdf')
        r = self.api.post(f'/api/cuentas-por-pagar/pagos/{pago.id}/adjuntos/', {'archivo': falso}, format='multipart')
        self.assertEqual(r.status_code, 400)
        bueno = SimpleUploadedFile('ok.pdf', b'%PDF-1.4 contenido', content_type='application/pdf')
        r = self.api.post(f'/api/cuentas-por-pagar/pagos/{pago.id}/adjuntos/', {'archivo': bueno}, format='multipart')
        self.assertEqual(r.status_code, 201, r.data)
