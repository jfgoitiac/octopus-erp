"""
Tests del Resumen ejecutivo de Cantina y Librería (GET reportes/resumen-ejecutivo/).

Reutilizan el escenario de `BaseReportes` (hoy: v1 4.00 con descuento y una
línea sin costo, v2 2.00 manual, v3 anulada 4.00, v4 librería 3.00; y hace 5
días v5 10.00) para que las cifras sean comparables con los demás reportes.
"""
import uuid
from datetime import timedelta
from decimal import Decimal

from django.test.utils import CaptureQueriesContext
from django.db import connection
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from .models import (
    AbonoCantina,
    AplicacionAbonoCantina,
    CargoCantina,
    CierreCajaCantina,
    ClienteCantina,
    ParametroAuditoriaCantina,
    VentaCantina,
)
from .services_inventario import aplicar_movimiento_inventario
from .tests_auditoria_base import crear_usuario
from .tests_auditoria_reportes import BaseReportes

URL = reverse('cantina:auditoria-reporte-resumen-ejecutivo')
URL_CAJEROS = reverse('cantina:auditoria-cajeros')

CLAVES_RAIZ = {
    'periodo', 'filtros', 'generado_en', 'vacio', 'kpis', 'comparacion', 'distribucion_area',
    'distribucion_metodo_pago', 'evolucion_diaria', 'ranking', 'sin_costo', 'inventario', 'caja',
    'excepciones', 'alertas', 'limitaciones',
}


class BaseResumen(BaseReportes):
    def resumen(self, **params):
        return self.get(URL, **params)

    def codigos_alerta(self, datos):
        return {a['codigo'] for a in datos['alertas']}


# ─────────────────────────────────────────────
# Permisos
# ─────────────────────────────────────────────
class ResumenPermisosTests(BaseResumen):
    def test_director_autorizado(self):
        datos = self.resumen()
        self.assertEqual(set(datos), CLAVES_RAIZ)

    def test_superusuario_autorizado(self):
        self.client.force_authenticate(crear_usuario('su_resumen', 'sistemas', superuser=True))
        self.assertEqual(self.client.get(URL).status_code, status.HTTP_200_OK)

    def test_otros_roles_rechazados(self):
        for user in (self.admin, self.cajero):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(URL).status_code, status.HTTP_403_FORBIDDEN)

    def test_anonimo_rechazado(self):
        self.client.force_authenticate(None)
        self.assertIn(
            self.client.get(URL).status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )


# ─────────────────────────────────────────────
# Validación de parámetros
# ─────────────────────────────────────────────
class ResumenParametrosTests(BaseResumen):
    def assertRechazado(self, **params):
        respuesta = self.client.get(URL, params)
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST, respuesta.content)
        self.assertIn('error', respuesta.json())

    def test_rango_correcto(self):
        datos = self.resumen(
            fecha_inicio=(self.hoy - timedelta(days=5)).isoformat(), fecha_fin=self.hoy.isoformat(),
        )
        self.assertEqual(datos['periodo']['dias'], 6)
        self.assertEqual(len(datos['evolucion_diaria']), 6)
        self.assertEqual(datos['kpis']['ventas_completadas'], 4)  # v1, v2, v4 + v5

    def test_sin_fechas_es_hoy(self):
        datos = self.resumen()
        self.assertEqual(datos['periodo'], {
            'fecha_inicio': self.hoy.isoformat(), 'fecha_fin': self.hoy.isoformat(), 'dias': 1,
        })

    def test_rangos_invalidos(self):
        self.assertRechazado(fecha_inicio=self.hoy.isoformat(), fecha_fin=(self.hoy - timedelta(days=1)).isoformat())
        self.assertRechazado(fecha_inicio='01/02/2026')
        self.assertRechazado(fecha_fin=(self.hoy + timedelta(days=1)).isoformat())
        self.assertRechazado(fecha_inicio=(self.hoy - timedelta(days=400)).isoformat())

    def test_area_cajero_y_comparar_invalidos(self):
        self.assertRechazado(area='papeleria')
        self.assertRechazado(cajero='abc')
        self.assertRechazado(cajero='999999')
        self.assertRechazado(comparar='quizas')

    def test_sede_se_rechaza_porque_cantina_no_la_registra(self):
        self.assertRechazado(sede='1')

    def test_sede_vacia_se_ignora(self):
        self.assertEqual(self.client.get(URL, {'sede': ''}).status_code, status.HTTP_200_OK)


