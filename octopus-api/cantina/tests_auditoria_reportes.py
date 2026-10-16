"""
Tests del carril B3 de la Auditoría de Cantina: reportes de ventas,
excepciones, inventario y rentabilidad (§4) — formas exactas de
CONTRATO_AUDITORIA_CANTINA.md.
"""
from datetime import timedelta
from decimal import Decimal

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from .models import (
    AperturaCajaCantina,
    CategoriaProducto,
    DetalleVentaCantina,
    MovimientoInventario,
    ProductoCantina,
    VentaCantina,
)
from .services_inventario import aplicar_movimiento_inventario
from .tests_auditoria_base import crear_usuario

URL_VENTAS = reverse('cantina:auditoria-reporte-ventas')
URL_EXCEPCIONES = reverse('cantina:auditoria-reporte-excepciones')
URL_INVENTARIO = reverse('cantina:auditoria-reporte-inventario')
URL_RENTABILIDAD = reverse('cantina:auditoria-reporte-rentabilidad')

CLAVES_FILA_VENTAS = {'clave', 'etiqueta', 'cantidad', 'ventas', 'total_usd', 'descuento_usd'}
CLAVES_EXCEPCION = {
    'venta_id', 'fecha_hora', 'cajero', 'turno', 'metodo_pago', 'total_usd', 'descuento_usd',
    'motivo', 'anulada_por', 'origen_producto', 'origen_alumno',
}
CLAVES_MOVIMIENTO = {
    'id', 'fecha_hora', 'producto', 'tipo', 'cantidad', 'stock_antes', 'stock_despues',
    'motivo', 'usuario', 'venta_id',
}
CLAVES_FILA_RENTABILIDAD = {
    'clave', 'etiqueta', 'unidades', 'ventas_usd', 'costo_usd', 'margen_usd', 'margen_pct',
    'unidades_sin_costo',
}


