"""
Tests de Fase 5 de cantina: cierre de caja — CierreCajaCantinaView
(§5.7/§8 FASE 5/§10 checklist de cantina.md). Sigue el mismo estilo que
tests_ventas.py/tests_recargas.py (APIClient + perfil.rol/perfil.esta_activo).

Reescrito para el cierre de caja POR APERTURA (§ apertura por cajero): ya
no se calcula "el día del cajero" sino "la apertura de caja abierta del
cajero" — cada cajero puede tener su propia sesión de caja concurrente con
hasta otros 2 cajeros, y cerrar la suya no debe tocar ni ver las de los
demás.
"""
import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from cobranza.models import TasaCambio
from secretaria.models import Alumno, Representante

from .models import AbonoCantina, AperturaCajaCantina, CategoriaProducto,CierreCajaCantina, ProductoCantina, RecargaTarjeta, TarjetaPrepago, VentaCantina

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

        # Cada cajero abre su propia caja — mismo criterio que
        # tests_ventas.py: el cierre ahora opera sobre la apertura activa,
        # no sobre "el día".
        self.apertura = AperturaCajaCantina.objects.create(cajero=self.cajero_user, monto_inicial=Decimal('0.00'))
        self.apertura_otro = AperturaCajaCantina.objects.create(cajero=self.otro_cajero, monto_inicial=Decimal('0.00'))

    def _crear_venta(self, cajero, metodo_pago, total_usd, estado='completada', apertura=None, tarjeta=None):
        venta = VentaCantina.objects.create(
            alumno=self.alumno if tarjeta else None,
            tarjeta=tarjeta,
            apertura=apertura,
            cajero=cajero,
            metodo_pago=metodo_pago,
            total_usd=total_usd,
            tasa_aplicada=self.tasa.valor_bs,
            total_ves=(total_usd * self.tasa.valor_bs).quantize(Decimal('0.01')),
            estado=estado,
        )
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
    def test_sin_cierre_previo_calcula_totales_de_la_apertura_correctamente(self):
        # Ventas del cajero bajo SU apertura: una en efectivo, una con tarjeta, una en efectivo_ves.
        self._crear_venta(self.cajero_user, 'efectivo', Decimal('10.00'), apertura=self.apertura)
        self._crear_venta(self.cajero_user, 'tarjeta_prepago', Decimal('5.00'), apertura=self.apertura, tarjeta=self.tarjeta)
        self._crear_venta(self.cajero_user, 'efectivo_ves', Decimal('3.00'), apertura=self.apertura)
        # Venta anulada del cajero bajo su apertura: debe excluirse.
        self._crear_venta(self.cajero_user, 'efectivo', Decimal('100.00'), apertura=self.apertura, estado='anulada')
        # Venta del cajero pero SIN apertura (dato legado): debe excluirse.
        self._crear_venta(self.cajero_user, 'efectivo', Decimal('7.00'), apertura=None)
        # Venta de OTRO cajero (otra apertura): debe excluirse.
        self._crear_venta(self.otro_cajero, 'efectivo', Decimal('200.00'), apertura=self.apertura_otro)

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
        self.assertEqual(resp.data['apertura_id'], self.apertura.id)
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

    def test_sin_apertura_abierta_devuelve_400_legible(self):
        self.apertura.estado = 'cerrada'
        self.apertura.save(update_fields=['estado'])

        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get('/api/cantina/cierre-caja/')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', resp.data)

    def test_ya_cerrado_devuelve_registro_existente(self):
        CierreCajaCantina.objects.create(
            cajero=self.cajero_user, apertura=self.apertura, fecha=self.hoy,
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
        self._crear_venta(self.otro_cajero, 'efectivo', Decimal('500.00'), apertura=self.apertura_otro)
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get('/api/cantina/cierre-caja/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(resp.data['total_ventas']), Decimal('0.00'))


class CierreCajaCantinaPostTests(CierreCajaCantinaTestsBase):
    def test_post_crea_cierre_con_diferencia_correcta(self):
        self._crear_venta(self.cajero_user, 'efectivo', Decimal('10.00'), apertura=self.apertura)
        self._crear_venta(self.cajero_user, 'tarjeta_prepago', Decimal('5.00'), apertura=self.apertura, tarjeta=self.tarjeta)
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
        # efectivo_esperado = monto_inicial(0.00) + 10.00 (efectivo) + 20.00 (recargas efectivo) = 30.00
        # diferencia = conteo_fisico(30.00) - efectivo_esperado(30.00) = 0.00
        self.assertEqual(Decimal(resp.data['diferencia']), Decimal('0.00'))
        self.assertEqual(resp.data['observaciones'], 'Cuadró todo')
        self.assertEqual(resp.data['cajero_username'], self.cajero_user.username)
        # Datos del reporte de cierre en pantalla/impresión.
        self.assertEqual(Decimal(resp.data['efectivo_esperado']), Decimal('30.00'))
        self.assertIsNotNone(resp.data['fecha_hora_apertura'])

        cierre = CierreCajaCantina.objects.get(cajero=self.cajero_user, apertura=self.apertura)
        self.assertEqual(cierre.diferencia, Decimal('0.00'))

        self.apertura.refresh_from_db()
        self.assertEqual(self.apertura.estado, 'cerrada')
        self.assertIsNotNone(self.apertura.cerrada_en)

    def test_post_incluye_el_monto_inicial_en_el_efectivo_esperado(self):
        self.apertura.monto_inicial = Decimal('15.00')
        self.apertura.save(update_fields=['monto_inicial'])
        self._crear_venta(self.cajero_user, 'efectivo', Decimal('10.00'), apertura=self.apertura)

        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/cierre-caja/', {'conteo_fisico': '25.00'}, format='json')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        # efectivo_esperado = 15.00 (monto_inicial) + 10.00 (efectivo) = 25.00 -> diferencia 0.00
        self.assertEqual(Decimal(resp.data['diferencia']), Decimal('0.00'))

    def test_post_con_faltante_calcula_diferencia_negativa(self):
        self._crear_venta(self.cajero_user, 'efectivo', Decimal('10.00'), apertura=self.apertura)

        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/cierre-caja/', {
            'conteo_fisico': '7.00',
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        # efectivo_esperado = 10.00, conteo_fisico = 7.00 -> diferencia = -3.00
        self.assertEqual(Decimal(resp.data['diferencia']), Decimal('-3.00'))

    def test_post_no_recalcula_confiando_en_el_cliente(self):
        """Aunque el cliente mande totales falsos, el backend los ignora y recalcula."""
        self._crear_venta(self.cajero_user, 'efectivo', Decimal('10.00'), apertura=self.apertura)

        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/cierre-caja/', {
            'conteo_fisico': '10.00',
            'total_ventas': '99999.00',
            'total_efectivo': '99999.00',
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(Decimal(resp.data['total_ventas']), Decimal('10.00'))
        self.assertEqual(Decimal(resp.data['total_efectivo']), Decimal('10.00'))

    def test_post_duplicado_sobre_la_misma_apertura_devuelve_400_legible(self):
        self.client.force_authenticate(user=self.cajero_user)
        resp1 = self.client.post('/api/cantina/cierre-caja/', {'conteo_fisico': '0.00'}, format='json')
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED, resp1.data)

        # La apertura ya quedó cerrada -> ya no hay nada que cerrar.
        resp2 = self.client.post('/api/cantina/cierre-caja/', {'conteo_fisico': '0.00'}, format='json')
        self.assertEqual(resp2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', resp2.data)

        self.assertEqual(CierreCajaCantina.objects.filter(cajero=self.cajero_user, apertura=self.apertura).count(), 1)

    def test_post_sin_conteo_fisico_es_rechazado(self):
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/cierre-caja/', {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', resp.data)

    def test_post_sin_apertura_abierta_es_rechazado(self):
        self.apertura.estado = 'cerrada'
        self.apertura.save(update_fields=['estado'])

        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/cierre-caja/', {'conteo_fisico': '0.00'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', resp.data)

    def test_cajero_no_puede_cerrar_con_totales_de_otro_cajero(self):
        self._crear_venta(self.otro_cajero, 'efectivo', Decimal('500.00'), apertura=self.apertura_otro)

        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/cierre-caja/', {'conteo_fisico': '0.00'}, format='json')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(Decimal(resp.data['total_ventas']), Decimal('0.00'))

        cierre = CierreCajaCantina.objects.get(cajero=self.cajero_user, apertura=self.apertura)
        self.assertEqual(cierre.total_ventas, Decimal('0.00'))
        # El cierre del otro cajero no se creó por error cruzado, y su
        # apertura sigue abierta — cerrar la propia no debe tocarla.
        self.assertFalse(CierreCajaCantina.objects.filter(cajero=self.otro_cajero, apertura=self.apertura_otro).exists())
        self.apertura_otro.refresh_from_db()
        self.assertEqual(self.apertura_otro.estado, 'abierta')

    def test_no_autenticado_rechazado(self):
        resp = self.client.post('/api/cantina/cierre-caja/', {'conteo_fisico': '0.00'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_tambien_puede_cerrar_caja(self):
        AperturaCajaCantina.objects.create(cajero=self.admin_user, monto_inicial=Decimal('0.00'))
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.post('/api/cantina/cierre-caja/', {'conteo_fisico': '0.00'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)


class CierreCajaDesgloseTestsBase(CierreCajaCantinaTestsBase):
    """Datos a tasa 100 para que las conversiones se lean a simple vista."""
    TASA = Decimal('100.0000')
    URL = '/api/cantina/cierre-caja/'

    def _venta(self, metodo_pago, total_usd, estado='completada', tarjeta=None):
        return VentaCantina.objects.create(
            alumno=self.alumno if tarjeta else None,
            tarjeta=tarjeta,
            apertura=self.apertura,
            cajero=self.cajero_user,
            metodo_pago=metodo_pago,
            total_usd=total_usd,
            tasa_aplicada=self.TASA,
            total_ves=(total_usd * self.TASA).quantize(Decimal('0.01')),
            estado=estado,
        )

    def _recarga(self, metodo_pago, monto_usd, **extra):
        datos = {'estatus': 'aprobado', 'registrado_por_portal': False, 'cajero': self.cajero_user}
        datos.update(extra)
        return RecargaTarjeta.objects.create(
            tarjeta=self.tarjeta,
            metodo_pago=metodo_pago,
            monto_usd=monto_usd,
            tasa_aplicada=self.TASA,
            monto_ves=(monto_usd * self.TASA).quantize(Decimal('0.01')),
            **datos,
        )

    def _abono(self, metodo_pago, monto_usd, estatus='completado'):
        return AbonoCantina.objects.create(
            operacion_uuid=uuid.uuid4(),
            representante=self.representante,
            area='cantina',
            apertura=self.apertura,
            metodo_pago=metodo_pago,
            monto_usd=monto_usd,
            tasa_aplicada=self.TASA,
            monto_ves=(monto_usd * self.TASA).quantize(Decimal('0.01')),
            estatus=estatus,
            cajero=self.cajero_user,
        )

    def _preliminar(self):
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        return resp.data

    def _cerrar(self, **payload):
        self.client.force_authenticate(user=self.cajero_user)
        return self.client.post(self.URL, payload, format='json')


class CierreCajaDesgloseOrigenTests(CierreCajaDesgloseTestsBase):
    def test_desglose_con_cada_origen(self):
        self._venta('efectivo', Decimal('10.00'))
        self._venta('tarjeta_prepago', Decimal('5.00'), tarjeta=self.tarjeta)
        self._venta('credito_representante', Decimal('4.00'))
        self._venta('efectivo', Decimal('7.00'), estado='anulada')
        self._recarga('efectivo', Decimal('20.00'))
        self._recarga('efectivo_ves', Decimal('3.00'))
        self._recarga('zelle', Decimal('8.00'))
        self._abono('efectivo', Decimal('6.00'))
        self._abono('zelle', Decimal('2.00'))
        self._abono('efectivo', Decimal('900.00'), estatus='anulado')

        origen = self._preliminar()['desglose']['origen']

        self.assertEqual(origen['ventas'], {'usd': '19.00', 'operaciones': 3})
        self.assertEqual(origen['recargas_cobradas'], {
            'usd': '31.00', 'operaciones': 3, 'efectivo_usd': '23.00', 'banco_usd': '8.00',
        })
        self.assertEqual(origen['consumo_recargas'], {'usd': '5.00', 'operaciones': 1})
        self.assertEqual(origen['abonos'], {'usd': '8.00', 'operaciones': 2})
        self.assertEqual(origen['cargado_a_cuenta'], {'usd': '4.00', 'operaciones': 1})
        self.assertEqual(origen['anuladas'], {'usd': '7.00', 'operaciones': 1})
        self.assertEqual(origen['recargas_portal'], {'usd': '0.00', 'operaciones': 0})

    def test_sin_movimientos_el_desglose_viene_en_cero(self):
        desglose = self._preliminar()['desglose']
        for clave in ('ventas', 'consumo_recargas', 'abonos', 'cargado_a_cuenta', 'anuladas', 'recargas_portal'):
            self.assertEqual(desglose['origen'][clave], {'usd': '0.00', 'operaciones': 0})
        self.assertEqual(desglose['arqueo']['esperado_usd'], '0.00')
        self.assertEqual(desglose['arqueo']['esperado_ves'], '0.00')

    def test_venta_anulada_en_anuladas_y_fuera_de_totales(self):
        self._venta('efectivo', Decimal('10.00'))
        self._venta('efectivo', Decimal('100.00'), estado='anulada')

        data = self._preliminar()

        self.assertEqual(data['desglose']['origen']['anuladas'], {'usd': '100.00', 'operaciones': 1})
        self.assertEqual(data['desglose']['origen']['ventas'], {'usd': '10.00', 'operaciones': 1})
        self.assertEqual(Decimal(data['total_ventas']), Decimal('10.00'))
        self.assertEqual(Decimal(data['efectivo_esperado']), Decimal('10.00'))
        self.assertEqual(data['desglose']['arqueo']['esperado_usd'], '10.00')

    def test_anulada_de_otra_apertura_no_cuenta(self):
        VentaCantina.objects.create(
            apertura=self.apertura_otro, cajero=self.otro_cajero, metodo_pago='efectivo',
            total_usd=Decimal('50.00'), tasa_aplicada=self.TASA, total_ves=Decimal('5000.00'),
            estado='anulada',
        )
        self.assertEqual(self._preliminar()['desglose']['origen']['anuladas'], {'usd': '0.00', 'operaciones': 0})

    def test_recarga_de_portal_aprobada_por_el_cajero_es_solo_informativa(self):
        recarga = self._recarga(
            'efectivo', Decimal('25.00'), estatus='pendiente', registrado_por_portal=True, cajero=None,
        )
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post(f'/api/cantina/recargas/{recarga.pk}/aprobar/', format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)

        data = self._preliminar()

        self.assertEqual(data['desglose']['origen']['recargas_portal'], {'usd': '25.00', 'operaciones': 1})
        self.assertEqual(data['desglose']['origen']['recargas_cobradas']['usd'], '0.00')
        self.assertEqual(data['totales_por_metodo'], {})
        self.assertEqual(Decimal(data['efectivo_esperado']), Decimal('0.00'))
        self.assertEqual(data['desglose']['arqueo']['esperado_usd'], '0.00')

    def test_recarga_de_portal_de_otro_revisor_o_previa_a_la_apertura_no_cuenta(self):
        self._recarga(
            'zelle', Decimal('11.00'), registrado_por_portal=True, cajero=None,
            revisado_por=self.otro_cajero, revisado_en=timezone.now(),
        )
        self._recarga(
            'zelle', Decimal('12.00'), registrado_por_portal=True, cajero=None,
            revisado_por=self.cajero_user,
            revisado_en=self.apertura.fecha_hora_apertura - timezone.timedelta(hours=1),
        )
        self._recarga(
            'zelle', Decimal('13.00'), estatus='rechazado', registrado_por_portal=True, cajero=None,
            revisado_por=self.cajero_user, revisado_en=timezone.now(),
        )
        self.assertEqual(
            self._preliminar()['desglose']['origen']['recargas_portal'],
            {'usd': '0.00', 'operaciones': 0},
        )


class CierreCajaArqueoTests(CierreCajaDesgloseTestsBase):
    def test_invariante_del_esperado(self):
        self.apertura.monto_inicial = Decimal('15.00')
        self.apertura.save(update_fields=['monto_inicial'])
        self._venta('efectivo', Decimal('10.00'))
        self._venta('efectivo_ves', Decimal('3.00'))
        self._recarga('efectivo', Decimal('20.00'))
        self._recarga('efectivo_ves', Decimal('2.00'))
        self._abono('efectivo', Decimal('6.00'))
        self._abono('efectivo_ves', Decimal('1.00'))
        self._venta('zelle', Decimal('50.00'))

        data = self._preliminar()
        arqueo = data['desglose']['arqueo']

        self.assertEqual(arqueo['esperado_usd'], '51.00')  # 15 + 10 + 20 + 6
        # Solo los Bs físicos: 6 USD a tasa 100. El equivalente contable en Bs
        # de las operaciones en dólares no se suma.
        self.assertEqual(arqueo['esperado_ves'], '600.00')
        efectivo_ves_usd = Decimal(data['totales_por_metodo']['efectivo_ves']['total_usd'])
        self.assertEqual(
            Decimal(arqueo['esperado_usd']) + efectivo_ves_usd,
            Decimal(data['efectivo_esperado']),
        )

    def test_tasa_implicita_del_turno_si_hay_movimiento_en_bs(self):
        self._venta('efectivo_ves', Decimal('10.00'))
        # self.tasa (activa) vale 40: debe ganar la implícita del turno.
        self.assertEqual(Decimal(self._preliminar()['desglose']['arqueo']['tasa_ves']), Decimal('100'))

    def test_tasa_activa_si_no_hay_movimiento_en_bs(self):
        self._venta('efectivo', Decimal('10.00'))
        self.assertEqual(Decimal(self._preliminar()['desglose']['arqueo']['tasa_ves']), Decimal('40'))

    def test_tasa_null_sin_movimiento_ni_tasa_activa(self):
        TasaCambio.objects.all().delete()
        self.assertIsNone(self._preliminar()['desglose']['arqueo']['tasa_ves'])

    def test_preliminar_omite_contado_y_diferencia(self):
        arqueo = self._preliminar()['desglose']['arqueo']
        for campo in ('contado_usd', 'contado_ves', 'diferencia_usd', 'diferencia_ves'):
            self.assertNotIn(campo, arqueo)

    def test_conteo_exacto_en_ambas_monedas_da_diferencia_cero(self):
        self._venta('efectivo', Decimal('10.00'))
        self._venta('efectivo_ves', Decimal('10.00'))

        resp = self._cerrar(conteo_usd='10.00', conteo_ves='1000.00')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(Decimal(resp.data['diferencia']), Decimal('0.00'))
        self.assertEqual(Decimal(resp.data['conteo_fisico']), Decimal('20.00'))
        self.assertEqual(Decimal(resp.data['efectivo_esperado']), Decimal('20.00'))
        arqueo = resp.data['desglose']['arqueo']
        self.assertEqual(arqueo['contado_usd'], '10.00')
        self.assertEqual(arqueo['contado_ves'], '1000.00')
        self.assertEqual(arqueo['diferencia_usd'], '0.00')
        self.assertEqual(arqueo['diferencia_ves'], '0.00')

    def test_conteo_exacto_con_tasas_mezcladas_da_diferencia_cero(self):
        # Dos tasas en el mismo turno: la implícita no es redonda, pero contar
        # lo esperado nunca puede fabricar una diferencia.
        self._venta('efectivo_ves', Decimal('3.33'))
        VentaCantina.objects.create(
            apertura=self.apertura, cajero=self.cajero_user, metodo_pago='efectivo_ves',
            total_usd=Decimal('7.77'), tasa_aplicada=Decimal('101.2345'), total_ves=Decimal('786.59'),
        )
        esperado_ves = self._preliminar()['desglose']['arqueo']['esperado_ves']

        resp = self._cerrar(conteo_ves=esperado_ves)

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(Decimal(resp.data['diferencia']), Decimal('0.00'))
        self.assertEqual(Decimal(resp.data['conteo_fisico']), Decimal('11.10'))

    def test_caja_vacia_con_monto_grande_falta_exactamente_lo_esperado(self):
        # Tasa implícita de muchos decimales: redondearla a 4 antes de
        # convertir desviaría el faltante por encima de 0.01 USD.
        VentaCantina.objects.create(
            apertura=self.apertura, cajero=self.cajero_user, metodo_pago='efectivo_ves',
            total_usd=Decimal('99999.99'), tasa_aplicada=Decimal('33.3333'), total_ves=Decimal('3333333.33'),
        )

        resp = self._cerrar(conteo_usd='0', conteo_ves='0')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(Decimal(resp.data['diferencia']), Decimal('-99999.99'))
        self.assertEqual(Decimal(resp.data['conteo_fisico']), Decimal('0.00'))

    def test_faltante_en_bs_se_convierte_a_usd(self):
        self._venta('efectivo', Decimal('10.00'))
        self._venta('efectivo_ves', Decimal('10.00'))

        resp = self._cerrar(conteo_usd='10.00', conteo_ves='900.00')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(Decimal(resp.data['diferencia']), Decimal('-1.00'))
        self.assertEqual(Decimal(resp.data['conteo_fisico']), Decimal('19.00'))
        self.assertEqual(resp.data['desglose']['arqueo']['diferencia_ves'], '-100.00')
        self.assertEqual(resp.data['desglose']['arqueo']['diferencia_usd'], '0.00')

    def test_si_llega_solo_una_moneda_la_otra_vale_cero(self):
        self._venta('efectivo', Decimal('10.00'))
        self._venta('efectivo_ves', Decimal('10.00'))

        resp = self._cerrar(conteo_usd='10.00')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['desglose']['arqueo']['contado_ves'], '0.00')
        self.assertEqual(Decimal(resp.data['diferencia']), Decimal('-10.00'))

    def test_post_persiste_el_desglose_y_devuelve_ya_cerrado(self):
        self._venta('efectivo', Decimal('10.00'))

        resp = self._cerrar(conteo_usd='10.00', conteo_ves='0', observaciones='Ok')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIs(resp.data['ya_cerrado'], True)
        cierre = CierreCajaCantina.objects.get(apertura=self.apertura)
        self.assertEqual(cierre.desglose, resp.data['desglose'])
        self.assertEqual(cierre.desglose['origen']['ventas'], {'usd': '10.00', 'operaciones': 1})
        self.assertEqual(cierre.observaciones, 'Ok')

    def test_payload_antiguo_sigue_funcionando_sin_guardar_contado(self):
        self._venta('efectivo', Decimal('10.00'))
        self._venta('efectivo_ves', Decimal('10.00'))

        resp = self._cerrar(conteo_fisico='18.50', observaciones='Antiguo')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIs(resp.data['ya_cerrado'], True)
        self.assertEqual(Decimal(resp.data['conteo_fisico']), Decimal('18.50'))
        self.assertEqual(Decimal(resp.data['diferencia']), Decimal('-1.50'))
        arqueo = resp.data['desglose']['arqueo']
        self.assertEqual(arqueo['esperado_usd'], '10.00')
        for campo in ('contado_usd', 'contado_ves', 'diferencia_usd', 'diferencia_ves'):
            self.assertNotIn(campo, arqueo)

    def test_rechaza_montos_invalidos_en_todos_los_campos(self):
        self._venta('efectivo_ves', Decimal('10.00'))
        for campo in ('conteo_usd', 'conteo_ves', 'conteo_fisico'):
            for valor in ('-1', '-0.01', 'NaN', 'sNaN', 'Infinity', '-Infinity', 'abc', '1e400', True, ['1']):
                with self.subTest(campo=campo, valor=valor):
                    resp = self._cerrar(**{campo: valor})
                    self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.data)
                    self.assertIn('detail', resp.data)
        self.assertFalse(CierreCajaCantina.objects.filter(apertura=self.apertura).exists())
        self.apertura.refresh_from_db()
        self.assertEqual(self.apertura.estado, 'abierta')

    def test_monto_que_no_cabe_en_el_cierre_se_rechaza_sin_error_500(self):
        resp = self._cerrar(conteo_usd='100000000000')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.data)
        self.assertFalse(CierreCajaCantina.objects.filter(apertura=self.apertura).exists())

    def test_conteo_ves_sin_tasa_da_400(self):
        TasaCambio.objects.all().delete()

        resp = self._cerrar(conteo_usd='0', conteo_ves='100')

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.data)
        self.assertEqual(resp.data['detail'], 'No hay tasa de cambio para convertir los bolívares contados.')
        self.assertFalse(CierreCajaCantina.objects.filter(apertura=self.apertura).exists())

    def test_conteo_solo_en_usd_sin_tasa_si_se_puede_cerrar(self):
        TasaCambio.objects.all().delete()
        self._venta('efectivo', Decimal('10.00'))

        resp = self._cerrar(conteo_usd='10.00', conteo_ves='0')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(Decimal(resp.data['diferencia']), Decimal('0.00'))
        self.assertIsNone(resp.data['desglose']['arqueo']['tasa_ves'])


