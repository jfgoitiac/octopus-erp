from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from .models import ConceptoNomina, Empleado, ParametroLegalNomina, RegistroNomina

Usuario = get_user_model()


def crear_empleado(cedula='V-11111111', sueldo='15000.00', pensionado=False):
    return Empleado.objects.create(
        cedula=cedula,
        nombre='Juan',
        apellido='Pérez',
        tipo_personal='docente',
        fecha_ingreso='2020-01-01',
        sueldo_base_ves=Decimal(sueldo),
        es_pensionado=pensionado,
    )


class CalculoDeduccionesTest(TestCase):
    def test_sin_parametro_legal_lanza_validation_error(self):
        """CRÍTICO: antes de la corrección, esto lanzaba TypeError (Decimal * None)
        sin manejar, tumbando la generación completa del lote.
        Nota: la migración 0006 siembra un ParametroLegalNomina desde 1970-01-01
        por defecto, así que hay que borrarlo para simular "sin parámetros configurados"."""
        ParametroLegalNomina.objects.all().delete()
        empleado = crear_empleado()
        registro = RegistroNomina(
            empleado=empleado,
            mes_correspondiente=1,
            anio_correspondiente=1960,
            monto_cestaticket=Decimal('0.00'),
            tasa_pago_bono=Decimal('0.00'),
        )
        with self.assertRaises(ValidationError):
            registro.save()

    def test_pensionado_no_tiene_deducciones(self):
        ParametroLegalNomina.objects.create(
            vigente_desde='2020-01-01',
            porcentaje_sso=Decimal('0.04'),
            porcentaje_lph=Decimal('0.01'),
        )
        empleado = crear_empleado(pensionado=True)
        registro = RegistroNomina.objects.create(
            empleado=empleado,
            mes_correspondiente=6,
            anio_correspondiente=2026,
            monto_cestaticket=Decimal('100.00'),
            tasa_pago_bono=Decimal('0.00'),
        )
        self.assertEqual(registro.monto_sso, Decimal('0.00'))
        self.assertEqual(registro.monto_lph, Decimal('0.00'))
        self.assertEqual(registro.total_pagar_ves, empleado.sueldo_base_ves + registro.monto_cestaticket)

    def test_redondeo_comercial_half_up(self):
        """0.005 debe redondear hacia arriba (comercial), no ROUND_HALF_EVEN (default de Decimal)."""
        ParametroLegalNomina.objects.create(
            vigente_desde='2020-01-01',
            porcentaje_sso=Decimal('0.0001'),
            porcentaje_lph=Decimal('0.0001'),
        )
        empleado = crear_empleado(sueldo='125.00')  # 125.00 * 0.0001 = 0.0125 -> 0.01
        registro = RegistroNomina.objects.create(
            empleado=empleado,
            mes_correspondiente=1,
            anio_correspondiente=2026,
            monto_cestaticket=Decimal('0.00'),
            tasa_pago_bono=Decimal('0.00'),
        )
        self.assertEqual(registro.monto_sso, Decimal('0.01'))


class EmpleadoRrhhDuplicadoTest(TestCase):
    def test_no_permite_dos_empleados_de_nomina_para_el_mismo_rrhh(self):
        from rrhh.models import Empleado as EmpleadoRRHH

        rrhh_emp = EmpleadoRRHH.objects.create(
            nombre='Ana', apellido='Gómez', cedula='V-22222222', cargo='Profesora',
        )
        # rrhh.Empleado.save() ya vincula automáticamente un nomina.Empleado.
        Empleado.objects.get(empleado_rrhh=rrhh_emp)

        duplicado = Empleado(
            cedula='V-33333333',
            nombre='Otro',
            apellido='Nombre',
            tipo_personal='docente',
            fecha_ingreso='2020-01-01',
            sueldo_base_ves=Decimal('1000.00'),
            empleado_rrhh=rrhh_emp,
        )
        with self.assertRaises(ValidationError):
            duplicado.save()


class GenerarLoteViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = Usuario.objects.create_user(username='admin', password='x', is_superuser=True, is_staff=True)
        ParametroLegalNomina.objects.create(
            vigente_desde='2020-01-01',
            porcentaje_sso=Decimal('0.04'),
            porcentaje_lph=Decimal('0.01'),
        )

    def test_requiere_autenticacion(self):
        resp = self.client.post('/api/nomina/registros/generar_lote/', {
            'mes': 6, 'anio': 2026, 'tasa_cambio': 40, 'monto_cestaticket': 5,
        })
        self.assertIn(resp.status_code, (401, 403))

    def test_cero_empleados_activos(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.post('/api/nomina/registros/generar_lote/', {
            'mes': 6, 'anio': 2026, 'tasa_cambio': 40, 'monto_cestaticket': 5,
        })
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json(), [])

    def test_falla_limpio_sin_parametro_legal_del_periodo(self):
        ParametroLegalNomina.objects.all().delete()
        self.client.force_authenticate(self.admin)
        crear_empleado()
        resp = self.client.post('/api/nomina/registros/generar_lote/', {
            'mes': 1, 'anio': 1960, 'tasa_cambio': 40, 'monto_cestaticket': 5,
        })
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(RegistroNomina.objects.filter(anio_correspondiente=1960).exists())

    def test_genera_para_empleados_activos(self):
        self.client.force_authenticate(self.admin)
        crear_empleado()
        resp = self.client.post('/api/nomina/registros/generar_lote/', {
            'mes': 6, 'anio': 2026, 'tasa_cambio': 40, 'monto_cestaticket': 5,
        })
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(len(resp.json()), 1)


