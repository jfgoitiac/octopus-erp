"""
Montos en REF. + bolívares (tasa BCV vigente) en los avisos de mora por
correo y WhatsApp y en el token {{monto}} del cobro manual por WhatsApp:
mismo formato que el portal de representantes.
"""
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.core import mail
from django.test import TestCase
from django.utils import timezone

from cobranza.models import Mensualidad, TasaCambio
from secretaria.models import Alumno, Representante

from .services import montos_ref, notificar_mora


class MontosRefTests(TestCase):

    def test_con_tasa_da_ref_bolivares_y_nota_con_la_fecha(self):
        TasaCambio.objects.create(valor_bs=Decimal('40.5000'))
        m = montos_ref(Decimal('45'))
        hoy = timezone.localtime().strftime('%d/%m/%Y')
        self.assertEqual(m['monto_ref'], 'REF. 45,00')
        self.assertEqual(m['monto_bs'], 'Bs. 1.822,50')
        self.assertIn(f'tasa del dólar BCV del día {hoy}', m['nota_tasa'])

    def test_sin_tasa_solo_da_ref(self):
        TasaCambio.objects.all().delete()
        m = montos_ref(Decimal('45'))
        self.assertEqual(m, {'monto_ref': 'REF. 45,00', 'monto_bs': '', 'nota_tasa': ''})


class AvisoMoraRefTests(TestCase):

    def setUp(self):
        TasaCambio.objects.create(valor_bs=Decimal('40.0000'))
        self.rep = Representante.objects.create(
            cedula='V7777777', nombre='María', apellido='González',
            telefono='04141234567', correo='maria@example.com', direccion='Av. 1',
        )
        alumno = Alumno.objects.create(
            representante=self.rep, cedula_escolar='E87000001', nombre='Pedro', apellido='González',
            fecha_nacimiento=date(2015, 3, 10), grado_seccion='3er Grado A',
        )
        with patch('notificaciones.tasks.programar_notificaciones_mensualidad'):
            self.mensualidad = Mensualidad.objects.create(
                alumno=alumno, mes=9, anio=2026, monto_usd=Decimal('45.00'),
            )

    def test_correo_de_mora_muestra_ref_y_bolivares(self):
        with patch('notificaciones.services.enviar_whatsapp'):
            notificar_mora(self.mensualidad, 5, 'mora_dia_5')
        html = mail.outbox[0].alternatives[0][0]
        self.assertIn('REF. 45,00', html)
        self.assertIn('Bs. 1.800,00', html)
        self.assertIn('tasa del dólar BCV del día', html)
        self.assertNotIn('USD', html)

    def test_whatsapp_de_mora_muestra_ref_y_bolivares(self):
        with patch('notificaciones.services.enviar_whatsapp') as wa:
            notificar_mora(self.mensualidad, 10, 'mora_dia_10')
        texto = wa.call_args.args[1]
        self.assertIn('*REF. 45,00* (Bs. 1.800,00)', texto)
        self.assertIn('tasa del dólar BCV del día', texto)
        self.assertNotIn('USD', texto)

    def test_token_monto_del_cobro_manual(self):
        from .cobro_whatsapp import _monto_cobro
        self.assertEqual(_monto_cobro(Decimal('100')), 'REF. 100,00 (Bs. 4.000,00)')