class BaseReportes(TestCase):
    """
    Escenario de hoy:
      v1 · Ana · turno 1 · 3 empanadas (costo 0.60) + 1 jugo (sin costo), bruto 5.00,
           descuento 1.00 → neto 4.00
      v2 · Beto · turno 2 · 2 empanadas (costo 0.60), venta manual → 2.00
      v3 · Ana · turno 1 · 2 jugos (costo 1.20) → 4.00 ANULADA
      v4 · Beto · turno 2 · librería · 1 cuaderno (costo 2.00) → 3.00
    Y hace 5 días:
      v5 · Ana · sin turno · 10 empanadas (costo 0.60) → 10.00
    """

    def setUp(self):
        self.client = APIClient()
        self.director = crear_usuario('director_b3', 'director')
        self.cajero = crear_usuario('cajero_b3', 'cajero')
        self.cajero.first_name, self.cajero.last_name = 'Ana', 'Pérez'
        self.cajero.save()
        self.cajero2 = crear_usuario('cajero2_b3', 'cajero')
        self.cajero2.first_name, self.cajero2.last_name = 'Beto', 'Ruiz'
        self.cajero2.save()
        self.admin = crear_usuario('admin_b3', 'administrador')
        self.hoy = timezone.localdate()
        self.client.force_authenticate(self.director)

        self.comida = CategoriaProducto.objects.create(nombre='Comida')
        self.bebidas = CategoriaProducto.objects.create(nombre='Bebidas')
        self.utiles = CategoriaProducto.objects.create(nombre='Útiles', area='libreria')
        self.empanada = ProductoCantina.objects.create(
            nombre='Empanada', categoria=self.comida, precio=Decimal('1.00'), costo=Decimal('0.60'),
            stock_actual=50,
        )
        self.jugo = ProductoCantina.objects.create(
            nombre='Jugo natural', categoria=self.bebidas, precio=Decimal('2.00'), stock_actual=20,
        )
        self.cuaderno = ProductoCantina.objects.create(
            nombre='Cuaderno', categoria=self.utiles, precio=Decimal('3.00'), costo=Decimal('2.00'),
            area='libreria', stock_actual=10,
        )
        self.turno1 = self.crear_apertura(self.cajero)
        self.turno2 = self.crear_apertura(self.cajero2)

        self.v1 = self.crear_venta(
            self.cajero, self.turno1, [(self.empanada, 3, '0.60'), (self.jugo, 1, None)],
            descuento='1.00', motivo_descuento='Promo docente',
        )
        self.v2 = self.crear_venta(
            self.cajero2, self.turno2, [(self.empanada, 2, '0.60')],
            es_manual=True, origen_producto='manual',
        )
        self.v3 = self.crear_venta(
            self.cajero, self.turno1, [(self.jugo, 2, '1.20')],
            estado='anulada', motivo_anulacion='Cliente desistió', anulada_por=self.director,
            anulada_en=timezone.now(),
        )
        self.v4 = self.crear_venta(
            self.cajero2, self.turno2, [(self.cuaderno, 1, '2.00')], area='libreria',
        )
        self.v5 = self.crear_venta(self.cajero, None, [(self.empanada, 10, '0.60')], dias_atras=5)

    def crear_apertura(self, cajero, area='cantina'):
        return AperturaCajaCantina.objects.create(
            cajero=cajero, area=area, monto_inicial=Decimal('10.00'), estado='cerrada',
            cerrada_en=timezone.now(),
        )

    def crear_venta(self, cajero, apertura, lineas, descuento='0.00', area='cantina', dias_atras=0, **extra):
        bruto = sum((p.precio * c for p, c, _ in lineas), Decimal('0.00'))
        neto = bruto - Decimal(descuento)
        venta = VentaCantina.objects.create(
            cajero=cajero, apertura=apertura, metodo_pago='efectivo', area=area,
            total_usd=neto, descuento_usd=Decimal(descuento), tasa_aplicada=Decimal('36.0000'),
            total_ves=neto * 36, **extra,
        )
        for producto, cantidad, costo in lineas:
            DetalleVentaCantina.objects.create(
                venta=venta, producto=producto, cantidad=cantidad, precio_unitario=producto.precio,
                subtotal=producto.precio * cantidad, costo_unitario=Decimal(costo) if costo else None,
            )
        if dias_atras:
            VentaCantina.objects.filter(pk=venta.pk).update(creado_en=timezone.now() - timedelta(days=dias_atras))
        return venta

    def get(self, url, **params):
        respuesta = self.client.get(url, params)
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK, respuesta.content)
        return respuesta.json()

    def contar_consultas(self, url, **params):
        with CaptureQueriesContext(connection) as ctx:
            self.get(url, **params)
        return len(ctx)


