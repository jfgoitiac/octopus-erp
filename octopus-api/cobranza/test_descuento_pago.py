"""
Tests de "descuento por pago dentro de rango" (cobranza/descuentos.py):
  - Regresión: cero reglas activas = comportamiento idéntico al de hoy.
  - resolver_descuento(): frontera del rango (inclusive en ambos extremos),
    topado en meses cortos, mes PROPIO de la mensualidad (no el de la fecha
    de pago), independiente de mora.py.
  - Beca: nunca sube el precio a una mensualidad ya becada o más barata que
    el monto final de la regla.
  - monto_personalizado=True queda excluido.
  - Validación de solape con ReglaRecargoPago tipo='recargo' al guardar.

La integración con RegistrarPagoView (abono fantasma, snapshot, anulación)
se cubre en un archivo de test aparte cuando se conecte ese flujo.
"""
from datetime import date, datetime
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from secretaria.models import Alumno, ConfiguracionSistema, Representante
from .descuentos import resolver_descuento
from .models import Mensualidad, ReglaRecargoPago


def _crear_alumno(cedula, representante, **kwargs):
    defaults = dict(
        nombre='Ana', apellido='Test', fecha_nacimiento=date(2015, 1, 1),
        dia_limite_pago=1, representante=representante,
    )
    defaults.update(kwargs)
    return Alumno.objects.create(cedula_escolar=cedula, **defaults)


class DescuentoPagoBase(TestCase):
    def setUp(self):
        self.config = ConfiguracionSistema.objects.create(
            fecha_inicio_inscripciones=date(2026, 1, 1),
            fecha_fin_inscripciones=date(2026, 12, 31),
            fecha_inicio_ano_escolar=date(2025, 9, 1),
            fecha_fin_ano_escolar=date(2026, 7, 31),
            periodo_escolar_activo='2025-2026',
        )
        self.representante = Representante.objects.create(
            cedula='V22222222', nombre='Maria', apellido='Perez',
            telefono='0412', correo='maria@test.com', direccion='Calle 1',
        )
        self.alumno = _crear_alumno('E2000001', self.representante)

    def _mensualidad(self, mes, anio, monto='32.00', **kwargs):
        return Mensualidad.objects.create(
            alumno=self.alumno, mes=mes, anio=anio, monto_usd=Decimal(monto), **kwargs
        )

    def _regla(self, **kwargs):
        defaults = dict(
            nombre='Descuento por pronto pago', tipo='descuento',
            modo_calculo='monto_fijo_usd', valor=Decimal('30.00'),
            dia_desde=15, dia_hasta=18, activa=True,
        )
        defaults.update(kwargs)
        return ReglaRecargoPago.objects.create(**defaults)


class SinReglasActivasRegresionTest(DescuentoPagoBase):
    """PRIMER test, por diseño: cero reglas activas debe comportarse
    exactamente igual que antes de esta feature."""

    def test_resolver_descuento_no_aplica_sin_reglas(self):
        m = self._mensualidad(7, 2026)
        self.assertIsNone(resolver_descuento(m, date(2026, 7, 16)))


class ResolverDescuentoFronteraTest(DescuentoPagoBase):

    def test_dia_anterior_al_rango_no_descuenta(self):
        self._regla(dia_desde=15, dia_hasta=18)
        m = self._mensualidad(7, 2026)
        self.assertIsNone(resolver_descuento(m, date(2026, 7, 14)))

    def test_dia_desde_descuenta_inclusive(self):
        self._regla(dia_desde=15, dia_hasta=18, valor=Decimal('30.00'))
        m = self._mensualidad(7, 2026)
        resultado = resolver_descuento(m, date(2026, 7, 15))
        self.assertIsNotNone(resultado)
        self.assertEqual(resultado['monto_final_usd'], Decimal('30.00'))
        self.assertEqual(resultado['monto_descontado_usd'], Decimal('2.00'))

    def test_dia_hasta_descuenta_inclusive(self):
        self._regla(dia_desde=15, dia_hasta=18, valor=Decimal('30.00'))
        m = self._mensualidad(7, 2026)
        resultado = resolver_descuento(m, date(2026, 7, 18))
        self.assertIsNotNone(resultado)
        self.assertEqual(resultado['monto_final_usd'], Decimal('30.00'))

    def test_dia_posterior_al_rango_no_descuenta(self):
        self._regla(dia_desde=15, dia_hasta=18)
        m = self._mensualidad(7, 2026)
        self.assertIsNone(resolver_descuento(m, date(2026, 7, 19)))

    def test_acepta_datetime_como_fecha_referencia(self):
        self._regla(dia_desde=15, dia_hasta=18, valor=Decimal('30.00'))
        m = self._mensualidad(7, 2026)
        fecha = timezone.make_aware(datetime(2026, 7, 16, 12, 0))
        resultado = resolver_descuento(m, fecha)
        self.assertIsNotNone(resultado)


