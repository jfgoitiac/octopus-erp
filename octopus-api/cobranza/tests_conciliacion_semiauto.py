from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from multisede.models import PermisoSede, Sede
from portal.models import ComprobantePago
from secretaria.models import Alumno, ConfiguracionSistema, Representante

from .models import (
    BancoInstitucional, ConciliacionBancaria, LoteRevisionCaja, Mensualidad, Pago, TasaCambio,
)

User = get_user_model()

PNG_BYTES = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06'
    b'\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe'
    b'\xa7\x9a\xa0\xa0\x00\x00\x00\x00IEND\xaeB`\x82'
)

URL_CAND = '/api/cobranza/conciliacion/candidatos/'
URL_CONC = '/api/cobranza/conciliacion/conciliar/'
URL_ABIERTO = '/api/cobranza/conciliacion/lotes/abierto/'
URL_FINALIZAR = '/api/cobranza/conciliacion/lotes/abierto/finalizar/'


def crear_usuario(username, rol='cobranza'):
    u = User.objects.create_user(username=username, password='clave123456', email=f'{username}@example.com')
    u.perfil.rol = rol
    u.perfil.save(update_fields=['rol'])
    return u


class BaseConciliacionTest(TestCase):
    def setUp(self):
        cache.clear()
        self.user = crear_usuario('conc_user')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.banco = BancoInstitucional.objects.create(nombre='Banco Conc Test', activo=True)
        self.otro_banco = BancoInstitucional.objects.create(nombre='Otro Banco Conc', activo=True)
        TasaCambio.objects.create(valor_bs=Decimal('40.0000'))

        self.rep = Representante.objects.create(
            cedula='V70000001', nombre='Rosa', apellido='Mena', correo='rosa@example.com',
        )
        self.alumno = Alumno.objects.create(
            nombre='Luis', apellido='Mena', cedula_escolar='E70000001',
            fecha_nacimiento=date(2015, 1, 1), representante=self.rep,
        )
        self.hermano = Alumno.objects.create(
            nombre='Ana', apellido='Mena', cedula_escolar='E70000002',
            fecha_nacimiento=date(2017, 1, 1), representante=self.rep,
        )

    def pago(self, referencia='00123456', usd='10.00', alumno=None, banco=None, uuid_op=None, **kw):
        p = Pago.objects.create(
            alumno=alumno or self.alumno, usuario_receptor=self.user, metodo_pago='transferencia',
            banco_receptor=banco or self.banco, monto_usd=Decimal(usd),
            tasa_aplicada=Decimal('40.00'), referencia=referencia, estatus='completado', **kw,
        )
        if uuid_op:
            Pago.objects.filter(pk=p.pk).update(operacion_uuid=uuid_op)
            p.refresh_from_db()
        return p

    def body(self, op, monto='400.00', ref='00123456', fecha='2026-10-01', **extra):
        b = {
            'operacion_uuid': str(op),
            'banco': self.banco.id,
            'transaccion': {'referencia': ref, 'fecha': fecha, 'monto': monto},
            'tolerancia': 200,
            'observacion': '',
            'archivo': 'estado.xlsx',
        }
        b.update(extra)
        return b


class BancosConciliadorTest(BaseConciliacionTest):
    def test_bdt_existe_inactivo_para_caja_y_activo_en_conciliador(self):
        bdt = BancoInstitucional.objects.get(nombre='Banco Digital de los Trabajadores')
        self.assertFalse(bdt.activo)
        self.assertTrue(bdt.activo_conciliador)
        self.assertEqual(bdt.formato_estado_cuenta, 'bdt')

    def test_endpoint_bancos_caja_excluye_bdt_y_conciliador_lo_incluye(self):
        resp = self.client.get('/api/cobranza/bancos/')
        self.assertNotIn('Banco Digital de los Trabajadores', [b['nombre'] for b in resp.data])
        resp = self.client.get('/api/cobranza/bancos/?para=conciliador')
        nombres = [b['nombre'] for b in resp.data]
        self.assertIn('Banco Digital de los Trabajadores', nombres)
        bdt = next(b for b in resp.data if b['nombre'].startswith('Banco Digital'))
        self.assertEqual(bdt['formato_estado_cuenta'], 'bdt')
        self.assertIn('color', bdt)


