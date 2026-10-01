"""
Motor único del recibo de cobranza (cobranza/recibo_cobranza.py): el mismo
PDF, con el mismo N° de recibo, en el panel, el portal, el correo y WhatsApp.
"""
import io
import time
from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pdfplumber
from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from notificaciones.models import NotificacionLog
from secretaria.models import Alumno, ConfiguracionSistema, Representante

from .models import Mensualidad, Pago
from .recibo_cobranza import (
    DIAS_VIGENCIA_ENLACE, datos_recibo, firmar_enlace_recibo, generar_pdf_recibo, fmt_bs,
)

User = get_user_model()


def _texto(pdf_bytes):
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        return ' '.join(page.extract_text() or '' for page in pdf.pages)


class ReciboBase(TestCase):
    def setUp(self):
        self.rep = Representante.objects.create(
            cedula='V12345678', nombre='María', apellido='González',
            telefono='04141234567', correo='maria@example.com', direccion='Av. 1',
        )
        self.alumno = self._alumno('E84000001', 'Pedro')
        self.cajero = User.objects.create_user(username='cajero1', password='x')

    def _alumno(self, cedula, nombre):
        return Alumno.objects.create(
            representante=self.rep, cedula_escolar=cedula, nombre=nombre, apellido='González',
            fecha_nacimiento=date(2015, 3, 10), grado_seccion='3er Grado A',
        )

    def _pago(self, alumno=None, **kw):
        datos = dict(
            alumno=alumno or self.alumno, usuario_receptor=self.cajero, metodo_pago='efectivo',
            concepto='mensualidad', monto_usd=Decimal('45.00'), tasa_aplicada=Decimal('40.00'),
        )
        datos.update(kw)
        return Pago.objects.create(**datos)

    def _mensualidad(self, pago, mes=9, alumno=None):
        m = Mensualidad.objects.create(alumno=alumno or self.alumno, mes=mes, anio=2026,
                                       monto_usd=Decimal('45.00'))
        m.pagos.add(pago)
        return m

    def _config(self, **kw):
        return ConfiguracionSistema.objects.create(
            fecha_inicio_inscripciones=date.today(), fecha_fin_inscripciones=date.today(),
            fecha_inicio_ano_escolar=date.today(), fecha_fin_ano_escolar=date.today(), **kw
        )


