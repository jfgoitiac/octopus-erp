"""Regresiones de entradas no representables en las condiciones del convenio."""
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient

from . import gestion
from .models import ConvenioPago, CuotaConvenio, EventoCiclo
from .test_gestion_cobranza import GestionBase
from .test_motor_cobranza import AHORA, HOY


INVALIDOS_IMPORTE = (
    'NaN', 'sNaN', 'Infinity', '-Infinity', '1e9999', '1e-9999',
    '100000000.00', '0', '-0.01', '1.001', True, [], {},
)
INVALIDOS_ENTERO = ('NaN', 'Infinity', '1e9999', '1.5', 1.5, 0, -1, 32768, True, [], {})


class ValidacionRecargosConvenioTest(SimpleTestCase):
    def configuracion(self, **cambios):
        return {'aplicar_recargo_incumplimiento': True, 'valor_recargo': '5.00', **cambios}

    def test_importes_no_finitos_fuera_de_rango_o_precision_se_rechazan(self):
        for campo in ('valor_recargo', 'tope_recargo_usd'):
            for valor in INVALIDOS_IMPORTE:
                with self.subTest(campo=campo, valor=valor), self.assertRaises(gestion.AccionInvalida):
                    gestion._configuracion_recargo_convenio(self.configuracion(**{campo: valor}))

    def test_enteros_no_se_truncan_ni_desbordan_el_campo(self):
        for campo in ('intervalo_cantidad', 'maximo_aplicaciones'):
            for valor in INVALIDOS_ENTERO:
                with self.subTest(campo=campo, valor=valor), self.assertRaises(gestion.AccionInvalida):
                    gestion._configuracion_recargo_convenio(self.configuracion(**{campo: valor}))

    def test_limites_representables_y_valores_opcionales(self):
        datos = gestion._configuracion_recargo_convenio(self.configuracion(
            valor_recargo='0.01', tope_recargo_usd='99999999.99',
            intervalo_cantidad=32767, maximo_aplicaciones='32767'))
        self.assertEqual(datos['valor_recargo'], Decimal('0.01'))
        self.assertEqual(datos['tope_recargo_usd'], Decimal('99999999.99'))
        self.assertEqual(datos['maximo_aplicaciones'], 32767)
        datos = gestion._configuracion_recargo_convenio(None)
        self.assertIsNone(datos['valor_recargo'])
        self.assertIsNone(datos['tope_recargo_usd'])
        self.assertEqual(datos['intervalo_cantidad'], 1)

    def test_booleanos_no_aceptan_cadenas_ni_numeros(self):
        for campo in ('aplicar_recargo_incumplimiento', 'exonera_recargos_durante_vigencia'):
            for valor in ('false', 'true', 0, 1, None):
                with self.subTest(campo=campo, valor=valor), self.assertRaises(gestion.AccionInvalida):
                    gestion._configuracion_recargo_convenio({campo: valor})

    def test_opciones_malformadas_no_lanzan_typeerror(self):
        for campo in ('modo_recargo', 'frecuencia_recargo', 'intervalo_unidad'):
            with self.subTest(campo=campo), self.assertRaises(gestion.AccionInvalida):
                gestion._configuracion_recargo_convenio(self.configuracion(**{campo: ['incorrecto']}))


class ApiValidacionRecargosConvenioTest(GestionBase):
    def test_configuracion_invalida_responde_400_sin_efectos_parciales(self):
        ciclo = self.ciclo(monto=50)
        estado = ciclo.estado
        eventos = EventoCiclo.objects.count()
        api = APIClient()
        api.force_authenticate(self.admin)
        casos = [
            (campo, valor)
            for campo in ('valor_recargo', 'tope_recargo_usd')
            for valor in INVALIDOS_IMPORTE
        ] + [
            (campo, valor)
            for campo in ('intervalo_cantidad', 'maximo_aplicaciones')
            for valor in INVALIDOS_ENTERO
        ]
        for campo, valor in casos:
            with self.subTest(campo=campo, valor=valor), patch('django.utils.timezone.now', return_value=AHORA):
                respuesta = api.post('/api/cobranza/inteligente/convenios/', {
                    'representante_id': self.rep.id, 'ciclo_ids': [ciclo.id],
                    'cuotas': [{'fecha': str(HOY + timedelta(days=10)), 'monto': '50.00'}],
                    'aplicar_recargo_incumplimiento': True, 'valor_recargo': '5.00', campo: valor,
                }, format='json')
                self.assertEqual(respuesta.status_code, 400, respuesta.data)
                self.assertTrue(respuesta.data)
                self.assertFalse(ConvenioPago.objects.exists())
                self.assertFalse(CuotaConvenio.objects.exists())
                self.assertEqual(EventoCiclo.objects.count(), eventos)
                ciclo.refresh_from_db()
                self.assertEqual(ciclo.estado, estado)
