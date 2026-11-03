"""
Tests del contrato de deudas (cobranza/deudas.py::item_deuda): los flags
`vencida` y `cobrable_por_whatsapp` deben seguir la misma regla que mora y
el cobro por WhatsApp (notificaciones/cobro_whatsapp.py).
"""
from datetime import date
from decimal import Decimal

from django.test import TestCase

from secretaria.models import Alumno, Representante

from .deudas import item_deuda
from .models import CuotaProyectoInversion, Mensualidad, TipoCargoEspecial


class ItemDeudaFlagsTest(TestCase):
    def setUp(self):
        self.rep = Representante.objects.create(
            cedula='V3200001', nombre='Luis', apellido='Perez', telefono='0412-1234567',
            correo='V3200001@test.com', direccion='Calle 1',
        )
        self.alumno = Alumno.objects.create(
            cedula_escolar='E3200001', nombre='Ana', apellido='Test',
            fecha_nacimiento=date(2015, 1, 1), dia_limite_pago=5, representante=self.rep,
        )

    def test_mensualidad_vence_el_mismo_dia_inclusive(self):
        m = Mensualidad.objects.create(
            alumno=self.alumno, mes=11, anio=2026, monto_usd=Decimal('50.00'),
            fecha_vencimiento=date(2026, 11, 5),
        )
        antes = item_deuda(m, hoy=date(2026, 11, 4))
        el_dia = item_deuda(m, hoy=date(2026, 11, 5))
        self.assertFalse(antes['vencida'])
        self.assertFalse(antes['cobrable_por_whatsapp'])
        self.assertTrue(el_dia['vencida'])
        self.assertTrue(el_dia['cobrable_por_whatsapp'])

    def test_cargo_especial_solo_es_cobrable_si_bloquea_inscripcion(self):
        bloqueante = TipoCargoEspecial.objects.create(
            nombre='Proyecto', monto_defecto_usd=Decimal('50.00'), bloquea_inscripcion=True,
        )
        libre = TipoCargoEspecial.objects.create(
            nombre='Paseo', monto_defecto_usd=Decimal('20.00'), bloquea_inscripcion=False,
        )
        c_bloq = CuotaProyectoInversion.objects.create(
            representante=self.rep, periodo_escolar='2026-2027', tipo_concepto=bloqueante,
            monto_usd=Decimal('50.00'),
        )
        c_libre = CuotaProyectoInversion.objects.create(
            representante=self.rep, periodo_escolar='2026-2028', tipo_concepto=libre,
            monto_usd=Decimal('20.00'),
        )
        self.assertTrue(item_deuda(c_bloq)['cobrable_por_whatsapp'])
        self.assertTrue(item_deuda(c_libre)['vencida'])
        self.assertFalse(item_deuda(c_libre)['cobrable_por_whatsapp'])
