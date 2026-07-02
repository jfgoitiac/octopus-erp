from datetime import date
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from cobranza.models import Pago
from secretaria.models import Alumno, Representante

from .models import Sede

User = get_user_model()


class DashboardSedeNPlusOneTest(TestCase):
    """
    DashboardSedeView.ultimos_pagos accedía a `p.alumno.nombre` sin
    select_related('alumno') en el queryset base (_get_pagos_de_sede),
    disparando una query extra por cada uno de los 5 últimos pagos.
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='directivo1', password='clave123456')
        self.user.perfil.rol = 'directivo_red'
        self.user.perfil.save(update_fields=['rol'])
        token = str(RefreshToken.for_user(self.user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

        self.sede = Sede.objects.create(nombre='Sede Central')
        self.sede2 = Sede.objects.create(nombre='Sede Norte')  # fuerza total_sedes > 1

        self.representante = Representante.objects.create(
            cedula='V99999999', nombre='Carla', apellido='Diaz', correo='carla@example.com',
        )

        for i in range(5):
            alumno = Alumno.objects.create(
                nombre=f'Alumno{i}', apellido='Diaz', cedula_escolar=f'E9900000{i}',
                fecha_nacimiento=date(2015, 3, 10), representante=self.representante,
                sede=self.sede,
            )
            Pago.objects.create(
                alumno=alumno, usuario_receptor=self.user, metodo_pago='efectivo',
                monto_usd=Decimal('10.00'), tasa_aplicada=Decimal('40.00'),
                estatus='completado', sede=self.sede,
            )

    def test_ultimos_pagos_incluye_nombre_del_alumno(self):
        resp = self.client.get(f'/api/multisede/dashboard/{self.sede.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['ultimos_pagos']), 5)
        for pago in resp.data['ultimos_pagos']:
            self.assertTrue(pago['alumno'].startswith('Alumno'))

    def test_query_count_no_escala_con_cantidad_de_pagos(self):
        """El nº de queries para armar ultimos_pagos no debe crecer con el
        número de pagos devueltos (antes: 1 query extra por pago por acceder
        a p.alumno sin select_related)."""
        with CaptureQueriesContext(connection) as ctx_cinco:
            resp = self.client.get(f'/api/multisede/dashboard/{self.sede.id}/')
        self.assertEqual(resp.status_code, 200)

        # Deja solo 1 pago y compara: el conteo de queries debe ser el mismo.
        Pago.objects.exclude(pk=Pago.objects.first().pk).delete()
        Alumno.objects.exclude(pk=Alumno.objects.first().pk).delete()
        with CaptureQueriesContext(connection) as ctx_uno:
            resp = self.client.get(f'/api/multisede/dashboard/{self.sede.id}/')
        self.assertEqual(resp.status_code, 200)

        self.assertEqual(len(ctx_cinco.captured_queries), len(ctx_uno.captured_queries))


class DashboardConsolidadoNPlusOneTest(TestCase):
    """
    Dos problemas apilados en el mismo endpoint:
    1) DashboardConsolidadoView recalculaba en un loop aparte (alumnos_activos,
       deuda, pagos del mes, morosos) las mismas 4 métricas por sede que
       SedeResumenSerializer ya computa (8 queries por sede en vez de 4).
    2) SedeResumenSerializer._total_sedes() usaba
       `self.context.get('total_sedes', Sede.objects...count())` — el default
       de dict.get() se evalúa siempre en Python, así que disparaba esa query
       en cada una de las 4 llamadas por sede (4 queries extra por sede),
       ignorando el valor ya pasado por contexto.
    Con ambos arreglados: 4 queries por sede (antes: 12).
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='directivo2', password='clave123456')
        self.user.perfil.rol = 'directivo_red'
        self.user.perfil.save(update_fields=['rol'])
        token = str(RefreshToken.for_user(self.user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        self.representante = Representante.objects.create(
            cedula='V88888888', nombre='Jose', apellido='Ruiz', correo='jose@example.com',
        )

    def _crear_sede_con_datos(self, nombre, moroso=False):
        from cobranza.models import Mensualidad
        sede = Sede.objects.create(nombre=nombre)
        alumno = Alumno.objects.create(
            nombre='Alumno', apellido=nombre, cedula_escolar=f'E{nombre}',
            fecha_nacimiento=date(2015, 3, 10), representante=self.representante,
            sede=sede, estatus_financiero='mora' if moroso else 'solvente',
        )
        # mock: evita que el signal post_save intente agendar notificaciones
        # vía Celery contra un broker Redis que no existe en tests (sin esto,
        # el test tarda varios minutos por los reintentos de conexión).
        with mock.patch('portal.tasks.programar_notificaciones_mensualidad'):
            Mensualidad.objects.create(alumno=alumno, mes=1, anio=2020, monto_usd=Decimal('35.00'))
        Pago.objects.create(
            alumno=alumno, usuario_receptor=self.user, metodo_pago='efectivo',
            monto_usd=Decimal('20.00'), tasa_aplicada=Decimal('40.00'),
            estatus='completado', sede=sede,
        )
        return sede

    def test_totales_correctos_con_varias_sedes(self):
        self._crear_sede_con_datos('SedeA', moroso=True)
        self._crear_sede_con_datos('SedeB', moroso=False)

        resp = self.client.get('/api/multisede/dashboard/')
        self.assertEqual(resp.status_code, 200)
        totales = resp.data['totales']
        self.assertEqual(totales['alumnos_activos'], 2)
        self.assertEqual(totales['morosos'], 1)
        self.assertEqual(totales['deuda_total_usd'], 70.0)  # 35 x 2 sedes
        self.assertEqual(totales['pagos_mes_actual'], 40.0)  # 20 x 2 sedes (Pago es de hoy)

    def test_costo_por_sede_no_se_duplica(self):
        """Antes: 8 queries extra por cada sede agregada (4 del loop + 4 del
        serializer). Ahora: solo las 4 del serializer."""
        self._crear_sede_con_datos('SedeUno')
        with CaptureQueriesContext(connection) as ctx_una_sede:
            resp = self.client.get('/api/multisede/dashboard/')
        self.assertEqual(resp.status_code, 200)

        self._crear_sede_con_datos('SedeDos')
        with CaptureQueriesContext(connection) as ctx_dos_sedes:
            resp = self.client.get('/api/multisede/dashboard/')
        self.assertEqual(resp.status_code, 200)

        delta = len(ctx_dos_sedes.captured_queries) - len(ctx_una_sede.captured_queries)
        self.assertEqual(delta, 4)
