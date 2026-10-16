"""
Tests del carril B2 de la Auditoría de Cantina: panel ejecutivo (§2) y
cierres diarios con su revisión, adjuntos e historial (§3) — formas exactas
de CONTRATO_AUDITORIA_CANTINA.md.
"""
import shutil
import tempfile
from datetime import timedelta
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from .auditoria.bitacora import registrar_evento
from .models import (
    AdjuntoRevision,
    AlertaCantina,
    AperturaCajaCantina,
    CategoriaProducto,
    CierreCajaCantina,
    DetalleVentaCantina,
    EventoAuditoriaCantina,
    ProductoCantina,
    RevisionCierre,
    VentaCantina,
)
from .tests_auditoria_base import crear_usuario

CLAVES_FILA = {
    'id', 'fecha', 'area', 'cajero', 'turno', 'total_ventas_usd', 'esperado_efectivo_usd',
    'conteo_fisico_usd', 'diferencia_usd', 'estado_revision', 'revisado_por', 'revisado_en',
    'tiene_adjuntos', 'fue_reabierto',
}
CLAVES_DETALLE = CLAVES_FILA | {
    'monto_inicial_usd', 'totales_por_metodo', 'observaciones_cajero', 'revision',
    'adjuntos', 'reaperturas', 'resumen_ventas',
}
CLAVES_EVENTO = {
    'id', 'tipo', 'tipo_etiqueta', 'creado_en', 'usuario', 'usuario_rol', 'area',
    'objeto_tipo', 'objeto_id', 'objeto_etiqueta', 'antes', 'despues', 'motivo', 'ip',
}


