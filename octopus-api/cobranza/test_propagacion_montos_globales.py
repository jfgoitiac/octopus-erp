"""
Tests de propagar_monto_global (cobranza/services.py) y su integración en
ConfiguracionCobranzaView.post:
  - Guardar un ParametroGlobal por defecto (mensualidad/inscripción/proyecto
    de inversión) debe propagarse a las cuotas ya generadas que dependen de
    ese valor, respetando overrides manuales (monto_personalizado=True) y,
    para mensualidad, excluyendo las vencidas (mismo criterio que
    cobranza/mora.py::_condicion_mora).
  - Idempotencia: llamar dos veces con el mismo monto no duplica filas ni
    produce un segundo efecto distinto.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from secretaria.models import Alumno, ConfiguracionSistema, Representante
from usuarios.models import LogAuditoria
from .models import CuotaInscripcion, CuotaProyectoInversion, Mensualidad, ParametroGlobal, TipoCargoEspecial
from .services import propagar_monto_global, tipo_cargo_proyecto_inversion

User = get_user_model()


def _crear_alumno(cedula, representante, **kwargs):
    defaults = dict(
        nombre='Ana', apellido='Test', fecha_nacimiento=date(2015, 1, 1),
        dia_limite_pago=10, representante=representante,
    )
    defaults.update(kwargs)
    return Alumno.objects.create(cedula_escolar=cedula, **defaults)


class PropagacionMontosGlobalesBase(TestCase):
    def setUp(self):
        self.config = ConfiguracionSistema.objects.create(
            fecha_inicio_inscripciones=date(2026, 1, 1),
            fecha_fin_inscripciones=date(2026, 12, 31),
            fecha_inicio_ano_escolar=date(2025, 9, 1),
            fecha_fin_ano_escolar=date(2026, 7, 31),
            periodo_escolar_activo='2025-2026',
        )
        self.representante = Representante.objects.create(
            cedula='V11111111', nombre='Maria', apellido='Perez',
            telefono='0412', correo='maria@test.com', direccion='Calle 1',
        )
        self.alumno = _crear_alumno('E1000001', self.representante)
        self.usuario = User.objects.create_superuser(
            username='admin', password='x', email='admin@test.com'
        )
        # Hoy fijo dentro del test: 15/06/2026, dia_limite_pago=10.
        self.hoy = date(2026, 6, 15)


class PropagacionMensualidadTest(PropagacionMontosGlobalesBase):

    def test_propaga_a_mensualidad_heredada_futura(self):
        m = Mensualidad.objects.create(
            alumno=self.alumno, mes=7, anio=2026, monto_usd=Decimal('35.00'),
        )
        resultado = propagar_monto_global(
            'MONTO_MENSUALIDAD_DEFECTO', Decimal('50.00'), usuario=self.usuario, hoy=self.hoy,
        )
        m.refresh_from_db()
        self.assertEqual(m.monto_usd, Decimal('50.00'))
        self.assertEqual(resultado['actualizadas'], 1)
        self.assertEqual(resultado['respetadas_por_override'], 0)
        self.assertEqual(resultado['excluidas_por_vencidas'], 0)

    def test_no_propaga_a_mensualidad_personalizada(self):
        m = Mensualidad.objects.create(
            alumno=self.alumno, mes=7, anio=2026, monto_usd=Decimal('35.00'),
            monto_personalizado=True,
        )
        resultado = propagar_monto_global(
            'MONTO_MENSUALIDAD_DEFECTO', Decimal('50.00'), usuario=self.usuario, hoy=self.hoy,
        )
        m.refresh_from_db()
        self.assertEqual(m.monto_usd, Decimal('35.00'))
        self.assertEqual(resultado['actualizadas'], 0)
        self.assertEqual(resultado['respetadas_por_override'], 1)
        self.assertEqual(resultado['excluidas_por_vencidas'], 0)

    def test_no_propaga_a_mensualidad_ya_pagada(self):
        m = Mensualidad.objects.create(
            alumno=self.alumno, mes=7, anio=2026, monto_usd=Decimal('35.00'),
            pagado=True,
        )
        resultado = propagar_monto_global(
            'MONTO_MENSUALIDAD_DEFECTO', Decimal('50.00'), usuario=self.usuario, hoy=self.hoy,
        )
        m.refresh_from_db()
        self.assertEqual(m.monto_usd, Decimal('35.00'))
        self.assertFalse(m.monto_personalizado)
        self.assertEqual(resultado['actualizadas'], 0)
        self.assertEqual(resultado['respetadas_por_override'], 0)
        self.assertEqual(resultado['excluidas_por_vencidas'], 0)

    def test_no_propaga_a_mensualidad_vencida_mes_pasado(self):
        m = Mensualidad.objects.create(
            alumno=self.alumno, mes=5, anio=2026, monto_usd=Decimal('35.00'),
        )
        resultado = propagar_monto_global(
            'MONTO_MENSUALIDAD_DEFECTO', Decimal('50.00'), usuario=self.usuario, hoy=self.hoy,
        )
        m.refresh_from_db()
        self.assertEqual(m.monto_usd, Decimal('35.00'))
        self.assertEqual(resultado['actualizadas'], 0)
        self.assertEqual(resultado['excluidas_por_vencidas'], 1)

    def test_no_propaga_a_mensualidad_vencida_mes_actual_dia_limite_alcanzado(self):
        # dia_limite_pago=10, hoy=15/jun/2026 -> ya se alcanzó el límite.
        m = Mensualidad.objects.create(
            alumno=self.alumno, mes=6, anio=2026, monto_usd=Decimal('35.00'),
        )
        resultado = propagar_monto_global(
            'MONTO_MENSUALIDAD_DEFECTO', Decimal('50.00'), usuario=self.usuario, hoy=self.hoy,
        )
        m.refresh_from_db()
        self.assertEqual(m.monto_usd, Decimal('35.00'))
        self.assertEqual(resultado['actualizadas'], 0)
        self.assertEqual(resultado['excluidas_por_vencidas'], 1)

    def test_propaga_a_mensualidad_mes_actual_dia_limite_no_alcanzado(self):
        # dia_limite_pago=10, hoy=5/jun/2026 -> aún no llega el límite.
        alumno_dia_20 = _crear_alumno('E1000002', self.representante, dia_limite_pago=20)
        m = Mensualidad.objects.create(
            alumno=alumno_dia_20, mes=6, anio=2026, monto_usd=Decimal('35.00'),
        )
        resultado = propagar_monto_global(
            'MONTO_MENSUALIDAD_DEFECTO', Decimal('50.00'), usuario=self.usuario, hoy=self.hoy,
        )
        m.refresh_from_db()
        self.assertEqual(m.monto_usd, Decimal('50.00'))
        self.assertEqual(resultado['actualizadas'], 1)
        self.assertEqual(resultado['excluidas_por_vencidas'], 0)

    def test_doble_ejecucion_consecutiva_es_idempotente(self):
        m = Mensualidad.objects.create(
            alumno=self.alumno, mes=7, anio=2026, monto_usd=Decimal('35.00'),
        )
        conteo_antes = Mensualidad.objects.count()

        resultado_1 = propagar_monto_global(
            'MONTO_MENSUALIDAD_DEFECTO', Decimal('50.00'), usuario=self.usuario, hoy=self.hoy,
        )
        resultado_2 = propagar_monto_global(
            'MONTO_MENSUALIDAD_DEFECTO', Decimal('50.00'), usuario=self.usuario, hoy=self.hoy,
        )

        self.assertEqual(resultado_1, resultado_2)
        self.assertEqual(Mensualidad.objects.count(), conteo_antes)
        # unique_together garantiza una sola fila por alumno/mes/año; la
        # segunda corrida no crea ninguna adicional.
        self.assertEqual(
            Mensualidad.objects.filter(alumno=self.alumno, mes=7, anio=2026).count(), 1
        )
        m.refresh_from_db()
        self.assertEqual(m.monto_usd, Decimal('50.00'))

    def test_dry_run_no_escribe_nada(self):
        m = Mensualidad.objects.create(
            alumno=self.alumno, mes=7, anio=2026, monto_usd=Decimal('35.00'),
        )
        logs_antes = LogAuditoria.objects.count()
        resultado = propagar_monto_global(
            'MONTO_MENSUALIDAD_DEFECTO', Decimal('50.00'), usuario=self.usuario,
            dry_run=True, hoy=self.hoy,
        )
        m.refresh_from_db()
        self.assertEqual(m.monto_usd, Decimal('35.00'))
        self.assertEqual(resultado['actualizadas'], 1)
        self.assertEqual(LogAuditoria.objects.count(), logs_antes)

    def test_registra_auditoria_al_propagar(self):
        Mensualidad.objects.create(
            alumno=self.alumno, mes=7, anio=2026, monto_usd=Decimal('35.00'),
        )
        propagar_monto_global(
            'MONTO_MENSUALIDAD_DEFECTO', Decimal('50.00'), usuario=self.usuario, hoy=self.hoy,
        )
        log = LogAuditoria.objects.filter(modulo='cobranza', accion='Propagación de monto global').latest('fecha_hora')
        self.assertEqual(log.usuario, self.usuario)
        self.assertEqual(log.detalles.get('clave'), 'MONTO_MENSUALIDAD_DEFECTO')
        self.assertEqual(log.detalles.get('actualizadas'), 1)


class PropagacionInscripcionYProyectoTest(PropagacionMontosGlobalesBase):

    def test_propaga_a_cuota_inscripcion_del_periodo_activo(self):
        cuota = CuotaInscripcion.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026', monto_usd=Decimal('50.00'),
        )
        resultado = propagar_monto_global(
            'MONTO_INSCRIPCION_DEFECTO', Decimal('60.00'), usuario=self.usuario,
        )
        cuota.refresh_from_db()
        self.assertEqual(cuota.monto_usd, Decimal('60.00'))
        self.assertEqual(resultado['actualizadas'], 1)
        self.assertEqual(resultado['respetadas_por_override'], 0)
        self.assertEqual(resultado['excluidas_por_vencidas'], 0)

    def test_no_propaga_a_cuota_inscripcion_personalizada(self):
        cuota = CuotaInscripcion.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026', monto_usd=Decimal('50.00'),
            monto_personalizado=True,
        )
        resultado = propagar_monto_global(
            'MONTO_INSCRIPCION_DEFECTO', Decimal('60.00'), usuario=self.usuario,
        )
        cuota.refresh_from_db()
        self.assertEqual(cuota.monto_usd, Decimal('50.00'))
        self.assertEqual(resultado['respetadas_por_override'], 1)

    def test_no_propaga_a_cuota_inscripcion_de_otro_periodo(self):
        cuota = CuotaInscripcion.objects.create(
            alumno=self.alumno, periodo_escolar='2024-2025', monto_usd=Decimal('50.00'),
        )
        resultado = propagar_monto_global(
            'MONTO_INSCRIPCION_DEFECTO', Decimal('60.00'), usuario=self.usuario,
        )
        cuota.refresh_from_db()
        self.assertEqual(cuota.monto_usd, Decimal('50.00'))
        self.assertEqual(resultado['actualizadas'], 0)

    def test_propaga_a_cuota_proyecto_inversion_sin_tocar_otro_tipo_de_cargo(self):
        tipo_proyecto = tipo_cargo_proyecto_inversion()
        tipo_uniformes = TipoCargoEspecial.objects.create(
            nombre='Uniformes', monto_defecto_usd=Decimal('20.00'),
            periodicidad='unico', numero_cuotas=1, bloquea_inscripcion=False,
            alcance='todos', activo=True,
        )
        cuota_proyecto = CuotaProyectoInversion.objects.create(
            representante=self.representante, periodo_escolar='2025-2026',
            tipo_concepto=tipo_proyecto, numero_cuota=1, monto_usd=Decimal('100.00'),
        )
        cuota_uniformes = CuotaProyectoInversion.objects.create(
            representante=self.representante, periodo_escolar='2025-2026',
            tipo_concepto=tipo_uniformes, numero_cuota=1, monto_usd=Decimal('20.00'),
        )
        resultado = propagar_monto_global(
            'MONTO_PROYECTO_INVERSION_DEFECTO', Decimal('150.00'), usuario=self.usuario,
        )
        cuota_proyecto.refresh_from_db()
        cuota_uniformes.refresh_from_db()
        self.assertEqual(cuota_proyecto.monto_usd, Decimal('150.00'))
        self.assertEqual(cuota_uniformes.monto_usd, Decimal('20.00'))
        self.assertEqual(resultado['actualizadas'], 1)

    def test_no_propaga_a_cuota_proyecto_inversion_personalizada(self):
        tipo_proyecto = tipo_cargo_proyecto_inversion()
        cuota = CuotaProyectoInversion.objects.create(
            representante=self.representante, periodo_escolar='2025-2026',
            tipo_concepto=tipo_proyecto, numero_cuota=1, monto_usd=Decimal('100.00'),
            monto_personalizado=True,
        )
        resultado = propagar_monto_global(
            'MONTO_PROYECTO_INVERSION_DEFECTO', Decimal('150.00'), usuario=self.usuario,
        )
        cuota.refresh_from_db()
        self.assertEqual(cuota.monto_usd, Decimal('100.00'))
        self.assertEqual(resultado['respetadas_por_override'], 1)

    def test_doble_ejecucion_inscripcion_es_idempotente(self):
        CuotaInscripcion.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026', monto_usd=Decimal('50.00'),
        )
        conteo_antes = CuotaInscripcion.objects.count()
        resultado_1 = propagar_monto_global(
            'MONTO_INSCRIPCION_DEFECTO', Decimal('60.00'), usuario=self.usuario,
        )
        resultado_2 = propagar_monto_global(
            'MONTO_INSCRIPCION_DEFECTO', Decimal('60.00'), usuario=self.usuario,
        )
        self.assertEqual(resultado_1, resultado_2)
        self.assertEqual(CuotaInscripcion.objects.count(), conteo_antes)


class ConfiguracionCobranzaViewPropagacionTest(PropagacionMontosGlobalesBase):
    """Integra propagar_monto_global en el endpoint que la UI consume."""

    def _post(self, payload):
        client = APIClient()
        client.force_authenticate(self.usuario)
        return client.post('/api/cobranza/configuracion/', payload, format='json')

    def test_post_guarda_parametro_y_propaga_mensualidad(self):
        """Bug original: el guardado reportaba éxito pero las mensualidades
        ya generadas no cambiaban. Ahora sí se propagan.

        La vista llama a propagar_monto_global() sin `hoy` explícito (usa
        date.today() real), así que el mes de la mensualidad debe ser
        garantizadamente futuro respecto a la fecha real de ejecución, no
        respecto al `self.hoy` fijo del resto de esta suite.
        """
        anio_futuro = date.today().year + 2
        m = Mensualidad.objects.create(
            alumno=self.alumno, mes=1, anio=anio_futuro, monto_usd=Decimal('35.00'),
        )
        resp = self._post({'monto_defecto': '55.00'})
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data['monto_defecto'], '55.00')
        self.assertEqual(resp.data['resultado']['mensualidad']['actualizadas'], 1)
        self.assertEqual(
            ParametroGlobal.objects.get(clave='MONTO_MENSUALIDAD_DEFECTO').valor, '55.00'
        )
        m.refresh_from_db()
        self.assertEqual(m.monto_usd, Decimal('55.00'))

    def test_post_dry_run_no_persiste_cambios_de_propagacion(self):
        anio_futuro = date.today().year + 2
        m = Mensualidad.objects.create(
            alumno=self.alumno, mes=1, anio=anio_futuro, monto_usd=Decimal('35.00'),
        )
        resp = self._post({'monto_defecto': '55.00', 'dry_run': True})
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIn('preview', resp.data)
        self.assertEqual(resp.data['preview']['mensualidad']['actualizadas'], 1)
        self.assertNotIn('resultado', resp.data)
        m.refresh_from_db()
        # La propagación no se aplicó (aunque el monto_usd base no cambió).
        self.assertEqual(m.monto_usd, Decimal('35.00'))

    def test_post_respeta_override_de_inscripcion(self):
        cuota_override = CuotaInscripcion.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026', monto_usd=Decimal('40.00'),
            monto_personalizado=True,
        )
        resp = self._post({'monto_inscripcion': '65.00'})
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data['resultado']['inscripcion']['respetadas_por_override'], 1)
        cuota_override.refresh_from_db()
        self.assertEqual(cuota_override.monto_usd, Decimal('40.00'))
