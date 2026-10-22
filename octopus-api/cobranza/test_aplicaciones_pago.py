from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from secretaria.models import Alumno, Representante

from .correcciones import anular_pago
from .models import AplicacionPago, Mensualidad, Pago


class AplicacionesPagoAnulacionTest(TestCase):
    def setUp(self):
        self.usuario = get_user_model().objects.create_user('cajero-aplicacion', password='x')
        rep = Representante.objects.create(cedula='V-AP-1', nombre='Rosa', apellido='Pérez')
        self.alumno = Alumno.objects.create(
            representante=rep, cedula_escolar='E-AP-1', nombre='Luis', apellido='Pérez',
            fecha_nacimiento=date(2015, 1, 1),
        )

    def pago(self, monto):
        return Pago.objects.create(
            alumno=self.alumno, usuario_receptor=self.usuario, metodo_pago='efectivo',
            concepto='mensualidad', monto_usd=Decimal(monto), tasa_aplicada=Decimal('40'),
        )

    def test_anular_un_abono_no_borra_abono_posterior(self):
        mensualidad = Mensualidad.objects.create(
            alumno=self.alumno, mes=7, anio=2026, monto_usd=Decimal('30.00'),
            monto_pagado=Decimal('20.00'),
        )
        primero, segundo = self.pago('10.00'), self.pago('10.00')
        ct = ContentType.objects.get_for_model(mensualidad)
        AplicacionPago.objects.create(
            pago=primero, content_type=ct, object_id=mensualidad.id,
            monto_nominal_usd=Decimal('30.00'), monto_abonado_usd=Decimal('10.00'),
            saldo_resultante_usd=Decimal('20.00'),
        )
        AplicacionPago.objects.create(
            pago=segundo, content_type=ct, object_id=mensualidad.id,
            monto_nominal_usd=Decimal('30.00'), monto_abonado_usd=Decimal('10.00'),
            saldo_resultante_usd=Decimal('10.00'),
        )

        anular_pago(primero, self.usuario, 'Reverso del primer abono parcial')

        mensualidad.refresh_from_db()
        primero.refresh_from_db()
        aplicacion = AplicacionPago.objects.get(pago=primero)
        self.assertEqual(mensualidad.monto_pagado, Decimal('10.00'))
        self.assertFalse(mensualidad.pagado)
        self.assertEqual(primero.estatus, 'anulado')
        self.assertIsNotNone(aplicacion.anulada_en)