class RegistroNominaEdicionDeshabilitadaTest(TestCase):
    """Los recibos de nómina ya emitidos no se editan/borran por API — solo GET/POST."""

    def setUp(self):
        self.client = APIClient()
        self.admin = Usuario.objects.create_user(username='admin2', password='x', is_superuser=True, is_staff=True)
        self.client.force_authenticate(self.admin)
        ParametroLegalNomina.objects.create(
            vigente_desde='2020-01-01',
            porcentaje_sso=Decimal('0.04'),
            porcentaje_lph=Decimal('0.01'),
        )
        empleado = crear_empleado()
        self.registro = RegistroNomina.objects.create(
            empleado=empleado,
            mes_correspondiente=6,
            anio_correspondiente=2026,
            monto_cestaticket=Decimal('100.00'),
            tasa_pago_bono=Decimal('0.00'),
        )

    def test_no_permite_editar(self):
        resp = self.client.patch(
            f'/api/nomina/registros/{self.registro.id}/',
            {'monto_cestaticket': '999.00'},
            format='json',
        )
        self.assertEqual(resp.status_code, 405)

    def test_no_permite_borrar(self):
        resp = self.client.delete(f'/api/nomina/registros/{self.registro.id}/')
        self.assertEqual(resp.status_code, 405)


class EstadoRegistroNominaTest(TestCase):
    """Fase B: RegistroNomina.estado — un registro cerrado deja de recalcularse
    automáticamente cuando cambian los datos maestros del empleado."""

    def setUp(self):
        self.client = APIClient()
        self.admin = Usuario.objects.create_user(username='admin_estado', password='x', is_superuser=True, is_staff=True)
        self.client.force_authenticate(self.admin)
        ParametroLegalNomina.objects.create(
            vigente_desde='2020-01-01',
            porcentaje_sso=Decimal('0.04'),
            porcentaje_lph=Decimal('0.01'),
        )
        self.empleado = crear_empleado(sueldo='1000.00')
        hoy = date.today()
        self.registro = RegistroNomina.objects.create(
            empleado=self.empleado,
            mes_correspondiente=hoy.month,
            anio_correspondiente=hoy.year,
            monto_cestaticket=Decimal('0.00'),
            tasa_pago_bono=Decimal('0.00'),
        )

    def test_registro_nuevo_queda_abierto_por_defecto(self):
        self.assertEqual(self.registro.estado, 'abierto')

    def test_signal_recalcula_registro_abierto(self):
        total_antes = self.registro.total_pagar_ves
        self.empleado.sueldo_base_ves = Decimal('2000.00')
        self.empleado.save()
        self.registro.refresh_from_db()
        self.assertNotEqual(self.registro.total_pagar_ves, total_antes)

    def test_signal_no_recalcula_registro_cerrado(self):
        self.registro.estado = 'cerrado'
        self.registro.save(update_fields=['estado'])
        total_antes = self.registro.total_pagar_ves

        self.empleado.sueldo_base_ves = Decimal('2000.00')
        self.empleado.save()

        self.registro.refresh_from_db()
        self.assertEqual(self.registro.total_pagar_ves, total_antes)

    def test_accion_cerrar(self):
        resp = self.client.post(f'/api/nomina/registros/{self.registro.id}/cerrar/')
        self.assertEqual(resp.status_code, 200)
        self.registro.refresh_from_db()
        self.assertEqual(self.registro.estado, 'cerrado')

    def test_accion_reabrir(self):
        self.registro.estado = 'cerrado'
        self.registro.save(update_fields=['estado'])
        resp = self.client.post(f'/api/nomina/registros/{self.registro.id}/reabrir/')
        self.assertEqual(resp.status_code, 200)
        self.registro.refresh_from_db()
        self.assertEqual(self.registro.estado, 'abierto')


class ConceptoNominaViewSetTest(TestCase):
    """Fase B: CRUD de ConceptoNomina — parametrización que consume el frontend."""

    def setUp(self):
        self.client = APIClient()
        self.admin = Usuario.objects.create_user(username='admin_concepto', password='x', is_superuser=True, is_staff=True)
        self.client.force_authenticate(self.admin)

    def test_requiere_autenticacion(self):
        client_anonimo = APIClient()
        resp = client_anonimo.get('/api/nomina/conceptos/')
        self.assertIn(resp.status_code, (401, 403))

    def test_crear_concepto_universal_hijo_fijo(self):
        resp = self.client.post('/api/nomina/conceptos/', {
            'nombre': 'Prima por hijo (personalizada)',
            'tipo': 'asignacion',
            'base_calculo': 'monto_fijo',
            'codigo': 'HIJO_FIJO',
            'monto': '15.00',
            'moneda': 'USD',
            'activo': True,
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(ConceptoNomina.objects.get(codigo='HIJO_FIJO').monto, Decimal('15.00'))

    def test_filtro_activo_y_convenio(self):
        ConceptoNomina.objects.create(nombre='Activo universal', tipo='asignacion', codigo='HIJO_FIJO', activo=True, convenio='')
        ConceptoNomina.objects.create(nombre='Inactivo', tipo='asignacion', activo=False, convenio='')
        ConceptoNomina.objects.create(nombre='Solo AVEC', tipo='asignacion', activo=True, convenio='avec_ve')

        resp = self.client.get('/api/nomina/conceptos/?activo=1&convenio=')
        nombres = [c['nombre'] for c in resp.json()]
        self.assertEqual(nombres, ['Activo universal'])
