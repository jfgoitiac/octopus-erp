"""
Tests de Fase 7 de cantina: reportes de ventas — ReporteVentasView,
ExportarVentasExcelView (§5.6/§7.4/§8 FASE 7/§10 checklist de cantina.md).
Sigue el mismo estilo que tests_ventas.py/tests_tarjetas.py (APIClient +
perfil.rol/perfil.esta_activo).
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from cobranza.models import TasaCambio
from secretaria.models import Alumno, Representante

from .models import CategoriaProducto, DetalleVentaCantina, ProductoCantina, VentaCantina

User = get_user_model()


class ReporteVentasTestsBase(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.admin_user = User.objects.create_user(username='admin_reportes', password='password123')
        self.admin_user.perfil.rol = 'administrador'
        self.admin_user.perfil.esta_activo = True
        self.admin_user.perfil.save()

        self.cajero_user = User.objects.create_user(username='cajero_reportes', password='password123')
        self.cajero_user.perfil.rol = 'cajero'
        self.cajero_user.perfil.esta_activo = True
        self.cajero_user.perfil.save()

        self.categoria = CategoriaProducto.objects.create(nombre='Snacks')
        self.jugo = ProductoCantina.objects.create(
            nombre='Jugo natural', categoria=self.categoria, codigo_barras='7592222222221',
            precio=Decimal('1.50'), stock_actual=100, stock_minimo=2,
        )
        self.empanada = ProductoCantina.objects.create(
            nombre='Empanada', categoria=self.categoria, codigo_barras='7592222222222',
            precio=Decimal('1.00'), stock_actual=100, stock_minimo=2,
        )

        self.representante = Representante.objects.create(
            cedula='V-8888888', nombre='Luisa', apellido='Perez',
            telefono='0412-8888888', correo='luisa@example.com', direccion='Calle 8',
        )
        self.alumno = Alumno.objects.create(
            nombre='Marco', apellido='Perez', representante=self.representante, grado_seccion='3ro B',
        )

        TasaCambio.objects.create(valor_bs=Decimal('40.0000'))

    def _crear_venta(self, dias_atras=0, estado='completada', alumno=None, cantidad_jugo=1, cantidad_empanada=0):
        subtotal_jugo = (self.jugo.precio * cantidad_jugo).quantize(Decimal('0.01'))
        subtotal_empanada = (self.empanada.precio * cantidad_empanada).quantize(Decimal('0.01'))
        total_usd = subtotal_jugo + subtotal_empanada

        venta = VentaCantina.objects.create(
            alumno=alumno,
            cajero=self.cajero_user,
            metodo_pago='efectivo',
            total_usd=total_usd,
            tasa_aplicada=Decimal('40.0000'),
            total_ves=(total_usd * Decimal('40.0000')).quantize(Decimal('0.01')),
            estado=estado,
        )
        if cantidad_jugo:
            DetalleVentaCantina.objects.create(
                venta=venta, producto=self.jugo, cantidad=cantidad_jugo,
                precio_unitario=self.jugo.precio, subtotal=subtotal_jugo,
            )
        if cantidad_empanada:
            DetalleVentaCantina.objects.create(
                venta=venta, producto=self.empanada, cantidad=cantidad_empanada,
                precio_unitario=self.empanada.precio, subtotal=subtotal_empanada,
            )

        # creado_en tiene auto_now_add=True — se ajusta manualmente vía update()
        # para simular ventas de distintos días dentro/fuera del rango del reporte.
        fecha = timezone.now() - timedelta(days=dias_atras)
        VentaCantina.objects.filter(pk=venta.pk).update(creado_en=fecha)
        venta.refresh_from_db()
        return venta


class ReporteVentasViewTests(ReporteVentasTestsBase):
    def test_reporte_filtra_por_rango_de_fechas(self):
        self._crear_venta(dias_atras=0, cantidad_jugo=1)
        self._crear_venta(dias_atras=10, cantidad_jugo=2)  # fuera del rango por defecto

        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get('/api/cantina/reportes/ventas/')

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(len(resp.data['ventas']), 1)
        self.assertEqual(resp.data['totales']['cantidad_ventas'], 1)

    def test_reporte_con_rango_explicito_incluye_ventas_dentro_del_rango(self):
        hoy = timezone.localdate()
        self._crear_venta(dias_atras=0, cantidad_jugo=1)
        self._crear_venta(dias_atras=5, cantidad_jugo=1)
        self._crear_venta(dias_atras=20, cantidad_jugo=1)  # fuera de rango

        fecha_inicio = (hoy - timedelta(days=7)).isoformat()
        fecha_fin = hoy.isoformat()

        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get(
            f'/api/cantina/reportes/ventas/?fecha_inicio={fecha_inicio}&fecha_fin={fecha_fin}'
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(len(resp.data['ventas']), 2)
        self.assertEqual(resp.data['totales']['cantidad_ventas'], 2)

    def test_venta_anulada_no_suma_en_totales_pero_aparece_en_listado(self):
        self._crear_venta(dias_atras=0, estado='completada', cantidad_jugo=1)
        self._crear_venta(dias_atras=0, estado='anulada', cantidad_jugo=5)

        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get('/api/cantina/reportes/ventas/')

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        # Ambas ventas aparecen en el listado...
        self.assertEqual(len(resp.data['ventas']), 2)
        estados = {v['estado'] for v in resp.data['ventas']}
        self.assertEqual(estados, {'completada', 'anulada'})
        # ...pero solo la completada cuenta en los totales agregados.
        self.assertEqual(resp.data['totales']['cantidad_ventas'], 1)
        self.assertEqual(Decimal(resp.data['totales']['total_vendido_usd']), Decimal('1.50'))

    def test_productos_mas_vendidos_solo_cuenta_ventas_completadas(self):
        self._crear_venta(dias_atras=0, estado='completada', cantidad_jugo=2, cantidad_empanada=1)
        self._crear_venta(dias_atras=0, estado='completada', cantidad_jugo=3, cantidad_empanada=0)
        self._crear_venta(dias_atras=0, estado='anulada', cantidad_jugo=10, cantidad_empanada=10)

        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get('/api/cantina/reportes/ventas/')

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        productos = {p['nombre']: p for p in resp.data['productos_mas_vendidos']}
        self.assertIn('Jugo natural', productos)
        self.assertEqual(productos['Jugo natural']['cantidad_total'], 5)  # 2 + 3, sin la anulada
        self.assertEqual(Decimal(productos['Jugo natural']['monto_total']), Decimal('7.50'))
        self.assertIn('Empanada', productos)
        self.assertEqual(productos['Empanada']['cantidad_total'], 1)

    def test_filtro_por_alumno_id(self):
        self._crear_venta(dias_atras=0, alumno=self.alumno, cantidad_jugo=1)
        self._crear_venta(dias_atras=0, alumno=None, cantidad_jugo=1)

        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get(f'/api/cantina/reportes/ventas/?alumno_id={self.alumno.id}')

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(len(resp.data['ventas']), 1)
        self.assertEqual(resp.data['ventas'][0]['alumno'], self.alumno.id)

    def test_ventas_por_dia_agrega_correctamente(self):
        hoy = timezone.localdate()
        self._crear_venta(dias_atras=0, cantidad_jugo=1)
        self._crear_venta(dias_atras=0, cantidad_jugo=1)
        self._crear_venta(dias_atras=1, cantidad_jugo=2)

        fecha_inicio = (hoy - timedelta(days=3)).isoformat()
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get(f'/api/cantina/reportes/ventas/?fecha_inicio={fecha_inicio}')

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        serie = {fila['fecha']: fila['total_usd'] for fila in resp.data['ventas_por_dia']}
        self.assertEqual(Decimal(serie[str(hoy)]), Decimal('3.00'))  # 1.50 + 1.50
        self.assertEqual(Decimal(serie[str(hoy - timedelta(days=1))]), Decimal('3.00'))  # 2 * 1.50

    def test_formato_de_fecha_invalido_devuelve_400(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get('/api/cantina/reportes/ventas/?fecha_inicio=31-12-2025')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cajero_tiene_el_mismo_acceso_que_admin(self):
        # Decisión de negocio confirmada por el cliente: el cajero tiene el
        # mismo nivel de acceso que administrador/director en todo el
        # módulo cantina — ya no se le restringe este reporte.
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get('/api/cantina/reportes/ventas/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_no_autenticado_rechazado(self):
        resp = self.client.get('/api/cantina/reportes/ventas/')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class ExportarVentasExcelViewTests(ReporteVentasTestsBase):
    def test_export_excel_responde_con_content_type_correcto(self):
        self._crear_venta(dias_atras=0, cantidad_jugo=1)

        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get('/api/cantina/reportes/ventas/excel/')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(
            resp['Content-Type'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        self.assertIn('attachment', resp['Content-Disposition'])

    def test_export_excel_cajero_tiene_el_mismo_acceso_que_admin(self):
        # Mismo criterio que ReporteVentasViewTests.test_cajero_tiene_el_mismo_acceso_que_admin.
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get('/api/cantina/reportes/ventas/excel/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_export_excel_formato_de_fecha_invalido_devuelve_400(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get('/api/cantina/reportes/ventas/excel/?fecha_fin=no-es-una-fecha')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
