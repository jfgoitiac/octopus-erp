"""
Tests de la generación automática de mensualidades:
  - Servicio central (cobranza/services.py)
  - Tarea mensual de Celery (generar_mensualidades_mes_actual)
  - Comando de backfill (manage.py generar_mensualidades)
  - Integración con el criterio de mora
  - Inscripción: solo cobra la cuota de inscripción y bloquea si hay una impaga
"""
from datetime import date
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from secretaria.models import Alumno, ConfiguracionGrado, ConfiguracionSistema, Representante
from .models import CuotaInscripcion, Mensualidad, ParametroGlobal
from .mora import annotate_en_mora
from .services import (
    generar_mensualidades,
    meses_ano_escolar,
    rango_ano_escolar,
)
from .tasks import generar_mensualidades_mes_actual

User = get_user_model()


class _FechaFija(date):
    """Reemplazo de datetime.date con today() fijo (2 de julio de 2026)."""
    @classmethod
    def today(cls):
        return date(2026, 7, 2)


def _crear_alumno(cedula, representante, **kwargs):
    defaults = dict(
        nombre='Ana', apellido='Test', fecha_nacimiento=date(2015, 1, 1),
        dia_limite_pago=1, representante=representante,
    )
    defaults.update(kwargs)
    return Alumno.objects.create(cedula_escolar=cedula, **defaults)


class GeneracionMensualidadesBase(TestCase):
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


class ServicioGeneracionTest(GeneracionMensualidadesBase):

    def test_crea_mensualidades_y_es_idempotente(self):
        creadas = generar_mensualidades([self.alumno], [(6, 2026), (7, 2026)])
        self.assertEqual(creadas, 2)
        # Segunda corrida no duplica
        creadas = generar_mensualidades([self.alumno], [(6, 2026), (7, 2026)])
        self.assertEqual(creadas, 0)
        self.assertEqual(Mensualidad.objects.filter(alumno=self.alumno).count(), 2)

    def test_excluye_meses_fuera_del_ano_escolar_activo(self):
        """Agosto/2026 y septiembre/2025 quedan fuera de 1/sep/2025-31/jul/2026."""
        creadas = generar_mensualidades([self.alumno], [(8, 2026), (8, 2025)])
        self.assertEqual(creadas, 0)
        self.assertFalse(Mensualidad.objects.filter(alumno=self.alumno).exists())

    def test_sin_configuracion_no_genera_nada(self):
        ConfiguracionSistema.objects.all().delete()
        creadas = generar_mensualidades([self.alumno], [(7, 2026)])
        self.assertEqual(creadas, 0)
        self.assertFalse(Mensualidad.objects.filter(alumno=self.alumno).exists())

    def test_usa_monto_de_parametro_global(self):
        ParametroGlobal.objects.create(clave='MONTO_MENSUALIDAD_DEFECTO', valor='42.50')
        generar_mensualidades([self.alumno], [(7, 2026)])
        m = Mensualidad.objects.get(alumno=self.alumno, mes=7, anio=2026)
        self.assertEqual(m.monto_usd, Decimal('42.50'))

    def test_rango_ano_escolar_toma_las_fechas_de_configuracion(self):
        self.assertEqual(
            rango_ano_escolar(), (date(2025, 9, 1), date(2026, 7, 31))
        )

    def test_meses_ano_escolar(self):
        meses = meses_ano_escolar(date(2025, 9, 1), date(2026, 7, 31))
        self.assertEqual(len(meses), 11)  # Sep-Dic 2025 + Ene-Jul 2026
        self.assertEqual(meses[0], (9, 2025))
        self.assertEqual(meses[-1], (7, 2026))


class TareaMensualTest(GeneracionMensualidadesBase):

    @patch('cobranza.tasks.date', _FechaFija)
    def test_genera_mes_actual_para_activos_no_becados(self):
        becado = _crear_alumno(
            'E1000002', self.representante, estatus_financiero='becado'
        )
        retirado = _crear_alumno('E1000003', self.representante, activo=False)

        creadas = generar_mensualidades_mes_actual()
        self.assertEqual(creadas, 1)
        self.assertTrue(
            Mensualidad.objects.filter(alumno=self.alumno, mes=7, anio=2026).exists()
        )
        self.assertFalse(Mensualidad.objects.filter(alumno=becado).exists())
        self.assertFalse(Mensualidad.objects.filter(alumno=retirado).exists())

    @patch('cobranza.tasks.date', _FechaFija)
    def test_alumno_queda_en_mora_tras_generacion(self):
        """Con dia_limite_pago=1 y hoy=2/jul, la mensualidad generada activa la mora."""
        generar_mensualidades_mes_actual()
        alumno = annotate_en_mora(
            Alumno.objects.filter(pk=self.alumno.pk), hoy=date(2026, 7, 2)
        ).get()
        self.assertTrue(alumno.en_mora)

    def test_no_genera_en_agosto(self):
        class _Agosto(date):
            @classmethod
            def today(cls):
                return date(2026, 8, 1)

        with patch('cobranza.tasks.date', _Agosto):
            creadas = generar_mensualidades_mes_actual()
        self.assertEqual(creadas, 0)
        self.assertFalse(Mensualidad.objects.exists())


