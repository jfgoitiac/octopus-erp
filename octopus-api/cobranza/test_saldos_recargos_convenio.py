from decimal import Decimal
from unittest.mock import patch

from rest_framework.test import APIRequestFactory, force_authenticate

from secretaria.models import Alumno
from portal.views import PortalDashboardView
from . import gestion
from .models import Pago, RecargoConvenio, ReglaCobranza
from .mora import annotate_mora_detalle, enriquecer_monto_adeudado_con_recargo
from .motor import construir_mensaje
from .saldos_recargos_convenio import items_penalidades_convenio, saldos_penalidades_por_alumno
from .test_recargos_convenio import RecargoConvenioBase
from .test_motor_cobranza import HOY, AHORA
from .views import BuscarAlumnoCobranzaView, ListaMorososView
from notificaciones.cobro_whatsapp import agrupar_morosos_por_representante


class SaldosPenalidadesConvenioTest(RecargoConvenioBase):
    def setUp(self):
        super().setUp()
        self.ciclo1, self.convenio = self.crear(configuracion=self.configuracion())
        self.ciclo2 = self.ciclo(cedula='E2')
        self.convenio.ciclos.add(self.ciclo2)
        gestion.incumplir_convenio(self.convenio, momento=AHORA)
        self.alumno1 = self.ciclo1.mensualidad.alumno
        self.alumno2 = self.ciclo2.mensualidad.alumno
        self.ids = [self.alumno1.id, self.alumno2.id]

    def test_ancla_estable_no_duplica_hermanos_ni_paginacion(self):
        items = items_penalidades_convenio(alumno_ids=self.ids, hoy=HOY)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['alumno_id'], min(self.ids))
        montos = saldos_penalidades_por_alumno(self.ids, HOY)
        self.assertEqual(sum(montos.values()), Decimal('5.00'))
        paginas = sum((sum(saldos_penalidades_por_alumno([pk], HOY).values()) for pk in self.ids), Decimal('0.00'))
        self.assertEqual(paginas, Decimal('5.00'))

    def test_anulado_no_es_deuda_y_fecha_futura_no_se_cobra(self):
        recargo = self.convenio.recargos_incumplimiento.get()
        self.assertEqual(items_penalidades_convenio(alumno_ids=self.ids, hoy=HOY.replace(day=19)), [])
        recargo.estado = RecargoConvenio.ANULADO
        recargo.save(update_fields=['estado'])
        self.assertEqual(items_penalidades_convenio(alumno_ids=self.ids, hoy=HOY), [])

    def test_pago_anulado_reabre_penalidad_sin_perder_auditoria(self):
        pago = Pago.objects.create(alumno=self.alumno1, usuario_receptor=self.admin,
                                  concepto='multa', metodo_pago='efectivo', monto_usd='5.00',
                                  tasa_aplicada='40.00', sede=self.sede)
        recargo = self.convenio.recargos_incumplimiento.get()
        recargo.estado, recargo.pago = RecargoConvenio.PAGADO, pago
        recargo.save(update_fields=['estado', 'pago'])
        self.assertEqual(items_penalidades_convenio(alumno_ids=self.ids, hoy=HOY), [])
        pago.estatus = 'anulado'
        pago.save(update_fields=['estatus'])
        self.assertEqual(sum(saldos_penalidades_por_alumno(self.ids, HOY).values()), Decimal('5.00'))
        recargo.refresh_from_db()
        self.assertEqual(recargo.pago_id, pago.id)

    def test_penalidad_permanece_aunque_principal_y_ciclos_se_cierren(self):
        for ciclo in (self.ciclo1, self.ciclo2):
            m = ciclo.mensualidad
            m.monto_pagado = m.monto_usd
            m.save()
            ciclo.estado = ciclo.CERRADA
            ciclo.save(update_fields=['estado'])
        alumnos = list(annotate_mora_detalle(Alumno.objects.filter(id__in=self.ids), HOY))
        ancla = next(a for a in alumnos if a.id == min(self.ids))
        self.assertTrue(ancla.en_mora)
        enriquecidos = enriquecer_monto_adeudado_con_recargo(alumnos, HOY)
        self.assertEqual(sum(a.monto_adeudado for a in enriquecidos), Decimal('5.00'))

    @patch('django.utils.timezone.localdate', return_value=HOY)
    def test_retiro_del_alumno_no_elimina_deuda_familiar_ni_del_dashboard(self, _fecha):
        self.alumno1.activo = False
        self.alumno1.save(update_fields=['activo'])
        items = items_penalidades_convenio(representante_ids=[self.rep.id], hoy=HOY)
        self.assertEqual(sum(p['monto_usd'] for p in items), Decimal('5.00'))
        from .dashboard import calcular_dashboard
        dashboard = calcular_dashboard({self.sede.id}, hoy=HOY, ahora=AHORA)
        self.assertEqual(dashboard['total_penalidades_convenio_usd'], '5.00')
        self.assertIn(self.alumno1.pk, ListaMorososView._build_qs(HOY, user=self.admin).values_list('id', flat=True))
        request = APIRequestFactory().get('/api/cobranza/buscar/V1/')
        force_authenticate(request, user=self.admin)
        caja = BuscarAlumnoCobranzaView.as_view()(request, cedula=self.rep.cedula)
        self.assertEqual(caja.status_code, 200)
        self.assertIn(self.alumno1.pk, [a['id'] for a in caja.data['alumnos']])
        retirado = next(a for a in caja.data['alumnos'] if a['id'] == self.alumno1.pk)
        self.assertEqual(retirado['mensualidades_pendientes'], [])
        self.assertEqual(retirado['detalle_deuda'], [])
        self.assertEqual(retirado['total_penalidades_convenio_usd'], '5.00')
        morosos = enriquecer_monto_adeudado_con_recargo(
            list(ListaMorososView._build_qs(HOY, user=self.admin)), HOY)
        self.assertEqual(next(a for a in morosos if a.id == self.alumno1.id).monto_adeudado, Decimal('5.00'))
        aviso = agrupar_morosos_por_representante(morosos, HOY)[0]
        self.assertEqual(aviso['monto_total'], Decimal('55.00'))
        request = APIRequestFactory().get('/api/portal/dashboard/')
        force_authenticate(request, user=self.admin)
        with patch('portal.views._get_representante', return_value=self.rep):
            respuesta = PortalDashboardView.as_view()(request)
        detalle = respuesta.data['resumen_financiero']['deuda_por_alumno']
        ancla = next(d for d in detalle if d['alumno_id'] == self.alumno1.id)
        self.assertEqual(Decimal(str(ancla['deuda_usd'])), Decimal('5.00'))

    def test_dashboard_no_expone_penalidades_de_otra_sede(self):
        from .dashboard import calcular_dashboard
        self.assertEqual(calcular_dashboard({None}, hoy=HOY, ahora=AHORA)['total_penalidades_convenio_usd'], '0.00')

    @patch('django.utils.timezone.localdate', return_value=HOY)
    def test_portal_caja_morosos_y_avisos_comparten_total(self, _fecha):
        alumnos = list(annotate_mora_detalle(Alumno.objects.filter(id__in=self.ids), HOY))
        morosos = enriquecer_monto_adeudado_con_recargo(alumnos, HOY)
        self.assertEqual(sum(a.monto_adeudado for a in morosos), Decimal('105.00'))
        caja = [BuscarAlumnoCobranzaView()._alumno_data(a) for a in alumnos]
        self.assertEqual(sum(Decimal(a['total_penalidades_convenio_usd']) for a in caja), Decimal('5.00'))
        request = APIRequestFactory().get('/api/portal/dashboard/')
        force_authenticate(request, user=self.admin)
        with patch('portal.views._get_representante', return_value=self.rep):
            respuesta = PortalDashboardView.as_view()(request)
        self.assertEqual(respuesta.status_code, 200)
        resumen = respuesta.data['resumen_financiero']
        self.assertEqual(Decimal(str(resumen['total_deuda_usd'])), Decimal('105.00'))
        self.assertEqual(resumen['total_penalidades_convenio_usd'], '5.00')
        self.assertEqual(len(resumen['penalidades_convenio']), 1)
        grupo = agrupar_morosos_por_representante(alumnos, HOY)[0]
        self.assertEqual(grupo['monto_total'], Decimal('105.00'))
        self.assertEqual(grupo['total_penalidades_convenio_usd'], Decimal('5.00'))
        regla = ReglaCobranza.objects.filter(sede=self.sede).first()
        _, mensaje = construir_mensaje(self.rep, [self.ciclo1, self.ciclo2], regla)
        self.assertEqual(mensaje.count(f'Penalidad del convenio #{self.convenio.id}'), 1)
        self.assertIn('$5.00', mensaje)