# ─────────────────────────────────────────────
# Ventas
# ─────────────────────────────────────────────
class ReporteVentasTests(BaseReportes):
    def test_por_producto_forma_y_montos_netos(self):
        datos = self.get(URL_VENTAS, agrupar='producto')
        self.assertEqual(set(datos), {'fecha_inicio', 'fecha_fin', 'agrupar', 'filas', 'totales'})
        self.assertEqual(datos['fecha_inicio'], self.hoy.isoformat())
        self.assertEqual(datos['fecha_fin'], self.hoy.isoformat())
        self.assertEqual(datos['agrupar'], 'producto')
        for fila in datos['filas']:
            self.assertEqual(set(fila), CLAVES_FILA_VENTAS)
        # Descuento de v1 (1.00) prorrateado: 3.00/5.00 a empanadas, 2.00/5.00 al jugo.
        self.assertEqual(datos['filas'], [
            {'clave': str(self.empanada.id), 'etiqueta': 'Empanada', 'cantidad': 5, 'ventas': 2,
             'total_usd': '4.40', 'descuento_usd': '0.60'},
            {'clave': str(self.cuaderno.id), 'etiqueta': 'Cuaderno', 'cantidad': 1, 'ventas': 1,
             'total_usd': '3.00', 'descuento_usd': '0.00'},
            {'clave': str(self.jugo.id), 'etiqueta': 'Jugo natural', 'cantidad': 1, 'ventas': 1,
             'total_usd': '1.60', 'descuento_usd': '0.40'},
        ])
        self.assertEqual(datos['totales'], {
            'cantidad': 7, 'ventas': 3, 'total_usd': '9.00', 'descuento_usd': '1.00',
        })

    def test_excluye_anuladas(self):
        datos = self.get(URL_VENTAS, agrupar='producto')
        jugo = next(f for f in datos['filas'] if f['clave'] == str(self.jugo.id))
        self.assertEqual(jugo['cantidad'], 1)  # los 2 jugos de v3 (anulada) no cuentan
        datos = self.get(URL_VENTAS, agrupar='responsable')
        ana = next(f for f in datos['filas'] if f['clave'] == str(self.cajero.id))
        self.assertEqual(ana['ventas'], 1)
        self.assertEqual(ana['total_usd'], '4.00')

    def test_agrupar_por_defecto_es_producto(self):
        self.assertEqual(self.get(URL_VENTAS)['agrupar'], 'producto')

    def test_por_categoria(self):
        datos = self.get(URL_VENTAS, agrupar='categoria')
        self.assertEqual(
            [(f['etiqueta'], f['cantidad'], f['ventas'], f['total_usd'], f['descuento_usd']) for f in datos['filas']],
            [('Comida', 5, 2, '4.40', '0.60'), ('Útiles', 1, 1, '3.00', '0.00'), ('Bebidas', 1, 1, '1.60', '0.40')],
        )
        self.assertEqual(datos['filas'][0]['clave'], str(self.comida.id))

    def test_por_turno(self):
        datos = self.get(URL_VENTAS, agrupar='turno')
        self.assertEqual(len(datos['filas']), 2)
        t1, t2 = datos['filas']
        self.assertEqual(t1['clave'], str(self.turno1.id))
        self.assertTrue(t1['etiqueta'].startswith(f'Turno #{self.turno1.id} · '))
        self.assertEqual((t1['cantidad'], t1['ventas'], t1['total_usd'], t1['descuento_usd']), (4, 1, '4.00', '1.00'))
        self.assertEqual((t2['cantidad'], t2['ventas'], t2['total_usd'], t2['descuento_usd']), (3, 2, '5.00', '0.00'))
        self.assertEqual(datos['totales'], {
            'cantidad': 7, 'ventas': 3, 'total_usd': '9.00', 'descuento_usd': '1.00',
        })

    def test_por_turno_incluye_ventas_sin_turno(self):
        inicio = (self.hoy - timedelta(days=5)).isoformat()
        datos = self.get(URL_VENTAS, agrupar='turno', fecha_inicio=inicio)
        sin_turno = next(f for f in datos['filas'] if f['clave'] == 'sin_turno')
        self.assertEqual(sin_turno['etiqueta'], 'Sin turno')
        self.assertEqual((sin_turno['cantidad'], sin_turno['ventas'], sin_turno['total_usd']), (10, 1, '10.00'))

    def test_por_responsable(self):
        datos = self.get(URL_VENTAS, agrupar='responsable')
        self.assertEqual(datos['filas'], [
            {'clave': str(self.cajero2.id), 'etiqueta': 'Beto Ruiz', 'cantidad': 3, 'ventas': 2,
             'total_usd': '5.00', 'descuento_usd': '0.00'},
            {'clave': str(self.cajero.id), 'etiqueta': 'Ana Pérez', 'cantidad': 4, 'ventas': 1,
             'total_usd': '4.00', 'descuento_usd': '1.00'},
        ])

    def test_por_dia_respeta_el_rango(self):
        hace5 = self.hoy - timedelta(days=5)
        datos = self.get(URL_VENTAS, agrupar='dia', fecha_inicio=hace5.isoformat(), fecha_fin=self.hoy.isoformat())
        self.assertEqual(
            [(f['clave'], f['etiqueta'], f['cantidad'], f['ventas'], f['total_usd']) for f in datos['filas']],
            [(hace5.isoformat(), hace5.isoformat(), 10, 1, '10.00'),
             (self.hoy.isoformat(), self.hoy.isoformat(), 7, 3, '9.00')],
        )
        self.assertEqual(datos['totales']['total_usd'], '19.00')
        # Sin fechas → solo hoy.
        self.assertEqual(len(self.get(URL_VENTAS, agrupar='dia')['filas']), 1)

    def test_filtro_area(self):
        datos = self.get(URL_VENTAS, agrupar='producto', area='libreria')
        self.assertEqual([f['etiqueta'] for f in datos['filas']], ['Cuaderno'])
        self.assertEqual(datos['totales']['total_usd'], '3.00')

    def test_filtro_cajero(self):
        datos = self.get(URL_VENTAS, agrupar='turno', cajero=self.cajero.id)
        self.assertEqual([f['clave'] for f in datos['filas']], [str(self.turno1.id)])
        self.assertEqual(datos['totales'], {
            'cantidad': 4, 'ventas': 1, 'total_usd': '4.00', 'descuento_usd': '1.00',
        })

    def test_sin_ventas_totales_en_cero(self):
        datos = self.get(URL_VENTAS, agrupar='responsable', fecha_inicio='2020-01-01', fecha_fin='2020-01-02')
        self.assertEqual(datos['filas'], [])
        self.assertEqual(datos['totales'], {'cantidad': 0, 'ventas': 0, 'total_usd': '0.00', 'descuento_usd': '0.00'})

    def test_consultas_acotadas(self):
        for agrupar in ('producto', 'turno', 'responsable', 'dia'):
            antes = self.contar_consultas(URL_VENTAS, agrupar=agrupar)
            otro = crear_usuario(f'cajero_extra_{agrupar}', 'cajero')
            turno = self.crear_apertura(otro)
            self.crear_venta(otro, turno, [(self.jugo, 1, '1.20'), (self.empanada, 2, '0.60')])
            self.assertEqual(self.contar_consultas(URL_VENTAS, agrupar=agrupar), antes, agrupar)


