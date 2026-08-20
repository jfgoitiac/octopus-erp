from datetime import date
from decimal import Decimal

from django.test import TestCase

from secretaria.models import Alumno, Representante

from .models import MovimientoTarjeta, TarjetaPrepago
from .services_tarjeta import SaldoInsuficienteError, aplicar_movimiento_tarjeta


class AplicarMovimientoTarjetaTests(TestCase):
    def setUp(self):
        representante = Representante.objects.create(
            cedula='V-1234567', nombre='Juan', apellido='Pérez',
            telefono='0414-1234567', correo='juan@example.com', direccion='Calle 1',
        )
        alumno = Alumno.objects.create(
            nombre='Pedro', apellido='Pérez', representante=representante,
        )
        self.tarjeta = TarjetaPrepago.objects.create(
            alumno=alumno, serial='L001-0001', codigo='CANT-0000000001',
            saldo=Decimal('0.00'), limite_credito=Decimal('5.00'),
        )

    def test_recarga_simple(self):
        mov = aplicar_movimiento_tarjeta(self.tarjeta, 'recarga', Decimal('10.00'))

        self.assertEqual(mov.tipo, 'recarga')
        self.assertEqual(mov.saldo_antes, Decimal('0.00'))
        self.assertEqual(mov.saldo_despues, Decimal('10.00'))
        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, Decimal('10.00'))

    def test_consumo_deja_saldo_positivo(self):
        aplicar_movimiento_tarjeta(self.tarjeta, 'recarga', Decimal('10.00'))
        mov = aplicar_movimiento_tarjeta(self.tarjeta, 'consumo', Decimal('3.00'))

        self.assertEqual(mov.saldo_antes, Decimal('10.00'))
        self.assertEqual(mov.saldo_despues, Decimal('7.00'))
        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, Decimal('7.00'))
        self.assertIsNone(self.tarjeta.saldo_negativo_desde)

    def test_consumo_cruza_a_negativo_dentro_del_limite(self):
        mov = aplicar_movimiento_tarjeta(self.tarjeta, 'consumo', Decimal('3.00'))

        self.assertEqual(mov.saldo_despues, Decimal('-3.00'))
        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, Decimal('-3.00'))
        self.assertEqual(self.tarjeta.saldo_negativo_desde, date.today())

    def test_recarga_posterior_limpia_saldo_negativo_desde(self):
        aplicar_movimiento_tarjeta(self.tarjeta, 'consumo', Decimal('3.00'))
        self.tarjeta.refresh_from_db()
        self.assertIsNotNone(self.tarjeta.saldo_negativo_desde)

        aplicar_movimiento_tarjeta(self.tarjeta, 'recarga', Decimal('3.00'))
        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, Decimal('0.00'))
        self.assertIsNone(self.tarjeta.saldo_negativo_desde)

    def test_consumo_excede_limite_credito_no_persiste_nada(self):
        movimientos_antes = MovimientoTarjeta.objects.count()

        with self.assertRaises(SaldoInsuficienteError):
            aplicar_movimiento_tarjeta(self.tarjeta, 'consumo', Decimal('5.01'))

        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, Decimal('0.00'))
        self.assertIsNone(self.tarjeta.saldo_negativo_desde)
        self.assertEqual(MovimientoTarjeta.objects.count(), movimientos_antes)

    def test_ajuste_manual_negativo_resta_del_saldo(self):
        aplicar_movimiento_tarjeta(self.tarjeta, 'recarga', Decimal('10.00'))
        mov = aplicar_movimiento_tarjeta(self.tarjeta, 'ajuste', Decimal('-4.00'))

        self.assertEqual(mov.saldo_antes, Decimal('10.00'))
        self.assertEqual(mov.saldo_despues, Decimal('6.00'))
        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, Decimal('6.00'))