class CandidatosTest(BaseConciliacionTest):
    def test_match_por_sufijo_y_filtra_por_banco(self):
        p1 = self.pago(referencia='00123456')
        self.pago(referencia='00999999')                      # otro sufijo
        self.pago(referencia='00123456', banco=self.otro_banco)  # otro banco
        resp = self.client.get(URL_CAND, {'banco': self.banco.id, 'ref': '3456'})
        self.assertEqual(resp.status_code, 200)
        res = resp.data['resultados']
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]['tipo'], 'pago')
        self.assertEqual(res[0]['operacion_uuid'], str(p1.operacion_uuid))
        self.assertEqual(res[0]['pagos_ids'], [p1.id])
        self.assertFalse(res[0]['conciliado'])
        self.assertFalse(res[0]['se_aprobara'])

    def test_agrupa_por_operacion_y_suma_monto(self):
        p1 = self.pago(usd='10.00')
        p2 = self.pago(referencia='99123456', usd='5.00', alumno=self.hermano, uuid_op=p1.operacion_uuid)
        resp = self.client.get(URL_CAND, {'banco': self.banco.id, 'ref': '123456'})
        res = resp.data['resultados']
        self.assertEqual(len(res), 1)
        self.assertEqual(Decimal(res[0]['monto_ves']), Decimal('600.00'))
        self.assertEqual(sorted(res[0]['pagos_ids']), sorted([p1.id, p2.id]))
        self.assertEqual(len(res[0]['alumnos']), 2)
        self.assertEqual(res[0]['representante'], 'Rosa Mena')

    def test_incluye_comprobante_pendiente(self):
        mens = Mensualidad.objects.create(alumno=self.alumno, mes=9, anio=2026, monto_usd=Decimal('10.00'))
        comp = ComprobantePago.objects.create(
            mensualidad=mens, archivo=SimpleUploadedFile('p.png', PNG_BYTES, content_type='image/png'),
            referencia_bancaria='88776655', metodo_pago='transferencia', banco_receptor=self.banco,
        )
        resp = self.client.get(URL_CAND, {'banco': self.banco.id, 'ref': '6655'})
        res = resp.data['resultados']
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]['tipo'], 'comprobante_pendiente')
        self.assertEqual(res[0]['comprobante_id'], comp.id)
        self.assertIsNone(res[0]['operacion_uuid'])
        self.assertTrue(res[0]['se_aprobara'])
        self.assertEqual(Decimal(res[0]['monto_ves']), Decimal('400.00'))

    def test_marca_ya_conciliados_con_lote(self):
        p = self.pago()
        r = self.client.post(URL_CONC, self.body(p.operacion_uuid), format='json')
        self.assertEqual(r.status_code, 201)
        resp = self.client.get(URL_CAND, {'banco': self.banco.id, 'ref': '3456'})
        item = resp.data['resultados'][0]
        self.assertTrue(item['conciliado'])
        self.assertEqual(item['lote_id'], r.data['lote']['id'])

    def test_filtra_por_sede(self):
        sede_a = Sede.objects.create(nombre='Sede A')
        sede_b = Sede.objects.create(nombre='Sede B')
        PermisoSede.objects.create(user=self.user, sede=sede_a, rol='cobranza')
        propio = self.pago(referencia='00111111', sede=sede_a)
        self.pago(referencia='00112111', sede=sede_b)
        resp = self.client.get(URL_CAND, {'banco': self.banco.id, 'ref': '1111'})
        self.assertEqual([r['operacion_uuid'] for r in resp.data['resultados']], [str(propio.operacion_uuid)])
        resp = self.client.get(URL_CAND, {'banco': self.banco.id, 'ref': '2111'})
        self.assertEqual(resp.data['resultados'], [])

    def test_valida_parametros_y_permiso(self):
        self.assertEqual(self.client.get(URL_CAND, {'banco': self.banco.id, 'ref': '123'}).status_code, 400)
        self.assertEqual(self.client.get(URL_CAND, {'banco': self.banco.id, 'ref': '1234567'}).status_code, 400)
        self.assertEqual(self.client.get(URL_CAND, {'banco': 'x', 'ref': '1234'}).status_code, 400)
        docente = crear_usuario('conc_docente', rol='docente')
        c = APIClient()
        c.force_authenticate(user=docente)
        self.assertEqual(c.get(URL_CAND, {'banco': self.banco.id, 'ref': '1234'}).status_code, 403)