# ─────────────────────────────────────────────
# Excepciones
# ─────────────────────────────────────────────
class ReporteExcepcionesTests(BaseReportes):
    def test_anulaciones(self):
        datos = self.get(URL_EXCEPCIONES, tipo='anulaciones')
        self.assertEqual(set(datos), {'count', 'next', 'previous', 'resumen', 'por_responsable', 'results'})
        self.assertEqual(datos['count'], 1)
        self.assertEqual(datos['resumen'], {'cantidad': 1, 'monto_usd': '4.00'})
        self.assertEqual(datos['por_responsable'], [
            {'usuario': {'id': self.cajero.id, 'nombre': 'Ana Pérez'}, 'cantidad': 1, 'monto_usd': '4.00'},
        ])
        fila = datos['results'][0]
        self.assertEqual(set(fila), CLAVES_EXCEPCION)
        self.assertEqual(fila['venta_id'], self.v3.id)
        self.assertEqual(fila['cajero'], {'id': self.cajero.id, 'nombre': 'Ana Pérez'})
        self.assertEqual(fila['turno']['apertura_id'], self.turno1.id)
        self.assertEqual(fila['metodo_pago'], 'efectivo')
        self.assertEqual(fila['total_usd'], '4.00')
        self.assertEqual(fila['descuento_usd'], '0.00')
        self.assertEqual(fila['motivo'], 'Cliente desistió')
        self.assertEqual(fila['anulada_por']['id'], self.director.id)
        self.assertEqual(fila['origen_alumno'], 'no_aplica')

    def test_descuentos(self):
        datos = self.get(URL_EXCEPCIONES, tipo='descuentos')
        self.assertEqual(datos['count'], 1)
        self.assertEqual(datos['resumen'], {'cantidad': 1, 'monto_usd': '1.00'})
        fila = datos['results'][0]
        self.assertEqual(fila['venta_id'], self.v1.id)
        self.assertEqual(fila['motivo'], 'Promo docente')
        self.assertEqual(fila['descuento_usd'], '1.00')
        self.assertIsNone(fila['anulada_por'])

    def test_manuales(self):
        datos = self.get(URL_EXCEPCIONES, tipo='manuales')
        self.assertEqual(datos['count'], 1)
        self.assertEqual(datos['resumen'], {'cantidad': 1, 'monto_usd': '2.00'})
        self.assertEqual(datos['results'][0]['venta_id'], self.v2.id)
        self.assertEqual(datos['results'][0]['origen_producto'], 'manual')
        self.assertEqual(datos['por_responsable'][0]['usuario']['nombre'], 'Beto Ruiz')

    def test_tipo_por_defecto_es_anulaciones(self):
        self.assertEqual(self.get(URL_EXCEPCIONES)['results'][0]['venta_id'], self.v3.id)

    def test_paginacion_y_resumen_sobre_todo_el_filtro(self):
        for _ in range(3):
            self.crear_venta(self.cajero2, self.turno2, [(self.empanada, 1, '0.60')], estado='anulada',
                             motivo_anulacion='Error de cobro')
        datos = self.get(URL_EXCEPCIONES, tipo='anulaciones', page_size=2)
        self.assertEqual(datos['count'], 4)
        self.assertEqual(len(datos['results']), 2)
        self.assertIsNotNone(datos['next'])
        self.assertIsNone(datos['previous'])
        self.assertEqual(datos['resumen'], {'cantidad': 4, 'monto_usd': '7.00'})
        self.assertEqual(datos['por_responsable'], [
            {'usuario': {'id': self.cajero2.id, 'nombre': 'Beto Ruiz'}, 'cantidad': 3, 'monto_usd': '3.00'},
            {'usuario': {'id': self.cajero.id, 'nombre': 'Ana Pérez'}, 'cantidad': 1, 'monto_usd': '4.00'},
        ])
        pagina2 = self.get(URL_EXCEPCIONES, tipo='anulaciones', page_size=2, page=2)
        self.assertEqual(len(pagina2['results']), 2)
        self.assertIsNone(pagina2['next'])

    def test_filtros_area_y_cajero(self):
        self.assertEqual(self.get(URL_EXCEPCIONES, tipo='anulaciones', area='libreria')['count'], 0)
        self.assertEqual(self.get(URL_EXCEPCIONES, tipo='anulaciones', cajero=self.cajero2.id)['count'], 0)
        self.assertEqual(self.get(URL_EXCEPCIONES, tipo='anulaciones', cajero=self.cajero.id)['count'], 1)

    def test_consultas_acotadas(self):
        antes = self.contar_consultas(URL_EXCEPCIONES, tipo='anulaciones')
        for i in range(3):
            otro = crear_usuario(f'cajero_exc_{i}', 'cajero')
            self.crear_venta(otro, self.crear_apertura(otro), [(self.jugo, 1, None)], estado='anulada',
                             anulada_por=otro, motivo_anulacion='x')
        self.assertEqual(self.contar_consultas(URL_EXCEPCIONES, tipo='anulaciones'), antes)