# ─────────────────────────────────────────────
# Métricas y filtros
# ─────────────────────────────────────────────
class ResumenMetricasTests(BaseResumen):
    def test_kpis_del_dia_excluyen_anuladas_de_ingresos(self):
        k = self.resumen()['kpis']
        self.assertEqual(k['ingresos_netos_usd'], '9.00')  # v1 4.00 + v2 2.00 + v4 3.00 (v3 anulada no suma)
        self.assertEqual(k['ventas_completadas'], 3)
        self.assertEqual(k['ticket_promedio_usd'], '3.00')
        self.assertEqual(k['descuentos_usd'], '1.00')

    def test_anuladas_se_informan_como_control(self):
        k = self.resumen()['kpis']
        self.assertEqual(k['ventas_anuladas'], 1)
        self.assertEqual(k['ventas_anuladas_usd'], '4.00')
        datos = self.resumen()
        self.assertEqual(datos['excepciones']['anulaciones'], {'cantidad': 1, 'monto_usd': '4.00'})
        self.assertEqual(datos['excepciones']['anulaciones_por_cajero'][0]['usuario']['id'], self.cajero.id)

    def test_costo_y_margen_usan_el_costo_historico(self):
        # El costo actual de la empanada cambia DESPUÉS de vender: no debe alterar el histórico.
        self.empanada.costo = Decimal('0.99')
        self.empanada.save()
        k = self.resumen()['kpis']
        self.assertEqual(k['costo_mercancia_usd'], '5.00')  # 3×0.60 + 2×0.60 + 1×2.00
        self.assertEqual(k['ingresos_con_costo_usd'], '7.40')  # sin la línea del jugo
        self.assertEqual(k['utilidad_bruta_usd'], '2.40')
        self.assertEqual(k['margen_bruto_pct'], '32.43')
        self.assertEqual(k['cobertura_costo_pct'], '82.22')

    def test_productos_sin_costo_se_excluyen_y_se_advierten(self):
        datos = self.resumen()
        self.assertEqual(datos['kpis']['unidades_sin_costo'], 1)
        self.assertEqual(datos['sin_costo']['productos'], 1)
        self.assertEqual(datos['sin_costo']['ingresos_usd'], '1.60')
        self.assertEqual(
            [(f['etiqueta'], f['unidades']) for f in datos['sin_costo']['lineas']], [('Jugo natural', 1)],
        )
        self.assertIn('productos_sin_costo', self.codigos_alerta(datos))
        # El jugo no figura entre los productos con utilidad: sin costo no hay margen.
        etiquetas = [f['etiqueta'] for f in datos['ranking']['productos_utilidad']]
        self.assertNotIn('Jugo natural', etiquetas)
        self.assertIn('Jugo natural', [f['etiqueta'] for f in datos['ranking']['productos_ingresos']])

    def test_sin_ventas_con_costo_el_margen_no_es_calculable(self):
        VentaCantina.objects.filter(pk__in=[self.v2.pk, self.v4.pk]).update(estado='anulada')
        self.v1.detalles.filter(producto=self.empanada).update(costo_unitario=None)
        datos = self.resumen()
        self.assertIsNone(datos['kpis']['margen_bruto_pct'])
        self.assertIn('margen_no_calculable', self.codigos_alerta(datos))

    def test_filtro_cantina(self):
        datos = self.resumen(area='cantina')
        self.assertEqual(datos['kpis']['ingresos_netos_usd'], '6.00')
        self.assertEqual(datos['kpis']['ventas_completadas'], 2)
        self.assertEqual([f['clave'] for f in datos['distribucion_area']], ['cantina'])
        self.assertEqual(datos['filtros']['area_etiqueta'], 'Cantina')

    def test_filtro_libreria(self):
        datos = self.resumen(area='libreria')
        self.assertEqual(datos['kpis']['ingresos_netos_usd'], '3.00')
        self.assertEqual(datos['kpis']['ventas_completadas'], 1)
        self.assertEqual(datos['kpis']['ventas_anuladas'], 0)
        self.assertEqual(datos['kpis']['costo_mercancia_usd'], '2.00')
        self.assertEqual([f['etiqueta'] for f in datos['ranking']['categorias_ingresos']], ['Útiles'])

    def test_ambas_areas_y_distribucion_entre_ellas(self):
        datos = self.resumen()
        self.assertEqual(datos['filtros']['area'], None)
        self.assertEqual(
            [(f['clave'], f['ingresos_usd'], f['porcentaje']) for f in datos['distribucion_area']],
            [('cantina', '6.00', '66.67'), ('libreria', '3.00', '33.33')],
        )

    def test_distribucion_por_area_incluye_area_sin_ventas(self):
        VentaCantina.objects.filter(pk=self.v4.pk).delete()
        filas = {f['clave']: f for f in self.resumen()['distribucion_area']}
        self.assertEqual(filas['libreria']['ingresos_usd'], '0.00')
        self.assertEqual(filas['libreria']['ventas'], 0)

    def test_filtro_cajero(self):
        datos = self.resumen(cajero=self.cajero.id)  # Ana: v1 + v3 anulada
        self.assertEqual(datos['kpis']['ingresos_netos_usd'], '4.00')
        self.assertEqual(datos['kpis']['ventas_anuladas'], 1)
        self.assertEqual(datos['filtros']['cajero']['id'], self.cajero.id)
        datos = self.resumen(cajero=self.cajero2.id)  # Beto: v2 + v4
        self.assertEqual(datos['kpis']['ingresos_netos_usd'], '5.00')
        self.assertEqual(datos['kpis']['ventas_anuladas'], 0)

    def test_distribucion_por_metodo_de_pago(self):
        VentaCantina.objects.filter(pk=self.v2.pk).update(metodo_pago='pago_movil')
        filas = self.resumen()['distribucion_metodo_pago']
        self.assertEqual(
            [(f['clave'], f['etiqueta'], f['ingresos_usd'], f['ventas'], f['porcentaje']) for f in filas],
            [
                ('efectivo', 'Efectivo divisas', '7.00', 2, '77.78'),
                ('pago_movil', 'Pago móvil', '2.00', 1, '22.22'),
            ],
        )

    def test_evolucion_diaria_rellena_los_dias_sin_ventas(self):
        serie = self.resumen(fecha_inicio=(self.hoy - timedelta(days=5)).isoformat())['evolucion_diaria']
        self.assertEqual(serie[0], {'fecha': (self.hoy - timedelta(days=5)).isoformat(), 'ingresos_usd': '10.00', 'ventas': 1})
        self.assertEqual(serie[1]['ingresos_usd'], '0.00')
        self.assertEqual(serie[-1], {'fecha': self.hoy.isoformat(), 'ingresos_usd': '9.00', 'ventas': 3})

    def test_rankings_de_productos_y_categorias(self):
        r = self.resumen()['ranking']
        self.assertEqual(
            [(f['etiqueta'], f['ingresos_usd']) for f in r['productos_ingresos']],
            [('Empanada', '4.40'), ('Cuaderno', '3.00'), ('Jugo natural', '1.60')],
        )
        self.assertEqual(
            [(f['etiqueta'], f['utilidad_usd'], f['margen_pct']) for f in r['productos_utilidad']],
            [('Empanada', '1.40', '31.82'), ('Cuaderno', '1.00', '33.33')],
        )
        self.assertEqual({f['etiqueta'] for f in r['categorias_ingresos']}, {'Comida', 'Bebidas', 'Útiles'})
        self.assertEqual({f['etiqueta'] for f in r['categorias_utilidad']}, {'Comida', 'Útiles'})


