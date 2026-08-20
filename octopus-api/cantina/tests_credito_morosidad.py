from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from secretaria.models import Alumno, Representante

from .models import ParametroCantina, TarjetaPrepago

User = get_user_model()


class ParametroCantinaViewTests(TestCase):
    """
    Cubre `ParametroCantinaView` (§ Parámetros/ajuste de crédito/morosidad):
    GET crea el singleton si no existe, PUT actualiza parcialmente y valida
    `dias_alerta_saldo_negativo`.
    """

    def setUp(self):
        self.client = APIClient()

        self.admin_user = User.objects.create_user(username='admin_credito', password='password123')
        self.admin_user.perfil.rol = 'administrador'
        self.admin_user.perfil.esta_activo = True
        self.admin_user.perfil.save()

        self.cajero_user = User.objects.create_user(username='cajero_credito', password='password123')
        self.cajero_user.perfil.rol = 'cajero'
        self.cajero_user.perfil.esta_activo = True
        self.cajero_user.perfil.save()

    def test_get_crea_singleton_si_no_existe(self):
        self.assertEqual(ParametroCantina.objects.count(), 0)
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get('/api/cantina/parametros/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(ParametroCantina.objects.count(), 1)
        self.assertEqual(resp.data['dias_alerta_saldo_negativo'], '1,3,7')

    def test_cajero_tiene_el_mismo_acceso_que_admin(self):
        # Decisión de negocio: el cajero NO se restringe en este módulo.
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get('/api/cantina/parametros/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_put_actualiza_parcialmente(self):
        ParametroCantina.objects.create(
            limite_credito_default=Decimal('5.00'), dias_alerta_saldo_negativo='1,3,7',
        )
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.put(
            '/api/cantina/parametros/', {'limite_credito_default': '10.00'}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(Decimal(resp.data['limite_credito_default']), Decimal('10.00'))
        # El otro campo no se tocó (PUT parcial sobre el singleton).
        self.assertEqual(resp.data['dias_alerta_saldo_negativo'], '1,3,7')

    def test_put_normaliza_dias_alerta_con_espacios(self):
        ParametroCantina.objects.create()
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.put(
            '/api/cantina/parametros/', {'dias_alerta_saldo_negativo': '1, 3,7 '}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data['dias_alerta_saldo_negativo'], '1,3,7')

    def test_put_dias_alerta_invalido_rechazado(self):
        ParametroCantina.objects.create()
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.put(
            '/api/cantina/parametros/', {'dias_alerta_saldo_negativo': '1,abc,7'}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_put_dias_alerta_vacio_rechazado(self):
        ParametroCantina.objects.create()
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.put(
            '/api/cantina/parametros/', {'dias_alerta_saldo_negativo': ',, ,'}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_put_dias_alerta_negativo_rechazado(self):
        ParametroCantina.objects.create()
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.put(
            '/api/cantina/parametros/', {'dias_alerta_saldo_negativo': '1,-3,7'}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_put_limite_credito_default_negativo_rechazado(self):
        ParametroCantina.objects.create()
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.put(
            '/api/cantina/parametros/', {'limite_credito_default': '-1.00'}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class AjustarCreditoTarjetaViewTests(TestCase):
    """Cubre `AjustarCreditoTarjetaView` (PATCH .../credito/)."""

    def setUp(self):
        self.client = APIClient()

        self.admin_user = User.objects.create_user(username='admin_ajuste', password='password123')
        self.admin_user.perfil.rol = 'administrador'
        self.admin_user.perfil.esta_activo = True
        self.admin_user.perfil.save()

        self.cajero_user = User.objects.create_user(username='cajero_ajuste', password='password123')
        self.cajero_user.perfil.rol = 'cajero'
        self.cajero_user.perfil.esta_activo = True
        self.cajero_user.perfil.save()

        self.representante = Representante.objects.create(
            cedula='V-8888888', nombre='Pedro', apellido='Díaz',
            telefono='0412-8888888', correo='pedro@example.com', direccion='Calle 8',
        )
        self.alumno = Alumno.objects.create(
            nombre='Ana', apellido='Díaz', representante=self.representante, grado_seccion='2do A',
        )
        self.tarjeta = TarjetaPrepago.objects.create(
            alumno=self.alumno, serial='L001-0100', codigo='CANT-AJUSTE0001',
            estado='activa', limite_credito=Decimal('5.00'),
        )

    def test_ajustar_credito_valido_aceptado(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.patch(
            f'/api/cantina/tarjetas/{self.tarjeta.id}/credito/', {'limite_credito': '15.00'}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.limite_credito, Decimal('15.00'))
        self.assertEqual(Decimal(resp.data['limite_credito']), Decimal('15.00'))

    def test_ajustar_credito_cajero_tiene_mismo_acceso(self):
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.patch(
            f'/api/cantina/tarjetas/{self.tarjeta.id}/credito/', {'limite_credito': '20.00'}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)

    def test_ajustar_credito_negativo_rechazado(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.patch(
            f'/api/cantina/tarjetas/{self.tarjeta.id}/credito/', {'limite_credito': '-5.00'}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.limite_credito, Decimal('5.00'))

    def test_ajustar_credito_tarjeta_inexistente_404(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.patch(
            '/api/cantina/tarjetas/999999/credito/', {'limite_credito': '10.00'}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class ReporteMorosidadViewTests(TestCase):
    """Cubre `ReporteMorosidadView` (GET /reportes/morosos/)."""

    def setUp(self):
        self.client = APIClient()

        self.admin_user = User.objects.create_user(username='admin_morosos', password='password123')
        self.admin_user.perfil.rol = 'administrador'
        self.admin_user.perfil.esta_activo = True
        self.admin_user.perfil.save()

        self.cajero_user = User.objects.create_user(username='cajero_morosos', password='password123')
        self.cajero_user.perfil.rol = 'cajero'
        self.cajero_user.perfil.esta_activo = True
        self.cajero_user.perfil.save()

        self.representante = Representante.objects.create(
            cedula='V-7777777', nombre='Luisa', apellido='Pérez',
            telefono='0416-7777777', correo='luisa@example.com', direccion='Calle 9',
        )
        self.alumno_moroso = Alumno.objects.create(
            nombre='Carlos', apellido='Pérez', representante=self.representante, grado_seccion='1ro A',
        )
        self.alumno_solvente = Alumno.objects.create(
            nombre='Diana', apellido='Pérez', representante=self.representante, grado_seccion='4to B',
        )

        # Tarjeta en negativo hace 10 días.
        self.tarjeta_morosa = TarjetaPrepago.objects.create(
            alumno=self.alumno_moroso, serial='L001-0200', codigo='CANT-MOROSO0001',
            estado='activa', saldo=Decimal('-8.00'), limite_credito=Decimal('10.00'),
            saldo_negativo_desde=date.today() - timedelta(days=10),
        )
        # Tarjeta en negativo hace 2 días.
        self.tarjeta_morosa_reciente = TarjetaPrepago.objects.create(
            alumno=self.alumno_solvente, serial='L001-0201', codigo='CANT-MOROSO0002',
            estado='activa', saldo=Decimal('-1.50'), limite_credito=Decimal('5.00'),
            saldo_negativo_desde=date.today() - timedelta(days=2),
        )
        # Tarjeta solvente — no debe aparecer en el reporte.
        self.tarjeta_solvente = TarjetaPrepago.objects.create(
            serial='L001-0202', codigo='CANT-SOLVENTE01',
            estado='activa', saldo=Decimal('5.00'), limite_credito=Decimal('5.00'),
        )

    def test_solo_devuelve_tarjetas_en_negativo(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get('/api/cantina/reportes/morosos/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['count'], 2)
        ids = {fila['tarjeta_id'] for fila in resp.data['resultados']}
        self.assertEqual(ids, {self.tarjeta_morosa.id, self.tarjeta_morosa_reciente.id})
        self.assertNotIn(self.tarjeta_solvente.id, ids)

    def test_dias_en_negativo_correcto_y_orden_descendente(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get('/api/cantina/reportes/morosos/')
        resultados = resp.data['resultados']
        # La más morosa (10 días) debe ir primero.
        self.assertEqual(resultados[0]['tarjeta_id'], self.tarjeta_morosa.id)
        self.assertEqual(resultados[0]['dias_en_negativo'], 10)
        self.assertEqual(resultados[1]['tarjeta_id'], self.tarjeta_morosa_reciente.id)
        self.assertEqual(resultados[1]['dias_en_negativo'], 2)

    def test_incluye_datos_de_alumno_y_representante(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get('/api/cantina/reportes/morosos/')
        fila = next(f for f in resp.data['resultados'] if f['tarjeta_id'] == self.tarjeta_morosa.id)
        self.assertEqual(fila['alumno_nombre'], 'Carlos Pérez')
        self.assertEqual(fila['grado_seccion'], '1ro A')
        self.assertEqual(fila['representante_nombre'], 'Luisa Pérez')
        self.assertEqual(fila['representante_telefono'], '0416-7777777')
        self.assertEqual(fila['representante_correo'], 'luisa@example.com')

    def test_filtro_dias_min(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get('/api/cantina/reportes/morosos/', {'dias_min': 5})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['count'], 1)
        self.assertEqual(resp.data['resultados'][0]['tarjeta_id'], self.tarjeta_morosa.id)

    def test_cajero_tiene_el_mismo_acceso_que_admin(self):
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get('/api/cantina/reportes/morosos/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
