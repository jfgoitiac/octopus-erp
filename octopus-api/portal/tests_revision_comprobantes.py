"""
Tests de la revisión de comprobantes del portal (contratos 2026-10-29):
el representante solo sube el archivo; el colegio lo rechaza desde el panel
o lo aprueba registrando el pago en caja (comprobante_portal_id).
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

    def _pagar(self, comprobante=None, monto_ves='1750.00', **extra):
        """Procesa el comprobante en caja (POST cobranza/registrar-pago/).
        Por defecto: 35 USD a la tasa de hoy (50) en una línea de pago móvil."""
        self._auth_admin()
        payload = {
            'alumnos': [{'alumno_id': self.alumno.id, 'mensualidad_ids': [self.mensualidad.id]}],
            'concepto': 'mensualidad',
            'pagos': [{
                'metodo_pago': 'pago_movil', 'monto_ves': monto_ves,
                'referencia': '123456', 'banco_receptor_id': self.banco.id,
            }],
            'comprobante_portal_id': (comprobante or self.comprobante).id,
        }
        payload.update(extra)
        with mock.patch('notificaciones.tasks.task_notificar_comprobante_resuelto.delay') as delay, \
                mock.patch('notificaciones.tasks.task_notificar_pago_exitoso.delay') as delay_pago, \
                self.captureOnCommitCallbacks(execute=True):
            resp = self.client.post('/api/cobranza/registrar-pago/', payload, format='json')
        self.delay, self.delay_pago = delay, delay_pago
        return resp


class ProcesarEnCajaTests(RevisionBase):
    def test_registrar_pago_aprueba_el_comprobante(self):
        resp = self._pagar()
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(resp.data['comprobante_portal_id'], self.comprobante.id)
        pago = Pago.objects.get()
        self.mensualidad.refresh_from_db()
        self.assertTrue(self.mensualidad.pagado)
        self.assertEqual(AplicacionPago.objects.get(pago=pago).monto_abonado_usd, Decimal('35.00'))

        self.comprobante.refresh_from_db()
        self.assertEqual(self.comprobante.estatus, 'aprobado')
        self.assertEqual(self.comprobante.pago_id, pago.id)
        self.assertEqual(self.comprobante.revisado_por, self.admin)
        self.assertIsNotNone(self.comprobante.fecha_revision)
        self.assertEqual(self.comprobante.referencia_bancaria, '123456')
        self.assertEqual(self.comprobante.banco_receptor_id, self.banco.id)
        # Aviso de bandeja + push; el correo es el de caja (uno solo).
        aviso = AvisoPortal.objects.get(usuario_portal=self.rep_user)
        self.assertEqual(aviso.tipo, 'comprobante_aprobado')
        self.assertIn('REF. 35,00', aviso.cuerpo)
        self.delay.assert_called_once_with(self.comprobante.id)
        self.delay_pago.assert_called_once()

    def test_ya_procesado_devuelve_409(self):
        self.assertEqual(self._pagar().status_code, 201)
        # Otra deuda, para que el 409 venga del comprobante y no de la mensualidad.
        hoy = date.today()
        otra = crear_mensualidad(self.alumno, (hoy.month % 12) + 1, hoy.year + (1 if hoy.month == 12 else 0))
        resp = self._pagar(alumnos=[{'alumno_id': self.alumno.id, 'mensualidad_adelanto_ids': [otra.id]}], pagos=[{
            'metodo_pago': 'zelle', 'monto_usd': '35.00',
            'referencia': 'ZL-999', 'banco_receptor_id': self.banco.id,
        }])
        self.assertEqual(resp.status_code, 409, resp.content)
        self.assertEqual(Pago.objects.count(), 1)

    def test_comprobante_de_otro_alumno_devuelve_400_y_no_registra(self):
        otro = crear_alumno(self.rep, 'CE-OTRO-01', nombre='Otro')
        hoy = date.today()
        comprobante_otro = self._comprobante(crear_mensualidad(otro, hoy.month, hoy.year))
        resp = self._pagar(comprobante=comprobante_otro)
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertEqual(Pago.objects.count(), 0)
        comprobante_otro.refresh_from_db()
        self.assertEqual(comprobante_otro.estatus, 'pendiente')

    def test_retroactivo_usa_el_archivo_del_comprobante(self):
        from secretaria.models import ConfiguracionSistema
        hoy = timezone.localdate()
        inicio = hoy.year if hoy.month >= 9 else hoy.year - 1
        ConfiguracionSistema.objects.update_or_create(pk=1, defaults=dict(
            fecha_inicio_inscripciones=hoy, fecha_fin_inscripciones=hoy,
            fecha_inicio_ano_escolar=date(inicio, 9, 1), fecha_fin_ano_escolar=date(inicio + 1, 7, 31),
            periodo_escolar_activo=f'{inicio}-{inicio + 1}',
        ))
        resp = self._pagar(
            monto_ves='1417.50', fecha_pago=f'{self.ayer.isoformat()}T12:00:00',
            tasa_aplicada='40.50', motivo=f'Pago reportado en el portal (comprobante #{self.comprobante.id})',
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        pago = Pago.objects.get()
        self.assertEqual(pago.comprobante_retroactivo.name, self.comprobante.archivo.name)
        self.assertEqual(timezone.localtime(pago.fecha_pago).date(), self.ayer)

    def test_pagado_de_mas_se_registra_como_excedente(self):
        # Se deben Bs. 1.750 y transfieren Bs. 2.000 → Bs. 250 (5 USD) de excedente.
        resp = self._pagar(monto_ves='2000.00', excedente_ves='250.00', excedente_usd='5.00')
        self.assertEqual(resp.status_code, 201, resp.content)
        pago = Pago.objects.get()
        self.assertEqual(pago.excedente_ves, Decimal('250.00'))
        self.assertEqual(pago.vuelto_ves, Decimal('0.00'))
        self.assertEqual(pago.monto_ves, Decimal('2000.00'))
        self.mensualidad.refresh_from_db()
        self.assertEqual(self.mensualidad.monto_pagado, Decimal('35.00'))
        # El recibo lo muestra como línea propia dentro del total pagado.
        from cobranza.recibo_cobranza import datos_recibo
        linea = next(it for it in datos_recibo(pago)['items'] if it['concepto'] == 'EXCEDENTE')
        self.assertEqual(linea['monto_ves'], Decimal('250.00'))

    def test_excedente_mayor_a_lo_pagado_de_mas_revierte_todo(self):
        resp = self._pagar(monto_ves='1800.00', excedente_ves='250.00', excedente_usd='5.00')
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertEqual(Pago.objects.count(), 0)
        self.comprobante.refresh_from_db()
        self.assertEqual(self.comprobante.estatus, 'pendiente')
        self.assertFalse(AvisoPortal.objects.exists())

    def test_vuelto_y_excedente_a_la_vez_devuelve_400(self):
        resp = self._pagar(monto_ves='2000.00', excedente_ves='250.00', vuelto_ves='250.00')
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertEqual(Pago.objects.count(), 0)

    def test_patch_aprobado_ya_no_existe(self):
        self._auth_admin()
        resp = self.client.patch(f'{URL}{self.comprobante.id}/', {'estatus': 'aprobado'}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('caja', resp.data['error'])
        self.comprobante.refresh_from_db()
        self.assertEqual(self.comprobante.estatus, 'pendiente')


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


class DetalleListaTests(RevisionBase):
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
        self.assertEqual(resp.data['alumno_id'], self.alumno.id)
        self.assertIsNone(resp.data['pago'])
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

    def test_detalle_aprobado_trae_el_pago(self):
        self._pagar()
        resp = self.client.get(f'{URL}{self.comprobante.id}/')
        pago = Pago.objects.get()
        self.assertEqual(resp.data['pago']['id'], pago.id)
        self.assertEqual(resp.data['pago']['monto_ves'], '1750.00')
        self.assertEqual(resp.data['pago']['referencia'], '123456')
        self.assertEqual(resp.data['revisado_por'], 'revisor1')

    def test_detalle_inexistente_404(self):
        self._auth_admin()
        self.assertEqual(self.client.get(f'{URL}999999/').status_code, 404)

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
