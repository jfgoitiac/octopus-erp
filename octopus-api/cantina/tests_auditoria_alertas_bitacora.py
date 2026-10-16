"""
Tests del carril B4 de la Auditoría de Cantina: motor de alertas (§6), tarea
Celery, evaluación al cerrar caja, bitácora (§5), alertas, parámetros (§7) y
reapertura de caja (§3 `reabrir/`) — formas de CONTRATO_AUDITORIA_CANTINA.md.
"""
from datetime import datetime, time, timedelta
from decimal import Decimal
from unittest import mock

from django.conf import settings
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from .auditoria.bitacora import registrar_evento
from .auditoria.services_alertas import (
    _regla_cierre_faltante,
    evaluar_alertas,
    evaluar_diferencia_caja,
)
from .auditoria.tasks import evaluar_alertas_auditoria_cantina
from .models import (
    AlertaCantina,
    AperturaCajaCantina,
    CategoriaProducto,
    CierreCajaCantina,
    DetalleVentaCantina,
    EventoAuditoriaCantina,
    ParametroAuditoriaCantina,
    ProductoCantina,
    ReaperturaCajaCantina,
    VentaCantina,
)
from .services_inventario import aplicar_movimiento_inventario
from .tests_auditoria_base import crear_usuario

CLAVES_ALERTA = {
    'id', 'tipo', 'tipo_etiqueta', 'severidad', 'fecha', 'area', 'titulo', 'detalle',
    'referencia_tipo', 'referencia_id', 'estado', 'atendida_por', 'atendida_en', 'nota_atencion',
}
CLAVES_EVENTO = {
    'id', 'tipo', 'tipo_etiqueta', 'creado_en', 'usuario', 'usuario_rol', 'area',
    'objeto_tipo', 'objeto_id', 'objeto_etiqueta', 'antes', 'despues', 'motivo', 'ip',
}
CLAVES_PARAMETROS = {
    'tolerancia_diferencia_caja', 'limite_anulaciones_dia_cajero', 'limite_anulaciones_dia_total',
    'limite_descuentos_dia_cajero', 'limite_descuento_porcentaje', 'hora_tope_cierre',
    'actualizado_por', 'actualizado_en',
}


