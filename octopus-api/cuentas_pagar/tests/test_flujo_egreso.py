"""Vínculo CxP <-> Egresos, anulaciones, API de bandeja y schedule de Celery."""
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from cobranza.models import TasaCambio
from cuentas_pagar import services
from cuentas_pagar.models import AvisoBandeja, CuentaPorPagar
from egresos.models import Egreso
from finanzas.models import CategoriaGasto, Proveedor


class BaseCxP(TestCase):
    def setUp(self):
        self.usuario = get_user_model().objects.create_user(username='admin-cxp', password='clave')
        self.usuario.perfil.rol = 'administrador'
        self.usuario.perfil.esta_activo = True
        self.usuario.perfil.save()
        self.api = APIClient()
        self.api.force_authenticate(self.usuario)
        TasaCambio.objects.create(valor_bs=Decimal('100.0000'))
        self.categoria = CategoriaGasto.objects.create(nombre='Servicios CxP')
        self.proveedor = Proveedor.objects.create(razon_social='Proveedor CxP', rif='J-98765432-1')

    def cuenta(self, monto='100.00', origen='manual'):
        return services.crear({
            'proveedor': self.proveedor, 'categoria': self.categoria, 'concepto': 'Servicio', 'origen': origen,
            'moneda': 'USD', 'tasa_aplicada': '100', 'monto_documento': monto,
            'fecha_emision': timezone.localdate(), 'fecha_vencimiento': timezone.localdate()}, self.usuario)

    def pagar(self, cuenta, monto):
        return services.registrar_pago(cuenta.id, {
            'monto_aplicado': monto, 'monto_pagado': monto, 'moneda': 'USD', 'tasa_aplicada': '100',
            'metodo_pago': 'transferencia', 'referencia': 'REF'}, self.usuario)


class PagoEgresoTests(BaseCxP):
    def test_pago_total_crea_un_egreso_vinculado(self):
        cuenta = self.cuenta()
        _, cuenta, resultado = self.pagar(cuenta, '100.00')
        self.assertEqual(cuenta.estado, 'pagada')
        egreso = Egreso.objects.get(cuenta_por_pagar_id=cuenta.id, origen='cuenta_por_pagar')
        self.assertEqual(cuenta.egreso_id, egreso.id)
        self.assertEqual(resultado['egreso_id'], egreso.id)
        self.assertEqual(egreso.estado, 'registrado')

    def test_pago_parcial_no_crea_egreso(self):
        cuenta = self.cuenta()
        _, cuenta, _ = self.pagar(cuenta, '40.00')
        self.assertEqual(cuenta.estado, 'parcial')
        self.assertFalse(Egreso.objects.filter(cuenta_por_pagar_id=cuenta.id).exists())

    def test_anular_pago_revierte_egreso_y_repago_crea_uno_nuevo(self):
        cuenta = self.cuenta()
        pago, cuenta, _ = self.pagar(cuenta, '100.00')
        primero = cuenta.egreso_id
        cuenta = services.anular_pago(pago.id, 'Error de captura', self.usuario)
        self.assertEqual(cuenta.estado, 'pendiente')
        self.assertIsNone(cuenta.egreso_id)
        self.assertEqual(Egreso.objects.get(pk=primero).estado, 'anulado')
        _, cuenta, resultado = self.pagar(cuenta, '100.00')
        self.assertNotEqual(resultado['egreso_id'], primero)
        self.assertEqual(Egreso.objects.get(pk=primero).estado, 'anulado')
        self.assertEqual(Egreso.objects.exclude(estado='anulado').filter(cuenta_por_pagar_id=cuenta.id).count(), 1)

    def test_origen_factura_no_crea_egreso_cxp(self):
        cuenta = self.cuenta(origen='factura')
        pago, cuenta, _ = self.pagar(cuenta, '100.00')
        self.assertEqual(cuenta.estado, 'pagada')
        self.assertFalse(Egreso.objects.filter(origen='cuenta_por_pagar').exists())
        cuenta = services.anular_pago(pago.id, 'Reversa', self.usuario)
        self.assertEqual(cuenta.estado, 'pendiente')