class BaseAuditoriaB2(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.director = crear_usuario('director_b2', 'director')
        self.director.first_name, self.director.last_name = 'Dora', 'Directora'
        self.director.save()
        self.cajero = crear_usuario('cajero_b2', 'cajero')
        self.cajero.first_name, self.cajero.last_name = 'Ana', 'Pérez'
        self.cajero.save()
        self.admin = crear_usuario('admin_b2', 'administrador')
        self.hoy = timezone.localdate()
        self.client.force_authenticate(self.director)

        self.categoria = CategoriaProducto.objects.create(nombre='Comida')
        self.empanada = ProductoCantina.objects.create(
            nombre='Empanada', categoria=self.categoria, precio=Decimal('1.00'),
            stock_actual=50, stock_minimo=5,
        )
        self.jugo = ProductoCantina.objects.create(
            nombre='Jugo natural', categoria=self.categoria, precio=Decimal('2.00'),
            stock_actual=2, stock_minimo=5,
        )

    def crear_apertura(self, cajero=None, area='cantina', monto_inicial='20.00', estado='cerrada'):
        return AperturaCajaCantina.objects.create(
            cajero=cajero or self.cajero, area=area, monto_inicial=Decimal(monto_inicial), estado=estado,
            cerrada_en=timezone.now() if estado == 'cerrada' else None,
        )

    def crear_cierre(self, apertura=None, fecha=None, conteo='56.00', diferencia='-4.00', area='cantina',
                     cajero=None, **extra):
        cajero = cajero or self.cajero
        apertura = apertura or self.crear_apertura(cajero=cajero, area=area)
        datos = dict(
            cajero=cajero, apertura=apertura, fecha=fecha or self.hoy, area=area,
            total_ventas=Decimal('182.50'), total_efectivo=Decimal('40.00'),
            conteo_fisico=Decimal(conteo) if conteo is not None else None,
            diferencia=Decimal(diferencia) if diferencia is not None else None,
            totales_por_metodo={
                'efectivo': {'ventas': '40.00', 'abonos': '0.00', 'recargas': '0.00',
                             'total_usd': '40.00', 'total_ves': '1440.00'},
                'pago_movil': {'ventas': '62.50', 'abonos': '5.00', 'recargas': '15.00',
                               'total_usd': '82.50', 'total_ves': '2970.00'},
            },
            observaciones='Faltó sencillo',
        )
        datos.update(extra)
        return CierreCajaCantina.objects.create(**datos)

    def crear_venta(self, total='10.00', estado='completada', apertura=None, area='cantina', dias_atras=0,
                    producto=None, cantidad=1, **extra):
        venta = VentaCantina.objects.create(
            cajero=self.cajero, apertura=apertura, metodo_pago='efectivo', area=area,
            total_usd=Decimal(total), tasa_aplicada=Decimal('36.0000'),
            total_ves=Decimal(total) * 36, estado=estado, **extra,
        )
        if producto is not None:
            DetalleVentaCantina.objects.create(
                venta=venta, producto=producto, cantidad=cantidad,
                precio_unitario=producto.precio, subtotal=producto.precio * cantidad,
            )
        if dias_atras:
            VentaCantina.objects.filter(pk=venta.pk).update(creado_en=timezone.now() - timedelta(days=dias_atras))
        return venta


# ─────────────────────────────────────────────
# §2 Panel ejecutivo
# ─────────────────────────────────────────────
class PanelEjecutivoTests(BaseAuditoriaB2):
    url = reverse('cantina:auditoria-panel')

    def test_forma_de_la_respuesta(self):
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(set(resp.data), {
            'generado_en', 'ventas', 'caja_hoy', 'diferencias_pendientes', 'top_productos',
            'bajo_inventario', 'alertas',
        })
        self.assertEqual(set(resp.data['ventas']), {'hoy', 'semana', 'mes'})
        for periodo in resp.data['ventas'].values():
            self.assertEqual(set(periodo), {'total_usd', 'cantidad', 'variacion_pct'})
        self.assertEqual(set(resp.data['caja_hoy']), {
            'esperado_usd', 'reportado_usd', 'diferencia_usd', 'cajas_abiertas', 'cierres_realizados',
        })
        self.assertEqual(set(resp.data['diferencias_pendientes']), {'cantidad', 'monto_total_usd', 'cierres'})
        self.assertEqual(set(resp.data['alertas']), {'abiertas', 'recientes'})
        self.assertRegex(resp.data['generado_en'], r'[+-]\d{2}:\d{2}$')

    def test_ventas_de_hoy_con_variacion_contra_ayer(self):
        self.crear_venta('30.00')
        self.crear_venta('20.00')
        self.crear_venta('99.00', estado='anulada')  # no cuenta
        self.crear_venta('40.00', dias_atras=1)
        hoy = self.client.get(self.url).data['ventas']['hoy']
        self.assertEqual(hoy, {'total_usd': '50.00', 'cantidad': 2, 'variacion_pct': '25.00'})

    def test_variacion_nula_si_el_periodo_anterior_es_cero(self):
        self.crear_venta('5.00')
        self.assertIsNone(self.client.get(self.url).data['ventas']['hoy']['variacion_pct'])

    def test_caja_hoy_esperado_vs_reportado(self):
        # esperado = conteo − diferencia: 56 − (−4) = 60 y 30 − 0 = 30.
        self.crear_cierre(conteo='56.00', diferencia='-4.00')
        otro = crear_usuario('cajero_b2_2', 'cajero')
        self.crear_cierre(cajero=otro, conteo='30.00', diferencia='0.00')
        self.crear_cierre(fecha=self.hoy - timedelta(days=1))  # de ayer: no cuenta
        self.crear_apertura(estado='abierta')
        caja = self.client.get(self.url).data['caja_hoy']
        self.assertEqual(caja, {
            'esperado_usd': '90.00', 'reportado_usd': '86.00', 'diferencia_usd': '-4.00',
            'cajas_abiertas': 1, 'cierres_realizados': 2,
        })

    def test_diferencias_pendientes_excluye_aprobados_y_sin_diferencia(self):
        pendiente = self.crear_cierre(diferencia='-4.00')
        observado = self.crear_cierre(diferencia='-2.25', fecha=self.hoy - timedelta(days=1))
        RevisionCierre.objects.filter(cierre=observado).update(estado='observado')
        aprobado = self.crear_cierre(diferencia='-1.00')
        RevisionCierre.objects.filter(cierre=aprobado).update(estado='aprobado')
        self.crear_cierre(diferencia='0.00')
        dif = self.client.get(self.url).data['diferencias_pendientes']
        self.assertEqual(dif['cantidad'], 2)
        self.assertEqual(dif['monto_total_usd'], '-6.25')
        self.assertEqual([c['id'] for c in dif['cierres']], [pendiente.id, observado.id])
        self.assertEqual(dif['cierres'][0], {
            'id': pendiente.id, 'fecha': self.hoy.isoformat(),
            'cajero': {'id': self.cajero.id, 'nombre': 'Ana Pérez'},
            'diferencia_usd': '-4.00', 'estado_revision': 'pendiente',
        })

    def test_top_productos_y_bajo_inventario(self):
        self.crear_venta('3.00', producto=self.empanada, cantidad=3)
        self.crear_venta('4.00', producto=self.jugo, cantidad=2)
        self.crear_venta('9.00', producto=self.jugo, cantidad=9, estado='anulada')
        data = self.client.get(self.url).data
        self.assertEqual(data['top_productos'], [
            {'producto_id': self.empanada.id, 'nombre': 'Empanada', 'cantidad': 3, 'total_usd': '3.00'},
            {'producto_id': self.jugo.id, 'nombre': 'Jugo natural', 'cantidad': 2, 'total_usd': '4.00'},
        ])
        self.assertEqual(data['bajo_inventario'], [
            {'producto_id': self.jugo.id, 'nombre': 'Jugo natural', 'stock_actual': 2, 'stock_minimo': 5,
             'area': 'cantina'},
        ])

    def test_alertas_abiertas_y_recientes(self):
        AlertaCantina.objects.create(
            tipo='exceso_anulaciones', severidad='advertencia', fecha=self.hoy, area='cantina',
            titulo='Ana Pérez anuló 5 ventas hoy', clave_dedupe='a1',
        )
        AlertaCantina.objects.create(
            tipo='stock_bajo_minimo', severidad='info', fecha=self.hoy, area='libreria',
            titulo='Cuaderno bajo el mínimo', clave_dedupe='a2',
        )
        AlertaCantina.objects.create(
            tipo='diferencia_caja', severidad='critica', fecha=self.hoy, titulo='Atendida',
            clave_dedupe='a3', estado='atendida',
        )
        alertas = self.client.get(self.url).data['alertas']
        self.assertEqual(alertas['abiertas'], 2)
        self.assertEqual(set(alertas['recientes'][0]), {'id', 'tipo', 'severidad', 'titulo', 'fecha'})
        self.assertEqual(self.client.get(self.url, {'area': 'cantina'}).data['alertas']['abiertas'], 1)

    def test_filtro_de_area(self):
        self.crear_venta('10.00', area='cantina')
        self.crear_venta('7.00', area='libreria')
        self.assertEqual(self.client.get(self.url).data['ventas']['hoy']['total_usd'], '17.00')
        self.assertEqual(
            self.client.get(self.url, {'area': 'libreria'}).data['ventas']['hoy']['total_usd'], '7.00',
        )
        self.assertEqual(self.client.get(self.url, {'area': 'libreria'}).data['bajo_inventario'], [])

    def test_area_invalida_400(self):
        resp = self.client.get(self.url, {'area': 'kiosco'})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', resp.data)


# ─────────────────────────────────────────────
# §3 Listado y detalle de cierres
# ─────────────────────────────────────────────
class CierresListadoTests(BaseAuditoriaB2):
    url = reverse('cantina:auditoria-cierres')

    def test_forma_paginada_y_fila(self):
        cierre = self.crear_cierre()
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(set(resp.data), {'count', 'next', 'previous', 'results'})
        fila = resp.data['results'][0]
        self.assertEqual(set(fila), CLAVES_FILA)
        self.assertEqual(fila['id'], cierre.id)
        self.assertEqual(fila['cajero'], {'id': self.cajero.id, 'nombre': 'Ana Pérez'})
        self.assertEqual(set(fila['turno']), {'apertura_id', 'etiqueta', 'inicio', 'fin'})
        self.assertTrue(fila['turno']['etiqueta'].startswith(f'Turno #{cierre.apertura_id} · '))
        self.assertEqual(fila['total_ventas_usd'], '182.50')
        self.assertEqual(fila['esperado_efectivo_usd'], '60.00')
        self.assertEqual(fila['conteo_fisico_usd'], '56.00')
        self.assertEqual(fila['diferencia_usd'], '-4.00')
        self.assertEqual(fila['estado_revision'], 'pendiente')
        self.assertIsNone(fila['revisado_por'])
        self.assertFalse(fila['tiene_adjuntos'])
        self.assertFalse(fila['fue_reabierto'])

    def test_sin_fechas_devuelve_solo_hoy_y_filtra_por_rango(self):
        hoy = self.crear_cierre()
        ayer = self.crear_cierre(fecha=self.hoy - timedelta(days=1))
        ids = [f['id'] for f in self.client.get(self.url).data['results']]
        self.assertEqual(ids, [hoy.id])
        rango = {'fecha_inicio': (self.hoy - timedelta(days=1)).isoformat(), 'fecha_fin': self.hoy.isoformat()}
        ids = [f['id'] for f in self.client.get(self.url, rango).data['results']]
        self.assertEqual(ids, [hoy.id, ayer.id])

    def test_filtros_cajero_area_apertura_estado_y_diferencia(self):
        otro = crear_usuario('cajero_b2_3', 'cajero')
        c1 = self.crear_cierre(diferencia='-4.00')
        c2 = self.crear_cierre(cajero=otro, area='libreria', diferencia='0.00')
        RevisionCierre.objects.filter(cierre=c2).update(estado='aprobado')

        def ids(**params):
            return [f['id'] for f in self.client.get(self.url, params).data['results']]

        self.assertEqual(ids(cajero=otro.id), [c2.id])
        self.assertEqual(ids(area='cantina'), [c1.id])
        self.assertEqual(ids(apertura=c2.apertura_id), [c2.id])
        self.assertEqual(ids(estado='aprobado'), [c2.id])
        self.assertEqual(ids(estado='pendiente'), [c1.id])
        self.assertEqual(ids(con_diferencia='true'), [c1.id])

    def test_parametros_invalidos_400(self):
        for params in ({'estado': 'cerrado'}, {'fecha_inicio': '15-10-2026'}, {'cajero': 'ana'},
                       {'area': 'kiosco'}):
            resp = self.client.get(self.url, params)
            self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, params)
            self.assertIn('error', resp.data)

    def test_paginacion(self):
        for _ in range(3):
            self.crear_cierre()
        resp = self.client.get(self.url, {'page_size': 2})
        self.assertEqual(resp.data['count'], 3)
        self.assertEqual(len(resp.data['results']), 2)
        self.assertIsNotNone(resp.data['next'])

    def test_cierre_antiguo_sin_revision_la_obtiene_pendiente(self):
        cierre = self.crear_cierre()
        RevisionCierre.objects.filter(cierre=cierre).delete()
        resp = self.client.get(self.url, {'estado': 'pendiente'})
        self.assertEqual([f['id'] for f in resp.data['results']], [cierre.id])
        self.assertEqual(RevisionCierre.objects.get(cierre=cierre).estado, 'pendiente')

    def test_sin_n_mas_1(self):
        for _ in range(5):
            self.crear_cierre()
        # Consultas fijas: revisiones faltantes, count y página (la fila no
        # dispara consultas por cierre).
        with self.assertNumQueries(3):
            self.client.get(self.url)