class BaseAuditoriaB4(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.director = crear_usuario('director_b4', 'director')
        self.cajero = crear_usuario('cajero_b4', 'cajero')
        self.cajero.first_name, self.cajero.last_name = 'Ana', 'Pérez'
        self.cajero.save()
        self.cajero2 = crear_usuario('cajero2_b4', 'cajero')
        self.admin = crear_usuario('admin_b4', 'administrador')
        self.hoy = timezone.localdate()
        self.parametros = ParametroAuditoriaCantina.obtener()
        self.client.force_authenticate(self.director)

        self.categoria = CategoriaProducto.objects.create(nombre='Comida')
        self.empanada = ProductoCantina.objects.create(
            nombre='Empanada', categoria=self.categoria, precio=Decimal('1.00'),
            stock_actual=50, stock_minimo=5,
        )

    def crear_apertura(self, cajero=None, area='cantina', estado='cerrada', monto='20.00'):
        return AperturaCajaCantina.objects.create(
            cajero=cajero or self.cajero, area=area, monto_inicial=Decimal(monto), estado=estado,
            cerrada_en=timezone.now() if estado == 'cerrada' else None,
        )

    def crear_cierre(self, diferencia='-4.00', cajero=None, area='cantina', fecha=None):
        cajero = cajero or self.cajero
        return CierreCajaCantina.objects.create(
            cajero=cajero, apertura=self.crear_apertura(cajero=cajero, area=area), fecha=fecha or self.hoy,
            area=area, conteo_fisico=Decimal('56.00'),
            diferencia=Decimal(diferencia) if diferencia is not None else None,
        )

    def crear_venta(self, total='10.00', estado='completada', cajero=None, descuento='0.00', area='cantina',
                    anulada_por=None):
        cajero = cajero or self.cajero
        datos = dict(
            cajero=cajero, metodo_pago='efectivo', area=area, total_usd=Decimal(total),
            tasa_aplicada=Decimal('36.0000'), total_ves=Decimal(total) * 36, estado=estado,
            descuento_usd=Decimal(descuento),
        )
        if estado == 'anulada':
            datos.update(anulada_en=timezone.now(), anulada_por=anulada_por or cajero, motivo_anulacion='x')
        return VentaCantina.objects.create(**datos)

    def alertas(self, tipo=None):
        qs = AlertaCantina.objects.all()
        return qs.filter(tipo=tipo) if tipo else qs


# ─────────────────────────────────────────────
# §6 Motor de alertas
# ─────────────────────────────────────────────
class ReglaDiferenciaCajaTests(BaseAuditoriaB4):
    def test_dispara_sobre_la_tolerancia(self):
        cierre = self.crear_cierre('-4.00')
        evaluar_alertas()
        alerta = self.alertas('diferencia_caja').get()
        self.assertEqual(alerta.clave_dedupe, f'diferencia_caja:cierre:{cierre.id}:{self.hoy.isoformat()}')
        self.assertEqual(alerta.severidad, 'advertencia')
        self.assertEqual(alerta.titulo, f'Cierre #{cierre.id} con faltante de $4.00')
        self.assertEqual(alerta.detalle['diferencia_usd'], '-4.00')
        self.assertEqual(alerta.detalle['tolerancia_usd'], '1.00')
        self.assertEqual(
            (alerta.referencia_tipo, alerta.referencia_id, alerta.area), ('cierre', str(cierre.id), 'cantina'),
        )

    def test_critica_si_supera_cinco_veces_la_tolerancia(self):
        self.crear_cierre('6.00')
        evaluar_alertas()
        alerta = self.alertas('diferencia_caja').get()
        self.assertEqual(alerta.severidad, 'critica')
        self.assertIn('sobrante', alerta.titulo)

    def test_no_dispara_dentro_de_la_tolerancia_o_sin_conteo(self):
        self.crear_cierre('-1.00')
        self.crear_cierre(None)
        evaluar_alertas()
        self.assertFalse(self.alertas('diferencia_caja').exists())

    def test_signal_evalua_al_cerrar_caja_en_on_commit(self):
        with self.captureOnCommitCallbacks(execute=True) as callbacks:
            cierre = self.crear_cierre('-3.00')
            self.assertFalse(self.alertas('diferencia_caja').exists())  # aún no se confirmó
        self.assertEqual(len(callbacks), 1)
        self.assertEqual(self.alertas('diferencia_caja').get().referencia_id, str(cierre.id))

    def test_signal_no_crea_alerta_si_el_cierre_cuadra(self):
        with self.captureOnCommitCallbacks(execute=True):
            self.crear_cierre('0.00')
        self.assertFalse(self.alertas().exists())

    def test_fallo_del_motor_no_rompe_el_cierre(self):
        with mock.patch('cantina.auditoria.services_alertas.evaluar_diferencia_caja', side_effect=RuntimeError):
            with self.captureOnCommitCallbacks(execute=True):
                cierre = self.crear_cierre('-9.00')
        self.assertTrue(CierreCajaCantina.objects.filter(pk=cierre.pk).exists())


class ReglaAnulacionesTests(BaseAuditoriaB4):
    def test_dispara_por_cajero_sobre_el_limite(self):
        for _ in range(4):
            self.crear_venta(estado='anulada')
        evaluar_alertas()
        alerta = self.alertas('exceso_anulaciones').get()
        self.assertEqual(
            alerta.clave_dedupe, f'exceso_anulaciones:usuario:{self.cajero.id}:{self.hoy.isoformat()}',
        )
        self.assertEqual(alerta.detalle, {'cajero_id': self.cajero.id, 'cantidad': 4, 'limite': 3})
        self.assertIn('Ana Pérez anuló 4 ventas', alerta.titulo)
        self.assertEqual(alerta.area, 'cantina')

    def test_no_dispara_en_el_limite(self):
        for _ in range(3):
            self.crear_venta(estado='anulada')
        self.crear_venta()  # completada no cuenta
        evaluar_alertas()
        self.assertFalse(self.alertas('exceso_anulaciones').exists())

    def test_cuenta_a_quien_anulo_no_al_cajero_de_la_venta(self):
        for _ in range(4):
            self.crear_venta(estado='anulada', anulada_por=self.admin)
        evaluar_alertas()
        self.assertEqual(self.alertas('exceso_anulaciones').get().referencia_id, str(self.admin.id))

    def test_dispara_por_total_del_dia(self):
        self.parametros.limite_anulaciones_dia_total = 4
        self.parametros.save()
        for _ in range(3):
            self.crear_venta(estado='anulada', cajero=self.cajero)
            self.crear_venta(estado='anulada', cajero=self.cajero2, area='libreria')
        evaluar_alertas()
        alerta = self.alertas('exceso_anulaciones').get()
        self.assertEqual(alerta.clave_dedupe, f'exceso_anulaciones:total:-:{self.hoy.isoformat()}')
        self.assertEqual(alerta.detalle, {'cantidad': 6, 'limite': 4})
        self.assertIsNone(alerta.area)  # dos áreas


class ReglaDescuentosTests(BaseAuditoriaB4):
    def test_dispara_por_cantidad_de_descuentos_del_cajero(self):
        for _ in range(6):
            self.crear_venta(total='9.50', descuento='0.50')  # 5 %: bajo el límite de %
        evaluar_alertas()
        alerta = self.alertas('exceso_descuentos').get()
        self.assertEqual(alerta.referencia_tipo, 'usuario')
        self.assertEqual(alerta.detalle['cantidad'], 6)

    def test_no_dispara_en_el_limite_de_cantidad(self):
        for _ in range(5):
            self.crear_venta(total='9.50', descuento='0.50')
        self.crear_venta(total='9.50', descuento='0.50', estado='anulada')  # anulada no cuenta
        evaluar_alertas()
        self.assertFalse(self.alertas('exceso_descuentos').exists())

    def test_dispara_por_porcentaje_de_una_venta(self):
        venta = self.crear_venta(total='8.00', descuento='2.00')  # 20 % del subtotal 10.00
        self.crear_venta(total='9.00', descuento='1.00')  # 10 % exacto: no supera
        evaluar_alertas()
        alerta = self.alertas('exceso_descuentos').get()
        self.assertEqual(alerta.clave_dedupe, f'exceso_descuentos:venta:{venta.id}:{self.hoy.isoformat()}')
        self.assertEqual(alerta.detalle['porcentaje'], '20.00')
        self.assertEqual(alerta.detalle['subtotal_usd'], '10.00')


class ReglaInventarioTests(BaseAuditoriaB4):
    def vender(self, cantidad=2, con_salida=True):
        venta = self.crear_venta(total=str(cantidad))
        DetalleVentaCantina.objects.create(
            venta=venta, producto=self.empanada, cantidad=cantidad,
            precio_unitario=Decimal('1.00'), subtotal=Decimal(cantidad),
        )
        if con_salida:
            aplicar_movimiento_inventario(self.empanada, 'salida', cantidad, venta=venta)
        return venta

    def test_no_dispara_si_todo_cuadra(self):
        aplicar_movimiento_inventario(self.empanada, 'entrada', 10)
        self.vender()
        self.vender()
        evaluar_alertas()
        self.assertFalse(self.alertas('inventario_inconsistente').exists())

    def test_dispara_si_el_stock_salta_entre_movimientos(self):
        aplicar_movimiento_inventario(self.empanada, 'entrada', 10)  # 50 → 60
        ProductoCantina.objects.filter(pk=self.empanada.pk).update(stock_actual=55)  # por fuera
        self.vender()  # 55 → 53
        evaluar_alertas()
        alerta = self.alertas('inventario_inconsistente').get()
        self.assertEqual(alerta.severidad, 'critica')
        self.assertEqual(alerta.referencia_id, str(self.empanada.id))
        self.assertEqual(alerta.detalle['saltos'][0]['stock_esperado'], 60)
        self.assertEqual(alerta.detalle['saltos'][0]['stock_antes'], 55)

    def test_dispara_si_una_venta_no_tiene_su_salida(self):
        venta = self.vender(con_salida=False)
        evaluar_alertas()
        alerta = self.alertas('inventario_inconsistente').get()
        self.assertEqual(alerta.detalle['ventas_sin_salida'], [venta.id])
        self.assertIn('Empanada', alerta.titulo)


class ReglaCierreFaltanteTests(BaseAuditoriaB4):
    def ahora_a(self, hora):
        return timezone.make_aware(datetime.combine(self.hoy, hora))

    def test_dispara_pasada_la_hora_tope(self):
        apertura = self.crear_apertura(estado='abierta')
        resultados = _regla_cierre_faltante(self.hoy, self.parametros, ahora=self.ahora_a(time(18, 30)))
        self.assertEqual(resultados, ['creada'])
        alerta = self.alertas('cierre_faltante').get()
        self.assertEqual(alerta.clave_dedupe, f'cierre_faltante:apertura:{apertura.id}:{self.hoy.isoformat()}')
        self.assertEqual(alerta.detalle['hora_tope'], '18:00')

    def test_no_dispara_antes_de_la_hora_tope(self):
        self.crear_apertura(estado='abierta')
        self.assertEqual(_regla_cierre_faltante(self.hoy, self.parametros, ahora=self.ahora_a(time(8, 0))), [])
        self.assertFalse(self.alertas('cierre_faltante').exists())

    def test_no_dispara_con_las_cajas_cerradas(self):
        self.crear_apertura(estado='cerrada')
        self.assertEqual(_regla_cierre_faltante(self.hoy, self.parametros, ahora=self.ahora_a(time(19, 0))), [])

    def test_dia_pasado_siempre_supero_la_hora_tope(self):
        self.crear_apertura(estado='abierta')
        ayer = self.hoy - timedelta(days=1)
        AperturaCajaCantina.objects.update(fecha_hora_apertura=timezone.now() - timedelta(days=1))
        evaluar_alertas(ayer)
        self.assertTrue(self.alertas('cierre_faltante').filter(fecha=ayer).exists())


class ReglaStockBajoTests(BaseAuditoriaB4):
    def test_dispara_info_para_productos_activos_bajo_el_minimo(self):
        jugo = ProductoCantina.objects.create(
            nombre='Jugo natural', categoria=self.categoria, precio=Decimal('2.00'), stock_actual=2, stock_minimo=5,
        )
        ProductoCantina.objects.create(
            nombre='Inactivo', categoria=self.categoria, precio=Decimal('2.00'), stock_actual=0, stock_minimo=5,
            activo=False,
        )
        evaluar_alertas()
        alerta = self.alertas('stock_bajo_minimo').get()
        self.assertEqual(alerta.severidad, 'info')
        self.assertEqual(alerta.referencia_id, str(jugo.id))
        self.assertEqual(alerta.detalle, {'producto_id': jugo.id, 'stock_actual': 2, 'stock_minimo': 5})

    def test_no_dispara_en_el_minimo(self):
        self.empanada.stock_actual = 5
        self.empanada.save()
        evaluar_alertas()
        self.assertFalse(self.alertas('stock_bajo_minimo').exists())


class IdempotenciaYTareaTests(BaseAuditoriaB4):
    def test_correr_dos_veces_no_duplica(self):
        self.crear_cierre('-4.00')
        primero = evaluar_alertas()
        segundo = evaluar_alertas()
        self.assertEqual(primero['creadas'], 1)
        self.assertEqual(segundo['creadas'], 0)
        self.assertEqual(self.alertas().count(), 1)

    def test_no_reabre_ni_modifica_una_alerta_atendida(self):
        for _ in range(4):
            self.crear_venta(estado='anulada')
        evaluar_alertas()
        alerta = self.alertas('exceso_anulaciones').get()
        alerta.estado, alerta.nota_atencion = 'atendida', 'ok'
        alerta.save()
        self.crear_venta(estado='anulada')
        resumen = evaluar_alertas()
        alerta.refresh_from_db()
        self.assertEqual(alerta.estado, 'atendida')
        self.assertEqual(alerta.detalle['cantidad'], 4)
        self.assertEqual((resumen['creadas'], resumen['actualizadas']), (0, 0))

    def test_refresca_una_alerta_abierta(self):
        for _ in range(4):
            self.crear_venta(estado='anulada')
        evaluar_alertas()
        self.crear_venta(estado='anulada')
        resumen = evaluar_alertas()
        self.assertEqual(resumen['actualizadas'], 1)
        self.assertEqual(self.alertas('exceso_anulaciones').get().detalle['cantidad'], 5)

    def test_evaluar_diferencia_caja_es_idempotente(self):
        cierre = self.crear_cierre('-4.00')
        self.assertEqual(evaluar_diferencia_caja(cierre), 'creada')
        self.assertEqual(evaluar_diferencia_caja(cierre), 'sin_cambios')

    def test_tarea_celery_invocada_directamente(self):
        self.crear_cierre('-4.00')
        resumen = evaluar_alertas_auditoria_cantina()
        self.assertEqual(resumen['fecha'], self.hoy.isoformat())
        self.assertEqual(resumen['por_tipo']['diferencia_caja'], 1)
        self.assertEqual(set(resumen['por_tipo']), {t for t, _ in AlertaCantina.TIPOS})

    def test_tarea_celery_con_fecha_serializada(self):
        ayer = self.hoy - timedelta(days=1)
        self.crear_cierre('-4.00', fecha=ayer)
        resultado = evaluar_alertas_auditoria_cantina.apply(kwargs={'fecha': ayer.isoformat()}).get()
        self.assertEqual(resultado['creadas'], 1)
        self.assertEqual(self.alertas('diferencia_caja').get().fecha, ayer)

    def test_tarea_registrada_en_beat(self):
        entrada = settings.CELERY_BEAT_SCHEDULE['evaluar-alertas-auditoria-cantina']
        self.assertEqual(entrada['task'], evaluar_alertas_auditoria_cantina.name)


# ─────────────────────────────────────────────
# §5 Bitácora
# ─────────────────────────────────────────────
class BitacoraTests(BaseAuditoriaB4):
    url = reverse('cantina:auditoria-bitacora')

    def test_forma_sin_hash_y_etiqueta_legible(self):
        registrar_evento('cambio_precio', objeto=self.empanada, usuario=self.cajero, area='cantina',
                         antes={'precio': '1.00'}, despues={'precio': '1.50'})
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(set(resp.data), {'count', 'next', 'previous', 'results'})
        evento = resp.data['results'][0]
        self.assertEqual(set(evento), CLAVES_EVENTO)
        self.assertNotIn('hash', evento)
        self.assertEqual(evento['objeto_etiqueta'], 'Empanada')
        self.assertEqual(evento['tipo_etiqueta'], 'Cambio de precio o costo')
        self.assertEqual(evento['usuario'], {'id': self.cajero.id, 'nombre': 'Ana Pérez'})

    def test_etiquetas_de_cierre_turno_y_objeto_inexistente(self):
        cierre = self.crear_cierre()
        registrar_evento('cierre_caja', objeto=cierre, usuario=self.cajero)
        registrar_evento('apertura_caja', objeto=cierre.apertura, usuario=self.cajero)
        registrar_evento('venta_manual', objeto_tipo='ventacantina', objeto_id=999, usuario=self.cajero)
        etiquetas = {e['objeto_tipo']: e['objeto_etiqueta'] for e in self.client.get(self.url).data['results']}
        self.assertEqual(etiquetas['cierrecajacantina'], f'Cierre #{cierre.id} · Ana Pérez')
        self.assertEqual(etiquetas['aperturacajacantina'], f'Turno #{cierre.apertura_id} · Ana Pérez')
        self.assertEqual(etiquetas['ventacantina'], 'Venta #999')

    def test_sin_n_mas_1(self):
        def crear_productos(desde, hasta):
            for i in range(desde, hasta):
                p = ProductoCantina.objects.create(nombre=f'P{i}', categoria=self.categoria, precio=Decimal('1'))
                registrar_evento('producto_creado', objeto=p, usuario=self.cajero)

        def consultas():
            with CaptureQueriesContext(connection) as ctx:
                self.assertEqual(self.client.get(self.url).status_code, 200)
            return len(ctx)

        crear_productos(0, 2)
        pocas = consultas()
        crear_productos(2, 8)
        self.assertEqual(consultas(), pocas)

    def test_filtros(self):
        cierre = self.crear_cierre()
        registrar_evento('cambio_precio', objeto=self.empanada, usuario=self.cajero, area='cantina')
        registrar_evento('merma', objeto=self.empanada, usuario=self.cajero2, area='libreria')
        registrar_evento('cierre_caja', objeto=cierre, usuario=self.cajero, area='cantina')

        def tipos(**params):
            resp = self.client.get(self.url, params)
            self.assertEqual(resp.status_code, 200, resp.data)
            return sorted(e['tipo'] for e in resp.data['results'])

        self.assertEqual(tipos(tipo=['cambio_precio', 'merma']), ['cambio_precio', 'merma'])
        self.assertEqual(tipos(tipo='cambio_precio,cierre_caja'), ['cambio_precio', 'cierre_caja'])
        self.assertEqual(tipos(usuario=self.cajero2.id), ['merma'])
        self.assertEqual(tipos(area='libreria'), ['merma'])
        self.assertEqual(tipos(objeto_tipo='cierrecajacantina', objeto_id=cierre.id), ['cierre_caja'])
        self.assertEqual(tipos(objeto_tipo='productocantina'), ['cambio_precio', 'merma'])
        manana = (self.hoy + timedelta(days=1)).isoformat()
        self.assertEqual(tipos(fecha_inicio=manana, fecha_fin=manana), [])

    def test_parametros_invalidos(self):
        for params in ({'tipo': 'inventado'}, {'fecha_inicio': '15-10-2026'}, {'usuario': 'x'},
                       {'area': 'kiosko'}, {'objeto_id': '3'}):
            resp = self.client.get(self.url, params)
            self.assertEqual(resp.status_code, 400, params)
            self.assertIn('error', resp.data)

    def test_verificar_cadena(self):
        registrar_evento('cambio_precio', objeto=self.empanada, usuario=self.cajero)
        resp = self.client.get(reverse('cantina:auditoria-bitacora-verificar'))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data, {'ok': True, 'total': 1, 'primer_error_id': None, 'motivo': ''})


