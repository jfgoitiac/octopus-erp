"""Numeración de solvencias: no debe repetir un número existente.

Reproduce el fallo de producción: `registrar-pago` devolvía 500 con
`duplicate key ... cobranza_solvenciarepresentante_numero_key` porque el
siguiente número se calculaba como cantidad + 1 y, con huecos en la
numeración, coincidía con uno ya emitido.
"""
from django.test import TestCase

from cobranza.models import SolvenciaRepresentante
from cobranza.solvencia import _generar_numero
from secretaria.models import Representante


def _solvencia(numero, n):
    rep = Representante.objects.create(
        cedula=f'V-900{n}', nombre='Rep', apellido=f'N{n}',
        telefono='0414', correo=f'rep{n}@example.com', direccion='x',
    )
    return SolvenciaRepresentante.objects.create(
        representante=rep, numero=numero, periodo_escolar='2026-2027',
    )


class GenerarNumeroSolvenciaTests(TestCase):
    def test_primer_numero_del_anio(self):
        self.assertEqual(_generar_numero('2026-2027'), 'SLV-2026-0001')

    def test_con_hueco_no_repite_un_numero_existente(self):
        # Hay 2 solvencias pero la numeración llega a 0003: cantidad + 1
        # daba 0003 (ya existe) y el create reventaba.
        _solvencia('SLV-2026-0001', 1)
        _solvencia('SLV-2026-0003', 2)
        self.assertEqual(_generar_numero('2026-2027'), 'SLV-2026-0004')

    def test_tras_borrar_una_solvencia_sigue_el_mayor(self):
        _solvencia('SLV-2026-0001', 1)
        intermedia = _solvencia('SLV-2026-0002', 2)
        _solvencia('SLV-2026-0003', 3)
        intermedia.delete()
        self.assertEqual(_generar_numero('2026-2027'), 'SLV-2026-0004')

    def test_ignora_numeros_de_otro_anio_o_con_formato_raro(self):
        _solvencia('SLV-2025-0009', 1)
        _solvencia('SLV-2026-MANUAL', 2)
        self.assertEqual(_generar_numero('2026-2027'), 'SLV-2026-0001')

    def test_el_numero_generado_se_puede_guardar(self):
        _solvencia('SLV-2026-0001', 1)
        _solvencia('SLV-2026-0003', 2)
        nuevo = _solvencia(_generar_numero('2026-2027'), 3)
        self.assertEqual(nuevo.numero, 'SLV-2026-0004')
