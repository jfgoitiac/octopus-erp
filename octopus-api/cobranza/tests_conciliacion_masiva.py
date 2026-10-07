"""Conciliación masiva: filtro de fechas, propuestas automáticas y confirmación en lote."""
from datetime import date, datetime, time
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from multisede.models import PermisoSede, Sede
from portal.models import ComprobantePago

from .models import ConciliacionBancaria, LoteRevisionCaja, Mensualidad, Pago
from .tests_conciliacion_semiauto import PNG_BYTES, BaseConciliacionTest, crear_usuario

URL_CAND = '/api/cobranza/conciliacion/candidatos/'
URL_PROP = '/api/cobranza/conciliacion/auto/propuestas/'
URL_CONF = '/api/cobranza/conciliacion/auto/confirmar/'


def aware(anio, mes, dia, hora=12):
    return timezone.make_aware(datetime.combine(date(anio, mes, dia), time(hora, 0)))


class MasivaBase(BaseConciliacionTest):
    def pago_en(self, fecha, referencia='00123456', usd='10.00', **kw):
        p = self.pago(referencia=referencia, usd=usd, **kw)
        Pago.objects.filter(pk=p.pk).update(fecha_pago=fecha)
        p.refresh_from_db()
        return p

    def comprobante(self, referencia='88776655', usd='10.00', fecha_subida=None, banco=None, mes=9):
        mens = Mensualidad.objects.create(alumno=self.alumno, mes=mes, anio=2026, monto_usd=Decimal(usd))
        comp = ComprobantePago.objects.create(
            mensualidad=mens, archivo=SimpleUploadedFile('p.png', PNG_BYTES, content_type='image/png'),
            referencia_bancaria=referencia, metodo_pago='transferencia', banco_receptor=banco or self.banco,
        )
        if fecha_subida:
            ComprobantePago.objects.filter(pk=comp.pk).update(fecha_subida=fecha_subida)
        return comp


class CandidatosRangoTest(MasivaBase):
    def test_rango_sin_ref_filtra_por_fecha_inclusiva(self):
        antes = self.pago_en(aware(2026, 9, 30, 23), referencia='1111')
        dentro1 = self.pago_en(aware(2026, 10, 1, 0), referencia='2222')
        dentro2 = self.pago_en(aware(2026, 10, 5, 23), referencia='3333')
        despues = self.pago_en(aware(2026, 10, 6, 0), referencia='4444')
        resp = self.client.get(URL_CAND, {'banco': self.banco.id, 'desde': '2026-10-01', 'hasta': '2026-10-05'})
        self.assertEqual(resp.status_code, 200, resp.data)
        ids = {r['operacion_uuid'] for r in resp.data['resultados']}
        self.assertEqual(ids, {str(dentro1.operacion_uuid), str(dentro2.operacion_uuid)})
        self.assertNotIn(str(antes.operacion_uuid), ids)
        self.assertNotIn(str(despues.operacion_uuid), ids)

    def test_solo_desde_o_solo_hasta(self):
        a = self.pago_en(aware(2026, 9, 1), referencia='1111')
        b = self.pago_en(aware(2026, 10, 1), referencia='2222')
        r = self.client.get(URL_CAND, {'banco': self.banco.id, 'desde': '2026-09-15'})
        self.assertEqual([x['operacion_uuid'] for x in r.data['resultados']], [str(b.operacion_uuid)])
        r = self.client.get(URL_CAND, {'banco': self.banco.id, 'hasta': '2026-09-15'})
        self.assertEqual([x['operacion_uuid'] for x in r.data['resultados']], [str(a.operacion_uuid)])

    def test_rango_combinado_con_ref(self):
        self.pago_en(aware(2026, 10, 2), referencia='00123456')
        self.pago_en(aware(2026, 10, 2), referencia='00999999')
        r = self.client.get(URL_CAND, {'banco': self.banco.id, 'ref': '3456', 'desde': '2026-10-01', 'hasta': '2026-10-03'})
        self.assertEqual(len(r.data['resultados']), 1)

    def test_comprobante_filtra_por_fecha_subida(self):
        dentro = self.comprobante(referencia='5555', fecha_subida=aware(2026, 10, 2), mes=9)
        self.comprobante(referencia='6666', fecha_subida=aware(2026, 8, 2), mes=8)
        r = self.client.get(URL_CAND, {'banco': self.banco.id, 'desde': '2026-10-01', 'hasta': '2026-10-31'})
        self.assertEqual([x['comprobante_id'] for x in r.data['resultados']], [dentro.id])

    def test_sin_ref_ni_rango_sigue_siendo_400(self):
        r = self.client.get(URL_CAND, {'banco': self.banco.id})
        self.assertEqual(r.status_code, 400)
        r = self.client.get(URL_CAND, {'banco': self.banco.id, 'ref': '12'})
        self.assertEqual(r.status_code, 400)

    def test_ref_invalida_con_rango_sigue_siendo_400(self):
        r = self.client.get(URL_CAND, {'banco': self.banco.id, 'ref': '12', 'desde': '2026-10-01'})
        self.assertEqual(r.status_code, 400)

    def test_fechas_invalidas_400(self):
        r = self.client.get(URL_CAND, {'banco': self.banco.id, 'desde': '01/10/2026'})
        self.assertEqual(r.status_code, 400)
        r = self.client.get(URL_CAND, {'banco': self.banco.id, 'desde': '2026-10-05', 'hasta': '2026-10-01'})
        self.assertEqual(r.status_code, 400)


