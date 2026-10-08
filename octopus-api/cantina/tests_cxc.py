"""Tests de cuentas por cobrar (CxC) a representantes — PROMPT_CANTINA_CXC.md §3 y §5 (Agente A)."""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from cobranza.models import BancoInstitucional, Pago, TasaCambio
from pagos_comunes.referencias import buscar_referencia_duplicada
from secretaria.models import Alumno, ConfiguracionSistema, Representante

from . import services_cxc
from .models import (
    AbonoCantina,
    AperturaCajaCantina,
    CargoCantina,
    CreditoRepresentanteCantina,
    ParametroCantina,
    VentaCantina,
)

User = get_user_model()
BASE = '/api/cantina/cxc/'


def _usuario(username, rol):
    u = User.objects.create_user(username=username, password='password123')
    u.perfil.rol = rol
    u.perfil.esta_activo = True
    u.perfil.save()
    return u


class CxcBase(TestCase):
    def setUp(self):
        self.admin = _usuario('admin_cxc', 'administrador')
        self.cajero = _usuario('cajero_cxc', 'cajero')
        self.client_admin = APIClient()
        self.client_admin.force_authenticate(self.admin)
        self.client_cajero = APIClient()
        self.client_cajero.force_authenticate(self.cajero)

        TasaCambio.objects.create(valor_bs=Decimal('40.0000'))
        hoy = timezone.localdate()
        ConfiguracionSistema.objects.all().delete()
        ConfiguracionSistema.objects.create(
            fecha_inicio_inscripciones=date(hoy.year, 1, 1), fecha_fin_inscripciones=date(hoy.year, 12, 31),
            fecha_inicio_ano_escolar=date(hoy.year, 9, 1), fecha_fin_ano_escolar=date(hoy.year + 1, 7, 31),
            periodo_escolar_activo=f'{hoy.year}-{hoy.year + 1}',
        )
        ParametroCantina.objects.create(limite_credito_representante_default=Decimal('20.00'))

        self.banco = BancoInstitucional.objects.create(
            nombre='Banesco CxC', tipos=['transferencia', 'pago_movil', 'punto_de_venta', 'zelle'],
        )
        self.rep = Representante.objects.create(
            cedula='V-12345678', nombre='Maria', apellido='Gonzalez',
            telefono='0414-1111111', correo='m@example.com', direccion='X',
        )
        self.alumno = Alumno.objects.create(
            nombre='Luisito', apellido='Perez', cedula_escolar='CE-001',
            representante=self.rep, grado_seccion='3ro A',
        )
        self.apertura_cantina = AperturaCajaCantina.objects.create(
            cajero=self.cajero, monto_inicial=Decimal('0'), area='cantina',
        )
        self.apertura_admin = AperturaCajaCantina.objects.create(
            cajero=self.admin, monto_inicial=Decimal('0'), area='libreria',
        )

    def crear_cargo(self, monto, area='cantina', rep=None, alumno=None, creado_hace_dias=0):
        rep = rep or self.rep
        venta = VentaCantina.objects.create(
            cajero=self.cajero, metodo_pago='credito_representante', area=area,
            representante=rep, alumno=alumno or self.alumno,
            total_usd=Decimal(monto), tasa_aplicada=Decimal('40'), total_ves=Decimal(monto) * 40,
        )
        cargo = services_cxc.crear_cargo_por_venta(venta)
        if creado_hace_dias:
            CargoCantina.objects.filter(pk=cargo.pk).update(creado_en=timezone.now() - timedelta(days=creado_hace_dias))
            cargo.refresh_from_db()
        return cargo

    def linea_usd(self, monto, metodo='efectivo', **extra):
        d = {'metodo_pago': metodo, 'monto_usd': str(monto)}
        d.update(extra)
        return d

    def post_abono(self, client, lineas, **extra):
        body = {'representante_id': self.rep.id, 'lineas': lineas}
        body.update(extra)
        return client.post(BASE + 'abonos/', body, format='json')