class CierreDetalleTests(BaseAuditoriaB2):
    def url(self, cierre_id):
        return reverse('cantina:auditoria-cierre-detalle', kwargs={'pk': cierre_id})

    def test_forma_del_detalle(self):
        cierre = self.crear_cierre()
        self.crear_venta('5.00', apertura=cierre.apertura)
        self.crear_venta('3.00', apertura=cierre.apertura, estado='anulada')
        self.crear_venta('4.00', apertura=cierre.apertura, descuento_usd=Decimal('1.00'), motivo_descuento='x')
        self.crear_venta('2.00', apertura=cierre.apertura, es_manual=True, origen_producto='manual')
        self.crear_venta('8.00')  # otra apertura: no cuenta

        resp = self.client.get(self.url(cierre.id))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.data
        self.assertEqual(set(data), CLAVES_DETALLE)
        self.assertEqual(data['monto_inicial_usd'], '20.00')
        self.assertEqual(data['observaciones_cajero'], 'Faltó sencillo')
        self.assertEqual(data['totales_por_metodo'], [
            {'metodo': 'efectivo', 'etiqueta': 'Efectivo Divisas', 'ventas_usd': '40.00',
             'recargas_usd': '0.00', 'abonos_usd': '0.00', 'total_usd': '40.00'},
            {'metodo': 'pago_movil', 'etiqueta': 'Pago Móvil', 'ventas_usd': '62.50',
             'recargas_usd': '15.00', 'abonos_usd': '5.00', 'total_usd': '82.50'},
        ])
        self.assertEqual(data['revision'], {
            'estado': 'pendiente', 'comentario_director': '', 'revisado_por': None, 'revisado_en': None,
            'transiciones_permitidas': ['revisado', 'aprobado', 'observado'],
        })
        self.assertEqual(data['adjuntos'], [])
        self.assertEqual(data['reaperturas'], [])
        self.assertEqual(data['resumen_ventas'], {'cantidad': 3, 'anuladas': 1, 'con_descuento': 1, 'manuales': 1})

    def test_inexistente_404(self):
        self.assertEqual(self.client.get(self.url(9999)).status_code, status.HTTP_404_NOT_FOUND)

    def test_cierre_antiguo_sin_revision_get_or_create(self):
        cierre = self.crear_cierre()
        RevisionCierre.objects.filter(cierre=cierre).delete()
        resp = self.client.get(self.url(cierre.id))
        self.assertEqual(resp.data['revision']['estado'], 'pendiente')
        self.assertTrue(RevisionCierre.objects.filter(cierre=cierre).exists())