class ConciliarTest(BaseConciliacionTest):
    def test_dentro_de_tolerancia(self):
        p = self.pago()  # 400 Bs
        r = self.client.post(URL_CONC, self.body(p.operacion_uuid, monto='450.00'), format='json')
        self.assertEqual(r.status_code, 201)
        conc = r.data['conciliacion']
        self.assertEqual(Decimal(conc['diferencia_ves']), Decimal('50.00'))
        self.assertFalse(conc['fuera_tolerancia'])
        self.assertEqual(r.data['lote']['total_operaciones'], 1)
        lote = LoteRevisionCaja.objects.get(pk=r.data['lote']['id'])
        self.assertEqual(lote.estado, 'abierto')
        self.assertIn(p, lote.pagos.all())

    def test_fuera_de_tolerancia_sin_observacion_400_y_con_observacion_201(self):
        p = self.pago()
        r = self.client.post(URL_CONC, self.body(p.operacion_uuid, monto='700.00'), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(ConciliacionBancaria.objects.count(), 0)
        r = self.client.post(
            URL_CONC, self.body(p.operacion_uuid, monto='700.00', observacion='Excedente'), format='json',
        )
        self.assertEqual(r.status_code, 201)
        self.assertTrue(r.data['conciliacion']['fuera_tolerancia'])
        self.assertEqual(Decimal(r.data['conciliacion']['diferencia_ves']), Decimal('300.00'))

    def test_servidor_recalcula_la_diferencia(self):
        """Un cliente que declara una tolerancia enorme igual la ve evaluada por el servidor."""
        p = self.pago()
        r = self.client.post(
            URL_CONC, self.body(p.operacion_uuid, monto='1000.00', tolerancia=5000), format='json',
        )
        self.assertEqual(r.status_code, 201)  # la tolerancia de sesión la define el operador
        self.assertFalse(r.data['conciliacion']['fuera_tolerancia'])
        self.assertEqual(Decimal(r.data['conciliacion']['monto_sistema_ves']), Decimal('400.00'))

    def test_usa_tolerancia_global_si_no_se_envia(self):
        ConfiguracionSistema.objects.create(
            fecha_inicio_inscripciones=date(2026, 1, 1), fecha_fin_inscripciones=date(2026, 2, 1),
            fecha_inicio_ano_escolar=date(2026, 9, 1), fecha_fin_ano_escolar=date(2027, 7, 1),
            tolerancia_conciliacion_ves=Decimal('10.00'),
        )
        p = self.pago()
        b = self.body(p.operacion_uuid, monto='450.00')
        del b['tolerancia']
        r = self.client.post(URL_CONC, b, format='json')
        self.assertEqual(r.status_code, 400)  # 50 > 10 y sin observación

    def test_doble_conciliacion_de_la_operacion(self):
        p = self.pago()
        self.assertEqual(self.client.post(URL_CONC, self.body(p.operacion_uuid), format='json').status_code, 201)
        r = self.client.post(URL_CONC, self.body(p.operacion_uuid, ref='999999'), format='json')
        self.assertEqual(r.status_code, 400)

    def test_linea_del_banco_reutilizada(self):
        p1 = self.pago()
        p2 = self.pago(referencia='00555555')
        self.assertEqual(self.client.post(URL_CONC, self.body(p1.operacion_uuid), format='json').status_code, 201)
        # Misma línea del banco (referencia + fecha) contra otra operación
        r = self.client.post(URL_CONC, self.body(p2.operacion_uuid), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(ConciliacionBancaria.objects.count(), 1)

    def test_aprueba_comprobante_con_mismos_efectos_que_el_patch(self):
        mens = Mensualidad.objects.create(alumno=self.alumno, mes=9, anio=2026, monto_usd=Decimal('10.00'))
        comp = ComprobantePago.objects.create(
            mensualidad=mens, archivo=SimpleUploadedFile('p.png', PNG_BYTES, content_type='image/png'),
            referencia_bancaria='88776655', metodo_pago='transferencia', banco_receptor=self.banco,
        )
        with patch('portal.services.notificar_pago_aprobado') as notif,                 self.captureOnCommitCallbacks(execute=True):
            r = self.client.post(URL_CONC, {
                'comprobante_id': comp.id, 'banco': self.banco.id,
                'transaccion': {'referencia': '88776655', 'fecha': '2026-10-01', 'monto': '400.00'},
                'tolerancia': 200, 'observacion': '', 'archivo': 'e.pdf',
            }, format='json')
            self.assertEqual(r.status_code, 201, r.data)
        comp.refresh_from_db()
        mens.refresh_from_db()
        self.assertEqual(comp.estatus, 'aprobado')
        self.assertTrue(mens.pagado)
        pago = mens.pagos.get()
        self.assertEqual(pago.referencia, '88776655')
        self.assertEqual(pago.banco_receptor, self.banco)
        self.assertEqual(pago.estatus, 'completado')
        conc = ConciliacionBancaria.objects.get()
        self.assertEqual(conc.comprobante_aprobado, comp)
        self.assertEqual(conc.operacion_uuid, pago.operacion_uuid)
        self.assertIn(pago, conc.lote.pagos.all())
        notif.assert_called_once()

    def test_comprobante_fuera_de_tolerancia_sin_observacion_no_se_aprueba(self):
        mens = Mensualidad.objects.create(alumno=self.alumno, mes=9, anio=2026, monto_usd=Decimal('10.00'))
        comp = ComprobantePago.objects.create(
            mensualidad=mens, archivo=SimpleUploadedFile('p.png', PNG_BYTES, content_type='image/png'),
            referencia_bancaria='88776655', metodo_pago='transferencia', banco_receptor=self.banco,
        )
        r = self.client.post(URL_CONC, {
            'comprobante_id': comp.id, 'banco': self.banco.id,
            'transaccion': {'referencia': '88776655', 'fecha': '2026-10-01', 'monto': '900.00'},
            'tolerancia': 200,
        }, format='json')
        self.assertEqual(r.status_code, 400)
        comp.refresh_from_db()
        mens.refresh_from_db()
        self.assertEqual(comp.estatus, 'pendiente')
        self.assertFalse(mens.pagado)
        self.assertEqual(Pago.objects.count(), 0)

    def test_comprobante_de_otro_banco_400(self):
        mens = Mensualidad.objects.create(alumno=self.alumno, mes=9, anio=2026, monto_usd=Decimal('10.00'))
        comp = ComprobantePago.objects.create(
            mensualidad=mens, archivo=SimpleUploadedFile('p.png', PNG_BYTES, content_type='image/png'),
            referencia_bancaria='88776655', metodo_pago='transferencia', banco_receptor=self.otro_banco,
        )
        r = self.client.post(URL_CONC, {
            'comprobante_id': comp.id, 'banco': self.banco.id,
            'transaccion': {'referencia': '88776655', 'fecha': '2026-10-01', 'monto': '400.00'},
        }, format='json')
        self.assertEqual(r.status_code, 400)

    def test_sede_ajena_404(self):
        sede_a = Sede.objects.create(nombre='Sede A')
        sede_b = Sede.objects.create(nombre='Sede B')
        PermisoSede.objects.create(user=self.user, sede=sede_a, rol='cobranza')
        ajeno = self.pago(sede=sede_b)
        r = self.client.post(URL_CONC, self.body(ajeno.operacion_uuid), format='json')
        self.assertEqual(r.status_code, 404)
        self.assertEqual(ConciliacionBancaria.objects.count(), 0)

    def test_validaciones_de_entrada(self):
        p = self.pago()
        self.assertEqual(self.client.post(URL_CONC, {'banco': self.banco.id}, format='json').status_code, 400)
        b = self.body(p.operacion_uuid)
        b['transaccion']['fecha'] = 'no-es-fecha'
        self.assertEqual(self.client.post(URL_CONC, b, format='json').status_code, 400)
        b = self.body('no-es-uuid')
        self.assertEqual(self.client.post(URL_CONC, b, format='json').status_code, 400)

    def test_sin_permiso_403(self):
        p = self.pago()
        docente = crear_usuario('conc_docente2', rol='docente')
        c = APIClient()
        c.force_authenticate(user=docente)
        self.assertEqual(c.post(URL_CONC, self.body(p.operacion_uuid), format='json').status_code, 403)


class LoteAbiertoTest(BaseConciliacionTest):
    def test_get_sin_lote_devuelve_null(self):
        resp = self.client.get(URL_ABIERTO)
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data['lote'])

    def test_conciliaciones_se_acumulan_en_el_mismo_lote_abierto(self):
        p1 = self.pago(referencia='00123456')
        p2 = self.pago(referencia='00555555')
        r1 = self.client.post(URL_CONC, self.body(p1.operacion_uuid), format='json')
        r2 = self.client.post(
            URL_CONC, self.body(p2.operacion_uuid, ref='00555555', fecha='2026-10-02'), format='json',
        )
        self.assertEqual(r1.data['lote']['id'], r2.data['lote']['id'])
        self.assertEqual(r2.data['lote']['total_operaciones'], 2)
        resp = self.client.get(URL_ABIERTO)
        lote = resp.data['lote']
        self.assertEqual(lote['total_operaciones'], 2)
        self.assertEqual(len(lote['conciliaciones']), 2)
        self.assertEqual(lote['conciliaciones'][0]['referencia_banco'], '00123456')
        self.assertEqual(lote['conciliaciones'][0]['banco'], 'Banco Conc Test')

    def test_un_solo_lote_abierto_por_usuario(self):
        hoy = date.today()
        LoteRevisionCaja.objects.create(usuario=self.user, estado='abierto', fecha_inicio=hoy, fecha_fin=hoy)
        with self.assertRaises(IntegrityError), transaction.atomic():
            LoteRevisionCaja.objects.create(usuario=self.user, estado='abierto', fecha_inicio=hoy, fecha_fin=hoy)
        # Varios finalizados sí se permiten, y otro usuario puede tener el suyo
        LoteRevisionCaja.objects.create(usuario=self.user, estado='finalizado', fecha_inicio=hoy, fecha_fin=hoy)
        LoteRevisionCaja.objects.create(usuario=self.user, estado='finalizado', fecha_inicio=hoy, fecha_fin=hoy)
        otro = crear_usuario('conc_otro')
        LoteRevisionCaja.objects.create(usuario=otro, estado='abierto', fecha_inicio=hoy, fecha_fin=hoy)

    def test_lote_abierto_es_por_usuario(self):
        p = self.pago()
        self.client.post(URL_CONC, self.body(p.operacion_uuid), format='json')
        otro = crear_usuario('conc_otro2')
        c = APIClient()
        c.force_authenticate(user=otro)
        self.assertIsNone(c.get(URL_ABIERTO).data['lote'])

    def test_finalizar_recalcula_fechas(self):
        p1 = self.pago(referencia='00123456')
        p2 = self.pago(referencia='00555555')
        hace_5 = timezone.now() - timedelta(days=5)
        hace_2 = timezone.now() - timedelta(days=2)
        Pago.objects.filter(pk=p1.pk).update(fecha_pago=hace_5)
        Pago.objects.filter(pk=p2.pk).update(fecha_pago=hace_2)
        self.client.post(URL_CONC, self.body(p1.operacion_uuid), format='json')
        self.client.post(
            URL_CONC, self.body(p2.operacion_uuid, ref='00555555', fecha='2026-10-02'), format='json',
        )
        r = self.client.post(URL_FINALIZAR)
        self.assertEqual(r.status_code, 200)
        lote = LoteRevisionCaja.objects.get(pk=r.data['id'])
        self.assertEqual(lote.estado, 'finalizado')
        self.assertEqual(lote.fecha_inicio, timezone.localtime(hace_5).date())
        self.assertEqual(lote.fecha_fin, timezone.localtime(hace_2).date())
        self.assertIsNone(self.client.get(URL_ABIERTO).data['lote'])
        # Tras finalizar se puede abrir otro lote
        p3 = self.pago(referencia='00777777')
        r3 = self.client.post(
            URL_CONC, self.body(p3.operacion_uuid, ref='00777777', fecha='2026-10-03'), format='json',
        )
        self.assertNotEqual(r3.data['lote']['id'], lote.id)

    def test_finalizar_sin_lote_404(self):
        self.assertEqual(self.client.post(URL_FINALIZAR).status_code, 404)

    def test_lote_manual_se_suma_al_lote_abierto_y_lo_finaliza(self):
        p1 = self.pago(referencia='00123456')
        p2 = self.pago(referencia='00555555')
        abierto = self.client.post(URL_CONC, self.body(p1.operacion_uuid), format='json').data['lote']['id']
        hoy = date.today().isoformat()
        r = self.client.post('/api/cobranza/conciliacion/lotes/', {
            'fecha_inicio': hoy, 'fecha_fin': hoy, 'pago_ids': [p2.id], 'observaciones': 'manual',
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data['id'], abierto)
        self.assertEqual(LoteRevisionCaja.objects.count(), 1)
        lote = LoteRevisionCaja.objects.get(pk=abierto)
        self.assertEqual(lote.estado, 'finalizado')
        self.assertEqual({p1.id, p2.id}, set(lote.pagos.values_list('id', flat=True)))
        self.assertEqual(lote.observaciones, 'manual')

    def test_lote_manual_sin_lote_abierto_se_comporta_como_antes(self):
        p = self.pago()
        hoy = date.today().isoformat()
        r = self.client.post('/api/cobranza/conciliacion/lotes/', {
            'fecha_inicio': hoy, 'fecha_fin': hoy, 'pago_ids': [p.id],
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data['estado'], 'finalizado')

    def test_historial_excluye_abiertos_y_detalle_expone_conciliaciones(self):
        p = self.pago()
        self.client.post(URL_CONC, self.body(p.operacion_uuid, monto='900.00', observacion='ok'), format='json')
        lista = self.client.get('/api/cobranza/conciliacion/lotes/')
        self.assertEqual(lista.data, [])
        lote_id = self.client.post(URL_FINALIZAR).data['id']
        lista = self.client.get('/api/cobranza/conciliacion/lotes/')
        self.assertEqual([l['id'] for l in lista.data], [lote_id])
        det = self.client.get(f'/api/cobranza/conciliacion/lotes/{lote_id}/')
        self.assertEqual(len(det.data['conciliaciones']), 1)
        c = det.data['conciliaciones'][0]
        self.assertTrue(c['fuera_tolerancia'])
        self.assertEqual(c['observacion'], 'ok')
        self.assertEqual(Decimal(c['monto_banco_ves']), Decimal('900.00'))

    def test_resumen_expone_conciliacion_bancaria_y_filtra_fuera_de_tolerancia(self):
        hoy = date.today().isoformat()
        p_ok = self.pago(referencia='00123456')
        p_fuera = self.pago(referencia='00555555', alumno=self.hermano)
        self.client.post(URL_CONC, self.body(p_ok.operacion_uuid, monto='410.00'), format='json')
        self.client.post(
            URL_CONC,
            self.body(p_fuera.operacion_uuid, monto='900.00', ref='00555555', fecha='2026-10-02', observacion='x'),
            format='json',
        )
        params = {'fecha_desde': hoy, 'fecha_hasta': hoy}
        resp = self.client.get('/api/cobranza/conciliacion/resumen/', params)
        self.assertEqual(resp.status_code, 200)
        pagos = [p for rep in resp.data['results'] for p in rep['pagos']]
        por_id = {p['id']: p for p in pagos}
        self.assertEqual(por_id[p_ok.id]['conciliacion_bancaria']['referencia_banco'], '00123456')
        self.assertFalse(por_id[p_ok.id]['conciliacion_bancaria']['fuera_tolerancia'])
        self.assertTrue(por_id[p_fuera.id]['conciliacion_bancaria']['fuera_tolerancia'])
        self.assertTrue(por_id[p_ok.id]['revisado'])

        resp = self.client.get('/api/cobranza/conciliacion/resumen/', {**params, 'fuera_tolerancia': 'true'})
        pagos = [p for rep in resp.data['results'] for p in rep['pagos']]
        self.assertEqual([p['id'] for p in pagos], [p_fuera.id])
