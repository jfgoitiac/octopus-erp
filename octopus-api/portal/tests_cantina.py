"""
Tests del lado PORTAL de la Fase 3 de cantina.md (§5.6/§7.5/§8 FASE 3):
saldo de tarjeta, historial de consumo y solicitud de recarga con
comprobante desde /portal — el portal usa su propio JWT (portal_token),
nunca el de cantina, y solo lee/crea sobre cantina.models.

Sigue el mismo estilo que portal/tests.py (PortalTestBase, helpers
crear_representante_con_portal / crear_alumno, APIClient).
"""
from decimal import Decimal

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from cantina.models import MovimientoTarjeta, RecargaTarjeta, TarjetaPrepago
from cobranza.models import BancoInstitucional, Pago, TasaCambio
from secretaria.models import Alumno, Representante

from .models import RepresentanteUser, asignar_rol_portal
from .tests import PNG_BYTES, crear_alumno, crear_representante_con_portal

from django.contrib.auth import get_user_model

User = get_user_model()


class PortalCantinaTestBase(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.password = 'clave-segura-123'

        self.rep, self.user, self.rep_user = crear_representante_con_portal(
            'V11111111', 'rep1@example.com', self.password
        )
        self.alumno = crear_alumno(self.rep, 'E84000001')
        self.tarjeta = TarjetaPrepago.objects.create(
            alumno=self.alumno, serial='L001-0001', codigo='CANT-AAAAAAAAAA',
            estado='activa', saldo=Decimal('5.00'), limite_credito=Decimal('5.00'),
        )

        # Un segundo representante con su propio alumno/tarjeta, para probar
        # aislamiento IDOR (nunca se debe poder ver/tocar su tarjeta).
        self.rep2, self.user2, self.rep_user2 = crear_representante_con_portal(
            'V22222222', 'rep2@example.com', 'otra-clave-456'
        )
        self.alumno2 = crear_alumno(self.rep2, 'E84000002', nombre='Sofia', apellido='Perez')
        self.tarjeta2 = TarjetaPrepago.objects.create(
            alumno=self.alumno2, serial='L001-0002', codigo='CANT-BBBBBBBBBB',
            estado='activa', saldo=Decimal('0.00'), limite_credito=Decimal('5.00'),
        )

        self.banco = BancoInstitucional.objects.create(
            nombre='Banco Prueba', numero_cuenta='0102-1234-56-1234567890',
            activo=True, tipos=['transferencia', 'pago_movil'],
        )
        TasaCambio.objects.create(valor_bs=Decimal('40.0000'))

    def login_portal(self, cedula=None, password=None):
        resp = self.client.post('/api/portal/token/', {
            'cedula_o_email': cedula or self.rep.cedula,
            'contrasena': password or self.password,
        })
        return resp

    def auth_portal(self, cedula=None, password=None):
        resp = self.login_portal(cedula, password)
        assert resp.status_code == 200, resp.content
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}")

    def comprobante_valido(self, nombre='comprobante.png'):
        return SimpleUploadedFile(nombre, PNG_BYTES, content_type='image/png')


# ──────────────────────────────────────────────────────────────────────────────
# SALDO DE TARJETA
# ──────────────────────────────────────────────────────────────────────────────