# ─────────────────────────────────────────────
# §3 Revisión
# ─────────────────────────────────────────────
class RevisarCierreTests(BaseAuditoriaB2):
    def setUp(self):
        super().setUp()
        self.cierre = self.crear_cierre()
        self.url = reverse('cantina:auditoria-cierre-revision', kwargs={'pk': self.cierre.id})

    def revisar(self, estado, comentario=None):
        body = {'estado': estado}
        if comentario is not None:
            body['comentario'] = comentario
        return self.client.post(self.url, body, format='json')

    def test_observar_con_comentario_devuelve_detalle_y_registra_evento(self):
        resp = self.revisar('observado', 'Justificar faltante')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(set(resp.data), CLAVES_DETALLE)
        self.assertEqual(resp.data['estado_revision'], 'observado')
        self.assertEqual(resp.data['revision']['comentario_director'], 'Justificar faltante')
        self.assertEqual(resp.data['revision']['revisado_por'], {'id': self.director.id, 'nombre': 'Dora Directora'})
        self.assertEqual(resp.data['revision']['transiciones_permitidas'], ['revisado', 'aprobado'])

        evento = EventoAuditoriaCantina.objects.get(tipo='revision_cierre')
        self.assertEqual(evento.objeto_tipo, 'cierrecajacantina')
        self.assertEqual(evento.objeto_id, str(self.cierre.id))
        self.assertEqual(evento.antes, {'estado': 'pendiente'})
        self.assertEqual(evento.despues, {'estado': 'observado'})
        self.assertEqual(evento.motivo, 'Justificar faltante')
        self.assertEqual(evento.usuario, self.director)
        self.assertEqual(evento.area, 'cantina')

    def test_observado_sin_comentario_400_sin_evento(self):
        resp = self.revisar('observado', '  ')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', resp.data)
        self.assertEqual(RevisionCierre.objects.get(cierre=self.cierre).estado, 'pendiente')
        self.assertFalse(EventoAuditoriaCantina.objects.exists())

    def test_cadena_valida_de_transiciones(self):
        for estado in ('revisado', 'observado', 'revisado', 'aprobado'):
            comentario = 'Ver vueltos' if estado == 'observado' else None
            self.assertEqual(self.revisar(estado, comentario).status_code, status.HTTP_200_OK, estado)
        self.assertEqual(EventoAuditoriaCantina.objects.filter(tipo='revision_cierre').count(), 4)

    def test_transicion_invalida_409(self):
        self.assertEqual(self.revisar('aprobado').status_code, status.HTTP_200_OK)
        resp = self.revisar('observado', 'Tarde')
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertIn('error', resp.data)
        self.assertEqual(self.revisar('pendiente').status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(EventoAuditoriaCantina.objects.filter(tipo='revision_cierre').count(), 1)

    def test_mismo_estado_409(self):
        self.assertEqual(self.revisar('pendiente').status_code, status.HTTP_409_CONFLICT)

    def test_estado_desconocido_400(self):
        self.assertEqual(self.revisar('cerrado').status_code, status.HTTP_400_BAD_REQUEST)

    def test_cierre_inexistente_404(self):
        url = reverse('cantina:auditoria-cierre-revision', kwargs={'pk': 9999})
        resp = self.client.post(url, {'estado': 'aprobado'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


# ─────────────────────────────────────────────
# §3 Adjuntos
# ─────────────────────────────────────────────
class AdjuntosCierreTests(BaseAuditoriaB2):
    def setUp(self):
        super().setUp()
        self.media = tempfile.mkdtemp()
        self.override = override_settings(MEDIA_ROOT=self.media)
        self.override.enable()
        self.cierre = self.crear_cierre()
        self.url = reverse('cantina:auditoria-cierre-adjuntos', kwargs={'pk': self.cierre.id})

    def tearDown(self):
        self.override.disable()
        shutil.rmtree(self.media, ignore_errors=True)
        super().tearDown()

    def subir(self, nombre='acta.pdf', contenido=b'%PDF-1.4 acta', tipo='application/pdf', **extra):
        datos = {'archivo': SimpleUploadedFile(nombre, contenido, content_type=tipo), **extra}
        return self.client.post(self.url, datos, format='multipart')

    def test_sube_pdf_201_y_registra_evento(self):
        resp = self.subir(descripcion='Acta firmada')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(set(resp.data), {
            'id', 'nombre', 'url', 'tipo_mime', 'tamano_bytes', 'descripcion', 'subido_por', 'subido_en',
            'reemplaza_a',
        })
        self.assertEqual(resp.data['nombre'], 'acta.pdf')
        self.assertEqual(resp.data['tipo_mime'], 'application/pdf')
        self.assertEqual(resp.data['tamano_bytes'], len(b'%PDF-1.4 acta'))
        self.assertTrue(resp.data['url'].startswith('/media/cantina/auditoria/adjuntos/'))
        self.assertEqual(resp.data['subido_por'], {'id': self.director.id, 'nombre': 'Dora Directora'})
        self.assertIsNone(resp.data['reemplaza_a'])

        evento = EventoAuditoriaCantina.objects.get(tipo='adjunto_cierre')
        self.assertEqual(evento.objeto_id, str(self.cierre.id))
        self.assertEqual(evento.despues, {'adjunto_id': resp.data['id'], 'nombre': 'acta.pdf'})
        self.assertEqual(evento.motivo, 'Acta firmada')

        detalle = self.client.get(reverse('cantina:auditoria-cierre-detalle', kwargs={'pk': self.cierre.id}))
        self.assertTrue(detalle.data['tiene_adjuntos'])
        self.assertEqual([a['id'] for a in detalle.data['adjuntos']], [resp.data['id']])

    def test_extension_invalida_400(self):
        resp = self.subir('script.exe', b'MZ', 'application/octet-stream')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', resp.data)
        self.assertFalse(AdjuntoRevision.objects.exists())
        self.assertFalse(EventoAuditoriaCantina.objects.exists())

    def test_tamano_excedido_400(self):
        resp = self.subir('foto.jpg', b'0' * (5 * 1024 * 1024 + 1), 'image/jpeg')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(AdjuntoRevision.objects.exists())

    def test_sin_archivo_400(self):
        resp = self.client.post(self.url, {'descripcion': 'x'}, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reemplazo_no_borra_y_solo_una_vez(self):
        original = self.subir().data['id']
        resp = self.subir('acta-v2.pdf', reemplaza_a=original)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data['reemplaza_a'], original)
        self.assertEqual(AdjuntoRevision.objects.count(), 2)
        # El original ya fue reemplazado: no se puede volver a reemplazar.
        self.assertEqual(self.subir('acta-v3.pdf', reemplaza_a=original).status_code, status.HTTP_400_BAD_REQUEST)

    def test_reemplazo_de_otro_cierre_400(self):
        otro = self.crear_cierre()
        url_otro = reverse('cantina:auditoria-cierre-adjuntos', kwargs={'pk': otro.id})
        ajeno = self.client.post(
            url_otro, {'archivo': SimpleUploadedFile('a.pdf', b'%PDF', content_type='application/pdf')},
            format='multipart',
        ).data['id']
        self.assertEqual(self.subir(reemplaza_a=ajeno).status_code, status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────
# §3 Historial
# ─────────────────────────────────────────────
class HistorialCierreTests(BaseAuditoriaB2):
    def test_eventos_del_cierre_y_su_apertura_en_orden(self):
        cierre = self.crear_cierre()
        otro_cierre = self.crear_cierre()
        registrar_evento('apertura_caja', objeto=cierre.apertura, usuario=self.cajero, area='cantina',
                         despues={'monto_inicial': '20.00', 'area': 'cantina'})
        registrar_evento('cierre_caja', objeto=cierre, usuario=self.cajero, area='cantina')
        registrar_evento('cierre_caja', objeto=otro_cierre, usuario=self.cajero, area='cantina')
        registrar_evento('cambio_precio', objeto=self.jugo, usuario=self.cajero)
        self.client.post(
            reverse('cantina:auditoria-cierre-revision', kwargs={'pk': cierre.id}),
            {'estado': 'revisado'}, format='json',
        )

        resp = self.client.get(reverse('cantina:auditoria-cierre-historial', kwargs={'pk': cierre.id}))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual([e['tipo'] for e in resp.data], ['apertura_caja', 'cierre_caja', 'revision_cierre'])
        evento = resp.data[2]
        self.assertEqual(set(evento), CLAVES_EVENTO)
        self.assertEqual(evento['tipo_etiqueta'], 'Revisión de cierre')
        self.assertEqual(evento['usuario'], {'id': self.director.id, 'nombre': 'Dora Directora'})
        self.assertEqual(evento['usuario_rol'], 'director')
        self.assertEqual(evento['objeto_etiqueta'], f'Cierre #{cierre.id}')
        self.assertEqual(resp.data[0]['objeto_etiqueta'], f'Turno #{cierre.apertura_id}')

    def test_inexistente_404(self):
        resp = self.client.get(reverse('cantina:auditoria-cierre-historial', kwargs={'pk': 9999}))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


# ─────────────────────────────────────────────
# Permisos: solo el Director
# ─────────────────────────────────────────────
class PermisosB2Tests(BaseAuditoriaB2):
    def test_administrador_y_cajero_reciben_403(self):
        cierre = self.crear_cierre()
        gets = [
            reverse('cantina:auditoria-panel'),
            reverse('cantina:auditoria-cierres'),
            reverse('cantina:auditoria-cierre-detalle', kwargs={'pk': cierre.id}),
            reverse('cantina:auditoria-cierre-historial', kwargs={'pk': cierre.id}),
        ]
        posts = [
            (reverse('cantina:auditoria-cierre-revision', kwargs={'pk': cierre.id}), {'estado': 'aprobado'}),
            (reverse('cantina:auditoria-cierre-adjuntos', kwargs={'pk': cierre.id}), {}),
        ]
        for usuario in (self.admin, self.cajero):
            self.client.force_authenticate(usuario)
            for url in gets:
                self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN, url)
            for url, body in posts:
                self.assertEqual(self.client.post(url, body).status_code, status.HTTP_403_FORBIDDEN, url)
        self.assertEqual(RevisionCierre.objects.get(cierre=cierre).estado, 'pendiente')
        self.assertFalse(EventoAuditoriaCantina.objects.exists())

    def test_no_hay_delete(self):
        cierre = self.crear_cierre()
        url = reverse('cantina:auditoria-cierre-detalle', kwargs={'pk': cierre.id})
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
