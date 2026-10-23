"""
Tests de las correcciones del Director (contrato §10): buscar ventas,
corregir venta y editar la nota de un cierre. Todo exige `motivo`, queda en la
bitácora con antes/después y la cadena de hash sigue válida.
"""
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APIClient

from .auditoria.bitacora import verificar_cadena
from .models import CargoCantina, CreditoRepresentanteCantina, EventoAuditoriaCantina, RevisionCierre, VentaCantina
from .tests_auditoria_instrumentacion import URL_CIERRE, InstrumentacionTestsBase, _usuario

URL_VENTAS = '/api/cantina/auditoria/ventas/'


def url_corregir(venta_id):
    return f'/api/cantina/auditoria/ventas/{venta_id}/corregir/'


def url_notas(cierre_id):
    return f'/api/cantina/auditoria/cierres/{cierre_id}/notas/'


class CorreccionesBase(InstrumentacionTestsBase):
    def setUp(self):
        super().setUp()
        self.director = _usuario('director_corr', 'director')
        self.dir_client = APIClient()
        self.dir_client.force_authenticate(user=self.director)
        self.abrir_caja()

    def vender_ok(self, **extra):
        resp = self.vender(**extra)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        return VentaCantina.objects.get(pk=resp.data['id'])

    def cerrar_caja(self):
        resp = self.client.post(URL_CIERRE, {'conteo_fisico': '23.00'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

    def eventos(self, tipo):
        return EventoAuditoriaCantina.objects.filter(tipo=tipo)


class PermisosCorreccionesTests(CorreccionesBase):
    def test_solo_director(self):
        venta = self.vender_ok()
        for rol in ('cajero', 'administrador'):
            cliente = APIClient()
            cliente.force_authenticate(user=_usuario(f'u_{rol}', rol))
            self.assertEqual(cliente.get(URL_VENTAS).status_code, 403)
            self.assertEqual(cliente.post(url_corregir(venta.id), {'motivo': 'prueba x', 'observaciones': 'a'}, format='json').status_code, 403)
            self.assertEqual(cliente.patch(url_notas(1), {'motivo': 'prueba x', 'notas_director': 'a'}, format='json').status_code, 403)

    def test_sin_delete(self):
        venta = self.vender_ok()
        self.assertEqual(self.dir_client.delete(url_corregir(venta.id)).status_code, 405)
        self.assertEqual(self.dir_client.delete(f'{URL_VENTAS}{venta.id}/').status_code, 404)


class BuscarVentasTests(CorreccionesBase):
    def test_lista_paginada_con_campos_y_filtros(self):
        v1 = self.vender_ok()
        v2 = self.vender_ok(alumno_id=self.alumno.id) if False else self.vender_ok()
        resp = self.dir_client.get(URL_VENTAS, {'page_size': 1})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['count'], 2)
        self.assertEqual(len(resp.data['results']), 1)
        fila = resp.data['results'][0]
        self.assertEqual(fila['id'], v2.id)
        for campo in ('fecha', 'cajero', 'total_usd', 'metodo_pago', 'estado', 'cliente', 'turno', 'corregible', 'cierre_cerrado'):
            self.assertIn(campo, fila)
        self.assertEqual(fila['cajero']['id'], self.cajero.id)
        self.assertEqual(fila['turno']['apertura_id'], v1.apertura_id)
        self.assertFalse(fila['cierre_cerrado'])

        resp = self.dir_client.get(URL_VENTAS, {'q': f'#{v1.id}'})
        self.assertEqual([r['id'] for r in resp.data['results']], [v1.id])
        resp = self.dir_client.get(URL_VENTAS, {'q': 'cajero_b1'})
        self.assertEqual(resp.data['count'], 2)
        resp = self.dir_client.get(URL_VENTAS, {'q': 'zzzz-no-existe'})
        self.assertEqual(resp.data['count'], 0)
        resp = self.dir_client.get(URL_VENTAS, {'area': 'libreria'})
        self.assertEqual(resp.data['count'], 0)
        self.assertEqual(self.dir_client.get(URL_VENTAS, {'area': 'x'}).status_code, 400)
        self.assertEqual(self.dir_client.get(URL_VENTAS, {'fecha_inicio': 'mal'}).status_code, 400)

    def test_marca_cierre_y_anulada_no_corregible(self):
        venta = self.vender_ok()
        self.cerrar_caja()
        VentaCantina.objects.filter(pk=venta.pk).update(estado='anulada')
        fila = self.dir_client.get(URL_VENTAS).data['results'][0]
        self.assertTrue(fila['cierre_cerrado'])
        self.assertIsNotNone(fila['cierre_id'])
        self.assertFalse(fila['corregible'])

    def test_cliente_alumno_y_credito(self):
        CreditoRepresentanteCantina.objects.create(representante=self.representante, limite_usd=Decimal('50.00'))
        self.vender_ok(metodo_pago='credito_representante', representante_id=self.representante.id)
        fila = self.dir_client.get(URL_VENTAS).data['results'][0]
        self.assertEqual(fila['cliente']['tipo'], 'representante')
        self.assertEqual(self.dir_client.get(URL_VENTAS, {'q': 'Marta'}).data['count'], 1)


class CorregirVentaTests(CorreccionesBase):
    def test_motivo_obligatorio_y_minimo(self):
        venta = self.vender_ok()
        for body in ({'observaciones': 'x'}, {'motivo': 'abc', 'observaciones': 'x'}, {'motivo': '    ', 'observaciones': 'x'}):
            resp = self.dir_client.post(url_corregir(venta.id), body, format='json')
            self.assertEqual(resp.status_code, 400, resp.data)
        self.assertEqual(self.eventos('correccion_venta').count(), 0)

    def test_sin_campos_o_sin_cambios_es_400(self):
        venta = self.vender_ok()
        self.assertEqual(self.dir_client.post(url_corregir(venta.id), {'motivo': 'motivo valido'}, format='json').status_code, 400)
        resp = self.dir_client.post(url_corregir(venta.id), {'motivo': 'motivo valido', 'metodo_pago': 'efectivo'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_venta_inexistente_404(self):
        self.assertEqual(self.dir_client.post(url_corregir(99999), {'motivo': 'motivo valido', 'observaciones': 'x'}, format='json').status_code, 404)

    def test_cambia_metodo_pago_y_registra_bitacora(self):
        venta = self.vender_ok()
        resp = self.dir_client.post(url_corregir(venta.id), {
            'motivo': 'Pagó por Zelle', 'metodo_pago': 'zelle', 'referencia': 'ZL-1',
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['metodo_pago'], 'zelle')
        venta.refresh_from_db()
        self.assertEqual(venta.referencia, 'ZL-1')
        evento = self.eventos('correccion_venta').get()
        self.assertEqual(evento.antes['metodo_pago'], 'efectivo')
        self.assertEqual(evento.despues['metodo_pago'], 'zelle')
        self.assertEqual(evento.motivo, 'Pagó por Zelle')
        self.assertEqual(evento.usuario_id, self.director.id)
        self.assertEqual(evento.objeto_id, str(venta.id))
        self.assertTrue(verificar_cadena()['ok'])

    def test_metodo_bancario_exige_referencia(self):
        venta = self.vender_ok()
        resp = self.dir_client.post(url_corregir(venta.id), {'motivo': 'motivo valido', 'metodo_pago': 'zelle'}, format='json')
        self.assertEqual(resp.status_code, 400)
        resp = self.dir_client.post(url_corregir(venta.id), {'motivo': 'motivo valido', 'metodo_pago': 'inventado'}, format='json')
        self.assertEqual(resp.status_code, 400)
        venta.refresh_from_db()
        self.assertEqual(venta.metodo_pago, 'efectivo')
        self.assertEqual(self.eventos('correccion_venta').count(), 0)

    def test_descuento_recalcula_total_y_ves(self):
        venta = self.vender_ok()  # 2 x 1.50 = 3.00, tasa 40
        resp = self.dir_client.post(url_corregir(venta.id), {
            'motivo': 'Descuento autorizado', 'descuento_usd': '0.50', 'motivo_descuento': 'Personal',
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        venta.refresh_from_db()
        self.assertEqual(venta.total_usd, Decimal('2.50'))
        self.assertEqual(venta.total_ves, Decimal('100.00'))
        self.assertEqual(venta.descuento_usd, Decimal('0.50'))
        self.assertEqual(venta.subtotal_usd, Decimal('3.00'))
        evento = self.eventos('correccion_venta').get()
        self.assertEqual(evento.antes['total_usd'], '3.00')
        self.assertEqual(evento.despues['total_usd'], '2.50')

    def test_descuento_invalido(self):
        venta = self.vender_ok()
        for body in ({'descuento_usd': '3.01', 'motivo_descuento': 'x'}, {'descuento_usd': '-1'},
                     {'descuento_usd': 'abc'}, {'descuento_usd': '1.00'}):  # sin motivo_descuento
            resp = self.dir_client.post(url_corregir(venta.id), {'motivo': 'motivo valido', **body}, format='json')
            self.assertEqual(resp.status_code, 400, (body, resp.data))
        venta.refresh_from_db()
        self.assertEqual(venta.total_usd, Decimal('3.00'))

    def test_observaciones(self):
        venta = self.vender_ok()
        resp = self.dir_client.post(url_corregir(venta.id), {'motivo': 'motivo valido', 'observaciones': 'Revisada'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['observaciones'], 'Revisada')

    def test_venta_anulada_409(self):
        venta = self.vender_ok()
        VentaCantina.objects.filter(pk=venta.pk).update(estado='anulada')
        resp = self.dir_client.post(url_corregir(venta.id), {'motivo': 'motivo valido', 'observaciones': 'x'}, format='json')
        self.assertEqual(resp.status_code, 409)

    def test_tarjeta_prepago_no_cambia_metodo_ni_descuento(self):
        venta = self.vender_ok(metodo_pago='tarjeta_prepago', tarjeta_codigo=self.tarjeta.codigo)
        resp = self.dir_client.post(url_corregir(venta.id), {'motivo': 'motivo valido', 'metodo_pago': 'efectivo'}, format='json')
        self.assertEqual(resp.status_code, 409)
        resp = self.dir_client.post(url_corregir(venta.id), {
            'motivo': 'motivo valido', 'descuento_usd': '0.50', 'motivo_descuento': 'x',
        }, format='json')
        self.assertEqual(resp.status_code, 409)
        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, Decimal('7.00'))

    def test_hacia_credito_409(self):
        venta = self.vender_ok()
        resp = self.dir_client.post(url_corregir(venta.id), {'motivo': 'motivo valido', 'metodo_pago': 'credito_representante'}, format='json')
        self.assertEqual(resp.status_code, 409)

    def test_descuento_en_credito_ajusta_cargo(self):
        CreditoRepresentanteCantina.objects.create(representante=self.representante, limite_usd=Decimal('50.00'))
        venta = self.vender_ok(metodo_pago='credito_representante', representante_id=self.representante.id)
        self.assertEqual(CargoCantina.objects.get(venta=venta).monto_usd, Decimal('3.00'))
        resp = self.dir_client.post(url_corregir(venta.id), {
            'motivo': 'motivo valido', 'descuento_usd': '1.00', 'motivo_descuento': 'Promo',
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(CargoCantina.objects.get(venta=venta).monto_usd, Decimal('2.00'))

    def test_descuento_en_credito_con_abono_409_y_sin_cambios(self):
        CreditoRepresentanteCantina.objects.create(representante=self.representante, limite_usd=Decimal('50.00'))
        venta = self.vender_ok(metodo_pago='credito_representante', representante_id=self.representante.id)
        CargoCantina.objects.filter(venta=venta).update(monto_pagado=Decimal('1.00'))
        resp = self.dir_client.post(url_corregir(venta.id), {
            'motivo': 'motivo valido', 'descuento_usd': '1.00', 'motivo_descuento': 'Promo',
        }, format='json')
        self.assertEqual(resp.status_code, 409)
        venta.refresh_from_db()
        self.assertEqual(venta.total_usd, Decimal('3.00'))  # rollback completo
        self.assertEqual(self.eventos('correccion_venta').count(), 0)

    def test_turno_cerrado_rechaza_cambios_financieros_pero_permite_notas(self):
        venta = self.vender_ok()
        self.cerrar_caja()
        resp = self.dir_client.post(url_corregir(venta.id), {
            'motivo': 'motivo valido', 'metodo_pago': 'efectivo_ves',
        }, format='json')
        self.assertEqual(resp.status_code, 409)
        self.assertIn('cierre', resp.data['error'])
        resp = self.dir_client.post(url_corregir(venta.id), {
            'motivo': 'motivo valido', 'descuento_usd': '0.50', 'motivo_descuento': 'x',
        }, format='json')
        self.assertEqual(resp.status_code, 409)
        resp = self.dir_client.post(url_corregir(venta.id), {'motivo': 'motivo valido', 'observaciones': 'Nota tardía'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        venta.refresh_from_db()
        self.assertEqual(venta.metodo_pago, 'efectivo')
        self.assertEqual(venta.observaciones, 'Nota tardía')
        self.assertTrue(verificar_cadena()['ok'])


class NotasCierreTests(CorreccionesBase):
    def setUp(self):
        super().setUp()
        self.vender_ok()
        self.cerrar_caja()
        from .models import CierreCajaCantina
        self.cierre = CierreCajaCantina.objects.get()

    def test_edita_nota_sin_cambiar_estado_y_registra(self):
        resp = self.dir_client.patch(url_notas(self.cierre.id), {
            'motivo': 'Aclaración del conteo', 'notas_director': 'Faltante justificado',
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['id'], self.cierre.id)
        revision = RevisionCierre.objects.get(cierre=self.cierre)
        self.assertEqual(revision.comentario_director, 'Faltante justificado')
        self.assertEqual(revision.estado, 'pendiente')
        evento = self.eventos('nota_cierre').get()
        self.assertEqual(evento.antes, {'notas_director': ''})
        self.assertEqual(evento.despues, {'notas_director': 'Faltante justificado'})
        self.assertEqual(evento.motivo, 'Aclaración del conteo')
        self.assertTrue(verificar_cadena()['ok'])

    def test_funciona_en_cierre_aprobado_y_permite_limpiar(self):
        RevisionCierre.objects.filter(cierre=self.cierre).update(estado='aprobado', comentario_director='previa')
        resp = self.dir_client.patch(url_notas(self.cierre.id), {'motivo': 'Limpieza de nota', 'notas_director': ''}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        revision = RevisionCierre.objects.get(cierre=self.cierre)
        self.assertEqual((revision.estado, revision.comentario_director), ('aprobado', ''))
        self.assertEqual(self.eventos('nota_cierre').get().antes, {'notas_director': 'previa'})

    def test_validaciones(self):
        for body in ({'notas_director': 'x'}, {'motivo': 'abc', 'notas_director': 'x'},
                     {'motivo': 'motivo valido'}, {'motivo': 'motivo valido', 'notas_director': 'x' * 2001}):
            self.assertEqual(self.dir_client.patch(url_notas(self.cierre.id), body, format='json').status_code, 400, body)
        self.assertEqual(self.dir_client.patch(url_notas(99999), {'motivo': 'motivo valido', 'notas_director': 'x'}, format='json').status_code, 404)
        self.assertEqual(self.eventos('nota_cierre').count(), 0)