# ─────────────────────────────────────────────
# Comparación con el período anterior
# ─────────────────────────────────────────────
class ResumenComparacionTests(BaseResumen):
    def test_sin_comparar_no_hay_bloque_de_comparacion(self):
        self.assertIsNone(self.resumen()['comparacion'])

    def test_comparacion_con_periodo_anterior_equivalente(self):
        self.crear_venta(self.cajero, None, [(self.empanada, 5, '0.60')], dias_atras=8)  # 5.00 en el período previo
        datos = self.resumen(
            fecha_inicio=(self.hoy - timedelta(days=5)).isoformat(), fecha_fin=self.hoy.isoformat(), comparar='true',
        )
        c = datos['comparacion']
        self.assertEqual(c['periodo'], {
            'fecha_inicio': (self.hoy - timedelta(days=11)).isoformat(),
            'fecha_fin': (self.hoy - timedelta(days=6)).isoformat(),
        })
        ingresos = c['variaciones']['ingresos_netos_usd']
        self.assertEqual(ingresos, {'anterior': '5.00', 'variacion_pct': '280.00'})  # 19.00 vs 5.00
        self.assertEqual(c['variaciones']['ventas_completadas']['variacion_pct'], '300.00')  # 4 vs 1
        self.assertEqual(c['variaciones']['margen_bruto_pct']['variacion_puntos'], '-3.22')  # 36.78 vs 40.00

    def test_sin_base_de_comparacion_la_variacion_es_nula(self):
        c = self.resumen(comparar='true')['comparacion']  # ayer no hubo ventas
        self.assertEqual(c['variaciones']['ingresos_netos_usd'], {'anterior': '0.00', 'variacion_pct': None})
        self.assertNotIn('variacion_puntos', c['variaciones']['margen_bruto_pct'])