class PortalSaldoTarjetaTests(PortalCantinaTestBase):
    def test_requiere_autenticacion(self):
        resp = self.client.get('/api/portal/cantina/saldo/')
        self.assertEqual(resp.status_code, 401)

    def test_devuelve_saldo_de_su_alumno(self):
        self.auth_portal()
        resp = self.client.get('/api/portal/cantina/saldo/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        item = resp.data[0]
        self.assertEqual(item['alumno_id'], self.alumno.id)
        self.assertTrue(item['tiene_tarjeta'])
        self.assertEqual(Decimal(item['saldo']), Decimal('5.00'))
        self.assertEqual(item['estado'], 'activa')
        self.assertFalse(item['en_negativo'])

    def test_alumno_sin_tarjeta_responde_tiene_tarjeta_false_sin_error(self):
        alumno_sin_tarjeta = crear_alumno(self.rep, 'E84000099', nombre='Carlos', apellido='Gonzalez')
        self.auth_portal()
        resp = self.client.get('/api/portal/cantina/saldo/')
        self.assertEqual(resp.status_code, 200)
        item = next(i for i in resp.data if i['alumno_id'] == alumno_sin_tarjeta.id)
        self.assertFalse(item['tiene_tarjeta'])
        self.assertIsNone(item['saldo'])
        self.assertIsNone(item['tarjeta_id'])

    def test_saldo_negativo_se_reporta(self):
        self.tarjeta.saldo = Decimal('-2.50')
        from datetime import date
        self.tarjeta.saldo_negativo_desde = date.today()
        self.tarjeta.save()
        self.auth_portal()
        resp = self.client.get('/api/portal/cantina/saldo/')
        item = resp.data[0]
        self.assertTrue(item['en_negativo'])
        self.assertEqual(item['dias_en_negativo'], 0)

    def test_no_puede_ver_alumno_de_otro_representante_via_alumno_id(self):
        """IDOR: pedir el alumno_id de OTRO representante debe dar 404, no 403 ni fuga de datos."""
        self.auth_portal()
        resp = self.client.get(f'/api/portal/cantina/saldo/?alumno_id={self.alumno2.id}')
        self.assertEqual(resp.status_code, 404)

    def test_filtro_alumno_id_propio_funciona(self):
        self.auth_portal()
        resp = self.client.get(f'/api/portal/cantina/saldo/?alumno_id={self.alumno.id}')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['alumno_id'], self.alumno.id)


# ──────────────────────────────────────────────────────────────────────────────
# HISTORIAL DE CONSUMO
# ──────────────────────────────────────────────────────────────────────────────

class PortalHistorialConsumoCantinaTests(PortalCantinaTestBase):
    def test_requiere_alumno_id(self):
        self.auth_portal()
        resp = self.client.get('/api/portal/cantina/historial/')
        self.assertEqual(resp.status_code, 400)

    def test_no_puede_ver_historial_de_alumno_ajeno(self):
        self.auth_portal()
        resp = self.client.get(f'/api/portal/cantina/historial/?alumno_id={self.alumno2.id}')
        self.assertEqual(resp.status_code, 404)

    def test_historial_paginado_solo_consumos(self):
        MovimientoTarjeta.objects.create(
            tarjeta=self.tarjeta, tipo='consumo', monto=Decimal('1.50'),
            saldo_antes=Decimal('5.00'), saldo_despues=Decimal('3.50'),
        )
        MovimientoTarjeta.objects.create(
            tarjeta=self.tarjeta, tipo='recarga', monto=Decimal('5.00'),
            saldo_antes=Decimal('0.00'), saldo_despues=Decimal('5.00'),
        )
        self.auth_portal()
        resp = self.client.get(f'/api/portal/cantina/historial/?alumno_id={self.alumno.id}')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['total'], 1)
        self.assertEqual(resp.data['results'][0]['tipo'], 'consumo')


# ──────────────────────────────────────────────────────────────────────────────
# RECARGA DESDE EL PORTAL
# ──────────────────────────────────────────────────────────────────────────────