# ─────────────────────────────────────────────
# Inventario
# ─────────────────────────────────────────────
class ReporteInventarioTests(BaseReportes):
    def setUp(self):
        super().setUp()
        aplicar_movimiento_inventario(self.empanada, 'entrada', 12, motivo='Compra', usuario=self.cajero)
        aplicar_movimiento_inventario(self.empanada, 'salida', 3, usuario=self.cajero)
        aplicar_movimiento_inventario(self.empanada, 'ajuste', -2, motivo='Conteo', usuario=self.cajero2)
        self.merma = aplicar_movimiento_inventario(self.jugo, 'merma', 3, motivo='Vencido', usuario=self.cajero)
        aplicar_movimiento_inventario(self.cuaderno, 'entrada', 5, usuario=self.cajero2)
        viejo = aplicar_movimiento_inventario(self.jugo, 'entrada', 100, usuario=self.cajero)
        MovimientoInventario.objects.filter(pk=viejo.pk).update(creado_en=timezone.now() - timedelta(days=10))

    def test_forma_y_resumen(self):
        datos = self.get(URL_INVENTARIO)
        self.assertEqual(set(datos), {'count', 'next', 'previous', 'resumen', 'results'})
        self.assertEqual(datos['count'], 5)
        self.assertEqual(datos['resumen'], {'entrada': 17, 'salida': 3, 'ajuste': -2, 'merma': 3})
        for fila in datos['results']:
            self.assertEqual(set(fila), CLAVES_MOVIMIENTO)

    def test_filtro_tipo_merma(self):
        datos = self.get(URL_INVENTARIO, tipo='merma')
        self.assertEqual(datos['count'], 1)
        # El resumen ignora el filtro de tipo.
        self.assertEqual(datos['resumen']['entrada'], 17)
        fila = datos['results'][0]
        self.assertEqual(fila['id'], self.merma.id)
        self.assertEqual(fila['producto'], {'id': self.jugo.id, 'nombre': 'Jugo natural'})
        self.assertEqual((fila['tipo'], fila['cantidad'], fila['stock_antes'], fila['stock_despues']),
                         ('merma', 3, 20, 17))
        self.assertEqual(fila['motivo'], 'Vencido')
        self.assertEqual(fila['usuario'], {'id': self.cajero.id, 'nombre': 'Ana Pérez'})
        self.assertIsNone(fila['venta_id'])

    def test_filtro_producto_area_y_cajero(self):
        datos = self.get(URL_INVENTARIO, producto=self.empanada.id)
        self.assertEqual(datos['count'], 3)
        self.assertEqual(datos['resumen'], {'entrada': 12, 'salida': 3, 'ajuste': -2, 'merma': 0})
        self.assertEqual(self.get(URL_INVENTARIO, area='libreria')['count'], 1)
        datos = self.get(URL_INVENTARIO, cajero=self.cajero2.id)
        self.assertEqual(datos['resumen'], {'entrada': 5, 'salida': 0, 'ajuste': -2, 'merma': 0})

    def test_rango_de_fechas(self):
        inicio = (self.hoy - timedelta(days=10)).isoformat()
        self.assertEqual(self.get(URL_INVENTARIO, fecha_inicio=inicio)['count'], 6)

    def test_paginacion(self):
        datos = self.get(URL_INVENTARIO, page_size=2)
        self.assertEqual(datos['count'], 5)
        self.assertEqual(len(datos['results']), 2)
        self.assertIsNotNone(datos['next'])