# ─────────────────────────────────────────────
# Cuentas por cobrar, inventario y caja
# ─────────────────────────────────────────────
class ResumenOperacionTests(BaseResumen):
    def crear_cxc(self):
        cliente = ClienteCantina.objects.create(nombre='Pedro')
        cargo = CargoCantina.objects.create(
            cliente=cliente, venta=self.v2, area='cantina', monto_usd=Decimal('5.00'), monto_pagado=Decimal('2.00'),
        )
        abono = AbonoCantina.objects.create(
            operacion_uuid=uuid.uuid4(), cliente=cliente, area='cantina', metodo_pago='efectivo',
            monto_usd=Decimal('2.00'), tasa_aplicada=Decimal('36.0000'), monto_ves=Decimal('72.00'),
            cajero=self.cajero,
        )
        AplicacionAbonoCantina.objects.create(abono=abono, cargo=cargo, monto_usd=Decimal('2.00'))
        AbonoCantina.objects.create(  # un abono anulado no cuenta
            operacion_uuid=uuid.uuid4(), cliente=cliente, area='cantina', metodo_pago='efectivo',
            monto_usd=Decimal('9.00'), tasa_aplicada=Decimal('36.0000'), monto_ves=Decimal('324.00'),
            cajero=self.cajero, estatus='anulado',
        )
        return cargo, abono

    def test_cuentas_por_cobrar_y_abonos(self):
        self.crear_cxc()
        k = self.resumen()['kpis']
        self.assertEqual(k['cxc_generadas_cantidad'], 1)
        self.assertEqual(k['cxc_generadas_usd'], '5.00')
        self.assertEqual(k['abonos_recibidos_cantidad'], 1)
        self.assertEqual(k['abonos_recibidos_usd'], '2.00')
        self.assertEqual(k['saldo_cxc_pendiente_usd'], '3.00')

    def test_saldo_cxc_es_historico_a_fecha_fin(self):
        cargo, _ = self.crear_cxc()
        # Cargo creado hace 5 días, pagado hoy: al cierre de hace 3 días seguía pendiente completo (5.00).
        CargoCantina.objects.filter(pk=cargo.pk).update(creado_en=timezone.now() - timedelta(days=5))
        corte = (self.hoy - timedelta(days=3)).isoformat()
        datos = self.resumen(fecha_inicio=(self.hoy - timedelta(days=5)).isoformat(), fecha_fin=corte)
        self.assertEqual(datos['kpis']['saldo_cxc_pendiente_usd'], '5.00')
        self.assertEqual(self.resumen()['kpis']['saldo_cxc_pendiente_usd'], '3.00')

    def test_cuentas_por_cobrar_respetan_area_y_cajero(self):
        self.crear_cxc()
        self.assertEqual(self.resumen(area='libreria')['kpis']['cxc_generadas_usd'], '0.00')
        self.assertEqual(self.resumen(cajero=self.cajero.id)['kpis']['cxc_generadas_usd'], '0.00')  # el cargo es de la venta de Beto
        self.assertEqual(self.resumen(cajero=self.cajero2.id)['kpis']['cxc_generadas_usd'], '5.00')
        self.assertEqual(self.resumen(cajero=self.cajero.id)['kpis']['abonos_recibidos_usd'], '2.00')

    def test_cargos_anulados_no_cuentan(self):
        self.crear_cxc()
        CargoCantina.objects.update(estado='anulado')
        k = self.resumen()['kpis']
        self.assertEqual((k['cxc_generadas_usd'], k['saldo_cxc_pendiente_usd']), ('0.00', '0.00'))

    def test_inventario_y_mermas(self):
        aplicar_movimiento_inventario(self.empanada, 'entrada', 12, usuario=self.cajero)
        aplicar_movimiento_inventario(self.empanada, 'salida', 3, usuario=self.cajero)
        aplicar_movimiento_inventario(self.empanada, 'ajuste', -2, usuario=self.cajero2)
        aplicar_movimiento_inventario(self.empanada, 'merma', 2, motivo='Vencida', usuario=self.cajero)
        aplicar_movimiento_inventario(self.jugo, 'merma', 3, motivo='Dañado', usuario=self.cajero)
        # Cambiar el costo actual después de la merma NO altera el snapshot histórico del movimiento.
        self.empanada.costo = Decimal('5.00')
        self.empanada.save()
        datos = self.resumen()
        self.assertEqual(datos['inventario'], {
            'entradas': 12, 'salidas': 3, 'ajustes': -2, 'mermas': 5,
            'merma_valor_estimado_usd': '1.20',  # 2 × 0.60 (snapshot); el jugo no tiene costo
            'merma_unidades_sin_costo': 3,
        })
        self.assertIn('mermas', self.codigos_alerta(datos))
        self.assertEqual(self.resumen(area='libreria')['inventario']['mermas'], 0)
        self.assertEqual(self.resumen(cajero=self.cajero2.id)['inventario']['ajustes'], -2)

    def test_diferencias_de_caja_relevantes(self):
        for cajero, dif in ((self.cajero, '-4.00'), (self.cajero2, '0.50')):
            CierreCajaCantina.objects.create(
                cajero=cajero, fecha=self.hoy, area='cantina', conteo_fisico=Decimal('10.00'),
                diferencia=Decimal(dif),
            )
        CierreCajaCantina.objects.create(cajero=self.cajero, fecha=self.hoy, area='libreria')  # sin conteo
        datos = self.resumen()
        caja = datos['caja']
        self.assertEqual(
            (caja['cierres'], caja['con_diferencia'], caja['sin_conteo'], caja['tolerancia_usd']), (3, 1, 1, '1.00'),
        )
        self.assertEqual(
            (caja['diferencia_neta_usd'], caja['faltantes_usd'], caja['sobrantes_usd']), ('-3.50', '-4.00', '0.50'),
        )
        self.assertEqual([(d['diferencia_usd'], d['cajero']['id']) for d in caja['detalle']], [('-4.00', self.cajero.id)])
        self.assertLessEqual({'diferencias_caja', 'datos_incompletos'}, self.codigos_alerta(datos))