class CierreCajaUltimoTests(CierreCajaDesgloseTestsBase):
    URL_ULTIMO = '/api/cantina/cierre-caja/ultimo/'

    def _cierre(self, cajero, hace_horas=0, **extra):
        apertura = AperturaCajaCantina.objects.create(
            cajero=cajero, monto_inicial=Decimal('0.00'), estado='cerrada',
        )
        cierre = CierreCajaCantina.objects.create(
            cajero=cajero, apertura=apertura, fecha=self.hoy,
            conteo_fisico=Decimal('0.00'), diferencia=Decimal('0.00'), **extra,
        )
        CierreCajaCantina.objects.filter(pk=cierre.pk).update(
            cerrado_en=timezone.now() - timezone.timedelta(hours=hace_horas),
        )
        return cierre

    def test_devuelve_el_mas_reciente_del_cajero(self):
        self._cierre(self.cajero_user, hace_horas=5)
        reciente = self._cierre(self.cajero_user, hace_horas=1)
        self._cierre(self.cajero_user, hace_horas=9)

        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get(self.URL_ULTIMO)

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data['id'], reciente.id)
        self.assertIs(resp.data['ya_cerrado'], True)

    def test_nunca_devuelve_el_de_otro_cajero(self):
        propio = self._cierre(self.cajero_user, hace_horas=5)
        self._cierre(self.otro_cajero, hace_horas=0)

        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get(self.URL_ULTIMO)

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data['id'], propio.id)

    def test_404_si_el_cajero_no_tiene_cierres(self):
        self._cierre(self.otro_cajero)

        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get(self.URL_ULTIMO)

        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND, resp.data)
        self.assertIn('detail', resp.data)

    def test_no_autenticado_rechazado(self):
        self.assertEqual(self.client.get(self.URL_ULTIMO).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_cierre_antiguo_con_desglose_vacio_se_serializa_sin_error(self):
        antiguo = self._cierre(self.cajero_user)
        self.assertEqual(antiguo.desglose, {})

        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.get(self.URL_ULTIMO)

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data['desglose'], {})

    def test_get_de_cierre_existente_incluye_el_desglose_guardado(self):
        CierreCajaCantina.objects.create(
            cajero=self.cajero_user, apertura=self.apertura, fecha=self.hoy,
            conteo_fisico=Decimal('0.00'), diferencia=Decimal('0.00'),
        )
        data = self._preliminar()
        self.assertIs(data['ya_cerrado'], True)
        self.assertEqual(data['desglose'], {})