class ComandoBackfillTest(GeneracionMensualidadesBase):

    def _run(self, *args):
        out = StringIO()
        with patch(
            'cobranza.management.commands.generar_mensualidades.date', _FechaFija
        ):
            call_command('generar_mensualidades', *args, stdout=out)
        return out.getvalue()

    def test_backfill_mes_actual_hasta_fin_de_periodo(self):
        salida = self._run()
        # Hoy fijo = 2/jul/2026, período 2025-2026 → solo julio queda por delante
        self.assertEqual(Mensualidad.objects.filter(alumno=self.alumno).count(), 1)
        self.assertIn('1 mensualidades creadas', salida)

    def test_backfill_desde_mes_anterior(self):
        self._run('--desde', '2026-05')
        meses = set(
            Mensualidad.objects.filter(alumno=self.alumno).values_list('mes', flat=True)
        )
        self.assertEqual(meses, {5, 6, 7})

    def test_dry_run_no_escribe(self):
        salida = self._run('--dry-run')
        self.assertIn('DRY-RUN', salida)
        self.assertFalse(Mensualidad.objects.exists())


class InscripcionGeneraDeudaTest(GeneracionMensualidadesBase):
    """Valida el flujo completo de inscripción: bloqueo por cuota impaga y
    que al inscribir solo se cobre la cuota de inscripción (ninguna
    Mensualidad; esas las genera después la tarea mensual de Celery)."""

    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(username='secretaria', password='x')
        ConfiguracionGrado.objects.create(grado_seccion='1er Grado - A', cupos_maximos=30)
        self.payload = {
            'alumno': {
                'nombre': 'Ana', 'apellido': 'Test',
                'cedula_escolar': 'E1000001',
                'fecha_nacimiento': '2015-01-01', 'genero': 'femenino',
                'representante': {
                    'cedula': 'V11111111', 'nombre': 'Maria', 'apellido': 'Perez',
                    'telefono': '0412', 'correo': 'maria@test.com', 'direccion': 'Calle 1',
                },
            },
            'periodo_escolar': '2025-2026',
            'grado_seccion': '1er Grado - A',
            'tipo_ingreso': 'regular',
        }

    def _serializer(self):
        from secretaria.serializers import InscripcionSerializer
        request = type('R', (), {'user': self.user})()
        return InscripcionSerializer(data=self.payload, context={'request': request})

    def test_bloquea_inscripcion_con_cuota_impaga(self):
        CuotaInscripcion.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026',
            monto_usd=Decimal('50.00'), pagado=False,
        )
        serializer = self._serializer()
        self.assertTrue(serializer.is_valid(), serializer.errors)
        from rest_framework.serializers import ValidationError
        with self.assertRaises(ValidationError) as ctx:
            serializer.save()
        self.assertIn('cuota de inscripción pendiente', str(ctx.exception))
        # No se generó deuda de mensualidades porque la inscripción se revirtió
        self.assertFalse(Mensualidad.objects.filter(alumno=self.alumno).exists())

    def test_inscripcion_exitosa_solo_cobra_la_cuota_de_inscripcion(self):
        serializer = self._serializer()
        self.assertTrue(serializer.is_valid(), serializer.errors)
        inscripcion = serializer.save()

        # Cuota de inscripción cargada como deuda del período
        self.assertTrue(
            CuotaInscripcion.objects.filter(
                alumno=inscripcion.alumno, periodo_escolar='2025-2026', pagado=False
            ).exists()
        )
        # No se genera ninguna Mensualidad al inscribir
        self.assertFalse(
            Mensualidad.objects.filter(alumno=inscripcion.alumno).exists()
        )


