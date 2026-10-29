"""
Tests de la revisión de comprobantes del portal (contrato 2026-10-29):
el representante solo sube el archivo y el revisor del colegio llena
referencia, banco, método, fecha, monto y moneda al aprobar.
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken

from cobranza.models import AplicacionPago, BancoInstitucional, Pago, TasaCambio
from notificaciones.models import PlantillaAviso

from .models import AvisoPortal, ComprobantePago, MotivoRechazo
from .tests import (
    PNG_BYTES, PortalTestBase, asignar_rol, crear_alumno, crear_mensualidad,
    crear_representante_con_portal,
)

User = get_user_model()

URL = '/api/portal/admin/comprobantes/'


def crear_tasa(valor, fecha):
    """TasaCambio.fecha es auto_now_add: se corrige con update()."""
    tasa = TasaCambio.objects.create(valor_bs=Decimal(valor))
    momento = timezone.make_aware(datetime.combine(fecha, time(9, 0)))
    TasaCambio.objects.filter(pk=tasa.pk).update(fecha=momento)
    tasa.refresh_from_db()
    return tasa


class RevisionBase(PortalTestBase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(
            username='revisor1', password='clave123456', email='revisor@example.com'
        )
        asignar_rol(self.admin, 'cobranza')
        self.admin_token = str(RefreshToken.for_user(self.admin).access_token)
        self.banco = BancoInstitucional.objects.create(
            nombre='Banesco', tipos=['transferencia', 'pago_movil'],
        )
        self.ayer = timezone.localdate() - timedelta(days=1)
        self.hace_10 = timezone.localdate() - timedelta(days=10)
        # Tasa vieja y tasa de ayer: debe usarse la de la fecha del pago,
        # no la última del sistema.
        crear_tasa('30.0000', self.hace_10)
        crear_tasa('40.5000', self.ayer)
        crear_tasa('50.0000', timezone.localdate())
        self.comprobante = self._comprobante(self.mensualidad)

    def _comprobante(self, mensualidad, **kwargs):
        return ComprobantePago.objects.create(
            mensualidad=mensualidad,
            archivo=SimpleUploadedFile('pago.png', PNG_BYTES, content_type='image/png'),
            **kwargs,
        )

    def _auth_admin(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.admin_token}')

    def _datos(self, **extra):
        datos = {
            'estatus': 'aprobado', 'referencia': '123456', 'banco_receptor_id': self.banco.id,
            'metodo_pago': 'pago_movil', 'fecha_pago': self.ayer.isoformat(),
            'monto_recibido': '1417.50', 'moneda': 'VES', 'observaciones': '',
        }
        datos.update(extra)
        return datos

    def _aprobar(self, comprobante=None, **extra):
        self._auth_admin()
        with mock.patch('notificaciones.tasks.task_notificar_comprobante_resuelto.delay') as delay:
            resp = self.client.patch(
                f'{URL}{(comprobante or self.comprobante).id}/', self._datos(**extra), format='json',
            )
        self.delay = delay
        return resp


class AprobarConDatosTests(RevisionBase):
    def test_pago_completo_con_la_tasa_de_la_fecha(self):
        # 35 USD * 40.50 = 1417.50 Bs (tasa de AYER, no la de hoy ni la vieja)
        resp = self._aprobar()
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data['abono_usd'], '35.00')
        self.assertEqual(resp.data['saldo_pendiente_usd'], '0.00')
        self.assertEqual(resp.data['excedente_usd'], '0.00')

        self.mensualidad.refresh_from_db()
        self.assertTrue(self.mensualidad.pagado)
        self.assertEqual(self.mensualidad.monto_pagado, Decimal('35.00'))
        self.assertEqual(self.mensualidad.fecha_pago.date(), self.ayer)

        pago = Pago.objects.get()
        self.assertEqual(pago.monto_usd, Decimal('35.00'))
        self.assertEqual(pago.monto_ves, Decimal('1417.50'))
        self.assertEqual(pago.tasa_aplicada, Decimal('40.50'))
        self.assertEqual(pago.referencia, '123456')
        self.assertEqual(pago.metodo_pago, 'pago_movil')
        self.assertEqual(pago.banco_receptor_id, self.banco.id)
        self.assertEqual(timezone.localtime(pago.fecha_pago).date(), self.ayer)
        self.assertIn(pago, self.mensualidad.pagos.all())
        aplicacion = AplicacionPago.objects.get(pago=pago)
        self.assertEqual(aplicacion.monto_abonado_usd, Decimal('35.00'))

        self.comprobante.refresh_from_db()
        self.assertEqual(self.comprobante.estatus, 'aprobado')
        self.assertEqual(self.comprobante.pago_id, pago.id)
        self.assertEqual(self.comprobante.tasa_aplicada, Decimal('40.5000'))
        self.assertEqual(self.comprobante.monto_usd_aplicado, Decimal('35.00'))
        self.assertEqual(self.comprobante.revisado_por, self.admin)
        self.assertIsNotNone(self.comprobante.fecha_revision)
        self.assertEqual(self.comprobante.referencia_bancaria, '123456')
        self.delay.assert_called_once_with(self.comprobante.id)

    def test_monto_en_usd_no_convierte(self):
        resp = self._aprobar(metodo_pago='zelle', moneda='USD', monto_recibido='35')
        self.assertEqual(resp.status_code, 200, resp.content)
        pago = Pago.objects.get()
        self.assertEqual(pago.monto_usd, Decimal('35.00'))
        self.assertEqual(pago.monto_ves, Decimal('1417.50'))

    def test_moneda_por_defecto_segun_metodo(self):
        resp = self._aprobar(metodo_pago='zelle', moneda='', monto_recibido='35')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.comprobante.refresh_from_db()
        self.assertEqual(self.comprobante.moneda, 'USD')

    def test_pago_parcial_deja_la_mensualidad_pendiente(self):
        resp = self._aprobar(monto_recibido='810.00')  # 20 USD
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data['abono_usd'], '20.00')
        self.assertEqual(resp.data['saldo_pendiente_usd'], '15.00')
        self.assertTrue(any('parcial' in a.lower() for a in resp.data['advertencias']))
        self.mensualidad.refresh_from_db()
        self.assertFalse(self.mensualidad.pagado)
        self.assertEqual(self.mensualidad.monto_pagado, Decimal('20.00'))
        self.assertEqual(Pago.objects.get().monto_usd, Decimal('20.00'))

    def test_excedente_solo_aplica_el_saldo(self):
        resp = self._aprobar(metodo_pago='zelle', moneda='USD', monto_recibido='50')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data['abono_usd'], '35.00')
        self.assertEqual(resp.data['excedente_usd'], '15.00')
        self.assertEqual(resp.data['saldo_pendiente_usd'], '0.00')
        self.assertTrue(any('excedente' in a.lower() for a in resp.data['advertencias']))
        self.mensualidad.refresh_from_db()
        self.assertEqual(self.mensualidad.monto_pagado, Decimal('35.00'))
        # El Pago registra lo realmente recibido; la aplicación, solo el saldo.
        pago = Pago.objects.get()
        self.assertEqual(pago.monto_usd, Decimal('50.00'))
        self.assertEqual(AplicacionPago.objects.get(pago=pago).monto_abonado_usd, Decimal('35.00'))

    def test_referencia_duplicada_en_pago_devuelve_400_y_no_aprueba(self):
        Pago.objects.create(
            alumno=self.alumno, usuario_receptor=self.admin, metodo_pago='pago_movil',
            banco_receptor=self.banco, monto_usd=Decimal('10.00'), tasa_aplicada=Decimal('40.50'),
            monto_ves=Decimal('405.00'), referencia='123456', estatus='completado',
        )
        resp = self._aprobar()
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertIn('referencia', resp.data['campos'])
        self.comprobante.refresh_from_db()
        self.assertEqual(self.comprobante.estatus, 'pendiente')
        self.mensualidad.refresh_from_db()
        self.assertEqual(self.mensualidad.monto_pagado, Decimal('0.00'))
        self.assertEqual(Pago.objects.count(), 1)
        self.delay.assert_not_called()

    def test_referencia_duplicada_en_otro_comprobante_pendiente(self):
        hoy = date.today()
        otra = crear_mensualidad(self.alumno, (hoy.month % 12) + 1, hoy.year + (1 if hoy.month == 12 else 0))
        self._comprobante(otra, referencia_bancaria='123456', metodo_pago='pago_movil',
                          banco_receptor=self.banco)
        resp = self._aprobar()
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertIn('referencia', resp.data['campos'])

    def test_misma_referencia_otro_banco_no_es_duplicado(self):
        otro_banco = BancoInstitucional.objects.create(nombre='Mercantil', tipos=['pago_movil'])
        Pago.objects.create(
            alumno=self.alumno, usuario_receptor=self.admin, metodo_pago='pago_movil',
            banco_receptor=otro_banco, monto_usd=Decimal('10.00'), tasa_aplicada=Decimal('40.50'),
            monto_ves=Decimal('405.00'), referencia='123456', estatus='completado',
        )
        resp = self._aprobar()
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_faltan_datos_devuelve_400_con_campos(self):
        self._auth_admin()
        resp = self.client.patch(f'{URL}{self.comprobante.id}/', {'estatus': 'aprobado'}, format='json')
        self.assertEqual(resp.status_code, 400)
        for campo in ('referencia', 'banco_receptor_id', 'metodo_pago', 'fecha_pago', 'monto_recibido'):
            self.assertIn(campo, resp.data['campos'])
        self.comprobante.refresh_from_db()
        self.assertEqual(self.comprobante.estatus, 'pendiente')

    def test_fecha_futura_y_monto_cero_se_rechazan(self):
        manana = (timezone.localdate() + timedelta(days=1)).isoformat()
        resp = self._aprobar(fecha_pago=manana, monto_recibido='0')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('fecha_pago', resp.data['campos'])
        self.assertIn('monto_recibido', resp.data['campos'])

    def test_sin_tasa_y_moneda_ves_devuelve_400(self):
        TasaCambio.objects.all().delete()
        resp = self._aprobar()
        self.assertEqual(resp.status_code, 400)
        self.assertIn('fecha_pago', resp.data['campos'])

    def test_ya_procesado_devuelve_409(self):
        self.assertEqual(self._aprobar().status_code, 200)
        self.assertEqual(self._aprobar(referencia='999').status_code, 409)

    def test_aprobar_crea_aviso_aprobado(self):
        resp = self._aprobar()
        self.assertEqual(resp.status_code, 200)
        aviso = AvisoPortal.objects.get(usuario_portal=self.rep_user)
        self.assertEqual(aviso.tipo, 'comprobante_aprobado')
        self.assertIn('REF. 35,00', aviso.cuerpo)

    def test_conciliacion_sin_datos_conserva_el_comportamiento_anterior(self):
        """El servicio sin datos_pago (conciliación bancaria) sigue marcando la
        mensualidad pagada por el nominal."""
        from .services import aprobar_comprobante
        comprobante, pago, mensualidad, _ = aprobar_comprobante(self.comprobante.id, self.admin)
        mensualidad.refresh_from_db()
        self.assertTrue(mensualidad.pagado)
        self.assertEqual(pago.monto_usd, Decimal('35.00'))
        self.assertEqual(comprobante.revisado_por, self.admin)
        self.assertEqual(comprobante.pago_id, pago.id)


class RechazoTests(RevisionBase):
    def _rechazar(self, datos):
        self._auth_admin()
        with mock.patch('notificaciones.tasks.task_notificar_comprobante_resuelto.delay') as delay:
            resp = self.client.patch(f'{URL}{self.comprobante.id}/', datos, format='json')
        self.delay = delay
        return resp

    def test_rechazo_con_motivo_crea_aviso_y_compone_el_texto(self):
        motivo = MotivoRechazo.objects.get(nombre='Monto no coincide')
        resp = self._rechazar({
            'estatus': 'rechazado', 'motivo_rechazo_id': motivo.id,
            'observaciones': 'Faltan 5 USD',
        })
        self.assertEqual(resp.status_code, 200, resp.content)
        self.comprobante.refresh_from_db()
        self.assertEqual(self.comprobante.estatus, 'rechazado')
        self.assertEqual(self.comprobante.motivo_rechazo_id, motivo.id)
        self.assertEqual(self.comprobante.observaciones, f'{motivo.texto}\nFaltan 5 USD')
        self.assertEqual(self.comprobante.revisado_por, self.admin)
        self.mensualidad.refresh_from_db()
        self.assertFalse(self.mensualidad.pagado)

        aviso = AvisoPortal.objects.get(usuario_portal=self.rep_user)
        self.assertEqual(aviso.tipo, 'comprobante_rechazado')
        self.assertIn(motivo.texto, aviso.cuerpo)
        self.assertIn('Faltan 5 USD', aviso.cuerpo)
        self.assertNotIn('{{', aviso.cuerpo + aviso.titulo)
        self.delay.assert_called_once_with(self.comprobante.id)

    def test_rechazo_sin_motivo_ni_observaciones_devuelve_400(self):
        resp = self._rechazar({'estatus': 'rechazado'})
        self.assertEqual(resp.status_code, 400)
        self.assertIn('campos', resp.data)
        self.comprobante.refresh_from_db()
        self.assertEqual(self.comprobante.estatus, 'pendiente')

    def test_rechazo_solo_con_observaciones(self):
        resp = self._rechazar({'estatus': 'rechazado', 'observaciones': 'Ilegible'})
        self.assertEqual(resp.status_code, 200)
        self.comprobante.refresh_from_db()
        self.assertEqual(self.comprobante.observaciones, 'Ilegible')

    def test_tarea_envia_email_de_rechazo_con_la_plantilla(self):
        motivo = MotivoRechazo.objects.first()
        self._rechazar({'estatus': 'rechazado', 'motivo_rechazo_id': motivo.id})
        from notificaciones.tasks import task_notificar_comprobante_resuelto
        mail.outbox = []
        task_notificar_comprobante_resuelto(self.comprobante.id)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.rep.correo])
        self.assertIn('fue rechazado', mail.outbox[0].subject)
        self.assertIn(motivo.texto, mail.outbox[0].body)

    def test_fallo_al_encolar_no_rompe_la_revision(self):
        self._auth_admin()
        with mock.patch('notificaciones.tasks.task_notificar_comprobante_resuelto.delay',
                        side_effect=Exception('redis caído')):
            resp = self.client.patch(
                f'{URL}{self.comprobante.id}/', {'estatus': 'rechazado', 'observaciones': 'x'},
                format='json',
            )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(AvisoPortal.objects.filter(usuario_portal=self.rep_user).exists())


class DetalleListaTasaTests(RevisionBase):
    def test_lista_trae_campos_nuevos(self):
        self._auth_admin()
        resp = self.client.get(f'{URL}?estatus=pendiente')
        self.assertEqual(resp.status_code, 200)
        fila = resp.data[0]
        for campo in ('referencia_bancaria', 'metodo_pago', 'banco_receptor_id', 'banco_receptor_nombre'):
            self.assertIn(campo, fila)

    def test_detalle_pendiente(self):
        self._auth_admin()
        resp = self.client.get(f'{URL}{self.comprobante.id}/')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data['archivo_tipo'], 'imagen')
        self.assertEqual(resp.data['saldo_pendiente_usd'], '35.00')
        self.assertEqual(resp.data['mensualidad_id'], self.mensualidad.id)
        self.assertIsNone(resp.data['revision'])
        self.assertEqual(resp.data['advertencias'], [])

    def test_detalle_advierte_hash_repetido_sin_modificar(self):
        self.comprobante.hash_archivo = 'abc'
        self.comprobante.save()
        hoy = date.today()
        otra = crear_mensualidad(self.alumno, (hoy.month % 12) + 1, hoy.year + (1 if hoy.month == 12 else 0))
        self._comprobante(otra, hash_archivo='abc', estatus='aprobado')
        self._auth_admin()
        resp = self.client.get(f'{URL}{self.comprobante.id}/')
        self.assertEqual(len(resp.data['advertencias']), 1)
        self.comprobante.refresh_from_db()
        self.assertEqual(self.comprobante.estatus, 'pendiente')

    def test_detalle_revisado_trae_revision(self):
        self._aprobar()
        resp = self.client.get(f'{URL}{self.comprobante.id}/')
        revision = resp.data['revision']
        self.assertEqual(revision['fecha_pago'], self.ayer.isoformat())
        self.assertEqual(revision['moneda'], 'VES')
        self.assertEqual(revision['tasa_aplicada'], '40.5000')
        self.assertEqual(revision['monto_usd_aplicado'], '35.00')
        self.assertEqual(revision['revisado_por'], 'revisor1')
        self.assertEqual(revision['pago_id'], Pago.objects.get().id)

    def test_detalle_inexistente_404(self):
        self._auth_admin()
        self.assertEqual(self.client.get(f'{URL}999999/').status_code, 404)

    def test_tasa_por_fecha(self):
        self._auth_admin()
        resp = self.client.get(f'{URL}tasa/?fecha={self.ayer.isoformat()}')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['valor_bs'], '40.5000')
        self.assertEqual(resp.data['fuente'], 'BCV')
        # Sin tasa ese día: la última anterior.
        resp = self.client.get(f'{URL}tasa/?fecha={(self.hace_10 + timedelta(days=2)).isoformat()}')
        self.assertEqual(resp.data['valor_bs'], '30.0000')
        resp = self.client.get(f'{URL}tasa/?fecha=2000-01-01')
        self.assertEqual(resp.status_code, 404)

    def test_representante_no_accede_a_la_revision(self):
        self.auth_portal()
        self.assertIn(self.client.get(f'{URL}{self.comprobante.id}/').status_code, (401, 403))
        self.assertIn(self.client.get('/api/portal/admin/motivos-rechazo/').status_code, (401, 403))


class MotivosRechazoTests(RevisionBase):
    def test_semilla_y_filtro_activos(self):
        self._auth_admin()
        resp = self.client.get('/api/portal/admin/motivos-rechazo/')
        self.assertEqual(len(resp.data), 5)
        MotivoRechazo.objects.filter(nombre='Comprobante ilegible').update(activo=False)
        resp = self.client.get('/api/portal/admin/motivos-rechazo/?activos=1')
        self.assertEqual(len(resp.data), 4)

    def test_crear_editar_y_borrar(self):
        self._auth_admin()
        resp = self.client.post('/api/portal/admin/motivos-rechazo/',
                                {'nombre': 'Otro', 'texto': 'Texto'}, format='json')
        self.assertEqual(resp.status_code, 201, resp.content)
        motivo_id = resp.data['id']
        resp = self.client.patch(f'/api/portal/admin/motivos-rechazo/{motivo_id}/',
                                 {'texto': 'Nuevo texto'}, format='json')
        self.assertEqual(resp.data['texto'], 'Nuevo texto')
        resp = self.client.delete(f'/api/portal/admin/motivos-rechazo/{motivo_id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(MotivoRechazo.objects.filter(pk=motivo_id).exists())

    def test_borrar_motivo_usado_lo_desactiva(self):
        motivo = MotivoRechazo.objects.first()
        self.comprobante.motivo_rechazo = motivo
        self.comprobante.save()
        self._auth_admin()
        resp = self.client.delete(f'/api/portal/admin/motivos-rechazo/{motivo.id}/')
        self.assertEqual(resp.status_code, 200)
        motivo.refresh_from_db()
        self.assertFalse(motivo.activo)

    def test_crear_sin_texto_400(self):
        self._auth_admin()
        resp = self.client.post('/api/portal/admin/motivos-rechazo/', {'nombre': 'X'}, format='json')
        self.assertEqual(resp.status_code, 400)


class AvisosPortalTests(RevisionBase):
    def setUp(self):
        super().setUp()
        self.aviso1 = AvisoPortal.objects.create(usuario_portal=self.rep_user, tipo='otro', titulo='A1')
        self.aviso2 = AvisoPortal.objects.create(usuario_portal=self.rep_user, tipo='otro', titulo='A2')
        _rep2, _u2, self.rep_user2 = crear_representante_con_portal('V22222222', 'rep2@example.com', 'clave-x-123456')
        self.ajeno = AvisoPortal.objects.create(usuario_portal=self.rep_user2, tipo='otro', titulo='Ajeno')

    def test_solo_ve_los_propios(self):
        self.auth_portal()
        resp = self.client.get('/api/portal/avisos/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['no_leidos'], 2)
        titulos = [a['titulo'] for a in resp.data['resultados']]
        self.assertEqual(titulos, ['A2', 'A1'])
        self.assertFalse(resp.data['resultados'][0]['leido'])

    def test_marcar_leido_y_no_tocar_ajenos(self):
        self.auth_portal()
        resp = self.client.post(f'/api/portal/avisos/{self.aviso1.id}/leer/')
        self.assertEqual(resp.data, {'ok': True})
        self.aviso1.refresh_from_db()
        self.assertIsNotNone(self.aviso1.leido_en)
        self.assertEqual(self.client.post(f'/api/portal/avisos/{self.ajeno.id}/leer/').status_code, 404)
        self.ajeno.refresh_from_db()
        self.assertIsNone(self.ajeno.leido_en)

    def test_leer_todos(self):
        self.auth_portal()
        resp = self.client.post('/api/portal/avisos/leer-todos/')
        self.assertEqual(resp.data, {'ok': True, 'marcados': 2})
        self.ajeno.refresh_from_db()
        self.assertIsNone(self.ajeno.leido_en)
        self.assertEqual(self.client.get('/api/portal/avisos/').data['no_leidos'], 0)

    def test_token_admin_no_sirve(self):
        self._auth_admin()
        self.assertEqual(self.client.get('/api/portal/avisos/').status_code, 401)


class SubidaIgnoraDatosBancariosTests(PortalTestBase):
    def test_subida_ignora_referencia_metodo_y_banco(self):
        banco = BancoInstitucional.objects.create(nombre='Banesco', tipos=['transferencia'])
        self.auth_portal()
        with mock.patch('portal.tasks.notificar_comprobante_subido.delay'):
            resp = self.client.post('/api/portal/comprobante/', {
                'mensualidad_id': self.mensualidad.id,
                'archivo': SimpleUploadedFile('pago.png', PNG_BYTES, content_type='image/png'),
                'referencia_bancaria': '123456', 'metodo_pago': 'zelle', 'banco_receptor_id': banco.id,
            }, format='multipart')
        self.assertEqual(resp.status_code, 201, resp.content)
        comprobante = ComprobantePago.objects.get()
        self.assertIsNone(comprobante.referencia_bancaria)
        self.assertIsNone(comprobante.metodo_pago)
        self.assertIsNone(comprobante.banco_receptor_id)

    def test_subida_sin_referencia_es_valida(self):
        self.auth_portal()
        with mock.patch('portal.tasks.notificar_comprobante_subido.delay'):
            resp = self.client.post('/api/portal/comprobante/', {
                'mensualidad_id': self.mensualidad.id,
                'archivo': SimpleUploadedFile('pago.png', PNG_BYTES, content_type='image/png'),
            }, format='multipart')
        self.assertEqual(resp.status_code, 201, resp.content)


class PlantillasAvisoTests(RevisionBase):
    def test_get_trae_las_sembradas_y_los_tokens(self):
        self._auth_admin()
        resp = self.client.get('/api/notificaciones/plantillas-aviso/')
        self.assertEqual(resp.status_code, 200)
        claves = {p['clave'] for p in resp.data['plantillas']}
        self.assertEqual(claves, {'comprobante_rechazado', 'comprobante_aprobado'})
        tokens = {t['token'] for t in resp.data['tokens']}
        self.assertIn('{{motivo}}', tokens)
        self.assertIn('{{portal.link}}', tokens)

    def test_patch_cambia_el_texto_del_aviso(self):
        plantilla = PlantillaAviso.objects.get(clave='comprobante_rechazado')
        self._auth_admin()
        resp = self.client.patch(f'/api/notificaciones/plantillas-aviso/{plantilla.id}/', {
            'asunto': 'Rechazado: {{mensualidad}}', 'cuerpo': 'Hola {{representante.nombre}}. {{motivo}}',
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.comprobante.estatus = 'rechazado'
        self.comprobante.observaciones = 'Ilegible'
        self.comprobante.save()
        from .services import crear_aviso_comprobante
        aviso = crear_aviso_comprobante(self.comprobante)
        self.assertEqual(aviso.titulo, f'Rechazado: {self.mensualidad.get_mes_display()} {self.mensualidad.anio}')
        self.assertEqual(aviso.cuerpo, 'Hola Maria Gonzalez. Ilegible')

    def test_patch_vacio_400(self):
        plantilla = PlantillaAviso.objects.get(clave='comprobante_rechazado')
        self._auth_admin()
        resp = self.client.patch(f'/api/notificaciones/plantillas-aviso/{plantilla.id}/',
                                 {'cuerpo': '  '}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_inactiva_usa_el_texto_por_defecto(self):
        from notificaciones.plantillas_aviso import TEXTOS_POR_DEFECTO, plantilla_vigente
        PlantillaAviso.objects.filter(clave='comprobante_aprobado').update(
            activa=False, asunto='Personalizado')
        asunto, _ = plantilla_vigente('comprobante_aprobado')
        self.assertEqual(asunto, TEXTOS_POR_DEFECTO['comprobante_aprobado']['asunto'])
        PlantillaAviso.objects.all().delete()
        asunto, _ = plantilla_vigente('comprobante_rechazado')
        self.assertEqual(asunto, TEXTOS_POR_DEFECTO['comprobante_rechazado']['asunto'])

    def test_render_reemplaza_todos_los_tokens(self):
        from notificaciones.plantillas_aviso import TOKENS_AVISO, renderizar_texto
        texto = ' '.join(t['token'] for t in TOKENS_AVISO)
        valores = {t['token']: 'X' for t in TOKENS_AVISO}
        self.assertEqual(renderizar_texto(texto, valores), ' '.join('X' for _ in TOKENS_AVISO))

    def test_representante_sin_portal_no_genera_aviso(self):
        from secretaria.models import Representante
        from .services import crear_aviso_comprobante
        rep = Representante.objects.create(
            cedula='V33333333', nombre='Ana', apellido='Paz', telefono='0414', correo='a@x.com',
            direccion='x',
        )
        alumno = crear_alumno(rep, 'E84000099')
        m = crear_mensualidad(alumno, 1, 2026)
        c = self._comprobante(m, estatus='rechazado', observaciones='x')
        self.assertIsNone(crear_aviso_comprobante(c))