# ─────────────────────────────────────────────
# Rentabilidad
# ─────────────────────────────────────────────
class ReporteRentabilidadTests(BaseReportes):
    def test_por_producto_con_y_sin_costo(self):
        datos = self.get(URL_RENTABILIDAD, agrupar='producto')
        self.assertEqual(set(datos), {'filas', 'totales', 'advertencia'})
        for fila in datos['filas']:
            self.assertEqual(set(fila), CLAVES_FILA_RENTABILIDAD)
        self.assertEqual(datos['filas'], [
            # 3 empanadas de v1 (neto 2.40, costo 1.80) + 2 de v2 (neto 2.00, costo 1.20).
            {'clave': str(self.empanada.id), 'etiqueta': 'Empanada', 'unidades': 5, 'ventas_usd': '4.40',
             'costo_usd': '3.00', 'margen_usd': '1.40', 'margen_pct': '31.82', 'unidades_sin_costo': 0},
            {'clave': str(self.cuaderno.id), 'etiqueta': 'Cuaderno', 'unidades': 1, 'ventas_usd': '3.00',
             'costo_usd': '2.00', 'margen_usd': '1.00', 'margen_pct': '33.33', 'unidades_sin_costo': 0},
            # El jugo de v1 no tiene costo: fuera de ventas y costo del margen.
            {'clave': str(self.jugo.id), 'etiqueta': 'Jugo natural', 'unidades': 1, 'ventas_usd': '0.00',
             'costo_usd': '0.00', 'margen_usd': '0.00', 'margen_pct': None, 'unidades_sin_costo': 1},
        ])
        self.assertEqual(datos['totales'], {
            'ventas_usd': '7.40', 'costo_usd': '5.00', 'margen_usd': '2.40', 'margen_pct': '32.43',
            'unidades_sin_costo': 1,
        })
        self.assertEqual(datos['advertencia'], '1 unidad vendida no tiene costo registrado y se excluye del margen.')

    def test_sin_unidades_sin_costo_no_hay_advertencia(self):
        datos = self.get(URL_RENTABILIDAD, area='libreria')
        self.assertIsNone(datos['advertencia'])
        self.assertEqual(datos['totales']['unidades_sin_costo'], 0)
        self.assertEqual(datos['totales']['margen_pct'], '33.33')

    def test_advertencia_en_plural(self):
        self.crear_venta(self.cajero, self.turno1, [(self.jugo, 4, None)])
        datos = self.get(URL_RENTABILIDAD)
        self.assertEqual(datos['totales']['unidades_sin_costo'], 5)
        self.assertEqual(
            datos['advertencia'], '5 unidades vendidas no tienen costo registrado y se excluyen del margen.',
        )

    def test_por_categoria(self):
        datos = self.get(URL_RENTABILIDAD, agrupar='categoria')
        self.assertEqual(
            [(f['clave'], f['etiqueta'], f['ventas_usd'], f['costo_usd'], f['unidades_sin_costo'])
             for f in datos['filas']],
            [(str(self.comida.id), 'Comida', '4.40', '3.00', 0), (str(self.utiles.id), 'Útiles', '3.00', '2.00', 0),
             (str(self.bebidas.id), 'Bebidas', '0.00', '0.00', 1)],
        )

    def test_excluye_anuladas_y_filtra_por_cajero_y_rango(self):
        # v3 (anulada, jugos con costo) no aporta ventas al jugo.
        datos = self.get(URL_RENTABILIDAD, cajero=self.cajero.id)
        self.assertEqual(datos['totales'], {
            'ventas_usd': '2.40', 'costo_usd': '1.80', 'margen_usd': '0.60', 'margen_pct': '25.00',
            'unidades_sin_costo': 1,
        })
        inicio = (self.hoy - timedelta(days=5)).isoformat()
        datos = self.get(URL_RENTABILIDAD, cajero=self.cajero.id, fecha_inicio=inicio)
        self.assertEqual(datos['totales']['ventas_usd'], '12.40')

    def test_sin_ventas(self):
        datos = self.get(URL_RENTABILIDAD, fecha_inicio='2020-01-01', fecha_fin='2020-01-01')
        self.assertEqual(datos, {
            'filas': [],
            'totales': {'ventas_usd': '0.00', 'costo_usd': '0.00', 'margen_usd': '0.00', 'margen_pct': None,
                        'unidades_sin_costo': 0},
            'advertencia': None,
        })

    def test_consultas_acotadas(self):
        antes = self.contar_consultas(URL_RENTABILIDAD, agrupar='categoria')
        self.crear_venta(self.cajero2, self.turno2, [(self.jugo, 1, '1.20'), (self.empanada, 2, None)])
        self.assertEqual(self.contar_consultas(URL_RENTABILIDAD, agrupar='categoria'), antes)