class SincronizarEstatusTest(GeneracionMensualidadesBase):
    """Tras un pago, el estatus persistido debe recalcularse con el criterio
    canónico — pagar un mes no implica solvencia si debe meses anteriores."""

    def test_pagar_un_mes_no_da_solvencia_si_debe_anteriores(self):
        from .mora import sincronizar_estatus_alumno
        generar_mensualidades([self.alumno], [(5, 2026), (6, 2026)])
        hoy = date(2026, 7, 2)

        estatus = sincronizar_estatus_alumno(self.alumno, hoy)
        self.assertEqual(estatus, 'mora')

        # Paga mayo pero sigue debiendo junio → sigue en mora
        Mensualidad.objects.filter(alumno=self.alumno, mes=5).update(pagado=True)
        estatus = sincronizar_estatus_alumno(self.alumno, hoy)
        self.assertEqual(estatus, 'mora')
        self.alumno.refresh_from_db()
        self.assertEqual(self.alumno.estatus_financiero, 'mora')

        # Paga todo → solvente
        Mensualidad.objects.filter(alumno=self.alumno).update(pagado=True)
        estatus = sincronizar_estatus_alumno(self.alumno, hoy)
        self.assertEqual(estatus, 'solvente')
        self.alumno.refresh_from_db()
        self.assertEqual(self.alumno.estatus_financiero, 'solvente')

    def test_cuota_inscripcion_impaga_pone_en_mora_sin_deuda_de_mensualidades(self):
        """Un alumno al día con sus mensualidades pero con la cuota de
        inscripción impaga debe aparecer en mora, no solvente (bug reportado:
        el módulo de alumnos lo mostraba solvente porque el criterio canónico
        solo miraba Mensualidad)."""
        CuotaInscripcion.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026',
            monto_usd=Decimal('50.00'), pagado=False,
        )
        alumno = annotate_en_mora(
            Alumno.objects.filter(pk=self.alumno.pk), hoy=date(2026, 7, 2)
        ).get()
        self.assertTrue(alumno.en_mora)

    def test_becado_no_se_toca(self):
        from .mora import sincronizar_estatus_alumno
        becado = _crear_alumno(
            'E1000005', self.representante, estatus_financiero='becado'
        )
        self.assertEqual(sincronizar_estatus_alumno(becado), 'becado')
        becado.refresh_from_db()
        self.assertEqual(becado.estatus_financiero, 'becado')


class DiaLimitePagoGlobalTest(GeneracionMensualidadesBase):
    """El día límite configurado en ConfiguracionSistema debe propagarse a los
    alumnos existentes y aplicarse como default a los alumnos nuevos."""

    def setUp(self):
        super().setUp()
        # Reutiliza el ConfiguracionSistema único creado en la base (singleton:
        # las vistas siempre usan ConfiguracionSistema.objects.first()).
        self.config.fecha_inicio_inscripciones = date(2026, 7, 1)
        self.config.fecha_fin_inscripciones = date(2026, 7, 1)  # cerradas (no genera cuotas)
        self.config.fecha_inicio_ano_escolar = date(2026, 9, 15)
        self.config.fecha_fin_ano_escolar = date(2027, 7, 15)
        self.config.periodo_escolar_activo = '2026-2027'
        self.config.dia_limite_pago = 5
        self.config.save()
        self.admin = User.objects.create_superuser(
            username='admin', password='x', email='admin@test.com'
        )

    def _post_config(self, payload):
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(self.admin)
        return client.post('/api/secretaria/configuracion/', payload, format='json')

    def test_cambio_de_dia_limite_se_propaga_a_alumnos(self):
        Alumno.todos.filter(pk=self.alumno.pk).update(dia_limite_pago=5)
        retirado = _crear_alumno(
            'E1000009', self.representante, activo=False, dia_limite_pago=5
        )
        resp = self._post_config({'dia_limite_pago': 1})
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data.get('alumnos_dia_limite_actualizados'), 2)

        self.alumno.refresh_from_db()
        retirado.refresh_from_db()
        self.assertEqual(self.alumno.dia_limite_pago, 1)
        # También los retirados, para que al reactivarlos queden consistentes
        self.assertEqual(retirado.dia_limite_pago, 1)

    def test_guardar_sin_cambio_sincroniza_alumnos_desviados(self):
        """Cada guardado sincroniza, aunque el valor de config no cambie:
        corrige alumnos que quedaron con otro día límite (data vieja)."""
        # self.alumno tiene dia_limite=1 (helper); config sigue en 5
        resp = self._post_config({'dia_limite_pago': 5})
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data.get('alumnos_dia_limite_actualizados'), 1)
        self.alumno.refresh_from_db()
        self.assertEqual(self.alumno.dia_limite_pago, 5)

        # Segundo guardado idéntico: ya no hay nada que corregir
        resp = self._post_config({'dia_limite_pago': 5})
        self.assertNotIn('alumnos_dia_limite_actualizados', resp.data)

    def test_alumno_nuevo_toma_dia_limite_de_configuracion(self):
        self.config.dia_limite_pago = 3
        self.config.save(update_fields=['dia_limite_pago'])

        from secretaria.serializers import AlumnoSerializer
        request = type('R', (), {'user': self.admin})()
        serializer = AlumnoSerializer(
            data={
                'nombre': 'Luis', 'apellido': 'Nuevo',
                'cedula_escolar': 'E2000001',
                'fecha_nacimiento': '2016-03-01', 'genero': 'masculino',
                'representante': {
                    'cedula': 'V11111111', 'nombre': 'Maria', 'apellido': 'Perez',
                    'telefono': '0412', 'correo': 'maria@test.com', 'direccion': 'Calle 1',
                },
            },
            context={'request': request},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        alumno = serializer.save()
        self.assertEqual(alumno.dia_limite_pago, 3)
