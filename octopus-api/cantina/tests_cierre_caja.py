"""
Tests de Fase 5 de cantina: cierre de caja — CierreCajaCantinaView
(§5.7/§8 FASE 5/§10 checklist de cantina.md). Sigue el mismo estilo que
tests_ventas.py/tests_recargas.py (APIClient + perfil.rol/perfil.esta_activo).
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from cobranza.models import TasaCambio
from secretaria.models import Alumno, Representante

from .models import CategoriaProducto, CierreCajaCantina, ProductoCantina, RecargaTarjeta, TarjetaPrepago, VentaCantina

User = get_user_model()


class CierreCajaCantinaTestsBase(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.admin_user = User.objects.create_user(username='admin_cierre', password='password123')
        self.admin_user.perfil.rol = 'administrador'
        self.admin_user.perfil.esta_activo = True
        self.admin_user.perfil.save()

        self.cajero_user = User.objects.create_user(username='cajero_cierre', password='password123')
        self.cajero_user.perfil.rol = 'cajero'
        self.cajero_user.perfil.esta_activo = True
        self.cajero_user.perfil.save()

        self.otro_cajero = User.objects.create_user(username='otro_cajero_cierre', password='password123')
        self.otro_cajero.perfil.rol = 'cajero'
        self.otro_cajero.perfil.esta_activo = True
        self.otro_cajero.perfil.save()

        self.categoria = CategoriaProducto.objects.create(nombre='Snacks Cierre')
        self.producto = ProductoCantina.objects.create(
            nombre='Galleta', categoria=self.categoria, codigo_barras='7592222222221',
            precio=Decimal('2.00'), stock_actual=100, stock_minimo=2,
        )

        self.representante = Representante.objects.create(
            cedula='V-9999999', nombre='Carla', apellido='Ríos',
            telefono='0412-9999999', correo='carla@example.com', direccion='Calle 9',
        )
        self.alumno = Alumno.objects.create(
            nombre='Luis', apellido='Ríos', representante=self.representante, grado_seccion='3ro A',
        )
        self.tarjeta = TarjetaPrepago.objects.create(
            alumno=self.alumno, serial='L001-0009', codigo='CANT-CIERRECAJA1',
            estado='activa', saldo=Decimal('50.00'), limite_credito=Decimal('5.00'),
        )

        self.tasa = TasaCambio.objects.create(valor_bs=Decimal('40.0000'))
        self.hoy = timezone.localdate()
        self.ayer = self.hoy - timezone.timedelta(days=1)

    def _crear_venta(self, cajero, metodo_pago, total_usd, estado='completada', fecha=None, tarjeta=None):
        venta = VentaCantina.objects.create(
            alumno=self.alumno if tarjeta else None,
            tarjeta=tarjeta,
            cajero=cajero,
            metodo_pago=metodo_pago,
            total_usd=total_usd,
            tasa_aplicada=self.tasa.valor_bs,
            total_ves=(total_usd * self.tasa.valor_bs).quantize(Decimal('0.01')),
            estado=estado,
        )
        if fecha is not None:
            # creado_en es auto_now_add=True: no se puede setear en .create(),
            # se sobreescribe después con .update() para simular ventas de
            # otro día en los tests.
            VentaCantina.objects.filter(pk=venta.pk).update(
                creado_en=timezone.make_aware(timezone.datetime.combine(fecha, timezone.datetime.min.time())),
            )
            venta.refresh_from_db()
        return venta

    def _crear_recarga(self, cajero, monto_usd, estatus='aprobado', registrado_por_portal=False, fecha=None):
        recarga = RecargaTarjeta.objects.create(
            tarjeta=self.tarjeta,
            metodo_pago='efectivo',
            monto_usd=monto_usd,
            tasa_aplicada=self.tasa.valor_bs,
            monto_ves=(monto_usd * self.tasa.valor_bs).quantize(Decimal('0.01')),
            estatus=estatus,
            registrado_por_portal=registrado_por_portal,
            cajero=cajero,
        )
        if fecha is not None:
            RecargaTarjeta.objects.filter(pk=recarga.pk).update(
                creado_en=timezone.make_aware(timezone.datetime.combine(fecha, timezone.datetime.min.time())),
            )
            recarga.refresh_from_db()
        return recarga


class CierreCajaCantinaGetTests(CierreCajaCantinaTestsBase):
    def test_sin_cierre_previo_calcula_totales_del_dia_correctamente(self):
        # Ventas del cajero HOY: una en efectivo, una con tarjeta, una en efectivo_ves.
        self._crear_venta(self.cajero_user, 'efectivo', Decimal('10.00'))
        self._crear_venta(self.cajero_user, 'tarjeta_prepago', Decimal('5.00'), tarjeta=self.tarjeta)
        self._crear_venta(self.cajero_user, 'efectivo_ves', Decimal('3.00'))
        # Venta anulada del cajero HOY: debe excluirse.
        self._crear_venta(self.cajero_user, 'efectivo', Decimal('100.00'), estado='anulada')
        # Venta del cajero pero de AYER: debe excluirse.
        self._crear_venta(self.cajero_user, 'efectivo', Decimal('7.00'), fecha=self.ayer)
        # Venta de OTRO cajero HOY: debe excluirse.
        self._crear_venta(self.otro_cajero, 'efectivo', Decimal('200.00'))

        # Recargas del cajero HOY: una aprobada propia (cuenta), una pendiente
        # (no cuenta), una aprobada pero registrada por el portal (no cuenta,
        # cajero=None en la práctica pero probamos igual con el flag).
        self._crear_recarga(self.cajero_user, Decimal('20.00'), estatus='aprobado')
        self._crear_recarga(self.cajero_user, Decimal('999.00'), estatus='pendiente')
        self._crear_recarga(self.cajero_user, Decimal('999.00'), estatus='aprobado', registrado_por_portal=True)
        # Recarga aprobada propia pero de AYER: no cuenta.
        self._crear_recarga(self.cajero_user, Decimal('999.00'), estatus='aprobado', fecha=self.ayer)
        # Recarga aprobada de OTRO cajero HOY: no cuenta.
        self._crear_recarga(self.otro_cajero, Decimal('999.00'), estatus='aprobado')

        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get('/api/cantina/cierre-caja/')

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertFalse(resp.data['ya_cerrado'])
        self.assertEqual(Decimal(resp.data['total_ventas']), Decimal('18.00'))  # 10 + 5 + 3
        self.assertEqual(Decimal(resp.data['total_tarjeta']), Decimal('5.00'))
        self.assertEqual(Decimal(resp.data['total_efectivo']), Decimal('13.00'))  # 10 + 3
        self.assertEqual(Decimal(resp.data['total_recargas_efectivo']), Decimal('20.00'))

    def test_sin_movimientos_devuelve_ceros_no_none(self):
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get('/api/cantina/cierre-caja/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data['ya_cerrado'])
        for campo in ('total_ventas', 'total_tarjeta', 'total_efectivo', 'total_recargas_efectivo'):
            self.assertEqual(Decimal(resp.data[campo]), Decimal('0.00'))

    def test_no_autenticado_rechazado(self):
        resp = self.client.get('/api/cantina/cierre-caja/')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_ya_cerrado_devuelve_registro_existente(self):
        CierreCajaCantina.objects.create(
            cajero=self.cajero_user, fecha=self.hoy,
            total_ventas=Decimal('10.00'), total_tarjeta=Decimal('0.00'),
            total_efectivo=Decimal('10.00'), total_recargas_efectivo=Decimal('0.00'),
            conteo_fisico=Decimal('10.00'), diferencia=Decimal('0.00'),
        )
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get('/api/cantina/cierre-caja/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data['ya_cerrado'])
        self.assertEqual(Decimal(resp.data['total_ventas']), Decimal('10.00'))

    def test_cajero_no_ve_totales_de_otro_cajero(self):
        self._crear_venta(self.otro_cajero, 'efectivo', Decimal('500.00'))
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get('/api/cantina/cierre-caja/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(resp.data['total_ventas']), Decimal('0.00'))


class CierreCajaCantinaPostTests(CierreCajaCantinaTestsBase):
    def test_post_crea_cierre_con_diferencia_correcta(self):
        self._crear_venta(self.cajero_user, 'efectivo', Decimal('10.00'))
        self._crear_venta(self.cajero_user, 'tarjeta_prepago', Decimal('5.00'), tarjeta=self.tarjeta)
        self._crear_recarga(self.cajero_user, Decimal('20.00'), estatus='aprobado')

        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/cierre-caja/', {
            'conteo_fisico': '30.00',
            'observaciones': 'Cuadró todo',
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(Decimal(resp.data['total_ventas']), Decimal('15.00'))
        self.assertEqual(Decimal(resp.data['total_tarjeta']), Decimal('5.00'))
        self.assertEqual(Decimal(resp.data['total_efectivo']), Decimal('10.00'))
        self.assertEqual(Decimal(resp.data['total_recargas_efectivo']), Decimal('20.00'))
        self.assertEqual(Decimal(resp.data['conteo_fisico']), Decimal('30.00'))
        # efectivo_esperado = 10.00 (efectivo) + 20.00 (recargas efectivo) = 30.00
        # diferencia = conteo_fisico(30.00) - efectivo_esperado(30.00) = 0.00
        self.assertEqual(Decimal(resp.data['diferencia']), Decimal('0.00'))
        self.assertEqual(resp.data['observaciones'], 'Cuadró todo')
        self.assertEqual(resp.data['cajero_username'], self.cajero_user.username)

        cierre = CierreCajaCantina.objects.get(cajero=self.cajero_user, fecha=self.hoy)
        self.assertEqual(cierre.diferencia, Decimal('0.00'))

    def test_post_con_faltante_calcula_diferencia_negativa(self):
        self._crear_venta(self.cajero_user, 'efectivo', Decimal('10.00'))

        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/cierre-caja/', {
            'conteo_fisico': '7.00',
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        # efectivo_esperado = 10.00, conteo_fisico = 7.00 -> diferencia = -3.00
        self.assertEqual(Decimal(resp.data['diferencia']), Decimal('-3.00'))

    def test_post_no_recalcula_confiando_en_el_cliente(self):
        """Aunque el cliente mande totales falsos, el backend los ignora y recalcula."""
        self._crear_venta(self.cajero_user, 'efectivo', Decimal('10.00'))

        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/cierre-caja/', {
            'conteo_fisico': '10.00',
            'total_ventas': '99999.00',
            'total_efectivo': '99999.00',
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(Decimal(resp.data['total_ventas']), Decimal('10.00'))
        self.assertEqual(Decimal(resp.data['total_efectivo']), Decimal('10.00'))

    def test_post_duplicado_mismo_dia_devuelve_400_legible(self):
        self.client.force_authenticate(user=self.cajero_user)
        resp1 = self.client.post('/api/cantina/cierre-caja/', {'conteo_fisico': '0.00'}, format='json')
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED, resp1.data)

        resp2 = self.client.post('/api/cantina/cierre-caja/', {'conteo_fisico': '0.00'}, format='json')
        self.assertEqual(resp2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', resp2.data)

        self.assertEqual(CierreCajaCantina.objects.filter(cajero=self.cajero_user, fecha=self.hoy).count(), 1)

    def test_post_sin_conteo_fisico_es_rechazado(self):
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/cierre-caja/', {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', resp.data)

    def test_cajero_no_puede_cerrar_con_totales_de_otro_cajero(self):
        self._crear_venta(self.otro_cajero, 'efectivo', Decimal('500.00'))

        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/cierre-caja/', {'conteo_fisico': '0.00'}, format='json')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(Decimal(resp.data['total_ventas']), Decimal('0.00'))

        cierre = CierreCajaCantina.objects.get(cajero=self.cajero_user, fecha=self.hoy)
        self.assertEqual(cierre.total_ventas, Decimal('0.00'))
        # El cierre del otro cajero para hoy no existe (no se creó por error cruzado).
        self.assertFalse(CierreCajaCantina.objects.filter(cajero=self.otro_cajero, fecha=self.hoy).exists())

    def test_no_autenticado_rechazado(self):
        resp = self.client.post('/api/cantina/cierre-caja/', {'conteo_fisico': '0.00'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_tambien_puede_cerrar_caja(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.post('/api/cantina/cierre-caja/', {'conteo_fisico': '0.00'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