def tx(ref, monto, fecha='2026-10-02'):
    return {'referencia': ref, 'fecha': fecha, 'monto': monto}


class PropuestasTest(MasivaBase):
    def propone(self, transacciones, **extra):
        body = {'banco': self.banco.id, 'desde': '2026-10-01', 'hasta': '2026-10-31',
                'tolerancia': 200, 'transacciones': transacciones}
        body.update(extra)
        return self.client.post(URL_PROP, body, format='json')

    def test_exacta_dentro_fuera_y_resumen(self):
        a = self.pago_en(aware(2026, 10, 2), referencia='00100001')
        b = self.pago_en(aware(2026, 10, 3), referencia='00200002')
        c = self.pago_en(aware(2026, 10, 4), referencia='00300003')
        r = self.propone([tx('100001', '400.00'), tx('200002', '500.00'), tx('300003', '900.00')])
        self.assertEqual(r.status_code, 200, r.data)
        por_op = {p['operacion_uuid']: p for p in r.data['propuestas']}
        pa, pb, pc = (por_op[str(x.operacion_uuid)] for x in (a, b, c))
        self.assertEqual(pa['estado'], 'exacta')
        self.assertEqual(pa['diferencia_ves'], '0.00')
        self.assertTrue(pa['seleccionada_por_defecto'])
        self.assertEqual(pb['estado'], 'dentro_tolerancia')
        self.assertEqual(pb['diferencia_ves'], '100.00')
        self.assertTrue(pb['seleccionada_por_defecto'])
        self.assertEqual(pc['estado'], 'fuera_tolerancia')
        self.assertEqual(pc['diferencia_ves'], '500.00')
        self.assertFalse(pc['seleccionada_por_defecto'])
        self.assertEqual(pc['transaccion'], {'referencia': '300003', 'fecha': '2026-10-02', 'monto': '900.00'})
        self.assertEqual(pa['tipo'], 'pago')
        self.assertEqual(pa['monto_sistema_ves'], '400.00')
        self.assertEqual(pa['referencia_sistema'], '00100001')
        self.assertEqual(pa['alumnos'], ['Luis Mena'])
        self.assertEqual(r.data['resumen'], {
            'total': 3, 'exactas': 1, 'dentro_tolerancia': 1, 'fuera_tolerancia': 1,
            'ambiguas': 0, 'sin_banco': 0,
        })
        self.assertEqual(r.data['sin_operacion'], [])

    def test_diferencia_negativa_con_signo(self):
        self.pago_en(aware(2026, 10, 2), referencia='00100001')
        r = self.propone([tx('100001', '350.00')])
        self.assertEqual(r.data['propuestas'][0]['diferencia_ves'], '-50.00')

    def test_sin_banco_y_sin_operacion(self):
        self.pago_en(aware(2026, 10, 2), referencia='00100001')
        r = self.propone([tx('999999', '10.00')])
        self.assertEqual(r.data['propuestas'][0]['estado'], 'sin_banco')
        self.assertIsNone(r.data['propuestas'][0]['transaccion'])
        self.assertIsNone(r.data['propuestas'][0]['diferencia_ves'])
        self.assertFalse(r.data['propuestas'][0]['seleccionada_por_defecto'])
        self.assertEqual(r.data['sin_operacion'], [tx('999999', '10.00')])
        self.assertEqual(r.data['resumen']['sin_banco'], 1)

    def test_empareja_por_ultimos_digitos_normalizando(self):
        self.pago_en(aware(2026, 10, 2), referencia='REF-00123456')
        r = self.propone([tx('0000123456', '400.00')], digitos=6)
        self.assertEqual(r.data['propuestas'][0]['estado'], 'exacta')
        r = self.propone([tx('9923456', '400.00')], digitos=6)  # solo 5 finales iguales
        self.assertEqual(r.data['propuestas'][0]['estado'], 'sin_banco')
        r = self.propone([tx('9923456', '400.00')], digitos=5)
        self.assertEqual(r.data['propuestas'][0]['estado'], 'exacta')

    def test_referencia_corta_exige_igualdad_completa(self):
        self.pago_en(aware(2026, 10, 2), referencia='1234')
        r = self.propone([tx('881234', '400.00')], digitos=6)
        self.assertEqual(r.data['propuestas'][0]['estado'], 'sin_banco')
        r = self.propone([tx('1234', '400.00')], digitos=6)
        self.assertEqual(r.data['propuestas'][0]['estado'], 'exacta')

    def test_ambigua_dos_lineas_misma_referencia_sin_desempate(self):
        self.pago_en(aware(2026, 10, 2), referencia='00100001')
        r = self.propone([tx('100001', '1000.00', '2026-10-02'), tx('100001', '1100.00', '2026-10-03')])
        p = r.data['propuestas'][0]
        self.assertEqual(p['estado'], 'ambigua')
        self.assertIsNone(p['transaccion'])
        self.assertEqual(len(p['candidatas']), 2)
        self.assertFalse(p['seleccionada_por_defecto'])
        self.assertEqual(r.data['sin_operacion'], [])

    def test_dos_lineas_se_desempata_por_monto_exacto(self):
        self.pago_en(aware(2026, 10, 2), referencia='00100001')
        r = self.propone([tx('100001', '600.00', '2026-10-02'), tx('100001', '400.00', '2026-10-03')])
        p = r.data['propuestas'][0]
        self.assertEqual(p['estado'], 'exacta')
        self.assertEqual(p['transaccion']['fecha'], '2026-10-03')

    def test_dos_operaciones_una_linea_desempata_por_monto(self):
        a = self.pago_en(aware(2026, 10, 2), referencia='00100001', usd='10.00')   # 400
        b = self.pago_en(aware(2026, 10, 2), referencia='99100001', usd='20.00')   # 800
        r = self.propone([tx('100001', '400.00')])
        por_op = {p['operacion_uuid']: p for p in r.data['propuestas']}
        self.assertEqual(por_op[str(a.operacion_uuid)]['estado'], 'exacta')
        self.assertEqual(por_op[str(b.operacion_uuid)]['estado'], 'sin_banco')

    def test_dos_operaciones_una_linea_sin_desempate_ambas_ambiguas(self):
        self.pago_en(aware(2026, 10, 2), referencia='00100001', usd='10.00')
        self.pago_en(aware(2026, 10, 2), referencia='99100001', usd='10.00')
        r = self.propone([tx('100001', '400.00')])
        self.assertEqual([p['estado'] for p in r.data['propuestas']], ['ambigua', 'ambigua'])
        self.assertEqual(r.data['resumen']['ambiguas'], 2)

    def test_linea_no_se_asigna_a_dos_operaciones(self):
        self.pago_en(aware(2026, 10, 2), referencia='00100001', usd='10.00')
        self.pago_en(aware(2026, 10, 3), referencia='99100001', usd='10.50')
        r = self.propone([tx('100001', '400.00')])
        asignadas = [p for p in r.data['propuestas'] if p['transaccion']]
        self.assertEqual(len(asignadas), 1)

    def test_linea_ya_usada_se_ignora(self):
        p = self.pago_en(aware(2026, 10, 2), referencia='00100001')
        otro = self.pago_en(aware(2026, 9, 20), referencia='00555555')
        lote = LoteRevisionCaja.objects.create(
            usuario=self.user, estado='abierto', fecha_inicio=date(2026, 10, 1), fecha_fin=date(2026, 10, 1),
        )
        ConciliacionBancaria.objects.create(
            lote=lote, operacion_uuid=otro.operacion_uuid, banco=self.banco, referencia_banco='100001',
            fecha_banco=date(2026, 10, 2), monto_banco_ves=Decimal('400'), monto_sistema_ves=Decimal('400'),
            diferencia_ves=Decimal('0'), tolerancia_aplicada_ves=Decimal('200'), usuario=self.user,
        )
        r = self.propone([tx('100001', '400.00', '2026-10-02')])
        self.assertEqual(r.data['propuestas'][0]['operacion_uuid'], str(p.operacion_uuid))
        self.assertEqual(r.data['propuestas'][0]['estado'], 'sin_banco')
        self.assertEqual(r.data['sin_operacion'], [])

    def test_operacion_ya_conciliada_no_aparece(self):
        p = self.pago_en(aware(2026, 10, 2), referencia='00100001')
        r = self.client.post('/api/cobranza/conciliacion/conciliar/', {
            'operacion_uuid': str(p.operacion_uuid), 'banco': self.banco.id,
            'transaccion': tx('100001', '400.00'), 'tolerancia': 200,
        }, format='json')
        self.assertEqual(r.status_code, 201)
        r = self.propone([tx('100001', '400.00', '2026-10-05')])
        self.assertEqual(r.data['propuestas'], [])
        self.assertEqual(r.data['resumen']['total'], 0)

    def test_fuera_de_rango_y_otro_banco_no_aparecen(self):
        self.pago_en(aware(2026, 9, 2), referencia='00100001')
        self.pago_en(aware(2026, 10, 2), referencia='00100002', banco=self.otro_banco)
        r = self.propone([tx('100001', '400.00'), tx('100002', '400.00')])
        self.assertEqual(r.data['propuestas'], [])
        self.assertEqual(len(r.data['sin_operacion']), 2)

    def test_comprobante_pendiente_nunca_preseleccionado(self):
        comp = self.comprobante(referencia='88776655', fecha_subida=aware(2026, 10, 2))
        r = self.propone([tx('776655', '400.00')])
        p = r.data['propuestas'][0]
        self.assertEqual(p['tipo'], 'comprobante_pendiente')
        self.assertEqual(p['comprobante_id'], comp.id)
        self.assertIsNone(p['operacion_uuid'])
        self.assertEqual(p['estado'], 'exacta')
        self.assertFalse(p['seleccionada_por_defecto'])

    def test_es_solo_lectura(self):
        comp = self.comprobante(referencia='88776655', fecha_subida=aware(2026, 10, 2))
        self.pago_en(aware(2026, 10, 2), referencia='00100001')
        self.propone([tx('776655', '400.00'), tx('100001', '400.00')])
        comp.refresh_from_db()
        self.assertEqual(comp.estatus, 'pendiente')
        self.assertEqual(ConciliacionBancaria.objects.count(), 0)
        self.assertEqual(LoteRevisionCaja.objects.count(), 0)

    def test_id_estable(self):
        for d in (2, 3, 4):
            self.pago_en(aware(2026, 10, d), referencia=f'00{d}00{d}00')
        r1 = self.propone([])
        r2 = self.propone([])
        self.assertEqual([p['operacion_uuid'] for p in r1.data['propuestas']],
                         [p['operacion_uuid'] for p in r2.data['propuestas']])
        self.assertEqual([p['id'] for p in r1.data['propuestas']], [0, 1, 2])

    def test_tolerancia_global_por_defecto(self):
        self.pago_en(aware(2026, 10, 2), referencia='00100001')
        r = self.client.post(URL_PROP, {
            'banco': self.banco.id, 'desde': '2026-10-01', 'hasta': '2026-10-31',
            'transacciones': [tx('100001', '650.00')],
        }, format='json')
        self.assertEqual(r.data['propuestas'][0]['estado'], 'fuera_tolerancia')  # dif 250 > 200

    def test_sede_ajena_no_aparece(self):
        sede_a = Sede.objects.create(nombre='Sede A')
        sede_b = Sede.objects.create(nombre='Sede B')
        PermisoSede.objects.create(user=self.user, sede=sede_a, rol='cobranza')
        propio = self.pago_en(aware(2026, 10, 2), referencia='00100001', sede=sede_a)
        self.pago_en(aware(2026, 10, 2), referencia='00200002', sede=sede_b)
        r = self.propone([tx('100001', '400.00'), tx('200002', '400.00')])
        self.assertEqual([p['operacion_uuid'] for p in r.data['propuestas']], [str(propio.operacion_uuid)])
        self.assertEqual(r.data['sin_operacion'], [tx('200002', '400.00')])

    def test_permisos_y_validaciones(self):
        docente = crear_usuario('masiva_docente', rol='docente')
        c = APIClient()
        c.force_authenticate(user=docente)
        base = {'banco': self.banco.id, 'desde': '2026-10-01', 'hasta': '2026-10-31', 'transacciones': []}
        self.assertEqual(c.post(URL_PROP, base, format='json').status_code, 403)
        self.assertEqual(self.client.post(URL_PROP, {**base, 'desde': None}, format='json').status_code, 400)
        self.assertEqual(self.client.post(URL_PROP, {**base, 'digitos': 3}, format='json').status_code, 400)
        self.assertEqual(self.client.post(URL_PROP, {**base, 'digitos': 9}, format='json').status_code, 400)
        self.assertEqual(self.client.post(URL_PROP, {**base, 'banco': 'x'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(URL_PROP, {**base, 'banco': 99999}, format='json').status_code, 404)
        self.assertEqual(self.client.post(URL_PROP, {**base, 'transacciones': 'x'}, format='json').status_code, 400)
        mala = [{'referencia': '', 'fecha': '2026-10-01', 'monto': '1'}]
        self.assertEqual(self.client.post(URL_PROP, {**base, 'transacciones': mala}, format='json').status_code, 400)


class ConfirmarMasivaTest(MasivaBase):
    def confirma(self, items, **extra):
        body = {'banco': self.banco.id, 'tolerancia': 200, 'archivo': 'estado.xlsx', 'items': items}
        body.update(extra)
        return self.client.post(URL_CONF, body, format='json')

    def item(self, op, ref='00100001', monto='400.00', fecha='2026-10-02', observacion=''):
        return {'operacion_uuid': str(op), 'transaccion': tx(ref, monto, fecha), 'observacion': observacion}

    def test_exito_parcial_con_errores_no_revierte_los_demas(self):
        a = self.pago_en(aware(2026, 10, 2), referencia='00100001')
        b = self.pago_en(aware(2026, 10, 3), referencia='00200002')
        c = self.pago_en(aware(2026, 10, 4), referencia='00300003')
        r = self.confirma([
            self.item(a.operacion_uuid, '00100001', '400.00'),
            self.item(b.operacion_uuid, '00200002', '900.00'),
            self.item(c.operacion_uuid, '00300003', '900.00', observacion='Pago adelantado'),
            self.item('no-es-uuid', '00400004'),
        ])
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual([x['indice'] for x in r.data['conciliadas']], [0, 2])
        self.assertEqual([x['indice'] for x in r.data['errores']], [1, 3])
        self.assertIn('observación', r.data['errores'][0]['error'])
        self.assertEqual(ConciliacionBancaria.objects.count(), 2)
        conc = ConciliacionBancaria.objects.get(id=r.data['conciliadas'][1]['conciliacion_id'])
        self.assertTrue(conc.fuera_tolerancia)
        self.assertEqual(conc.archivo_estado_cuenta, 'estado.xlsx')
        self.assertEqual(r.data['lote']['total_operaciones'], 2)

    def test_lote_unico_abierto(self):
        a = self.pago_en(aware(2026, 10, 2), referencia='00100001')
        b = self.pago_en(aware(2026, 10, 3), referencia='00200002')
        r = self.confirma([self.item(a.operacion_uuid), self.item(b.operacion_uuid, '00200002')])
        self.assertEqual(len(r.data['conciliadas']), 2)
        self.assertEqual(LoteRevisionCaja.objects.filter(usuario=self.user, estado='abierto').count(), 1)
        self.assertEqual(LoteRevisionCaja.objects.count(), 1)
        self.assertEqual(r.data['lote']['id'], LoteRevisionCaja.objects.get().id)

    def test_doble_envio_no_duplica(self):
        a = self.pago_en(aware(2026, 10, 2), referencia='00100001')
        r1 = self.confirma([self.item(a.operacion_uuid)])
        self.assertEqual(len(r1.data['conciliadas']), 1)
        r2 = self.confirma([self.item(a.operacion_uuid)])
        self.assertEqual(r2.data['conciliadas'], [])
        self.assertEqual(len(r2.data['errores']), 1)
        self.assertEqual(ConciliacionBancaria.objects.count(), 1)

    def test_misma_linea_dos_veces_en_la_peticion(self):
        a = self.pago_en(aware(2026, 10, 2), referencia='00100001')
        b = self.pago_en(aware(2026, 10, 2), referencia='99100001')
        r = self.confirma([self.item(a.operacion_uuid), self.item(b.operacion_uuid)])
        self.assertEqual(len(r.data['conciliadas']), 1)
        self.assertEqual(r.data['errores'][0]['indice'], 1)

    def test_comprobante_se_aprueba_y_concilia_y_error_no_lo_aprueba(self):
        ok = self.comprobante(referencia='88776655', fecha_subida=aware(2026, 10, 2), mes=9)
        mal = self.comprobante(referencia='11223344', fecha_subida=aware(2026, 10, 2), mes=8)
        r = self.confirma([
            {'comprobante_id': ok.id, 'transaccion': tx('88776655', '400.00')},
            {'comprobante_id': mal.id, 'transaccion': tx('11223344', '900.00')},
        ])
        self.assertEqual([x['indice'] for x in r.data['conciliadas']], [0])
        self.assertEqual([x['indice'] for x in r.data['errores']], [1])
        ok.refresh_from_db()
        mal.refresh_from_db()
        self.assertEqual(ok.estatus, 'aprobado')
        self.assertEqual(mal.estatus, 'pendiente')
        self.assertEqual(ConciliacionBancaria.objects.get().comprobante_aprobado_id, ok.id)

    def test_sede_ajena_va_a_errores(self):
        sede_a = Sede.objects.create(nombre='Sede A')
        sede_b = Sede.objects.create(nombre='Sede B')
        PermisoSede.objects.create(user=self.user, sede=sede_a, rol='cobranza')
        propio = self.pago_en(aware(2026, 10, 2), referencia='00100001', sede=sede_a)
        ajeno = self.pago_en(aware(2026, 10, 2), referencia='00200002', sede=sede_b)
        r = self.confirma([self.item(propio.operacion_uuid), self.item(ajeno.operacion_uuid, '00200002')])
        self.assertEqual([x['indice'] for x in r.data['conciliadas']], [0])
        self.assertEqual([x['indice'] for x in r.data['errores']], [1])
        self.assertEqual(ConciliacionBancaria.objects.count(), 1)

    def test_limite_500(self):
        items = [{'operacion_uuid': '00000000-0000-0000-0000-000000000000',
                  'transaccion': tx(str(i + 1), '1.00')} for i in range(501)]
        self.assertEqual(self.confirma(items).status_code, 400)
        r = self.confirma(items[:500])
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data['errores']), 500)
        self.assertIsNone(r.data['lote'])
        self.assertEqual(LoteRevisionCaja.objects.count(), 0)

    def test_validaciones_y_permisos(self):
        self.assertEqual(self.confirma([]).status_code, 400)
        self.assertEqual(self.confirma('x').status_code, 400)
        self.assertEqual(self.confirma([{}], banco='x').status_code, 400)
        self.assertEqual(self.confirma([{}], banco=99999).status_code, 404)
        self.assertEqual(self.confirma([{}], tolerancia='abc').status_code, 400)
        r = self.confirma([{}, 'x'])
        self.assertEqual(len(r.data['errores']), 2)
        docente = crear_usuario('masiva_docente2', rol='docente')
        c = APIClient()
        c.force_authenticate(user=docente)
        r = c.post(URL_CONF, {'banco': self.banco.id, 'items': [{}]}, format='json')
        self.assertEqual(r.status_code, 403)
