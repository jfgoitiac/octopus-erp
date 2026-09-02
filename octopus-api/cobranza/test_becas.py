"""
Tests del módulo de Becas:
  - Alcance: solo mensualidades, nunca inscripción ni cargos especiales.
  - Becado total (100%) no genera mensualidades en $0, no las genera.
  - Recálculo de mensualidades impagas al crear/cambiar/revocar una beca,
    sin tocar las ya pagadas.
  - Vigencia (fecha_desde/fecha_hasta) y validación de porcentaje.
  - Anti-duplicados: una sola beca activa por alumno/período.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from secretaria.models import Alumno, Beca, ConfiguracionSistema, Representante
from .models import CuotaInscripcion, CuotaProyectoInversion, Mensualidad, TipoCargoEspecial
from .services import (
    generar_cargos_especiales_pendientes,
    generar_mensualidades,
    porcentaje_beca_vigente,
    recalcular_mensualidades_impagas,
)
from .test_generacion_mensualidades import GeneracionMensualidadesBase, _crear_alumno


class BecaAlcanceTest(GeneracionMensualidadesBase):
    """La beca solo afecta mensualidades — inscripción y cargos especiales
    se cobran normalmente, sin descuento."""

    def setUp(self):
        super().setUp()
        self.beca = Beca.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026', porcentaje=50,
            fecha_desde=date(2025, 9, 1), fecha_hasta=date(2030, 7, 31),
        )

    def test_mensualidad_recibe_el_descuento(self):
        generar_mensualidades([self.alumno], [(7, 2026)], monto=Decimal('100.00'))
        m = Mensualidad.objects.get(alumno=self.alumno, mes=7, anio=2026)
        self.assertEqual(m.monto_usd, Decimal('50.00'))
        self.assertEqual(m.monto_original_usd, Decimal('100.00'))
        self.assertEqual(m.porcentaje_beca_aplicado, 50)

    def test_inscripcion_no_recibe_descuento(self):
        cuota = CuotaInscripcion.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026', monto_usd=Decimal('50.00'),
        )
        self.assertEqual(cuota.monto_usd, Decimal('50.00'))

    def test_cargo_especial_no_recibe_descuento(self):
        # No se asume que sea el único TipoCargoEspecial activo: la migración
        # de backfill (0035) ya siembra "Proyecto de Inversión", así que
        # generar_cargos_especiales_pendientes también genera esa cuota.
        tipo = TipoCargoEspecial.objects.create(
            nombre='Uniformes', monto_defecto_usd=Decimal('30.00'), alcance='todos',
        )
        generar_cargos_especiales_pendientes(periodo_escolar='2025-2026')
        cuota = CuotaProyectoInversion.objects.get(
            representante=self.representante, tipo_concepto=tipo, periodo_escolar='2025-2026',
        )
        self.assertEqual(cuota.monto_usd, Decimal('30.00'))


class BecadoTotalTest(GeneracionMensualidadesBase):

    def test_no_genera_mensualidades_en_vez_de_monto_cero(self):
        Beca.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026', porcentaje=100,
            fecha_desde=date(2025, 9, 1), fecha_hasta=date(2030, 7, 31),
        )
        # La señal ya marcó estatus_financiero='becado'; generar_mensualidades
        # no filtra por estatus_financiero (eso lo hace el llamador, ver
        # comando/tarea), así que forzamos el mismo caso límite: 100% de
        # descuento no debe crear filas en $0.
        creadas = generar_mensualidades([self.alumno], [(7, 2026)], monto=Decimal('100.00'))
        self.assertEqual(creadas, 0)
        self.assertFalse(Mensualidad.objects.filter(alumno=self.alumno).exists())

    def test_sincroniza_estatus_financiero_becado(self):
        Beca.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026', porcentaje=100,
            fecha_desde=date(2025, 9, 1), fecha_hasta=date(2030, 7, 31),
        )
        self.alumno.refresh_from_db()
        self.assertEqual(self.alumno.estatus_financiero, 'becado')
        self.assertEqual(self.alumno.porcentaje_beca, 100)

    def test_beca_100_elimina_mensualidades_impagas_existentes(self):
        generar_mensualidades([self.alumno], [(9, 2025)], monto=Decimal('100.00'))
        self.assertTrue(Mensualidad.objects.filter(alumno=self.alumno).exists())
        Beca.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026', porcentaje=100,
            fecha_desde=date(2025, 9, 1), fecha_hasta=date(2030, 7, 31),
        )
        self.assertFalse(Mensualidad.objects.filter(alumno=self.alumno).exists())


class RecalculoTest(GeneracionMensualidadesBase):

    def test_cambiar_beca_recalcula_impagas_no_toca_pagadas(self):
        generar_mensualidades([self.alumno], [(9, 2025), (10, 2025)], monto=Decimal('100.00'))
        pagada = Mensualidad.objects.get(alumno=self.alumno, mes=9, anio=2025)
        pagada.pagado = True
        pagada.save(update_fields=['pagado'])

        beca = Beca.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026', porcentaje=20,
            fecha_desde=date(2025, 9, 1), fecha_hasta=date(2030, 7, 31),
        )

        pagada.refresh_from_db()
        impaga = Mensualidad.objects.get(alumno=self.alumno, mes=10, anio=2025)
        self.assertEqual(pagada.monto_usd, Decimal('100.00'))  # no se tocó
        self.assertEqual(impaga.monto_usd, Decimal('80.00'))   # 20% de descuento
        self.assertEqual(impaga.porcentaje_beca_aplicado, 20)

        # Subir el porcentaje recalcula de nuevo la impaga
        beca.porcentaje = 60
        beca.save()
        impaga.refresh_from_db()
        self.assertEqual(impaga.monto_usd, Decimal('40.00'))

    def test_revocar_beca_regresa_monto_completo(self):
        generar_mensualidades([self.alumno], [(9, 2025)], monto=Decimal('100.00'))
        beca = Beca.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026', porcentaje=30,
            fecha_desde=date(2025, 9, 1), fecha_hasta=date(2030, 7, 31),
        )
        m = Mensualidad.objects.get(alumno=self.alumno, mes=9, anio=2025)
        self.assertEqual(m.monto_usd, Decimal('70.00'))

        beca.estado = 'revocada'
        beca.save()

        m.refresh_from_db()
        self.assertEqual(m.monto_usd, Decimal('100.00'))
        self.assertEqual(m.porcentaje_beca_aplicado, 0)

    def test_revocar_becado_total_deja_que_mora_recalcule(self):
        Beca.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026', porcentaje=100,
            fecha_desde=date(2025, 9, 1), fecha_hasta=date(2030, 7, 31),
        )
        beca = Beca.objects.get(alumno=self.alumno)
        self.alumno.refresh_from_db()
        self.assertEqual(self.alumno.estatus_financiero, 'becado')

        beca.estado = 'revocada'
        beca.save()

        self.alumno.refresh_from_db()
        # Sin mensualidades impagas generadas, el criterio canónico de mora.py
        # lo deja 'solvente' (no queda pegado en 'becado').
        self.assertEqual(self.alumno.estatus_financiero, 'solvente')
        self.assertEqual(self.alumno.porcentaje_beca, 0)


class VigenciaYValidacionTest(GeneracionMensualidadesBase):

    def test_vigencia_expirada_no_aplica(self):
        Beca.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026', porcentaje=50,
            fecha_desde=date(2025, 9, 1), fecha_hasta=date(2025, 12, 31),
        )
        self.assertEqual(porcentaje_beca_vigente(self.alumno, '2025-2026'), 0)

    def test_sin_beca_devuelve_cero(self):
        self.assertEqual(porcentaje_beca_vigente(self.alumno, '2025-2026'), 0)

    def test_porcentaje_fuera_de_rango_rechazado(self):
        for invalido in (0, -5, 101, 150):
            beca = Beca(
                alumno=self.alumno, periodo_escolar='2025-2026', porcentaje=invalido,
                fecha_desde=date(2025, 9, 1), fecha_hasta=date(2030, 7, 31),
            )
            with self.assertRaises(ValidationError):
                beca.full_clean()

    def test_fecha_hasta_anterior_a_fecha_desde_rechazada(self):
        beca = Beca(
            alumno=self.alumno, periodo_escolar='2025-2026', porcentaje=50,
            fecha_desde=date(2026, 1, 1), fecha_hasta=date(2025, 9, 1),
        )
        with self.assertRaises(ValidationError):
            beca.full_clean()


class AntiDuplicadosTest(GeneracionMensualidadesBase):

    def test_no_permite_dos_becas_activas_mismo_alumno_periodo(self):
        Beca.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026', porcentaje=50,
            fecha_desde=date(2025, 9, 1), fecha_hasta=date(2030, 7, 31),
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Beca.objects.create(
                    alumno=self.alumno, periodo_escolar='2025-2026', porcentaje=30,
                    fecha_desde=date(2025, 9, 1), fecha_hasta=date(2030, 7, 31),
                )

    def test_permite_nueva_beca_tras_revocar_la_anterior(self):
        primera = Beca.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026', porcentaje=50,
            fecha_desde=date(2025, 9, 1), fecha_hasta=date(2030, 7, 31),
        )
        primera.estado = 'revocada'
        primera.save()
        segunda = Beca.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026', porcentaje=30,
            fecha_desde=date(2025, 9, 1), fecha_hasta=date(2030, 7, 31),
        )
        self.assertEqual(Beca.objects.filter(alumno=self.alumno, estado='activa').count(), 1)
        self.assertEqual(segunda.porcentaje, 30)
