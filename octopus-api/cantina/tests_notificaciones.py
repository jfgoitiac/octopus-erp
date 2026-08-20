"""
Tests de Fase 6 de cantina: tareas Celery de notificación (§5.5/§10 de
cantina.md). Sigue el mismo estilo que tests_recargas.py (APIClient +
perfil.rol/perfil.esta_activo) y el patrón de mockear `.delay` en su
módulo de origen que ya usa cobranza/tests.py
(`with patch('notificaciones.tasks.task_notificar_pago_exitoso.delay')`).
"""
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from cobranza.models import TasaCambio
from secretaria.models import Alumno, Representante

from .models import ParametroCantina, RecargaTarjeta, TarjetaPrepago
from .tasks import task_notificar_recarga_aprobada, verificar_saldos_negativos_cantina

User = get_user_model()


class NotificacionesCantinaTestsBase(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.admin_user = User.objects.create_user(username='admin_notif', password='password123')
        self.admin_user.perfil.rol = 'administrador'
        self.admin_user.perfil.esta_activo = True
        self.admin_user.perfil.save()

        self.representante = Representante.objects.create(
            cedula='V-7777777', nombre='Karla', apellido='Solano',
            telefono='0412-7777777', correo='karla@example.com', direccion='Av. Libertador',
        )
        self.alumno = Alumno.objects.create(
            nombre='Mateo', apellido='Solano', representante=self.representante, grado_seccion='5to A',
        )
        self.tarjeta = TarjetaPrepago.objects.create(
            alumno=self.alumno, serial='L009-0001', codigo='CANT-TTTTTTTTTT',
            estado='activa', saldo=Decimal('0.00'), limite_credito=Decimal('5.00'),
        )
        TasaCambio.objects.create(valor_bs=Decimal('40.0000'))


class TaskNotificarRecargaAprobadaTests(NotificacionesCantinaTestsBase):
    def _crear_recarga_aprobada(self):
        tasa = TasaCambio.objects.latest('fecha')
        monto_usd = Decimal('15.00')
        return RecargaTarjeta.objects.create(
            tarjeta=self.tarjeta, metodo_pago='pago_movil',
            monto_usd=monto_usd, tasa_aplicada=tasa.valor_bs,
            monto_ves=(monto_usd * tasa.valor_bs).quantize(Decimal('0.01')),
            referencia='999010', estatus='aprobado', registrado_por_portal=True,
        )

    def test_llama_directamente_notifica_recarga_correcta(self):
        recarga = self._crear_recarga_aprobada()

        with patch('cantina.notificaciones_cantina.notificar_recarga_aprobada') as mock_notificar:
            task_notificar_recarga_aprobada(recarga.id)

        self.assertEqual(mock_notificar.call_count, 1)
        (llamada_recarga,), _kwargs = mock_notificar.call_args
        self.assertEqual(llamada_recarga.id, recarga.id)

    def test_error_en_notificacion_no_se_propaga(self):
        """Un fallo de envío nunca debe romper la tarea/vista que la dispara."""
        recarga = self._crear_recarga_aprobada()

        with patch(
            'cantina.notificaciones_cantina.notificar_recarga_aprobada',
            side_effect=Exception('SMTP caído'),
        ):
            # No debe lanzar excepción.
            task_notificar_recarga_aprobada(recarga.id)

    def test_recarga_inexistente_no_lanza_excepcion(self):
        with patch('cantina.notificaciones_cantina.notificar_recarga_aprobada') as mock_notificar:
            task_notificar_recarga_aprobada(999999)
        mock_notificar.assert_not_called()

    def test_aprobar_recarga_view_dispara_la_tarea(self):
        tasa = TasaCambio.objects.latest('fecha')
        monto_usd = Decimal('15.00')
        recarga = RecargaTarjeta.objects.create(
            tarjeta=self.tarjeta, metodo_pago='pago_movil',
            monto_usd=monto_usd, tasa_aplicada=tasa.valor_bs,
            monto_ves=(monto_usd * tasa.valor_bs).quantize(Decimal('0.01')),
            referencia='999011', estatus='pendiente', registrado_por_portal=True,
        )

        self.client.force_authenticate(user=self.admin_user)
        with patch('cantina.tasks.task_notificar_recarga_aprobada.delay') as mock_delay:
            resp = self.client.post(f'/api/cantina/recargas/{recarga.id}/aprobar/', format='json')

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        mock_delay.assert_called_once_with(recarga.id)


class VerificarSaldosNegativosCantinaTests(NotificacionesCantinaTestsBase):
    def _crear_tarjeta_negativa(self, serial, codigo, dias_atras, saldo=Decimal('-5.00')):
        alumno = Alumno.objects.create(
            nombre=f'Alumno{serial}', apellido='Solano', representante=self.representante, grado_seccion='6to A',
        )
        return TarjetaPrepago.objects.create(
            alumno=alumno, serial=serial, codigo=codigo, estado='activa',
            saldo=saldo, limite_credito=Decimal('5.00'),
            saldo_negativo_desde=date.today() - timedelta(days=dias_atras),
        )

    def test_notifica_solo_las_tarjetas_que_corresponden_hoy(self):
        ParametroCantina.objects.create(dias_alerta_saldo_negativo='1,3,7')

        # Debe notificarse: 3 días en negativo, 3 está en la config.
        tarjeta_debe_notificar = self._crear_tarjeta_negativa('L010-0001', 'CANT-UUUUUUUUUU', dias_atras=3)
        # No debe notificarse: 2 días en negativo, 2 no está en la config.
        tarjeta_no_debe_notificar = self._crear_tarjeta_negativa('L010-0002', 'CANT-VVVVVVVVVV', dias_atras=2)
        # Saldo positivo: debe ignorarse por completo (ni siquiera evaluarse).
        tarjeta_positiva = self._crear_tarjeta_negativa(
            'L010-0003', 'CANT-WWWWWWWWWW', dias_atras=3, saldo=Decimal('10.00'),
        )
        tarjeta_positiva.saldo_negativo_desde = None
        tarjeta_positiva.save(update_fields=['saldo_negativo_desde'])

        with patch('cantina.notificaciones_cantina.notificar_saldo_negativo') as mock_notificar:
            verificar_saldos_negativos_cantina()

        self.assertEqual(mock_notificar.call_count, 1)
        (tarjeta_llamada, dias_llamada), _kwargs = mock_notificar.call_args
        self.assertEqual(tarjeta_llamada.id, tarjeta_debe_notificar.id)
        self.assertEqual(dias_llamada, 3)

        ids_notificados = [call.args[0].id for call in mock_notificar.call_args_list]
        self.assertNotIn(tarjeta_no_debe_notificar.id, ids_notificados)
        self.assertNotIn(tarjeta_positiva.id, ids_notificados)

    def test_sin_parametro_cantina_usa_default(self):
        """Sin ParametroCantina configurado, cae al default '1,3,7'."""
        tarjeta = self._crear_tarjeta_negativa('L010-0004', 'CANT-XXXXXXXXXX', dias_atras=1)

        with patch('cantina.notificaciones_cantina.notificar_saldo_negativo') as mock_notificar:
            verificar_saldos_negativos_cantina()

        self.assertEqual(mock_notificar.call_count, 1)
        self.assertEqual(mock_notificar.call_args.args[0].id, tarjeta.id)

    def test_error_en_una_tarjeta_no_aborta_el_resto_del_batch(self):
        ParametroCantina.objects.create(dias_alerta_saldo_negativo='1,3,7')
        tarjeta_ok = self._crear_tarjeta_negativa('L010-0005', 'CANT-YYYYYYYYYY', dias_atras=1)
        tarjeta_ok_2 = self._crear_tarjeta_negativa('L010-0006', 'CANT-ZZZZZZZZZZ', dias_atras=3)

        llamadas = {'n': 0}

        def side_effect(tarjeta, dias_mora):
            llamadas['n'] += 1
            if tarjeta.id == tarjeta_ok.id:
                raise Exception('fallo simulado')

        with patch(
            'cantina.notificaciones_cantina.notificar_saldo_negativo', side_effect=side_effect,
        ) as mock_notificar:
            # No debe lanzar excepción aunque una tarjeta falle.
            verificar_saldos_negativos_cantina()

        # Ambas tarjetas debieron intentarse pese al error en la primera.
        self.assertEqual(mock_notificar.call_count, 2)
