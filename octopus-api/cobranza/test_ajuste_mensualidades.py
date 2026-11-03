"""
Tests del ajuste manual de montos (ActualizarMensualidadesView).

Un monto en 0 hace que Mensualidad.save() marque la fila como pagada sin que
exista ningún pago: la deuda desaparece y la fila deja de listarse en el mismo
modal, así que no se puede revertir desde la interfaz.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from secretaria.models import Alumno, Representante
from .models import Mensualidad


class ActualizarMensualidadesViewTests(TestCase):
    def setUp(self):
        representante = Representante.objects.create(
            cedula='V44444444', nombre='Maria', apellido='Perez',
            telefono='0412', correo='maria4@test.com', direccion='Calle 1',
        )
        self.alumno = Alumno.objects.create(
            cedula_escolar='E4000001', nombre='Ana', apellido='Test',
            fecha_nacimiento=date(2015, 1, 1), representante=representante,
        )
        self.primera = Mensualidad.objects.create(alumno=self.alumno, mes=10, anio=2026, monto_usd=Decimal('50.00'))
        self.segunda = Mensualidad.objects.create(alumno=self.alumno, mes=11, anio=2026, monto_usd=Decimal('50.00'))
        user = get_user_model().objects.create_superuser(
            username='ajuste_montos', password='clave123456', email='am@test.com'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=user)
        self.url = reverse('actualizar-mensualidades')

    def _patch(self, *items):
        return self.client.patch(self.url, {'mensualidades': list(items)}, format='json')

    def _assert_sin_cambios(self):
        for m in (self.primera, self.segunda):
            m.refresh_from_db()
            self.assertEqual(m.monto_usd, Decimal('50.00'))
            self.assertFalse(m.pagado)
            self.assertFalse(m.monto_personalizado)

    def test_rechaza_montos_no_positivos_o_invalidos(self):
        for monto in (0, '0.00', -5, '', 'abc', 'NaN', 'Infinity'):
            with self.subTest(monto=monto):
                response = self._patch({'id': self.primera.id, 'monto_usd': monto})
                self.assertEqual(response.status_code, 400)
                self._assert_sin_cambios()

    def test_un_monto_invalido_no_deja_el_lote_a_medias(self):
        response = self._patch(
            {'id': self.primera.id, 'monto_usd': '60.00'},
            {'id': self.segunda.id, 'monto_usd': 0},
        )
        self.assertEqual(response.status_code, 400)
        self._assert_sin_cambios()

    def test_monto_positivo_sigue_funcionando(self):
        response = self._patch({'id': self.primera.id, 'monto_usd': '60.00'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['actualizadas'], 1)
        self.primera.refresh_from_db()
        self.assertEqual(self.primera.monto_usd, Decimal('60.00'))
        self.assertFalse(self.primera.pagado)
        self.assertTrue(self.primera.monto_personalizado)

    def test_listado_suma_saldos_y_no_montos_nominales(self):
        self.primera.monto_pagado = Decimal('20.00')
        self.primera.save()

        response = self.client.get(reverse('mensualidades-alumno', args=[self.alumno.id]))

        self.assertEqual(response.status_code, 200)
        primera = next(m for m in response.data['mensualidades_pendientes'] if m['id'] == self.primera.id)
        self.assertEqual(Decimal(primera['monto_usd']), Decimal('50.00'))
        self.assertEqual(Decimal(primera['monto_pagado']), Decimal('20.00'))
        self.assertEqual(Decimal(primera['saldo']), Decimal('30.00'))
        self.assertEqual(Decimal(response.data['monto_total_deuda']), Decimal('80.00'))
