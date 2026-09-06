from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Empleado

Usuario = get_user_model()


class CategoriaDocenteTextoLibreTest(TestCase):
    """categoria_docente es CharField sin choices — documenta el estado actual,
    no es una corrección. Ver NOTAS_TECNICAS.md: desacoplado de
    constants/avec.js CATEGORIAS_DOCENTE en el frontend."""

    def test_acepta_cualquier_texto(self):
        emp = Empleado.objects.create(
            nombre='Ana', apellido='Pérez', cedula='V-10000001',
            cargo='Docente', tipo_personal='docente',
            categoria_docente='CATEGORIA-INVENTADA',
        )
        emp.refresh_from_db()
        self.assertEqual(emp.categoria_docente, 'CATEGORIA-INVENTADA')


class SincronizacionNominaTest(TestCase):
    """rrhh.Empleado es la ficha maestra: su save() crea/actualiza el
    nomina.Empleado vinculado. Sin cobertura previa (rrhh no tenía tests)."""

    def test_creacion_crea_ficha_de_nomina_vinculada(self):
        from nomina.models import Empleado as EmpleadoNomina

        emp = Empleado.objects.create(
            nombre='Carlos', apellido='Ruiz', cedula='V-10000002',
            cargo='Docente', tipo_personal='docente',
            sueldo_base=Decimal('500.00'),
        )
        nomina_emp = EmpleadoNomina.objects.get(empleado_rrhh=emp)
        self.assertEqual(nomina_emp.cedula, 'V-10000002')
        self.assertEqual(nomina_emp.sueldo_base_ves, Decimal('500.00'))

    def test_actualizar_sueldo_base_propaga_a_nomina(self):
        from nomina.models import Empleado as EmpleadoNomina

        emp = Empleado.objects.create(
            nombre='Luisa', apellido='Gómez', cedula='V-10000003',
            cargo='Docente', tipo_personal='docente',
            sueldo_base=Decimal('300.00'),
        )
        emp.sueldo_base = Decimal('450.00')
        emp.save()

        nomina_emp = EmpleadoNomina.objects.get(empleado_rrhh=emp)
        self.assertEqual(nomina_emp.sueldo_base_ves, Decimal('450.00'))

    def test_tipo_personal_apoyo_se_mapea_a_administrativo_en_nomina(self):
        """nomina.Empleado no tiene el tipo 'apoyo' (solo rrhh lo tiene) —
        rrhh/models.py:89-91 lo reasigna a 'administrativo' explícitamente."""
        from nomina.models import Empleado as EmpleadoNomina

        emp = Empleado.objects.create(
            nombre='Pedro', apellido='Díaz', cedula='V-10000004',
            cargo='Vigilante', tipo_personal='apoyo',
            sueldo_base=Decimal('200.00'),
        )
        nomina_emp = EmpleadoNomina.objects.get(empleado_rrhh=emp)
        self.assertEqual(nomina_emp.tipo_personal, 'administrativo')


class EmpleadoViewSetTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = Usuario.objects.create_user(username='admin_rrhh', password='x', is_superuser=True, is_staff=True)
        self.client.force_authenticate(self.admin)
        self.emp = Empleado.objects.create(
            nombre='Rosa', apellido='Fermín', cedula='V-10000005',
            cargo='Secretaria', tipo_personal='administrativo',
            sueldo_base=Decimal('350.00'),
        )

    def test_desactivar_no_elimina_el_registro(self):
        resp = self.client.post(f'/api/rrhh/empleados/{self.emp.id}/desactivar/')
        self.assertEqual(resp.status_code, 200)
        self.emp.refresh_from_db()
        self.assertFalse(self.emp.activo)
        self.assertTrue(Empleado.objects.filter(pk=self.emp.id).exists())

    def test_desactivado_no_aparece_en_listado(self):
        self.emp.activo = False
        self.emp.save(update_fields=['activo'])
        resp = self.client.get('/api/rrhh/empleados/')
        ids = [e['id'] for e in resp.json()]
        self.assertNotIn(self.emp.id, ids)
