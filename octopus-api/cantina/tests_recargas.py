"""
Tests de Fase 3 de cantina: recargas de tarjeta, moneda dual y validación
de referencias cruzada con cobranza (§5.9/§8 FASE 3/§10 checklist de
cantina.md). Sigue el mismo estilo que tests_tarjetas.py /
tests_services_tarjeta.py (APIClient + perfil.rol/perfil.esta_activo).
"""
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from cobranza.models import BancoInstitucional, Pago, TasaCambio
from pagos_comunes.referencias import buscar_referencia_duplicada, normalizar_referencia
from secretaria.models import Alumno, Representante

from .models import MovimientoTarjeta, RecargaTarjeta, TarjetaPrepago

User = get_user_model()


class RecargaTarjetaTestsBase(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.admin_user = User.objects.create_user(username='admin_recargas', password='password123')
        self.admin_user.perfil.rol = 'administrador'
        self.admin_user.perfil.esta_activo = True
        self.admin_user.perfil.save()

        self.cajero_user = User.objects.create_user(username='cajero_recargas', password='password123')
        self.cajero_user.perfil.rol = 'cajero'
        self.cajero_user.perfil.esta_activo = True
        self.cajero_user.perfil.save()

        self.representante = Representante.objects.create(
            cedula='V-8888888', nombre='Marisol', apellido='Duarte',
            telefono='0412-8888888', correo='marisol@example.com', direccion='Av. Bolívar',
        )
        self.alumno = Alumno.objects.create(
            nombre='Diego', apellido='Duarte', representante=self.representante, grado_seccion='4to A',
        )
        self.tarjeta = TarjetaPrepago.objects.create(
            alumno=self.alumno, serial='L001-0001', codigo='CANT-RRRRRRRRRR',
            estado='activa', saldo=Decimal('0.00'), limite_credito=Decimal('5.00'),
        )
        self.otro_alumno = Alumno.objects.create(
            nombre='Valeria', apellido='Duarte', representante=self.representante, grado_seccion='2do B',
        )
        self.otra_tarjeta = TarjetaPrepago.objects.create(
            alumno=self.otro_alumno, serial='L001-0002', codigo='CANT-SSSSSSSSSS',
            estado='activa', saldo=Decimal('0.00'), limite_credito=Decimal('5.00'),
        )

        TasaCambio.objects.create(valor_bs=Decimal('40.0000'))


class RecargarTarjetaCajeroViewTests(RecargaTarjetaTestsBase):
    def test_recarga_efectivo_incrementa_saldo_y_crea_movimiento(self):
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/tarjetas/recargar/', {
            'tarjeta': self.tarjeta.id,
            'metodo_pago': 'efectivo',
            'monto_usd': '10.00',
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, Decimal('10.00'))

        recarga = RecargaTarjeta.objects.get(pk=resp.data['id'])
        self.assertEqual(recarga.estatus, 'aprobado')
        self.assertFalse(recarga.registrado_por_portal)
        self.assertEqual(recarga.cajero, self.cajero_user)
        self.assertEqual(recarga.revisado_por, self.cajero_user)
        self.assertIsNotNone(recarga.revisado_en)
        # monto_ves se calcula al crear a partir de monto_usd * tasa_aplicada.
        self.assertEqual(recarga.tasa_aplicada, Decimal('40.0000'))
        self.assertEqual(recarga.monto_ves, Decimal('400.00'))

        movimiento = MovimientoTarjeta.objects.get(recarga=recarga)
        self.assertEqual(movimiento.tipo, 'recarga')
        self.assertEqual(movimiento.saldo_antes, Decimal('0.00'))
        self.assertEqual(movimiento.saldo_despues, Decimal('10.00'))

    def test_sin_tasa_de_cambio_registrada_rechaza(self):
        TasaCambio.objects.all().delete()
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/tarjetas/recargar/', {
            'tarjeta': self.tarjeta.id,
            'metodo_pago': 'efectivo',
            'monto_usd': '10.00',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, Decimal('0.00'))

    def test_admin_tambien_puede_recargar(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.post('/api/cantina/tarjetas/recargar/', {
            'tarjeta': self.tarjeta.id,
            'metodo_pago': 'efectivo',
            'monto_usd': '5.00',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

    def test_usuario_no_autenticado_rechazado(self):
        resp = self.client.post('/api/cantina/tarjetas/recargar/', {
            'tarjeta': self.tarjeta.id,
            'metodo_pago': 'efectivo',
            'monto_usd': '5.00',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    # --- Formato de referencia por método (§5.9 punto 3) ---

    def test_punto_de_venta_exige_referencia_y_lote_de_4_digitos(self):
        self.client.force_authenticate(user=self.cajero_user)

        resp = self.client.post('/api/cantina/tarjetas/recargar/', {
            'tarjeta': self.tarjeta.id,
            'metodo_pago': 'punto_de_venta',
            'monto_usd': '10.00',
            'referencia': '123',
            'numero_lote': '4567',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

        resp = self.client.post('/api/cantina/tarjetas/recargar/', {
            'tarjeta': self.tarjeta.id,
            'metodo_pago': 'punto_de_venta',
            'monto_usd': '10.00',
            'referencia': '1234',
            'numero_lote': '56',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

        resp = self.client.post('/api/cantina/tarjetas/recargar/', {
            'tarjeta': self.tarjeta.id,
            'metodo_pago': 'punto_de_venta',
            'monto_usd': '10.00',
            'referencia': '1234',
            'numero_lote': '5678',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

    def test_pago_movil_y_transferencia_exigen_referencia_de_6_digitos(self):
        self.client.force_authenticate(user=self.cajero_user)

        # 5 dígitos: rechazado.
        resp = self.client.post('/api/cantina/tarjetas/recargar/', {
            'tarjeta': self.tarjeta.id,
            'metodo_pago': 'pago_movil',
            'monto_usd': '10.00',
            'referencia': '12345',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

        # 6 dígitos: aceptado.
        resp = self.client.post('/api/cantina/tarjetas/recargar/', {
            'tarjeta': self.tarjeta.id,
            'metodo_pago': 'pago_movil',
            'monto_usd': '10.00',
            'referencia': '123456',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

        # Transferencia con la misma regla, usando la otra tarjeta y otra referencia.
        resp = self.client.post('/api/cantina/tarjetas/recargar/', {
            'tarjeta': self.otra_tarjeta.id,
            'metodo_pago': 'transferencia',
            'monto_usd': '10.00',
            'referencia': '654321',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

    # --- Deduplicación de referencia (§5.9 / §10 checklist) ---

    def test_referencia_duplicada_dentro_de_cantina_es_rechazada(self):
        self.client.force_authenticate(user=self.cajero_user)

        resp = self.client.post('/api/cantina/tarjetas/recargar/', {
            'tarjeta': self.tarjeta.id,
            'metodo_pago': 'pago_movil',
            'monto_usd': '10.00',
            'referencia': '111111',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

        # Misma referencia, otra tarjeta -> rechazada.
        resp = self.client.post('/api/cantina/tarjetas/recargar/', {
            'tarjeta': self.otra_tarjeta.id,
            'metodo_pago': 'pago_movil',
            'monto_usd': '5.00',
            'referencia': '111111',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('referencia', resp.data)

        self.otra_tarjeta.refresh_from_db()
        self.assertEqual(self.otra_tarjeta.saldo, Decimal('0.00'))

    def test_referencia_duplicada_cruzada_cobranza_a_cantina(self):
        """Una referencia ya usada en cobranza.Pago no se puede reutilizar en cantina."""
        usuario_cobranza = User.objects.create_user(username='cajero_cobranza', password='password123')
        Pago.objects.create(
            alumno=self.alumno, usuario_receptor=usuario_cobranza, metodo_pago='pago_movil',
            monto_usd=Decimal('20.00'), tasa_aplicada=Decimal('40.00'),
            referencia='222222', estatus='completado',
        )

        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/tarjetas/recargar/', {
            'tarjeta': self.tarjeta.id,
            'metodo_pago': 'pago_movil',
            'monto_usd': '10.00',
            'referencia': '222222',
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('cobranza.Pago', str(resp.data))

        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, Decimal('0.00'))
        self.assertEqual(RecargaTarjeta.objects.filter(referencia='222222').count(), 0)

    def test_referencia_duplicada_cruzada_cantina_a_cobranza(self):
        """
        Caso inverso: una referencia ya usada en una RecargaTarjeta de
        cantina debe quedar bloqueada para cobranza. La validación viva del
        lado de cobranza es responsabilidad de `cobranza/serializers.py`
        (ya modificado aparte para llamar a `buscar_referencia_duplicada`);
        acá se verifica que la función compartida (única fuente de verdad
        para ambos módulos) efectivamente reporta el origen 'cantina' una
        vez que la recarga fue creada desde cantina.
        """
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/tarjetas/recargar/', {
            'tarjeta': self.tarjeta.id,
            'metodo_pago': 'pago_movil',
            'monto_usd': '10.00',
            'referencia': '333333',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

        duplicado = buscar_referencia_duplicada(normalizar_referencia('333333'))
        self.assertIsNotNone(duplicado)
        self.assertEqual(duplicado['origen'], 'cantina.RecargaTarjeta')


class RecargasPendientesFlowTests(RecargaTarjetaTestsBase):
    """
    Simula recargas que ya llegaron desde el portal (estatus='pendiente')
    y cubre el flujo de aprobar/rechazar del lado admin.
    """

    def _crear_recarga_pendiente(self, tarjeta, monto_usd=Decimal('15.00'), referencia='999001'):
        tasa = TasaCambio.objects.latest('fecha')
        return RecargaTarjeta.objects.create(
            tarjeta=tarjeta, metodo_pago='pago_movil',
            monto_usd=monto_usd, tasa_aplicada=tasa.valor_bs,
            monto_ves=(monto_usd * tasa.valor_bs).quantize(Decimal('0.01')),
            referencia=referencia, estatus='pendiente', registrado_por_portal=True,
        )

    def test_recargas_pendientes_lista_solo_las_pendientes(self):
        pendiente = self._crear_recarga_pendiente(self.tarjeta)
        aprobada = self._crear_recarga_pendiente(self.otra_tarjeta, referencia='999002')
        aprobada.estatus = 'aprobado'
        aprobada.save(update_fields=['estatus'])

        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get('/api/cantina/recargas/pendientes/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = [r['id'] for r in resp.data]
        self.assertIn(pendiente.id, ids)
        self.assertNotIn(aprobada.id, ids)

    def test_aprobar_recarga_pendiente_actualiza_saldo(self):
        recarga = self._crear_recarga_pendiente(self.tarjeta, monto_usd=Decimal('15.00'))

        self.client.force_authenticate(user=self.admin_user)
        # AprobarRecargaView dispara task_notificar_recarga_aprobada.delay(...)
        # (Fase 6 — §5.5/§5.6 de cantina.md) tras aprobar. Se mockea aquí para
        # no depender de un broker Celery/Redis real durante los tests, mismo
        # patrón que cobranza/tests.py usa para
        # notificaciones.tasks.task_notificar_pago_exitoso.delay.
        with patch('cantina.tasks.task_notificar_recarga_aprobada.delay'):
            resp = self.client.post(f'/api/cantina/recargas/{recarga.id}/aprobar/', format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)

        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, Decimal('15.00'))

        recarga.refresh_from_db()
        self.assertEqual(recarga.estatus, 'aprobado')
        self.assertEqual(recarga.revisado_por, self.admin_user)
        self.assertIsNotNone(recarga.revisado_en)

        movimiento = MovimientoTarjeta.objects.get(recarga=recarga)
        self.assertEqual(movimiento.saldo_despues, Decimal('15.00'))

    def test_rechazar_recarga_no_toca_saldo(self):
        recarga = self._crear_recarga_pendiente(self.tarjeta, monto_usd=Decimal('15.00'))

        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.post(f'/api/cantina/recargas/{recarga.id}/rechazar/', {'motivo': 'comprobante ilegible'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)

        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, Decimal('0.00'))

        recarga.refresh_from_db()
        self.assertEqual(recarga.estatus, 'rechazado')
        self.assertEqual(recarga.revisado_por, self.admin_user)
        self.assertFalse(MovimientoTarjeta.objects.filter(recarga=recarga).exists())

    def test_no_se_puede_aprobar_una_recarga_ya_revisada(self):
        recarga = self._crear_recarga_pendiente(self.tarjeta)
        recarga.estatus = 'rechazado'
        recarga.save(update_fields=['estatus'])

        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.post(f'/api/cantina/recargas/{recarga.id}/aprobar/', format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, Decimal('0.00'))

    def test_cajero_puede_aprobar_y_rechazar(self):
        # Decisión de negocio confirmada por el cliente: el cajero tiene el
        # mismo nivel de acceso que administrador/director en todo el
        # módulo cantina, incluida la aprobación/rechazo de recargas
        # pendientes del portal (antes exclusiva de EsAdminCantina).
        recarga = self._crear_recarga_pendiente(self.tarjeta)

        self.client.force_authenticate(user=self.cajero_user)
        with patch('cantina.tasks.task_notificar_recarga_aprobada.delay'):
            resp = self.client.post(f'/api/cantina/recargas/{recarga.id}/aprobar/', format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)

        otra_recarga = self._crear_recarga_pendiente(self.tarjeta)
        resp = self.client.post(f'/api/cantina/recargas/{otra_recarga.id}/rechazar/', format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)


class BancosCantinaYBuscarTarjetaTests(RecargaTarjetaTestsBase):
    def test_bancos_cantina_devuelve_solo_activos(self):
        BancoInstitucional.objects.create(nombre='Banco Activo', activo=True, tipos=['transferencia'])
        BancoInstitucional.objects.create(nombre='Banco Inactivo', activo=False, tipos=['transferencia'])

        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get('/api/cantina/bancos/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        nombres = [b['nombre'] for b in resp.data]
        self.assertIn('Banco Activo', nombres)
        self.assertNotIn('Banco Inactivo', nombres)

    def test_buscar_tarjeta_activa_por_codigo(self):
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get('/api/cantina/tarjetas/buscar/', {'codigo': self.tarjeta.codigo})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['serial'], self.tarjeta.serial)

    def test_buscar_tarjeta_no_activa_no_aparece(self):
        tarjeta_bloqueada = TarjetaPrepago.objects.create(
            serial='L001-0099', codigo='CANT-BLOQUEADA1', estado='bloqueada',
        )
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get('/api/cantina/tarjetas/buscar/', {'codigo': tarjeta_bloqueada.codigo})
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_tarjetas_list_view_filtra_por_estado_y_cajero_tiene_el_mismo_acceso(self):
        TarjetaPrepago.objects.create(serial='L001-0100', codigo='CANT-SINASIGNAR1', estado='sin_asignar')

        # Decisión de negocio confirmada por el cliente: el cajero tiene el
        # mismo nivel de acceso que administrador/director en todo el
        # módulo cantina — ya no se le restringe este listado.
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get('/api/cantina/tarjetas/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get('/api/cantina/tarjetas/', {'estado': 'sin_asignar'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for tarjeta in resp.data:
            self.assertEqual(tarjeta['estado'], 'sin_asignar')