# ─────────────────────────────────────────────
# Buscador
# ─────────────────────────────────────────────
class BuscadorTests(CxcBase):
    def setUp(self):
        super().setUp()
        self.otro = Representante.objects.create(
            cedula='V-99999999', nombre='Carlos', apellido='Ramirez',
            telefono='0412-2222222', correo='c@example.com', direccion='Y',
        )
        Alumno.objects.create(nombre='Sofia', apellido='Ramirez', representante=self.otro, grado_seccion='1ro B')

    def buscar(self, q):
        resp = self.client_cajero.get(BASE + 'buscar/', {'q': q})
        self.assertEqual(resp.status_code, 200, resp.content)
        return resp.json()

    def test_por_cedula_del_representante(self):
        data = self.buscar('12345678')
        self.assertEqual([r['id'] for r in data], [self.rep.id])

    def test_por_apellido_del_representante(self):
        data = self.buscar('gonzalez')
        self.assertEqual([r['id'] for r in data], [self.rep.id])

    def test_por_nombre_de_alumno(self):
        data = self.buscar('luisito')
        self.assertEqual([r['id'] for r in data], [self.rep.id])
        self.assertEqual(data[0]['alumnos'][0]['nombre'], 'Luisito')
        self.assertEqual(data[0]['alumnos'][0]['grado_seccion'], '3ro A')

    def test_por_cedula_escolar_del_alumno(self):
        self.assertEqual([r['id'] for r in self.buscar('CE-001')], [self.rep.id])

    def test_por_dos_palabras_cruzadas_representante_y_alumno(self):
        # 'maria' (representante) + 'luisito' (alumno): ambas deben matchear.
        self.assertEqual([r['id'] for r in self.buscar('maria luisito')], [self.rep.id])
        self.assertEqual(self.buscar('maria sofia'), [])

    def test_dos_palabras_apellido_comun_no_duplica(self):
        # Dos alumnos del mismo representante no deben duplicar el resultado.
        Alumno.objects.create(nombre='Pedro', apellido='Perez', representante=self.rep, grado_seccion='1ro A')
        data = self.buscar('perez')
        self.assertEqual([r['id'] for r in data], [self.rep.id])
        self.assertEqual(len(data[0]['alumnos']), 2)

    def test_inactivos_excluidos(self):
        self.otro.activo = False
        self.otro.save()
        self.assertEqual(self.buscar('ramirez'), [])

    def test_alumno_inactivo_no_aporta_match(self):
        Alumno.objects.filter(nombre='Sofia').update(activo=False)
        self.assertEqual(self.buscar('sofia'), [])

    def test_consulta_corta_es_400(self):
        resp = self.client_cajero.get(BASE + 'buscar/', {'q': 'a'})
        self.assertEqual(resp.status_code, 400)

    def test_incluye_saldo_limite_y_bloqueo(self):
        self.crear_cargo('7.50')
        CreditoRepresentanteCantina.objects.create(representante=self.rep, limite_usd=Decimal('50'), bloqueado=True)
        r = self.buscar('gonzalez')[0]
        self.assertEqual(Decimal(r['saldo_usd']), Decimal('7.50'))
        self.assertEqual(Decimal(r['limite_usd']), Decimal('50'))
        self.assertTrue(r['bloqueado'])

    def test_sin_autenticar_o_sin_rol_es_denegado(self):
        self.assertEqual(APIClient().get(BASE + 'buscar/', {'q': 'maria'}).status_code, 401)
        docente = _usuario('docente_cxc', 'docente')
        c = APIClient()
        c.force_authenticate(docente)
        self.assertEqual(c.get(BASE + 'buscar/', {'q': 'maria'}).status_code, 403)

    def test_sin_n_mas_uno(self):
        for i in range(5):
            r = Representante.objects.create(
                cedula=f'V-5000{i}', nombre='Zeta', apellido=f'Apellido{i}',
                telefono='1', correo='z@example.com', direccion='Z',
            )
            Alumno.objects.create(nombre='Hijo', apellido=f'A{i}', representante=r)
        with self.assertNumQueries(4):
            self.buscar('zeta')