class PortalRecargarTarjetaTests(PortalCantinaTestBase):
    def _payload_transferencia(self, **overrides):
        data = dict(
            alumno_id=self.alumno.id,
            metodo_pago='transferencia',
            monto_usd='10.00',
            banco_receptor_id=self.banco.id,
            banco_procedencia='Banesco',
            referencia='123456',
            archivo=self.comprobante_valido(),
        )
        data.update(overrides)
        # El cliente de test multipart no puede codificar None (Django exige
        # str/bytes/file) — un campo "ausente" se expresa omitiéndolo, no con None.
        return {k: v for k, v in data.items() if v is not None}

    def test_requiere_autenticacion(self):
        resp = self.client.post('/api/portal/cantina/recargar/', self._payload_transferencia())
        self.assertEqual(resp.status_code, 401)

    def test_recarga_exitosa_queda_pendiente_y_no_toca_saldo(self):
        self.auth_portal()
        resp = self.client.post('/api/portal/cantina/recargar/', self._payload_transferencia(), format='multipart')
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(resp.data['estatus'], 'pendiente')

        recarga = RecargaTarjeta.objects.get(pk=resp.data['id'])
        self.assertTrue(recarga.registrado_por_portal)
        self.assertEqual(recarga.tarjeta_id, self.tarjeta.id)
        self.assertEqual(recarga.monto_usd, Decimal('10.00'))
        self.assertEqual(recarga.monto_ves, Decimal('400.00'))
        self.assertEqual(recarga.tasa_aplicada, Decimal('40.0000'))

        self.tarjeta.refresh_from_db()
        self.assertEqual(self.tarjeta.saldo, Decimal('5.00'))  # sin cambios: el portal nunca acredita

    def test_metodo_efectivo_no_permitido(self):
        self.auth_portal()
        resp = self.client.post(
            '/api/portal/cantina/recargar/',
            self._payload_transferencia(metodo_pago='efectivo', banco_receptor_id='', archivo=None),
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)

    def test_metodo_tarjeta_prepago_no_permitido(self):
        self.auth_portal()
        resp = self.client.post(
            '/api/portal/cantina/recargar/',
            self._payload_transferencia(metodo_pago='tarjeta_prepago', banco_receptor_id='', archivo=None),
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)

    def test_no_puede_recargar_tarjeta_de_alumno_ajeno(self):
        self.auth_portal()
        resp = self.client.post(
            '/api/portal/cantina/recargar/',
            self._payload_transferencia(alumno_id=self.alumno2.id),
            format='multipart',
        )
        self.assertEqual(resp.status_code, 404)
        self.tarjeta2.refresh_from_db()
        self.assertEqual(self.tarjeta2.saldo, Decimal('0.00'))

    def test_alumno_sin_tarjeta_rechaza(self):
        alumno_sin_tarjeta = crear_alumno(self.rep, 'E84000099', nombre='Carlos', apellido='Gonzalez')
        self.auth_portal()
        resp = self.client.post(
            '/api/portal/cantina/recargar/',
            self._payload_transferencia(alumno_id=alumno_sin_tarjeta.id),
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)

    def test_referencia_duplicada_contra_cobranza_pago_es_rechazada(self):
        """Una referencia ya usada en cobranza.Pago no puede reutilizarse en una recarga de cantina."""
        admin = User.objects.create_user(username='cobranza_admin', password='x')
        Pago.objects.create(
            alumno=self.alumno, usuario_receptor=admin, metodo_pago='transferencia',
            banco_receptor=self.banco,
            monto_usd=Decimal('35.00'), tasa_aplicada=Decimal('40.0000'),
            monto_ves=Decimal('1400.00'), referencia='REF-CRUZADA-1', estatus='completado',
        )
        self.auth_portal()
        resp = self.client.post(
            '/api/portal/cantina/recargar/',
            self._payload_transferencia(referencia='REF-CRUZADA-1'),
            format='multipart',
        )
        self.assertEqual(resp.status_code, 409)
        self.assertIn('cobranza.Pago', resp.data['error'])

    def test_referencia_duplicada_contra_otra_recarga_cantina_es_rechazada(self):
        """Una referencia ya usada en una RecargaTarjeta pendiente/aprobada bloquea un nuevo intento."""
        RecargaTarjeta.objects.create(
            tarjeta=self.tarjeta2, metodo_pago='transferencia', monto_usd=Decimal('5.00'),
            banco_receptor=self.banco,
            tasa_aplicada=Decimal('40.0000'), monto_ves=Decimal('200.00'),
            referencia='REF-CRUZADA-2', estatus='pendiente', registrado_por_portal=True,
        )
        self.auth_portal()
        resp = self.client.post(
            '/api/portal/cantina/recargar/',
            self._payload_transferencia(referencia='REF-CRUZADA-2'),
            format='multipart',
        )
        self.assertEqual(resp.status_code, 409)
        self.assertIn('cantina.RecargaTarjeta', resp.data['error'])

    def test_monto_en_ves_deriva_usd_con_tasa_vigente(self):
        self.auth_portal()
        resp = self.client.post(
            '/api/portal/cantina/recargar/',
            self._payload_transferencia(monto_usd='', monto_ves='800.00', referencia='REF-VES-1'),
            format='multipart',
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        recarga = RecargaTarjeta.objects.get(pk=resp.data['id'])
        self.assertEqual(recarga.monto_ves, Decimal('800.00'))
        self.assertEqual(recarga.monto_usd, Decimal('20.00'))

    def test_sin_monto_es_rechazado(self):
        self.auth_portal()
        resp = self.client.post(
            '/api/portal/cantina/recargar/',
            self._payload_transferencia(monto_usd='', referencia='REF-SIN-MONTO'),
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)

    def test_zelle_no_requiere_banco_receptor(self):
        self.auth_portal()
        resp = self.client.post(
            '/api/portal/cantina/recargar/',
            self._payload_transferencia(
                metodo_pago='zelle', banco_receptor_id='', banco_procedencia='',
                referencia='REF-ZELLE-1',
            ),
            format='multipart',
        )
        self.assertEqual(resp.status_code, 201, resp.content)

    def test_efectivo_ves_no_requiere_referencia_ni_comprobante(self):
        self.auth_portal()
        resp = self.client.post(
            '/api/portal/cantina/recargar/',
            self._payload_transferencia(
                metodo_pago='efectivo_ves', banco_receptor_id='', banco_procedencia='',
                referencia='', archivo=None, monto_usd='', monto_ves='400.00',
            ),
            format='multipart',
        )
        self.assertEqual(resp.status_code, 201, resp.content)


# ──────────────────────────────────────────────────────────────────────────────
# CUENTA POR COBRAR (CxC) — solo lectura
# ──────────────────────────────────────────────────────────────────────────────

class PortalCuentaCantinaTests(PortalCantinaTestBase):
    URL = '/api/portal/cantina/cuenta/'

    def _cargo(self, rep, alumno, monto, area='cantina', estado='pendiente', pagado='0.00'):
        from cantina.models import CargoCantina, VentaCantina
        venta = VentaCantina.objects.create(
            alumno=alumno, cajero=self.user, metodo_pago='credito_representante',
            area=area, representante=rep, total_usd=Decimal(monto),
            tasa_aplicada=Decimal('40.0000'), total_ves=Decimal(monto) * 40,
        )
        return CargoCantina.objects.create(
            representante=rep, alumno=alumno, venta=venta, area=area,
            monto_usd=Decimal(monto), monto_pagado=Decimal(pagado), estado=estado,
        )

    def _abono(self, rep, uuid_, monto, metodo='zelle', estatus='completado'):
        from cantina.models import AbonoCantina
        return AbonoCantina.objects.create(
            operacion_uuid=uuid_, representante=rep, area='cantina', metodo_pago=metodo,
            monto_usd=Decimal(monto), tasa_aplicada=Decimal('40.0000'),
            monto_ves=Decimal(monto) * 40, cajero=self.user, estatus=estatus,
        )

    def test_requiere_autenticacion(self):
        self.assertEqual(self.client.get(self.URL).status_code, 401)

    def test_devuelve_saldo_por_area_y_excluye_anulados(self):
        self._cargo(self.rep, self.alumno, '3.00', area='cantina')
        self._cargo(self.rep, self.alumno, '4.00', area='libreria', pagado='1.00')
        self._cargo(self.rep, self.alumno, '9.00', estado='anulado')
        self.auth_portal()
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(Decimal(resp.data['saldo_usd']), Decimal('6.00'))
        por_area = {a['area']: Decimal(a['saldo_usd']) for a in resp.data['por_area']}
        self.assertEqual(por_area, {'cantina': Decimal('3.00'), 'libreria': Decimal('3.00')})
        self.assertEqual(len(resp.data['cargos']), 2)

    def test_abonos_agrupados_sin_anulados_ni_cajero(self):
        import uuid
        op = uuid.uuid4()
        self._abono(self.rep, op, '2.00', 'zelle')
        self._abono(self.rep, op, '1.00', 'pago_movil')
        self._abono(self.rep, uuid.uuid4(), '5.00', estatus='anulado')
        self.auth_portal()
        resp = self.client.get(self.URL)
        self.assertEqual(len(resp.data['abonos']), 1)
        abono = resp.data['abonos'][0]
        self.assertEqual(Decimal(abono['total_usd']), Decimal('3.00'))
        self.assertNotIn('cajero', abono)

    def test_representante_no_ve_la_cuenta_de_otro(self):
        import uuid
        self._cargo(self.rep2, self.alumno2, '7.00')
        self._abono(self.rep2, uuid.uuid4(), '1.00')
        self.auth_portal()  # rep1, sin deuda propia
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(Decimal(resp.data['saldo_usd']), Decimal('0.00'))
        self.assertEqual(resp.data['cargos'], [])
        self.assertEqual(resp.data['abonos'], [])
        # y rep2 sí ve lo suyo
        self.client.credentials()
        self.auth_portal(cedula=self.rep2.cedula, password='otra-clave-456')
        resp2 = self.client.get(self.URL)
        self.assertEqual(Decimal(resp2.data['saldo_usd']), Decimal('7.00'))