# ─────────────────────────────────────────────
# Validación y permisos
# ─────────────────────────────────────────────
class ParametrosYPermisosTests(BaseReportes):
    def assert400(self, url, **params):
        respuesta = self.client.get(url, params)
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST, (url, params))
        self.assertIn('error', respuesta.json())

    def test_parametros_invalidos(self):
        self.assert400(URL_VENTAS, agrupar='semana')
        self.assert400(URL_RENTABILIDAD, agrupar='turno')
        self.assert400(URL_EXCEPCIONES, tipo='devoluciones')
        self.assert400(URL_INVENTARIO, tipo='robo')
        self.assert400(URL_INVENTARIO, producto='abc')
        for url in (URL_VENTAS, URL_EXCEPCIONES, URL_INVENTARIO, URL_RENTABILIDAD):
            self.assert400(url, fecha_inicio='15/10/2026')
            self.assert400(url, fecha_inicio='2026-10-15', fecha_fin='2026-10-01')
            self.assert400(url, area='kiosco')
            self.assert400(url, cajero='ana')

    def test_solo_el_director(self):
        for usuario in (self.admin, self.cajero):
            self.client.force_authenticate(usuario)
            for url in (URL_VENTAS, URL_EXCEPCIONES, URL_INVENTARIO, URL_RENTABILIDAD):
                self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN, (usuario, url))

    def test_superusuario_pasa(self):
        self.client.force_authenticate(crear_usuario('root_b3', 'cajero', superuser=True))
        for url in (URL_VENTAS, URL_EXCEPCIONES, URL_INVENTARIO, URL_RENTABILIDAD):
            self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK, url)
