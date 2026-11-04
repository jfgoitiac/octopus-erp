from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from cobranza.models import TasaCambio
from secretaria.models import Alumno, Representante

from .models import (
    AperturaCajaCantina, CierreCajaCantina, EventoAuditoriaCantina,
    MovimientoTarjeta, RecargaTarjeta, TarjetaPrepago,
)
from .services_tarjeta import aplicar_movimiento_tarjeta


User = get_user_model()


class ReversosRecargaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(username='admin_reversos', password='x')
        self.admin.perfil.rol = 'administrador'
        self.admin.perfil.save()
        self.cajero = User.objects.create_user(username='cajero_reversos', password='x')
        self.cajero.perfil.rol = 'cajero'
        self.cajero.perfil.save()
        self.otro = User.objects.create_user(username='otro_reversos', password='x')
        self.otro.perfil.rol = 'cajero'
        self.otro.perfil.save()
        rep = Representante.objects.create(
            cedula='V-19000111', nombre='Rosa', apellido='Luna',
            telefono='04120000000', correo='rosa@example.com', direccion='Centro',
        )
        alumno = Alumno.objects.create(nombre='Luis', apellido='Luna', representante=rep, grado_seccion='4to A')
        self.tarjeta = TarjetaPrepago.objects.create(
            alumno=alumno, serial='REV-0001', codigo='CANT-REVERSO001',
            estado='activa', saldo=Decimal('0.00'), limite_credito=Decimal('5.00'),
        )
        TasaCambio.objects.create(valor_bs=Decimal('50.0000'))
        self.apertura = AperturaCajaCantina.objects.create(
            cajero=self.cajero, area='cantina', monto_inicial=Decimal('0.00'),
        )

    def recargar(self, monto='10.00'):
        self.client.force_authenticate(self.cajero)
        resp = self.client.post('/api/cantina/tarjetas/recargar/', {
            'tarjeta': self.tarjeta.id, 'metodo_pago': 'efectivo', 'monto_usd': monto,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        return RecargaTarjeta.objects.get(pk=resp.data['id'])

    def anular(self, recarga, user=None, **extra):
        self.client.force_authenticate(user or self.cajero)
        payload = {'motivo': 'Monto registrado por error', **extra}
        with patch('cantina.tasks.task_notificar_recarga_anulada.delay'):
            return self.client.post(f'/api/cantina/recargas/{recarga.id}/anular/', payload, format='json')

    def test_recarga_nueva_queda_vinculada_a_apertura(self):
        recarga = self.recargar()
        self.assertEqual(recarga.apertura, self.apertura)

    def test_cajero_anula_recarga_propia_en_caja_abierta(self):
        recarga = self.recargar()
        resp = self.anular(recarga, devolucion_dinero=True)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        recarga.refresh_from_db()
        self.tarjeta.refresh_from_db()
        self.assertEqual(recarga.estatus, 'anulado')
        self.assertEqual(recarga.apertura_reverso, self.apertura)
        self.assertEqual(self.tarjeta.saldo, Decimal('0.00'))
        mov = MovimientoTarjeta.objects.get(recarga=recarga, tipo='anulacion_recarga')
        self.assertEqual(mov.saldo_antes, Decimal('10.00'))
        self.assertEqual(mov.saldo_despues, Decimal('0.00'))
        self.assertEqual(EventoAuditoriaCantina.objects.filter(tipo='anulacion_recarga').count(), 1)

    def test_no_anula_dos_veces(self):
        recarga = self.recargar()
        self.assertEqual(self.anular(recarga).status_code, status.HTTP_200_OK)
        resp = self.anular(recarga)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(MovimientoTarjeta.objects.filter(recarga=recarga, tipo='anulacion_recarga').count(), 1)

    def test_cadena_false_no_registra_devolucion_de_dinero(self):
        recarga = self.recargar()
        resp = self.anular(recarga, devolucion_dinero='false')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        recarga.refresh_from_db()
        self.assertFalse(recarga.devolucion_dinero)

    def test_otro_cajero_no_anula_recarga_ajena(self):
        recarga = self.recargar()
        resp = self.anular(recarga, user=self.otro)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        recarga.refresh_from_db()
        self.assertEqual(recarga.estatus, 'aprobado')

    def test_consumo_posterior_exige_admin_y_confirmacion_explicita(self):
        recarga = self.recargar()
        aplicar_movimiento_tarjeta(self.tarjeta, 'consumo', Decimal('10.00'), usuario=self.cajero)
        resp = self.anular(recarga)
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(resp.data['requiere_autorizacion'])
        resp = self.anular(recarga, user=self.admin, forzar_saldo_negativo=True)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, Decimal('-10.00'))

    def test_caja_cerrada_requiere_admin_y_ajusta_caja_actual_si_hay_devolucion(self):
        recarga = self.recargar()
        self.apertura.estado = 'cerrada'
        self.apertura.cerrada_en = timezone.now()
        self.apertura.save(update_fields=['estado', 'cerrada_en'])
        cierre = CierreCajaCantina.objects.create(
            cajero=self.cajero, apertura=self.apertura, fecha=timezone.localdate(),
            area='cantina', total_recargas_efectivo=Decimal('10.00'),
        )
        self.assertEqual(self.anular(recarga).status_code, status.HTTP_403_FORBIDDEN)
        apertura_admin = AperturaCajaCantina.objects.create(
            cajero=self.admin, area='cantina', monto_inicial=Decimal('20.00'),
        )
        resp = self.anular(recarga, user=self.admin, devolucion_dinero=True)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        recarga.refresh_from_db()
        self.assertEqual(recarga.cierre_afectado, cierre)
        self.assertEqual(recarga.apertura_reverso, apertura_admin)
        self.client.force_authenticate(self.admin)
        preliminar = self.client.get('/api/cantina/cierre-caja/')
        self.assertEqual(preliminar.status_code, status.HTTP_200_OK, preliminar.data)
        self.assertEqual(Decimal(preliminar.data['total_recargas_efectivo']), Decimal('-10.00'))
        self.assertEqual(Decimal(preliminar.data['efectivo_esperado']), Decimal('10.00'))

    def test_recarga_historica_requiere_caja_para_devolver_dinero(self):
        recarga = self.recargar()
        recarga.apertura = None
        recarga.save(update_fields=['apertura'])
        resp = self.anular(recarga, user=self.admin, devolucion_dinero=True)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        recarga.refresh_from_db()
        self.assertEqual(recarga.estatus, 'aprobado')

        apertura_admin = AperturaCajaCantina.objects.create(
            cajero=self.admin, area='cantina', monto_inicial=Decimal('20.00'),
        )
        resp = self.anular(recarga, user=self.admin, devolucion_dinero=True)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        recarga.refresh_from_db()
        self.assertEqual(recarga.apertura_reverso, apertura_admin)

    def test_correccion_es_atomica_y_enlaza_ambas_recargas(self):
        recarga = self.recargar('10.00')
        self.client.force_authenticate(self.cajero)
        with patch('cantina.tasks.task_notificar_recarga_corregida.delay'):
            resp = self.client.post(f'/api/cantina/recargas/{recarga.id}/corregir/', {
                'motivo': 'Monto correcto era quince',
                'recarga': {'metodo_pago': 'efectivo', 'monto_usd': '15.00'},
            }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        recarga.refresh_from_db()
        nueva = RecargaTarjeta.objects.get(pk=resp.data['recarga']['id'])
        self.tarjeta.refresh_from_db()
        self.assertEqual(recarga.estatus, 'anulado')
        self.assertEqual(nueva.reemplaza_a, recarga)
        self.assertEqual(nueva.apertura, self.apertura)
        self.assertEqual(self.tarjeta.saldo, Decimal('15.00'))
        self.assertEqual(EventoAuditoriaCantina.objects.filter(tipo='correccion_recarga').count(), 1)

    def test_correccion_invalida_no_anula_original(self):
        recarga = self.recargar()
        self.client.force_authenticate(self.cajero)
        resp = self.client.post(f'/api/cantina/recargas/{recarga.id}/corregir/', {
            'motivo': 'Monto inválido enviado',
            'recarga': {'metodo_pago': 'efectivo', 'monto_usd': '0.00'},
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        recarga.refresh_from_db()
        self.tarjeta.refresh_from_db()
        self.assertEqual(recarga.estatus, 'aprobado')
        self.assertEqual(self.tarjeta.saldo, Decimal('10.00'))

    def test_historial_busca_y_pagina(self):
        for _ in range(12):
            self.recargar('1.00')
        self.client.force_authenticate(self.cajero)
        resp = self.client.get('/api/cantina/recargas/', {'page': 2, 'page_size': 10, 'q': 'REV-0001'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data['count'], 12)
        self.assertEqual(len(resp.data['results']), 2)
        self.assertIn('puede_anular', resp.data['results'][0])

    def test_comprobante_pdf_solo_para_anulada(self):
        recarga = self.recargar()
        self.assertEqual(self.anular(recarga).status_code, status.HTTP_200_OK)
        self.client.force_authenticate(self.cajero)
        resp = self.client.get(f'/api/cantina/recargas/{recarga.id}/comprobante-anulacion/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        contenido = b''.join(resp.streaming_content)
        self.assertTrue(contenido.startswith(b'%PDF'))