# ─────────────────────────────────────────────
# §6 Alertas (endpoints)
# ─────────────────────────────────────────────
class AlertasEndpointsTests(BaseAuditoriaB4):
    def setUp(self):
        super().setUp()
        self.cierre = self.crear_cierre('-9.00')
        evaluar_alertas()  # solo la diferencia crítica (la empanada está sobre el mínimo)
        self.critica = self.alertas('diferencia_caja').get()
        self.info = AlertaCantina.objects.create(
            tipo='stock_bajo_minimo', severidad='info', fecha=self.hoy - timedelta(days=3), area='libreria',
            titulo='x', clave_dedupe='stock_bajo_minimo:producto:99:antigua',
        )

    def test_listado_forma_y_filtros(self):
        url = reverse('cantina:auditoria-alertas')
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 2)  # sin fechas no filtra por fecha
        self.assertEqual(set(resp.data['results'][0]), CLAVES_ALERTA)
        self.assertEqual(resp.data['results'][0]['tipo_etiqueta'], 'Diferencia de caja')
        self.assertEqual(self.client.get(url, {'tipo': 'stock_bajo_minimo'}).data['count'], 1)
        self.assertEqual(self.client.get(url, {'fecha_inicio': self.hoy.isoformat()}).data['count'], 1)
        self.assertEqual(self.client.get(url, {'area': 'libreria'}).data['count'], 1)
        self.assertEqual(self.client.get(url, {'estado': 'atendida'}).data['count'], 0)
        self.assertEqual(self.client.get(url, {'estado': 'otra'}).status_code, 400)
        self.assertEqual(self.client.get(url, {'tipo': 'otra'}).status_code, 400)

    def test_resumen(self):
        resp = self.client.get(reverse('cantina:auditoria-alertas-resumen'))
        self.assertEqual(resp.data, {'abiertas': 2, 'por_severidad': {'critica': 1, 'advertencia': 0, 'info': 1}})

    def test_atender(self):
        url = reverse('cantina:auditoria-alerta-atender', args=[self.critica.id])
        self.assertEqual(self.client.post(url, {'nota': '  '}, format='json').status_code, 400)
        resp = self.client.post(url, {'nota': 'Conversado con la cajera'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['estado'], 'atendida')
        self.assertEqual(resp.data['atendida_por']['id'], self.director.id)
        self.assertRegex(resp.data['atendida_en'], r'[+-]\d{2}:\d{2}$')
        evento = EventoAuditoriaCantina.objects.get(tipo='alerta_atendida')
        self.assertEqual((evento.objeto_tipo, evento.objeto_id), ('alertacantina', str(self.critica.id)))
        self.assertEqual((evento.antes, evento.despues), ({'estado': 'abierta'}, {'estado': 'atendida'}))
        self.assertEqual(evento.motivo, 'Conversado con la cajera')

        segunda = self.client.post(url, {'nota': 'otra vez'}, format='json')
        self.assertEqual(segunda.status_code, 409)
        self.assertEqual(EventoAuditoriaCantina.objects.filter(tipo='alerta_atendida').count(), 1)
        self.assertEqual(self.client.get(reverse('cantina:auditoria-alertas-resumen')).data['abiertas'], 1)

    def test_atender_inexistente(self):
        url = reverse('cantina:auditoria-alerta-atender', args=[99999])
        self.assertEqual(self.client.post(url, {'nota': 'x'}, format='json').status_code, 404)


# ─────────────────────────────────────────────
# §7 Parámetros
# ─────────────────────────────────────────────
class ParametrosTests(BaseAuditoriaB4):
    url = reverse('cantina:auditoria-parametros')

    def test_get_forma(self):
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(set(resp.data), CLAVES_PARAMETROS)
        self.assertEqual(resp.data['tolerancia_diferencia_caja'], '1.00')
        self.assertEqual(resp.data['limite_descuento_porcentaje'], '10.00')
        self.assertEqual(resp.data['hora_tope_cierre'], '18:00')

    def test_put_actualiza_y_registra_antes_despues(self):
        resp = self.client.put(self.url, {'tolerancia_diferencia_caja': '2.50', 'hora_tope_cierre': '17:30'},
                               format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['tolerancia_diferencia_caja'], '2.50')
        self.assertEqual(resp.data['hora_tope_cierre'], '17:30')
        self.assertEqual(resp.data['actualizado_por']['id'], self.director.id)
        evento = EventoAuditoriaCantina.objects.get(tipo='parametros_auditoria')
        self.assertEqual(evento.antes['tolerancia_diferencia_caja'], '1.00')
        self.assertEqual(evento.despues['tolerancia_diferencia_caja'], '2.50')
        self.assertEqual(evento.despues['hora_tope_cierre'], '17:30')
        self.assertEqual(ParametroAuditoriaCantina.obtener().tolerancia_diferencia_caja, Decimal('2.50'))

    def test_put_sin_cambios_no_registra(self):
        resp = self.client.put(self.url, {'limite_anulaciones_dia_cajero': 3}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(EventoAuditoriaCantina.objects.filter(tipo='parametros_auditoria').exists())

    def test_put_valida_rangos(self):
        for datos in ({'limite_descuento_porcentaje': '150'}, {'tolerancia_diferencia_caja': '-1'},
                      {'limite_anulaciones_dia_cajero': -2}, {'hora_tope_cierre': '25:00'},
                      {'limite_anulaciones_dia_cajero': 20, 'limite_anulaciones_dia_total': 10}):
            resp = self.client.put(self.url, datos, format='json')
            self.assertEqual(resp.status_code, 400, datos)
            self.assertIn('error', resp.data)
        self.assertFalse(EventoAuditoriaCantina.objects.filter(tipo='parametros_auditoria').exists())


# ─────────────────────────────────────────────
# §3 Reapertura de caja
# ─────────────────────────────────────────────
class ReaperturaTests(BaseAuditoriaB4):
    def setUp(self):
        super().setUp()
        self.cierre = self.crear_cierre('-4.00')
        self.url = reverse('cantina:auditoria-cierre-reabrir', args=[self.cierre.id])

    def test_reabre_con_apertura_nueva_sin_tocar_el_cierre(self):
        antes = CierreCajaCantina.objects.filter(pk=self.cierre.pk).values().get()
        resp = self.client.post(self.url, {'motivo': 'Faltó registrar una venta'}, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(set(resp.data), {'reapertura_id', 'apertura_nueva_id'})

        apertura = AperturaCajaCantina.objects.get(pk=resp.data['apertura_nueva_id'])
        self.assertEqual((apertura.cajero, apertura.area, apertura.estado), (self.cajero, 'cantina', 'abierta'))
        self.assertEqual(apertura.monto_inicial, Decimal('20.00'))  # el de la apertura original
        reapertura = ReaperturaCajaCantina.objects.get(pk=resp.data['reapertura_id'])
        self.assertEqual((reapertura.cierre_original, reapertura.apertura_nueva), (self.cierre, apertura))
        self.assertEqual(reapertura.autorizado_por, self.director)
        self.assertEqual(CierreCajaCantina.objects.filter(pk=self.cierre.pk).values().get(), antes)

        evento = EventoAuditoriaCantina.objects.get(tipo='reapertura_caja')
        self.assertEqual((evento.objeto_tipo, evento.objeto_id), ('reaperturacajacantina', str(reapertura.id)))
        self.assertEqual(evento.antes, {'cierre_id': self.cierre.id, 'apertura_id': self.cierre.apertura_id})
        self.assertEqual(evento.despues, {'apertura_nueva_id': apertura.id})
        self.assertEqual(evento.motivo, 'Faltó registrar una venta')
        self.assertTrue(EventoAuditoriaCantina.objects.filter(
            tipo='apertura_caja', objeto_tipo='aperturacajacantina', objeto_id=str(apertura.id)).exists())

        # Integración con B2: el cierre figura reabierto y su historial muestra la reapertura.
        detalle = self.client.get(reverse('cantina:auditoria-cierre-detalle', args=[self.cierre.id])).data
        self.assertTrue(detalle['fue_reabierto'])
        historial = self.client.get(reverse('cantina:auditoria-cierre-historial', args=[self.cierre.id])).data
        self.assertIn('reapertura_caja', [e['tipo'] for e in historial])

    def test_monto_inicial_explicito(self):
        resp = self.client.post(self.url, {'motivo': 'x', 'monto_inicial': '35.5'}, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(
            AperturaCajaCantina.objects.get(pk=resp.data['apertura_nueva_id']).monto_inicial, Decimal('35.50'),
        )

    def test_monto_inicial_invalido(self):
        for monto in ('-1', 'abc'):
            resp = self.client.post(self.url, {'motivo': 'x', 'monto_inicial': monto}, format='json')
            self.assertEqual(resp.status_code, 400, monto)

    def test_motivo_obligatorio(self):
        resp = self.client.post(self.url, {'motivo': ''}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(ReaperturaCajaCantina.objects.exists())

    def test_409_si_el_cajero_ya_tiene_caja_abierta(self):
        self.crear_apertura(estado='abierta')
        resp = self.client.post(self.url, {'motivo': 'x'}, format='json')
        self.assertEqual(resp.status_code, 409)
        self.assertFalse(ReaperturaCajaCantina.objects.exists())
        self.assertFalse(EventoAuditoriaCantina.objects.filter(tipo='reapertura_caja').exists())

    def test_409_si_el_area_llego_al_maximo(self):
        for i in range(AperturaCajaCantina.MAX_APERTURAS_SIMULTANEAS):
            self.crear_apertura(cajero=crear_usuario(f'otro_b4_{i}', 'cajero'), estado='abierta')
        self.assertEqual(self.client.post(self.url, {'motivo': 'x'}, format='json').status_code, 409)
        self.assertFalse(ReaperturaCajaCantina.objects.exists())

    def test_cierre_inexistente(self):
        url = reverse('cantina:auditoria-cierre-reabrir', args=[99999])
        self.assertEqual(self.client.post(url, {'motivo': 'x'}, format='json').status_code, 404)


# ─────────────────────────────────────────────
# Permisos
# ─────────────────────────────────────────────
class PermisosB4Tests(BaseAuditoriaB4):
    def test_administrador_puede_reabrir_pero_no_ver_bitacora_alertas_ni_parametros(self):
        cierre = self.crear_cierre()
        self.client.force_authenticate(self.admin)
        resp = self.client.post(reverse('cantina:auditoria-cierre-reabrir', args=[cierre.id]),
                                {'motivo': 'Autorizado por administración'}, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(ReaperturaCajaCantina.objects.get().autorizado_por, self.admin)
        alerta = AlertaCantina.objects.create(tipo='diferencia_caja', fecha=self.hoy, titulo='x', clave_dedupe='x')
        for metodo, url in (
            ('get', reverse('cantina:auditoria-bitacora')),
            ('get', reverse('cantina:auditoria-bitacora-verificar')),
            ('get', reverse('cantina:auditoria-alertas')),
            ('get', reverse('cantina:auditoria-alertas-resumen')),
            ('post', reverse('cantina:auditoria-alerta-atender', args=[alerta.id])),
            ('get', reverse('cantina:auditoria-parametros')),
            ('put', reverse('cantina:auditoria-parametros')),
        ):
            self.assertEqual(getattr(self.client, metodo)(url, {}, format='json').status_code, 403, url)

    def test_cajero_no_puede_reabrir(self):
        cierre = self.crear_cierre()
        self.client.force_authenticate(self.cajero)
        resp = self.client.post(reverse('cantina:auditoria-cierre-reabrir', args=[cierre.id]),
                                {'motivo': 'x'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_anonimo(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(reverse('cantina:auditoria-bitacora')).status_code, (401, 403))