class MotorReciboTests(ReciboBase):

    def test_pdf_con_datos_del_colegio_de_configuracion(self):
        self._config(nombre_colegio='Colegio San José', rif='J-12345678-9')
        pago = self._pago()
        self._mensualidad(pago)
        texto = _texto(generar_pdf_recibo(pago).getvalue())
        self.assertIn('RECIBO DE PAGO - COBRANZA ESCOLAR', texto)
        self.assertIn('Colegio San José', texto)
        self.assertIn('J-12345678-9', texto)
        self.assertIn(pago.factura_id, texto)
        self.assertIn('SEPTIEMBRE 2026', texto)
        self.assertIn(f"Bs. {fmt_bs(Decimal('1800'))}", texto)
        # Nada del recibo viejo con datos fijos.
        self.assertNotIn('OCTOPUS', texto)
        self.assertNotIn('J-12345678-0', texto)

    def test_con_recorte_de_encabezado_no_dibuja_el_membrete_de_texto(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from PIL import Image
        buf = io.BytesIO()
        Image.new('RGB', (220, 41), 'navy').save(buf, format='PNG')
        cfg = self._config(nombre_colegio='Colegio San José')
        cfg.encabezado_personalizado = SimpleUploadedFile('enc.png', buf.getvalue(), content_type='image/png')
        cfg.save()
        self.addCleanup(cfg.encabezado_personalizado.delete, save=False)
        pago = self._pago()
        texto = _texto(generar_pdf_recibo(pago).getvalue())
        self.assertNotIn('República Bolivariana de Venezuela', texto)
        self.assertIn('RECIBO DE PAGO - COBRANZA ESCOLAR', texto)

    def test_cualquier_fila_de_la_operacion_da_el_numero_del_primer_pago(self):
        primero = self._pago()
        segundo = self._pago(metodo_pago='transferencia', operacion_uuid=primero.operacion_uuid)
        for pago in (primero, segundo):
            self.assertEqual(datos_recibo(pago)['nro_recibo'], primero.factura_id)

    def test_hermanos_en_la_misma_operacion(self):
        hermana = self._alumno('E84000002', 'Ana')
        pago = self._pago()
        self._mensualidad(pago)
        self._mensualidad(pago, alumno=hermana)
        d = datos_recibo(pago)
        self.assertTrue(d['hay_varios_alumnos'])
        self.assertIn('Ana González', d['nombre_estudiante'])
        self.assertIn('Pedro González', d['nombre_estudiante'])

    def test_abono_parcial_de_una_sola_mensualidad(self):
        pago = self._pago(monto_usd=Decimal('20.00'))
        self._mensualidad(pago)
        item = datos_recibo(pago)['items'][0]
        self.assertIn('ABONO', item['descripcion'])
        self.assertEqual(item['monto_ves'], Decimal('800.00'))

    def test_muchas_lineas_no_rompen_el_pdf(self):
        pago = self._pago(monto_usd=Decimal('45.00') * 30)
        for mes in range(1, 13):
            self._mensualidad(pago, mes=mes)
        for i in range(18):
            otro = self._alumno(f'E8500{i:04d}', f'Hijo{i}')
            self._mensualidad(pago, alumno=otro)
        self.assertTrue(generar_pdf_recibo(pago).getvalue().startswith(b'%PDF'))


class ReciboEndpointsTests(ReciboBase):

    def setUp(self):
        super().setUp()
        self.client = APIClient()

    def test_panel_devuelve_el_pdf(self):
        pago = self._pago()
        self.client.force_authenticate(user=self.cajero)
        resp = self.client.get(f'/api/cobranza/recibo/{pago.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp['Content-Type'], 'application/pdf')
        self.assertIn(f'Recibo_{pago.factura_id}.pdf', resp['Content-Disposition'])

    def test_panel_sin_sesion_devuelve_401(self):
        pago = self._pago()
        self.assertEqual(self.client.get(f'/api/cobranza/recibo/{pago.id}/').status_code, 401)

    def test_enlace_publico_valido_devuelve_el_pdf_sin_sesion(self):
        pago = self._pago()
        resp = self.client.get(f'/api/cobranza/recibo/publico/{firmar_enlace_recibo(pago)}/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn(pago.factura_id, _texto(b''.join(resp.streaming_content)))

    def test_enlace_publico_alterado_devuelve_404(self):
        pago = self._pago()
        token = firmar_enlace_recibo(pago)
        resp = self.client.get(f'/api/cobranza/recibo/publico/{token[:-2]}xx/')
        self.assertEqual(resp.status_code, 404)

    def test_enlace_publico_vencido_devuelve_404(self):
        pago = self._pago()
        token = firmar_enlace_recibo(pago)
        futuro = time.time() + (DIAS_VIGENCIA_ENLACE + 1) * 24 * 3600
        with patch('django.core.signing.time.time', return_value=futuro):
            resp = self.client.get(f'/api/cobranza/recibo/publico/{token}/')
        self.assertEqual(resp.status_code, 404)

    def test_enlace_publico_de_pago_anulado_devuelve_404(self):
        pago = self._pago()
        token = firmar_enlace_recibo(pago)
        Pago.objects.filter(pk=pago.pk).update(estatus='anulado')
        self.assertEqual(self.client.get(f'/api/cobranza/recibo/publico/{token}/').status_code, 404)

    def test_whatsapp_arma_el_enlace_wa_me_y_registra_el_envio(self):
        pago = self._pago()
        self.client.force_authenticate(user=self.cajero)
        resp = self.client.post(f'/api/cobranza/recibo/{pago.id}/whatsapp/')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['url'].startswith('https://wa.me/584141234567?text='))
        self.assertIn(pago.factura_id, resp.data['mensaje'])
        self.assertIn('/api/cobranza/recibo/publico/', resp.data['mensaje'])
        log = NotificacionLog.objects.get(canal='whatsapp', tipo='pago_exitoso')
        self.assertEqual((log.modo, log.proveedor), ('manual', 'wa.me'))

    def test_whatsapp_sin_telefono_devuelve_400(self):
        self.rep.telefono = ''
        self.rep.save()
        pago = self._pago()
        self.client.force_authenticate(user=self.cajero)
        self.assertEqual(self.client.post(f'/api/cobranza/recibo/{pago.id}/whatsapp/').status_code, 400)

    def test_whatsapp_de_pago_anulado_devuelve_400(self):
        pago = self._pago()
        Pago.objects.filter(pk=pago.pk).update(estatus='anulado')
        self.client.force_authenticate(user=self.cajero)
        self.assertEqual(self.client.post(f'/api/cobranza/recibo/{pago.id}/whatsapp/').status_code, 400)


class NotificacionPagoReciboTests(ReciboBase):

    def test_correo_adjunta_el_mismo_recibo(self):
        self._config(nombre_colegio='Colegio San José')
        pago = self._pago()
        mensualidad = self._mensualidad(pago)
        from notificaciones.services import notificar_pago_exitoso
        with patch('notificaciones.services.enviar_whatsapp'):
            notificar_pago_exitoso(mensualidad, pago)
        self.assertEqual(len(mail.outbox), 1)
        nombre, contenido, mimetype = mail.outbox[0].attachments[0]
        self.assertEqual(nombre, f'Recibo_{pago.factura_id}.pdf')
        self.assertEqual(mimetype, 'application/pdf')
        self.assertIn('Colegio San José', _texto(contenido))
        self.assertIn(pago.factura_id, _texto(contenido))

    @override_settings(WHATSAPP_PROVIDER='meta', META_WHATSAPP_TOKEN='tok',
                       META_WHATSAPP_PHONE_ID='123', WHATSAPP_PLANTILLA_RECIBO='recibo_pago')
    def test_con_meta_manda_el_pdf_como_documento_con_la_plantilla(self):
        pago = self._pago()
        mensualidad = self._mensualidad(pago)
        subida = MagicMock(**{'json.return_value': {'id': 'media-1'}})
        envio = MagicMock()
        from notificaciones.services import notificar_pago_exitoso
        with patch('requests.post', side_effect=[subida, envio]) as post, \
             patch('notificaciones.services.enviar_whatsapp') as texto:
            notificar_pago_exitoso(mensualidad, pago)
        self.assertEqual(post.call_count, 2)
        self.assertTrue(post.call_args_list[0].args[0].endswith('/123/media'))
        payload = post.call_args_list[1].kwargs['json']
        self.assertEqual(payload['to'], '584141234567')
        self.assertEqual(payload['template']['name'], 'recibo_pago')
        header = payload['template']['components'][0]['parameters'][0]['document']
        self.assertEqual(header, {'id': 'media-1', 'filename': f'Recibo_{pago.factura_id}.pdf'})
        texto.assert_not_called()

    @override_settings(WHATSAPP_PROVIDER='twilio')
    def test_sin_meta_queda_el_aviso_de_texto(self):
        pago = self._pago()
        mensualidad = self._mensualidad(pago)
        from notificaciones.services import notificar_pago_exitoso
        with patch('requests.post') as post, patch('notificaciones.services.enviar_whatsapp') as texto:
            notificar_pago_exitoso(mensualidad, pago)
        post.assert_not_called()
        texto.assert_called_once()
        self.assertIn(pago.factura_id, texto.call_args.args[1])