# ─────────────────────────────────────────────
# Alertas, respuesta vacía y rendimiento
# ─────────────────────────────────────────────
class ResumenAlertasTests(BaseResumen):
    def test_alertas_ordenadas_por_severidad_y_con_forma_estable(self):
        alertas = self.resumen()['alertas']
        orden = {'critica': 0, 'advertencia': 1, 'info': 2}
        self.assertEqual([orden[a['severidad']] for a in alertas], sorted(orden[a['severidad']] for a in alertas))
        for a in alertas:
            self.assertEqual(set(a), {'codigo', 'severidad', 'titulo', 'detalle'})

    def test_descuentos_inusuales_segun_parametro_de_auditoria(self):
        # Escenario base: 1.00 de descuento sobre 10.00 bruto = 10.00% (igual al límite por defecto).
        self.assertIn('descuentos_inusuales', self.codigos_alerta(self.resumen()))
        self.assertNotIn(
            'descuentos_inusuales', self.codigos_alerta(self.resumen(fecha_inicio=(self.hoy - timedelta(days=5)).isoformat())),
        )

    def test_margen_bajo_y_anulaciones_elevadas(self):
        self.crear_venta(self.cajero, self.turno1, [(self.cuaderno, 1, '2.90')], area='libreria')  # margen casi nulo
        VentaCantina.objects.filter(pk=self.v4.pk).update(estado='anulada')
        datos = self.resumen()
        self.assertIn('anulaciones_elevadas', self.codigos_alerta(datos))
        datos = self.resumen(area='libreria')
        self.assertIn('margen_bajo', self.codigos_alerta(datos))


    def test_umbrales_ejecutivos_son_configurables(self):
        parametros = ParametroAuditoriaCantina.obtener()
        parametros.umbral_margen_bajo_pct = Decimal('40.00')
        parametros.save()
        self.assertIn('margen_bajo', self.codigos_alerta(self.resumen()))

    def test_endpoint_cajeros_auditoria(self):
        datos = self.get(URL_CAJEROS)
        ids = {u['id'] for u in datos['results']}
        self.assertLessEqual({self.director.id, self.cajero.id, self.cajero2.id}, ids)
        self.client.force_authenticate(self.cajero)
        self.assertEqual(self.client.get(URL_CAJEROS).status_code, status.HTTP_403_FORBIDDEN)