class MesCortoTopadoTest(DescuentoPagoBase):

    def test_dia_hasta_31_en_febrero_no_lanza_valueerror(self):
        self._regla(dia_desde=25, dia_hasta=31, valor=Decimal('30.00'))
        m = self._mensualidad(2, 2026, monto='32.00')  # febrero 2026: 28 días
        resultado = resolver_descuento(m, date(2026, 2, 28))
        self.assertIsNotNone(resultado)
        self.assertIsNone(resolver_descuento(m, date(2026, 2, 24)))


class MesPropioDeLaMensualidadTest(DescuentoPagoBase):
    """El rango se evalúa contra el mes de LA MENSUALIDAD, no el mes
    calendario en que se recibe el pago — simétrico a resolver_recargo."""

    def test_mensualidad_futura_adelantada_dentro_del_rango_del_mes_actual_no_aplica(self):
        self._regla(dia_desde=15, dia_hasta=18, valor=Decimal('30.00'))
        octubre = self._mensualidad(10, 2026)
        # Se paga el 16 de septiembre — dentro del rango de SEPTIEMBRE, pero
        # la mensualidad es de octubre: su propio rango es 15-18 de octubre.
        self.assertIsNone(resolver_descuento(octubre, date(2026, 9, 16)))

    def test_mensualidad_vencida_pagada_fuera_de_su_propio_mes_no_aplica(self):
        self._regla(dia_desde=15, dia_hasta=18, valor=Decimal('30.00'))
        agosto = self._mensualidad(8, 2026)
        # Vencida de agosto, pagada el 16 de septiembre: su rango (15-18 de
        # AGOSTO) ya pasó, el hecho de que sea el rango de septiembre da igual.
        self.assertIsNone(resolver_descuento(agosto, date(2026, 9, 16)))

    def test_mensualidad_pagada_dentro_de_su_propio_rango_si_aplica(self):
        self._regla(dia_desde=15, dia_hasta=18, valor=Decimal('30.00'))
        septiembre = self._mensualidad(9, 2026)
        resultado = resolver_descuento(septiembre, date(2026, 9, 16))
        self.assertIsNotNone(resultado)


class BecaYMontoPersonalizadoTest(DescuentoPagoBase):

    def test_no_sube_el_precio_a_mensualidad_ya_becada_mas_barata(self):
        self._regla(dia_desde=15, dia_hasta=18, valor=Decimal('30.00'))
        m = self._mensualidad(
            7, 2026, monto='16.00',  # ya con 50% de beca aplicado
            monto_original_usd=Decimal('32.00'), porcentaje_beca_aplicado=50,
        )
        # 16.00 (ya becado) es menor al "monto final" de la regla (30.00) —
        # no debe subirle el precio.
        self.assertIsNone(resolver_descuento(m, date(2026, 7, 16)))

    def test_beca_mas_cara_que_el_monto_final_si_aplica(self):
        self._regla(dia_desde=15, dia_hasta=18, valor=Decimal('30.00'))
        m = self._mensualidad(
            7, 2026, monto='40.00',  # mensualidad cara, con beca parcial menor
            monto_original_usd=Decimal('50.00'), porcentaje_beca_aplicado=20,
        )
        resultado = resolver_descuento(m, date(2026, 7, 16))
        self.assertIsNotNone(resultado)
        self.assertEqual(resultado['monto_final_usd'], Decimal('30.00'))
        self.assertEqual(resultado['monto_descontado_usd'], Decimal('10.00'))

    def test_monto_personalizado_queda_excluido(self):
        self._regla(dia_desde=15, dia_hasta=18, valor=Decimal('30.00'))
        m = self._mensualidad(7, 2026, monto='32.00', monto_personalizado=True)
        self.assertIsNone(resolver_descuento(m, date(2026, 7, 16)))