# ─────────────────────────────────────────────
# Cargos y límites
# ─────────────────────────────────────────────
class CargoTests(CxcBase):
    def test_crea_cargo_y_saldo_por_area(self):
        self.crear_cargo('5.00', area='cantina')
        self.crear_cargo('3.00', area='libreria')
        self.assertEqual(services_cxc.saldo_representante(self.rep), Decimal('8.00'))
        self.assertEqual(services_cxc.saldo_representante(self.rep, 'libreria'), Decimal('3.00'))

    def test_credito_excedido_falla(self):
        self.crear_cargo('15.00')
        venta = VentaCantina.objects.create(
            cajero=self.cajero, metodo_pago='credito_representante', area='cantina',
            representante=self.rep, total_usd=Decimal('6.00'), tasa_aplicada=Decimal('40'), total_ves=Decimal('240'),
        )
        with self.assertRaises(ValidationError):
            services_cxc.crear_cargo_por_venta(venta)
        self.assertFalse(CargoCantina.objects.filter(venta=venta).exists())

    def test_exactamente_en_el_limite_pasa(self):
        self.crear_cargo('20.00')
        self.assertEqual(services_cxc.saldo_representante(self.rep), Decimal('20.00'))

    def test_override_de_limite(self):
        CreditoRepresentanteCantina.objects.create(representante=self.rep, limite_usd=Decimal('100'))
        self.assertEqual(services_cxc.limite_credito(self.rep), Decimal('100'))
        self.crear_cargo('50.00')

    def test_bloqueado_falla(self):
        CreditoRepresentanteCantina.objects.create(representante=self.rep, bloqueado=True)
        with self.assertRaises(ValidationError):
            self.crear_cargo('1.00')

    def test_anular_cargo_sin_abonos(self):
        cargo = self.crear_cargo('4.00')
        services_cxc.anular_cargo_por_venta(cargo.venta, self.admin)
        cargo.refresh_from_db()
        self.assertEqual(cargo.estado, 'anulado')
        self.assertEqual(services_cxc.saldo_representante(self.rep), Decimal('0.00'))

    def test_anular_cargo_con_abonos_falla(self):
        cargo = self.crear_cargo('4.00')
        self.assertEqual(self.post_abono(self.client_cajero, [self.linea_usd('1.00')]).status_code, 201)
        with self.assertRaises(ValidationError):
            services_cxc.anular_cargo_por_venta(cargo.venta, self.admin)
        cargo.refresh_from_db()
        self.assertNotEqual(cargo.estado, 'anulado')

    def test_patch_credito_solo_admin(self):
        url = f'{BASE}representantes/{self.rep.id}/credito/'
        self.assertEqual(self.client_cajero.patch(url, {'bloqueado': True}, format='json').status_code, 403)
        resp = self.client_admin.patch(url, {'limite_usd': '35.00', 'bloqueado': True}, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(Decimal(resp.json()['limite_usd']), Decimal('35.00'))
        self.assertTrue(resp.json()['bloqueado'])
        # null vuelve al default
        resp = self.client_admin.patch(url, {'limite_usd': None}, format='json')
        self.assertEqual(Decimal(resp.json()['limite_usd']), Decimal('20.00'))


# ─────────────────────────────────────────────
# Abonos
# ─────────────────────────────────────────────
class AbonoTests(CxcBase):
    def test_abono_simple_efectivo(self):
        self.crear_cargo('10.00')
        resp = self.post_abono(self.client_cajero, [self.linea_usd('4.00')])
        self.assertEqual(resp.status_code, 201, resp.content)
        data = resp.json()
        self.assertEqual(Decimal(data['saldo_usd']), Decimal('6.00'))
        self.assertEqual(Decimal(data['total_usd']), Decimal('4.00'))
        self.assertEqual(data['area'], 'cantina')
        ab = AbonoCantina.objects.get()
        self.assertEqual(ab.apertura_id, self.apertura_cantina.id)
        self.assertEqual(ab.monto_ves, Decimal('160.00'))
        self.assertEqual(ab.tasa_aplicada, Decimal('40.0000'))
        self.assertFalse(ab.es_retroactivo)

    def test_abono_mixto_zelle_y_pago_movil(self):
        self.crear_cargo('10.00')
        lineas = [
            self.linea_usd('4.00', 'zelle', banco_receptor=self.banco.id, referencia='ZL-1001'),
            {'metodo_pago': 'pago_movil', 'monto_ves': '120.00', 'banco_receptor': self.banco.id,
             'banco_procedencia': 'Mercantil', 'referencia': '654321'},
        ]
        resp = self.post_abono(self.client_cajero, lineas)
        self.assertEqual(resp.status_code, 201, resp.content)
        data = resp.json()
        self.assertEqual(len(data['lineas']), 2)
        self.assertEqual(Decimal(data['total_usd']), Decimal('7.00'))  # 4 + 120/40
        self.assertEqual(Decimal(data['saldo_usd']), Decimal('3.00'))
        self.assertEqual(AbonoCantina.objects.values('operacion_uuid').distinct().count(), 1)

    def test_abono_en_bolivares_calcula_usd_con_tasa(self):
        self.crear_cargo('10.00')
        resp = self.post_abono(self.client_cajero, [{'metodo_pago': 'efectivo_ves', 'monto_ves': '200.00'}])
        self.assertEqual(resp.status_code, 201, resp.content)
        ab = AbonoCantina.objects.get()
        self.assertEqual(ab.monto_usd, Decimal('5.00'))
        self.assertEqual(ab.monto_ves, Decimal('200.00'))

    def test_bolivares_sin_monto_ves_es_400(self):
        self.crear_cargo('10.00')
        resp = self.post_abono(self.client_cajero, [{'metodo_pago': 'efectivo_ves', 'monto_usd': '5'}])
        self.assertEqual(resp.status_code, 400)

    def test_divisas_sin_monto_usd_es_400(self):
        self.crear_cargo('10.00')
        resp = self.post_abono(self.client_cajero, [{'metodo_pago': 'efectivo', 'monto_ves': '200'}])
        self.assertEqual(resp.status_code, 400)

    def test_metodo_invalido_es_400(self):
        self.crear_cargo('10.00')
        resp = self.post_abono(self.client_cajero, [self.linea_usd('1', 'bitcoin')])
        self.assertEqual(resp.status_code, 400)

    def test_bancarios_exigen_banco_y_referencia(self):
        self.crear_cargo('10.00')
        sin_banco = self.post_abono(self.client_cajero, [self.linea_usd('1', 'zelle', referencia='ABC')])
        sin_ref = self.post_abono(self.client_cajero, [self.linea_usd('1', 'zelle', banco_receptor=self.banco.id)])
        self.assertEqual(sin_banco.status_code, 400)
        self.assertEqual(sin_ref.status_code, 400)

    def test_punto_de_venta_exige_lote_4_digitos(self):
        self.crear_cargo('10.00')
        base = {'metodo_pago': 'punto_de_venta', 'monto_ves': '80', 'banco_receptor': self.banco.id, 'referencia': '1234'}
        self.assertEqual(self.post_abono(self.client_cajero, [dict(base, numero_lote='12')]).status_code, 400)
        self.assertEqual(self.post_abono(self.client_cajero, [base]).status_code, 400)
        self.assertEqual(self.post_abono(self.client_cajero, [dict(base, numero_lote='0042')]).status_code, 201)

    def test_fifo_parcial(self):
        c1 = self.crear_cargo('5.00', creado_hace_dias=3)
        c2 = self.crear_cargo('5.00', creado_hace_dias=2)
        c3 = self.crear_cargo('5.00', creado_hace_dias=1)
        resp = self.post_abono(self.client_cajero, [self.linea_usd('7.00')])
        self.assertEqual(resp.status_code, 201, resp.content)
        for c in (c1, c2, c3):
            c.refresh_from_db()
        self.assertEqual((c1.monto_pagado, c1.estado), (Decimal('5.00'), 'pagado'))
        self.assertEqual((c2.monto_pagado, c2.estado), (Decimal('2.00'), 'pendiente'))
        self.assertEqual((c3.monto_pagado, c3.estado), (Decimal('0.00'), 'pendiente'))
        # un segundo abono continúa donde quedó el primero
        self.assertEqual(self.post_abono(self.client_cajero, [self.linea_usd('4.00')]).status_code, 201)
        for c in (c2, c3):
            c.refresh_from_db()
        self.assertEqual((c2.monto_pagado, c2.estado), (Decimal('5.00'), 'pagado'))
        self.assertEqual((c3.monto_pagado, c3.estado), (Decimal('1.00'), 'pendiente'))

    def test_fifo_con_lineas_mixtas(self):
        c1 = self.crear_cargo('3.00', creado_hace_dias=2)
        c2 = self.crear_cargo('3.00', creado_hace_dias=1)
        resp = self.post_abono(self.client_cajero, [self.linea_usd('2.00'), self.linea_usd('3.50')])
        self.assertEqual(resp.status_code, 201, resp.content)
        c1.refresh_from_db()
        c2.refresh_from_db()
        self.assertEqual(c1.monto_pagado, Decimal('3.00'))
        self.assertEqual(c2.monto_pagado, Decimal('2.50'))

    def test_abono_mayor_que_deuda_es_400(self):
        self.crear_cargo('5.00')
        resp = self.post_abono(self.client_cajero, [self.linea_usd('5.01')])
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(AbonoCantina.objects.exists())

    def test_abono_sin_deuda_es_400(self):
        resp = self.post_abono(self.client_cajero, [self.linea_usd('1.00')])
        self.assertEqual(resp.status_code, 400)

    def test_abono_sin_caja_abierta_es_400(self):
        self.crear_cargo('5.00')
        AperturaCajaCantina.objects.filter(cajero=self.cajero).update(estado='cerrada')
        resp = self.post_abono(self.client_cajero, [self.linea_usd('1.00')])
        self.assertEqual(resp.status_code, 400)

    def test_abono_cruza_areas_y_hereda_area_de_la_apertura(self):
        cargo = self.crear_cargo('5.00', area='libreria')
        resp = self.post_abono(self.client_cajero, [self.linea_usd('5.00')])
        self.assertEqual(resp.status_code, 201, resp.content)
        ab = AbonoCantina.objects.get()
        self.assertEqual(ab.area, 'cantina')  # área de la caja
        self.assertEqual(ab.aplicaciones.get().cargo.area, 'libreria')
        cargo.refresh_from_db()
        self.assertEqual(cargo.estado, 'pagado')

    def test_referencia_duplicada_contra_cobranza_pago(self):
        self.crear_cargo('10.00')
        Pago.objects.create(
            alumno=self.alumno, usuario_receptor=self.admin, metodo_pago='zelle',
            banco_receptor=self.banco, monto_usd=Decimal('10'), tasa_aplicada=Decimal('40'),
            monto_ves=Decimal('400'), referencia='DUP-777',
        )
        resp = self.post_abono(
            self.client_cajero,
            [self.linea_usd('2', 'zelle', banco_receptor=self.banco.id, referencia='dup-777')],
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('cobranza.Pago', str(resp.json()))

    def test_referencia_duplicada_entre_abonos(self):
        self.crear_cargo('10.00')
        linea = self.linea_usd('2', 'zelle', banco_receptor=self.banco.id, referencia='UNICA-1')
        self.assertEqual(self.post_abono(self.client_cajero, [linea]).status_code, 201)
        resp = self.post_abono(self.client_cajero, [linea])
        self.assertEqual(resp.status_code, 400)
        self.assertIn('cantina.AbonoCantina', str(resp.json()))

    def test_referencia_repetida_dentro_de_la_misma_operacion(self):
        self.crear_cargo('10.00')
        linea = self.linea_usd('2', 'zelle', banco_receptor=self.banco.id, referencia='MISMA-1')
        resp = self.post_abono(self.client_cajero, [linea, dict(linea)])
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(AbonoCantina.objects.exists())

    def test_misma_referencia_otro_metodo_no_es_duplicado(self):
        self.crear_cargo('10.00')
        a = self.linea_usd('2', 'zelle', banco_receptor=self.banco.id, referencia='555555')
        b = {'metodo_pago': 'pago_movil', 'monto_ves': '80', 'banco_receptor': self.banco.id, 'referencia': '555555'}
        self.assertEqual(self.post_abono(self.client_cajero, [a, b]).status_code, 201)

    def test_buscar_referencia_duplicada_ve_abonos_y_ventas(self):
        self.crear_cargo('10.00')
        self.assertEqual(self.post_abono(
            self.client_cajero, [self.linea_usd('2', 'zelle', banco_receptor=self.banco.id, referencia='AB-1')],
        ).status_code, 201)
        dup = buscar_referencia_duplicada('AB-1', metodo_pago='zelle', banco_receptor_id=self.banco.id)
        self.assertEqual(dup['origen'], 'cantina.AbonoCantina')
        self.assertIsNone(buscar_referencia_duplicada(
            'AB-1', metodo_pago='zelle', banco_receptor_id=self.banco.id,
            excluir_abono_id=AbonoCantina.objects.get().pk,
        ))
        VentaCantina.objects.create(
            cajero=self.cajero, metodo_pago='transferencia', area='libreria', banco_receptor=self.banco,
            referencia='VT-9', total_usd=Decimal('1'), tasa_aplicada=Decimal('40'), total_ves=Decimal('40'),
        )
        self.assertEqual(buscar_referencia_duplicada('VT-9')['origen'], 'cantina.VentaCantina')


# ─────────────────────────────────────────────
# Retroactivo
# ─────────────────────────────────────────────
class RetroactivoTests(CxcBase):
    def fecha_pasada(self, dias=10):
        return (timezone.localdate() - timedelta(days=dias)).isoformat()

    def test_retroactivo_por_cajero_es_403(self):
        self.crear_cargo('10.00', creado_hace_dias=20)
        resp = self.post_abono(
            self.client_cajero, [self.linea_usd('2')],
            fecha_pago=self.fecha_pasada(), motivo='Pago recibido la semana pasada',
        )
        self.assertEqual(resp.status_code, 403)
        self.assertFalse(AbonoCantina.objects.exists())

    def test_retroactivo_admin_ok_sin_apertura(self):
        self.crear_cargo('10.00', creado_hace_dias=20)
        resp = self.post_abono(
            self.client_admin, [self.linea_usd('2')],
            fecha_pago=self.fecha_pasada(), motivo='Pago recibido la semana pasada',
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        ab = AbonoCantina.objects.get()
        self.assertTrue(ab.es_retroactivo)
        self.assertIsNone(ab.apertura_id)
        self.assertEqual(ab.area, 'cantina')  # área del cargo más antiguo
        self.assertEqual(timezone.localtime(ab.fecha_pago).date().isoformat(), self.fecha_pasada())

    def test_retroactivo_sin_motivo_o_motivo_corto_es_400(self):
        self.crear_cargo('10.00', creado_hace_dias=20)
        for motivo in ('', 'corto'):
            resp = self.post_abono(
                self.client_admin, [self.linea_usd('2')], fecha_pago=self.fecha_pasada(), motivo=motivo,
            )
            self.assertEqual(resp.status_code, 400, motivo)

    def test_retroactivo_en_bolivares_sin_tasa_es_400_y_con_tasa_usa_la_tasa(self):
        self.crear_cargo('10.00', creado_hace_dias=20)
        linea = {'metodo_pago': 'efectivo_ves', 'monto_ves': '100'}
        kw = dict(fecha_pago=self.fecha_pasada(), motivo='Pago retroactivo en bolívares')
        self.assertEqual(self.post_abono(self.client_admin, [linea], **kw).status_code, 400)
        resp = self.post_abono(self.client_admin, [dict(linea, tasa_aplicada='25.0000')], **kw)
        self.assertEqual(resp.status_code, 201, resp.content)
        ab = AbonoCantina.objects.get()
        self.assertEqual(ab.tasa_aplicada, Decimal('25.0000'))
        self.assertEqual(ab.monto_usd, Decimal('4.00'))

    def test_retroactivo_fuera_de_periodo_es_400(self):
        self.crear_cargo('10.00', creado_hace_dias=20)
        ConfiguracionSistema.objects.all().update(periodo_escolar_activo='2019-2020')
        resp = self.post_abono(
            self.client_admin, [self.linea_usd('2')],
            fecha_pago=self.fecha_pasada(), motivo='Pago retroactivo fuera de periodo',
        )
        self.assertEqual(resp.status_code, 400)

    def test_fecha_futura_no_es_retroactivo_y_exige_caja(self):
        # Una fecha futura no se trata como retroactivo: cae al flujo de caja
        # (se ignora la fecha, se usa ahora).
        self.crear_cargo('10.00')
        futura = (timezone.localdate() + timedelta(days=3)).isoformat()
        resp = self.post_abono(self.client_admin, [self.linea_usd('2')], fecha_pago=futura)
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertFalse(AbonoCantina.objects.get().es_retroactivo)

    def test_retroactivo_no_altera_aperturas(self):
        self.crear_cargo('10.00', creado_hace_dias=20)
        self.post_abono(
            self.client_admin, [self.linea_usd('2')],
            fecha_pago=self.fecha_pasada(), motivo='Pago retroactivo sin caja',
        )
        self.assertEqual(self.apertura_admin.abonos.count(), 0)


# ─────────────────────────────────────────────
# Anulación
# ─────────────────────────────────────────────
class AnulacionTests(CxcBase):
    def test_anular_abono_revierte_aplicaciones(self):
        c1 = self.crear_cargo('5.00', creado_hace_dias=2)
        c2 = self.crear_cargo('5.00', creado_hace_dias=1)
        resp = self.post_abono(self.client_cajero, [self.linea_usd('7.00')])
        op = resp.json()['operacion_uuid']
        c1.refresh_from_db()
        self.assertEqual(c1.estado, 'pagado')

        denegado = self.client_cajero.post(f'{BASE}abonos/{op}/anular/', {'motivo': 'error de caja'}, format='json')
        self.assertEqual(denegado.status_code, 403)

        resp = self.client_admin.post(f'{BASE}abonos/{op}/anular/', {'motivo': 'error de caja'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(Decimal(resp.json()['saldo_usd']), Decimal('10.00'))
        for c in (c1, c2):
            c.refresh_from_db()
            self.assertEqual(c.monto_pagado, Decimal('0.00'))
            self.assertEqual(c.estado, 'pendiente')
        ab = AbonoCantina.objects.get()
        self.assertEqual(ab.estatus, 'anulado')
        self.assertEqual(ab.anulado_por_id, self.admin.id)
        self.assertIn('error de caja', ab.motivo)

    def test_anular_dos_veces_es_400(self):
        self.crear_cargo('5.00')
        op = self.post_abono(self.client_cajero, [self.linea_usd('2.00')]).json()['operacion_uuid']
        url = f'{BASE}abonos/{op}/anular/'
        self.assertEqual(self.client_admin.post(url, {'motivo': 'x'}, format='json').status_code, 200)
        self.assertEqual(self.client_admin.post(url, {'motivo': 'x'}, format='json').status_code, 400)

    def test_anular_abono_libera_la_referencia(self):
        self.crear_cargo('5.00')
        linea = self.linea_usd('2', 'zelle', banco_receptor=self.banco.id, referencia='LIBRE-1')
        op = self.post_abono(self.client_cajero, [linea]).json()['operacion_uuid']
        self.client_admin.post(f'{BASE}abonos/{op}/anular/', {'motivo': 'reverso'}, format='json')
        self.assertEqual(self.post_abono(self.client_cajero, [linea]).status_code, 201)

    def test_anular_abono_inexistente_es_400(self):
        resp = self.client_admin.post(
            f'{BASE}abonos/00000000-0000-0000-0000-000000000000/anular/', {'motivo': 'x'}, format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_anular_cargo_tras_anular_abono_ok(self):
        cargo = self.crear_cargo('5.00')
        op = self.post_abono(self.client_cajero, [self.linea_usd('2.00')]).json()['operacion_uuid']
        self.client_admin.post(f'{BASE}abonos/{op}/anular/', {'motivo': 'reverso'}, format='json')
        services_cxc.anular_cargo_por_venta(cargo.venta, self.admin)
        cargo.refresh_from_db()
        self.assertEqual(cargo.estado, 'anulado')


# ─────────────────────────────────────────────
# Cuentas, estado de cuenta, Excel, recibo
# ─────────────────────────────────────────────
class ConsultasTests(CxcBase):
    def test_cuentas_lista_paginada_con_dias_y_areas(self):
        self.crear_cargo('5.00', area='cantina', creado_hace_dias=10)
        self.crear_cargo('3.00', area='libreria', creado_hace_dias=2)
        otro = Representante.objects.create(
            cedula='V-1', nombre='Sin', apellido='Deuda', telefono='1', correo='s@example.com', direccion='S',
        )
        resp = self.client_cajero.get(BASE + 'cuentas/', {'con_deuda': '1'})
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertEqual(data['count'], 1)
        fila = data['results'][0]
        self.assertEqual(fila['id'], self.rep.id)
        self.assertEqual(Decimal(fila['saldo_usd']), Decimal('8.00'))
        self.assertEqual(Decimal(fila['saldo_cantina_usd']), Decimal('5.00'))
        self.assertEqual(Decimal(fila['saldo_libreria_usd']), Decimal('3.00'))
        self.assertEqual(fila['dias_deuda_mas_antigua'], 10)
        self.assertEqual(fila['saldo_ves_tasa_vigente'], '320.00')
        self.assertNotIn(otro.id, [r['id'] for r in data['results']])

    def test_cuentas_filtra_por_area(self):
        self.crear_cargo('5.00', area='cantina')
        self.crear_cargo('3.00', area='libreria')
        resp = self.client_cajero.get(BASE + 'cuentas/', {'area': 'libreria'})
        fila = resp.json()['results'][0]
        self.assertEqual(Decimal(fila['saldo_usd']), Decimal('3.00'))
        self.assertEqual(self.client_cajero.get(BASE + 'cuentas/', {'area': 'otra'}).status_code, 400)

    def test_cuentas_con_deuda_excluye_saldadas(self):
        self.crear_cargo('5.00')
        self.post_abono(self.client_cajero, [self.linea_usd('5.00')])
        self.assertEqual(self.client_cajero.get(BASE + 'cuentas/', {'con_deuda': '1'}).json()['count'], 0)
        self.assertEqual(self.client_cajero.get(BASE + 'cuentas/').json()['count'], 1)

    def test_excel_solo_admin(self):
        self.crear_cargo('5.00')
        self.assertEqual(self.client_cajero.get(BASE + 'cuentas/excel/').status_code, 403)
        resp = self.client_admin.get(BASE + 'cuentas/excel/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('spreadsheetml', resp['Content-Type'])

    def test_estado_de_cuenta(self):
        self.crear_cargo('5.00', area='cantina')
        self.crear_cargo('3.00', area='libreria')
        self.post_abono(self.client_cajero, [self.linea_usd('1.00'), self.linea_usd('1.00', 'efectivo')])
        resp = self.client_cajero.get(f'{BASE}representantes/{self.rep.id}/estado-cuenta/')
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertEqual(Decimal(data['saldo_usd']), Decimal('6.00'))
        self.assertEqual(data['saldo_ves_tasa_vigente'], '240.00')
        self.assertEqual(Decimal(data['limite_usd']), Decimal('20.00'))
        self.assertEqual(len(data['cargos']), 2)
        self.assertEqual(data['cargos'][0]['alumno_nombre'], 'Luisito Perez')
        self.assertEqual(len(data['abonos']), 1)
        self.assertEqual(len(data['abonos'][0]['lineas']), 2)
        self.assertEqual(Decimal(data['abonos'][0]['total_usd']), Decimal('2.00'))
        self.assertEqual(data['abonos'][0]['estatus'], 'completado')

        solo_lib = self.client_cajero.get(f'{BASE}representantes/{self.rep.id}/estado-cuenta/', {'area': 'libreria'}).json()
        self.assertEqual(Decimal(solo_lib['saldo_usd']), Decimal('3.00'))
        self.assertEqual(len(solo_lib['cargos']), 1)
        self.assertEqual(solo_lib['abonos'], [])  # el abono fue en la caja de cantina

    def test_estado_de_cuenta_representante_inexistente_404(self):
        self.assertEqual(self.client_cajero.get(f'{BASE}representantes/999999/estado-cuenta/').status_code, 404)

    def test_recibo_pdf(self):
        self.crear_cargo('5.00')
        op = self.post_abono(self.client_cajero, [self.linea_usd('2.00')]).json()['operacion_uuid']
        resp = self.client_cajero.get(f'{BASE}abonos/{op}/recibo/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp['Content-Type'], 'application/pdf')
        self.assertTrue(b''.join(resp.streaming_content).startswith(b'%PDF'))
        self.assertEqual(
            self.client_cajero.get(f'{BASE}abonos/00000000-0000-0000-0000-000000000000/recibo/').status_code, 404,
        )

    def test_punto_de_venta_misma_referencia_distinto_lote_no_es_duplicado(self):
        VentaCantina.objects.create(
            cajero=self.cajero, metodo_pago='punto_de_venta', area='libreria', banco_receptor=self.banco,
            referencia='1234', numero_lote='0001', total_usd=Decimal('1'),
            tasa_aplicada=Decimal('40'), total_ves=Decimal('40'),
        )
        kw = dict(metodo_pago='punto_de_venta', banco_receptor_id=self.banco.id)
        self.assertIsNone(buscar_referencia_duplicada('1234', numero_lote='0002', **kw))
        self.assertEqual(
            buscar_referencia_duplicada('1234', numero_lote='0001', **kw)['origen'], 'cantina.VentaCantina',
        )