class ResumenVacioYRendimientoTests(BaseResumen):
    def test_respuesta_vacia_sin_errores(self):
        datos = self.resumen(
            fecha_inicio=(self.hoy - timedelta(days=90)).isoformat(), fecha_fin=(self.hoy - timedelta(days=60)).isoformat(),
            comparar='true',
        )
        self.assertTrue(datos['vacio'])
        k = datos['kpis']
        self.assertEqual((k['ingresos_netos_usd'], k['ventas_completadas'], k['ticket_promedio_usd']), ('0.00', 0, '0.00'))
        self.assertIsNone(k['margen_bruto_pct'])
        self.assertIsNone(k['cobertura_costo_pct'])
        self.assertEqual(len(datos['evolucion_diaria']), 31)
        self.assertEqual(datos['ranking']['productos_ingresos'], [])
        self.assertEqual(datos['sin_costo']['lineas'], [])
        self.assertEqual(datos['alertas'], [])
        self.assertEqual(datos['caja']['detalle'], [])

    def test_numero_de_consultas_no_depende_del_volumen(self):
        self.get(URL, comparar='true')  # calienta cachés (perfil, contenttypes) que no dependen del volumen
        base = self.contar_consultas(URL, comparar='true')
        for i in range(15):
            self.crear_venta(
                self.cajero if i % 2 else self.cajero2, self.turno1, [(self.empanada, 1, '0.60'), (self.jugo, 1, None)],
                area='cantina', es_manual=bool(i % 3),
            )
        con_mas_ventas = self.contar_consultas(URL, comparar='true')
        self.assertEqual(base, con_mas_ventas)
        self.assertLessEqual(con_mas_ventas, 30)