class IndependenciaDeDiaLimitePagoTest(DescuentoPagoBase):

    def test_dia_limite_pago_del_alumno_no_afecta_el_descuento(self):
        """dia_limite_pago (mora.py) y dia_desde/dia_hasta (descuentos.py)
        son independientes por diseño, igual que con el recargo."""
        self._regla(dia_desde=15, dia_hasta=18, valor=Decimal('30.00'))
        alumno_dia_5 = _crear_alumno('E2000002', self.representante, dia_limite_pago=5)
        alumno_dia_25 = _crear_alumno('E2000003', self.representante, dia_limite_pago=25)

        m1 = Mensualidad.objects.create(alumno=alumno_dia_5, mes=7, anio=2026, monto_usd=Decimal('32.00'))
        m2 = Mensualidad.objects.create(alumno=alumno_dia_25, mes=7, anio=2026, monto_usd=Decimal('32.00'))

        hoy = date(2026, 7, 16)
        r1 = resolver_descuento(m1, hoy)
        r2 = resolver_descuento(m2, hoy)
        self.assertEqual(r1['monto_final_usd'], r2['monto_final_usd'])
        self.assertEqual(r1['monto_final_usd'], Decimal('30.00'))


class ValidacionSolapeReglaTest(DescuentoPagoBase):
    """Cubre la validación agregada en ReglaRecargoPago.clean() (commit
    anterior): recargo y descuento activos nunca pueden solaparse, porque el
    recargo aplica desde dia_aplicacion EN ADELANTE sin límite superior."""

    def test_descuento_que_toca_el_dia_de_aplicacion_del_recargo_no_guarda(self):
        ReglaRecargoPago.objects.create(
            nombre='Recargo', tipo='recargo', modo_calculo='monto_fijo_usd',
            valor=Decimal('2.00'), dia_aplicacion=19, activa=True,
        )
        regla = ReglaRecargoPago(
            nombre='Descuento', tipo='descuento', modo_calculo='monto_fijo_usd',
            valor=Decimal('30.00'), dia_desde=15, dia_hasta=19, activa=True,
        )
        with self.assertRaises(ValidationError):
            regla.full_clean()

    def test_descuento_antes_del_recargo_si_guarda(self):
        ReglaRecargoPago.objects.create(
            nombre='Recargo', tipo='recargo', modo_calculo='monto_fijo_usd',
            valor=Decimal('2.00'), dia_aplicacion=19, activa=True,
        )
        regla = ReglaRecargoPago(
            nombre='Descuento', tipo='descuento', modo_calculo='monto_fijo_usd',
            valor=Decimal('30.00'), dia_desde=15, dia_hasta=18, activa=True,
        )
        regla.full_clean()  # no debe lanzar
        regla.save()
        self.assertTrue(ReglaRecargoPago.objects.filter(pk=regla.pk).exists())

    def test_recargo_que_empieza_dentro_del_rango_de_descuento_no_guarda(self):
        ReglaRecargoPago.objects.create(
            nombre='Descuento', tipo='descuento', modo_calculo='monto_fijo_usd',
            valor=Decimal('30.00'), dia_desde=15, dia_hasta=18, activa=True,
        )
        regla = ReglaRecargoPago(
            nombre='Recargo', tipo='recargo', modo_calculo='monto_fijo_usd',
            valor=Decimal('2.00'), dia_aplicacion=16, activa=True,
        )
        with self.assertRaises(ValidationError):
            regla.full_clean()

    def test_descuento_sin_rango_no_guarda(self):
        regla = ReglaRecargoPago(
            nombre='Descuento', tipo='descuento', modo_calculo='monto_fijo_usd',
            valor=Decimal('30.00'), activa=True,
        )
        with self.assertRaises(ValidationError):
            regla.full_clean()

    def test_descuento_con_modo_porcentaje_no_guarda(self):
        regla = ReglaRecargoPago(
            nombre='Descuento', tipo='descuento', modo_calculo='porcentaje',
            valor=Decimal('10.00'), dia_desde=15, dia_hasta=18, activa=True,
        )
        with self.assertRaises(ValidationError):
            regla.full_clean()
