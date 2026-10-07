"""Conciliación masiva: filtro de fechas, propuestas automáticas y confirmación en lote."""
from datetime import date, datetime, time
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

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
