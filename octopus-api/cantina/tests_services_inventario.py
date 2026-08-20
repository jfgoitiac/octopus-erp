from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from .models import CategoriaProducto, MovimientoInventario, ProductoCantina
from .services_inventario import aplicar_movimiento_inventario


class AplicarMovimientoInventarioTests(TestCase):
    def setUp(self):
        self.categoria = CategoriaProducto.objects.create(nombre='Snacks')
        self.producto = ProductoCantina.objects.create(
            nombre='Galletas',
            categoria=self.categoria,
            precio=Decimal('1.50'),
            stock_actual=10,
        )

    def test_entrada_simple(self):
        movimiento = aplicar_movimiento_inventario(self.producto, 'entrada', 5)

        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock_actual, 15)
        self.assertEqual(movimiento.tipo, 'entrada')
        self.assertEqual(movimiento.cantidad, 5)
        self.assertEqual(movimiento.stock_antes, 10)
        self.assertEqual(movimiento.stock_despues, 15)

    def test_salida_deja_stock_positivo(self):
        movimiento = aplicar_movimiento_inventario(self.producto, 'salida', 4)

        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock_actual, 6)
        self.assertEqual(movimiento.stock_antes, 10)
        self.assertEqual(movimiento.stock_despues, 6)

    def test_salida_que_dejaria_stock_negativo_no_persiste_nada(self):
        movimientos_antes = MovimientoInventario.objects.count()

        with self.assertRaises(ValidationError):
            aplicar_movimiento_inventario(self.producto, 'salida', 11)

        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock_actual, 10)
        self.assertEqual(MovimientoInventario.objects.count(), movimientos_antes)

    def test_salida_que_deja_stock_exactamente_en_cero(self):
        movimiento = aplicar_movimiento_inventario(self.producto, 'salida', 10)

        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock_actual, 0)
        self.assertEqual(movimiento.stock_despues, 0)

    def test_ajuste_positivo_suma_al_stock(self):
        movimiento = aplicar_movimiento_inventario(self.producto, 'ajuste', 3, motivo='conteo manual')

        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock_actual, 13)
        self.assertEqual(movimiento.stock_antes, 10)
        self.assertEqual(movimiento.stock_despues, 13)

    def test_ajuste_negativo_resta_sin_cruzar_a_negativo(self):
        movimiento = aplicar_movimiento_inventario(self.producto, 'ajuste', -3, motivo='merma')

        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock_actual, 7)
        self.assertEqual(movimiento.stock_antes, 10)
        self.assertEqual(movimiento.stock_despues, 7)