class AnulacionTests(BaseCxP):
    def test_anular_cuenta_pagada_anula_pagos_y_egreso(self):
        cuenta = self.cuenta()
        pago, cuenta, _ = self.pagar(cuenta, '100.00')
        egreso_id = cuenta.egreso_id
        cuenta = services.anular(cuenta.id, 'Duplicada', self.usuario)
        pago.refresh_from_db()
        self.assertEqual(cuenta.estado, 'anulada')
        self.assertEqual(pago.estado, 'anulado')
        self.assertEqual(Egreso.objects.get(pk=egreso_id).estado, 'anulado')

    def test_cuenta_anulada_rechaza_anular_pago_y_no_se_recalcula(self):
        cuenta = self.cuenta()
        pago, cuenta, _ = self.pagar(cuenta, '40.00')
        services.anular(cuenta.id, 'Cierre', self.usuario)
        with self.assertRaises(ValueError):
            services.anular_pago(pago.id, 'Tarde', self.usuario)
        cuenta = CuentaPorPagar.objects.get(pk=cuenta.id)
        services.recalcular_saldo(cuenta)
        cuenta.refresh_from_db()
        self.assertEqual(cuenta.estado, 'anulada')

    def test_api_devuelve_400_y_404_con_detalle(self):
        cuenta = self.cuenta()
        pago, cuenta, _ = self.pagar(cuenta, '40.00')
        services.anular(cuenta.id, 'Cierre', self.usuario)
        r = self.api.post('/api/cuentas-por-pagar/pagos/%s/anular/' % pago.id, {'motivo': 'x'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('detalle', r.data)
        self.assertEqual(self.api.post('/api/cuentas-por-pagar/999999/anular/', {'motivo': 'x'}, format='json').status_code, 404)


class TableroYBandejaTests(BaseCxP):
    def test_tablero_incluye_claves_del_frontend(self):
        self.cuenta()
        r = self.api.get('/api/cuentas-por-pagar/tablero/')
        self.assertEqual(r.status_code, 200)
        for clave in ('vencidas', 'vence_hoy', 'proximos_7_dias', 'total_adeudado', 'pagado_mes', 'aplazadas_mes', 'semana', 'por_situacion'):
            self.assertIn(clave, r.data)
        self.assertEqual(r.data['vence_hoy']['cantidad'], 1)
        self.assertEqual(len(r.data['semana']), 1)

    def test_tablero_reporta_monto_de_aplazadas_del_mes(self):
        cuenta = self.cuenta(monto='100.00')
        services.aplazar(cuenta.id, timezone.localdate() + timezone.timedelta(days=10), 'Sin fondos', self.usuario)
        r = self.api.get('/api/cuentas-por-pagar/tablero/')
        self.assertEqual(r.data['aplazadas_mes']['cantidad'], 1)
        self.assertEqual(r.data['aplazadas_mes']['monto_usd'], '100.00')
        self.assertEqual(r.data['aplazadas_mes']['monto_ves'], '10000.00')

    def test_bandeja_lista_filtra_y_marca_leido(self):
        cuenta = self.cuenta()
        a = AvisoBandeja.objects.create(cuenta=cuenta, usuario=self.usuario, titulo='A', mensaje='m')
        AvisoBandeja.objects.create(usuario=self.usuario, titulo='B', mensaje='m', leido=True)
        r = self.api.get('/api/cuentas-por-pagar/bandeja/', {'leido': 'false'})
        filas = r.data['results'] if isinstance(r.data, dict) else r.data
        self.assertEqual([x['id'] for x in filas], [a.id])
        p = self.api.patch('/api/cuentas-por-pagar/bandeja/%s/' % a.id, {'leido': True}, format='json')
        self.assertEqual(p.status_code, 200, p.data)
        a.refresh_from_db()
        self.assertTrue(a.leido)


class CelerySchedulerTests(TestCase):
    def test_cada_tarea_del_schedule_esta_registrada(self):
        from config.celery import app
        app.loader.import_default_modules()
        for nombre, entrada in settings.CELERY_BEAT_SCHEDULE.items():
            self.assertIn(entrada['task'], app.tasks, 'Beat "%s" apunta a una tarea inexistente' % nombre)
