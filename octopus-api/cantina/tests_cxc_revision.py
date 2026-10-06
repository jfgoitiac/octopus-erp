"""Tests de los hallazgos de revisión del backend de CxC (locks, inactivos, retroactivo,
entradas mal tipadas, redondeo en Bs, constraints)."""
from datetime import timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.db import connection
from django.utils import timezone

from secretaria.models import Alumno, Representante

from . import services_cxc
from .models import AbonoCantina, AplicacionAbonoCantina, CargoCantina, CreditoRepresentanteCantina
from .tests_cxc import BASE, CxcBase


class OrdenDeLocksTests(CxcBase):
    def test_anular_abono_bloquea_representante_antes_que_cargos_y_sin_n_mas_uno(self):
        for i in range(4):
            self.crear_cargo('2.00', creado_hace_dias=10 - i)
        op = self.post_abono(
            self.client_cajero, [self.linea_usd('3.00'), self.linea_usd('4.00')],
        ).json()['operacion_uuid']

        with CaptureQueriesContext(connection) as ctx:
            services_cxc.anular_abono(op, self.admin, 'reverso de prueba')
        sqls = [q['sql'] for q in ctx.captured_queries]
        idx_rep = next(i for i, q in enumerate(sqls) if 'FROM "secretaria_representante"' in q)
        idx_cargo = next(i for i, q in enumerate(sqls) if 'FROM "cantina_cargocantina"' in q)
        self.assertLess(idx_rep, idx_cargo)
        # Una sola consulta de cargos (sin N+1 por aplicación).
        self.assertEqual(sum('FROM "cantina_cargocantina"' in q for q in sqls), 1)
        self.assertEqual(services_cxc.saldo_representante(self.rep), Decimal('8.00'))
        self.assertTrue(all(a.estatus == 'anulado' for a in AbonoCantina.objects.all()))
        for c in CargoCantina.objects.all():
            self.assertEqual(c.monto_pagado, Decimal('0.00'))
            self.assertEqual(c.estado, 'pendiente')

    def test_anular_cargo_por_venta_bloquea_representante_primero(self):
        cargo = self.crear_cargo('4.00')
        with CaptureQueriesContext(connection) as ctx:
            services_cxc.anular_cargo_por_venta(cargo.venta, self.admin)
        sqls = [q['sql'] for q in ctx.captured_queries]
        idx_rep = next(i for i, q in enumerate(sqls) if 'FROM "secretaria_representante"' in q)
        idx_cargo = next(i for i, q in enumerate(sqls) if 'FROM "cantina_cargocantina"' in q)
        self.assertLess(idx_rep, idx_cargo)


class RepresentanteInactivoConDeudaTests(CxcBase):
    def setUp(self):
        super().setUp()
        self.crear_cargo('10.00')
        self.rep.activo = False
        self.rep.save()

    def test_aparece_en_cuentas_y_excel(self):
        resp = self.client_cajero.get(BASE + 'cuentas/')
        self.assertEqual([r['id'] for r in resp.json()['results']], [self.rep.id])
        self.assertEqual(self.client_admin.get(BASE + 'cuentas/excel/').status_code, 200)

    def test_estado_de_cuenta_ok(self):
        resp = self.client_cajero.get(f'{BASE}representantes/{self.rep.id}/estado-cuenta/')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(Decimal(resp.json()['saldo_usd']), Decimal('10.00'))
        self.assertIn('limite_personalizado', resp.json())
        self.assertFalse(resp.json()['limite_personalizado'])

    def test_se_puede_abonar(self):
        resp = self.post_abono(self.client_cajero, [self.linea_usd('4.00')])
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(Decimal(resp.json()['saldo_usd']), Decimal('6.00'))

    def test_credito_patch_ok_y_devuelve_limite_personalizado(self):
        url = f'{BASE}representantes/{self.rep.id}/credito/'
        resp = self.client_admin.patch(url, {'limite_usd': '50.00'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertTrue(resp.json()['limite_personalizado'])
        est = self.client_cajero.get(f'{BASE}representantes/{self.rep.id}/estado-cuenta/').json()
        self.assertTrue(est['limite_personalizado'])
        self.assertEqual(Decimal(est['limite_usd']), Decimal('50.00'))

    def test_buscador_lo_encuentra_con_saldo_pero_no_sin_saldo(self):
        resp = self.client_cajero.get(BASE + 'buscar/', {'q': 'gonzalez'})
        self.assertEqual([r['id'] for r in resp.json()], [self.rep.id])
        self.post_abono(self.client_cajero, [self.linea_usd('10.00')])
        resp = self.client_cajero.get(BASE + 'buscar/', {'q': 'gonzalez'})
        self.assertEqual(resp.json(), [])


class RetroactivoFifoTests(CxcBase):
    def fecha_pasada(self, dias=10):
        return (timezone.localdate() - timedelta(days=dias)).isoformat()

    def test_retroactivo_no_aplica_a_cargos_posteriores_a_la_fecha(self):
        antiguo = self.crear_cargo('5.00', creado_hace_dias=20)
        reciente = self.crear_cargo('5.00')
        kw = dict(fecha_pago=self.fecha_pasada(), motivo='Pago recibido hace diez dias')
        # Solo existe $5 de deuda a esa fecha: $8 excede.
        self.assertEqual(self.post_abono(self.client_admin, [self.linea_usd('8.00')], **kw).status_code, 400)
        self.assertEqual(self.post_abono(self.client_admin, [self.linea_usd('5.00')], **kw).status_code, 201)
        antiguo.refresh_from_db()
        reciente.refresh_from_db()
        self.assertEqual(antiguo.estado, 'pagado')
        self.assertEqual(reciente.monto_pagado, Decimal('0.00'))
        self.assertEqual(AplicacionAbonoCantina.objects.filter(cargo=reciente).count(), 0)

    def test_retroactivo_sin_cargos_a_esa_fecha_es_400(self):
        self.crear_cargo('5.00')
        resp = self.post_abono(
            self.client_admin, [self.linea_usd('1.00')],
            fecha_pago=self.fecha_pasada(), motivo='Pago recibido hace diez dias',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(AbonoCantina.objects.exists())


class EntradasMalTipadasTests(CxcBase):
    def setUp(self):
        super().setUp()
        self.crear_cargo('10.00')

    def assert_400(self, lineas, **extra):
        resp = self.post_abono(self.client_cajero, lineas, **extra)
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertFalse(AbonoCantina.objects.exists())

    def test_metodo_pago_mal_tipado(self):
        for valor in (123, {}, {'a': 1}, [1], True):
            self.assert_400([{'metodo_pago': valor, 'monto_usd': '1'}])

    def test_referencia_y_procedencia_numericas_no_rompen(self):
        resp = self.post_abono(self.client_cajero, [self.linea_usd(
            '1', 'zelle', banco_receptor=self.banco.id, referencia=123456, banco_procedencia=777,
        )])
        self.assertEqual(resp.status_code, 201, resp.content)
        ab = AbonoCantina.objects.get()
        self.assertEqual(ab.referencia, '123456')
        self.assertEqual(ab.banco_procedencia, '777')

    def test_referencia_dict_es_400(self):
        self.assert_400([self.linea_usd('1', 'zelle', banco_receptor=self.banco.id, referencia={'a': 1})])

    def test_banco_receptor_no_entero(self):
        for valor in ('abc', {'a': 1}, [1], True, 1.5):
            self.assert_400([self.linea_usd('1', 'zelle', banco_receptor=valor, referencia='ZZ-1')])

    def test_montos_y_tasa_absurdos(self):
        self.assert_400([self.linea_usd('1e400')])
        self.assert_400([self.linea_usd('999999999999')])
        self.assert_400([{'metodo_pago': 'efectivo_ves', 'monto_ves': '1e30'}])
        self.assert_400([{'metodo_pago': 'efectivo_ves', 'monto_ves': '99999999999999999999999'}])
        self.assert_400([self.linea_usd('abc')])
        self.assert_400([self.linea_usd({'x': 1})])
        retro = dict(fecha_pago=(timezone.localdate() - timedelta(days=5)).isoformat(), motivo='Pago retroactivo largo')
        resp = self.post_abono(self.client_admin, [{
            'metodo_pago': 'efectivo_ves', 'monto_ves': '100', 'tasa_aplicada': '1e30',
        }], **retro)
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_representante_id_mal_tipado_en_abono(self):
        for valor in ('abc', {}, [1]):
            resp = self.client_cajero.post(
                BASE + 'abonos/', {'representante_id': valor, 'lineas': [self.linea_usd('1')]}, format='json',
            )
            self.assertEqual(resp.status_code, 400, resp.content)

    def venta(self, **body):
        data = {'items': [{'producto_id': 1, 'cantidad': 1}], 'metodo_pago': 'credito_representante'}
        data.update(body)
        return self.client_cajero.post('/api/cantina/ventas/registrar/', data, format='json')

    def test_venta_ids_y_metodo_mal_tipados(self):
        for valor in ('abc', {}, [1]):
            self.assertEqual(self.venta(representante_id=valor).status_code, 400, valor)
            self.assertEqual(self.venta(representante_id=self.rep.id, alumno_id=valor).status_code, 400, valor)
            self.assertEqual(self.venta(metodo_pago=valor).status_code, 400, valor)
        self.assertEqual(self.venta(metodo_pago=123).status_code, 400)
        for valor in ('abc', {}, [1]):
            resp = self.venta(metodo_pago='transferencia', banco_receptor=valor, referencia='123456')
            self.assertEqual(resp.status_code, 400, valor)
        resp = self.venta(metodo_pago='transferencia', banco_receptor=self.banco.id, referencia={'a': 1})
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(self.venta(items=[1, 'x']).status_code, 400)


class ReglasBancariasAbonoTests(CxcBase):
    def setUp(self):
        super().setUp()
        self.crear_cargo('10.00')

    def test_pago_movil_exige_referencia_de_6_digitos(self):
        base = {'metodo_pago': 'pago_movil', 'monto_ves': '40', 'banco_receptor': self.banco.id}
        self.assertEqual(self.post_abono(self.client_cajero, [dict(base, referencia='12345')]).status_code, 400)
        self.assertEqual(self.post_abono(self.client_cajero, [dict(base, referencia='12AB56')]).status_code, 400)
        self.assertEqual(self.post_abono(self.client_cajero, [dict(base, referencia='123456')]).status_code, 201)

    def test_punto_de_venta_exige_referencia_de_4_digitos(self):
        base = {'metodo_pago': 'punto_de_venta', 'monto_ves': '40', 'banco_receptor': self.banco.id, 'numero_lote': '0001'}
        self.assertEqual(self.post_abono(self.client_cajero, [dict(base, referencia='123')]).status_code, 400)
        self.assertEqual(self.post_abono(self.client_cajero, [dict(base, referencia='1234')]).status_code, 201)

    def test_efectivo_ignora_la_referencia(self):
        r1 = self.post_abono(self.client_cajero, [self.linea_usd('1', 'efectivo', referencia='ABC-1')])
        r2 = self.post_abono(self.client_cajero, [self.linea_usd('1', 'efectivo', referencia='ABC-1')])
        self.assertEqual((r1.status_code, r2.status_code), (201, 201))
        self.assertEqual(set(AbonoCantina.objects.values_list('referencia', flat=True)), {None})


class RedondeoBolivaresTests(CxcBase):
    def test_pago_en_bs_completo_no_deja_un_centavo_pendiente(self):
        cargo = self.crear_cargo('1.00')
        # 39.79 / 40 = 0.99475 -> 0.99: se ajusta a 1.00 para saldar.
        resp = self.post_abono(self.client_cajero, [{'metodo_pago': 'efectivo_ves', 'monto_ves': '39.79'}])
        self.assertEqual(resp.status_code, 201, resp.content)
        cargo.refresh_from_db()
        self.assertEqual(cargo.estado, 'pagado')
        self.assertEqual(AbonoCantina.objects.get().monto_usd, Decimal('1.00'))

    def test_pago_en_bs_que_excede_por_un_centavo_se_topa_al_saldo(self):
        cargo = self.crear_cargo('0.99')
        # 39.90 / 40 = 0.9975 -> 1.00 > 0.99: se topa al saldo.
        resp = self.post_abono(self.client_cajero, [{'metodo_pago': 'efectivo_ves', 'monto_ves': '39.90'}])
        self.assertEqual(resp.status_code, 201, resp.content)
        cargo.refresh_from_db()
        self.assertEqual(cargo.estado, 'pagado')

    def test_exceso_real_sigue_siendo_rechazado(self):
        self.crear_cargo('1.00')
        resp = self.post_abono(self.client_cajero, [{'metodo_pago': 'efectivo_ves', 'monto_ves': '41'}])
        self.assertEqual(resp.status_code, 400)

    def test_pago_en_usd_parcial_a_un_centavo_no_se_ajusta(self):
        cargo = self.crear_cargo('1.00')
        self.post_abono(self.client_cajero, [self.linea_usd('0.99')])
        cargo.refresh_from_db()
        self.assertEqual(cargo.estado, 'pendiente')


class ConstraintsTests(CxcBase):
    def test_cargo_pagado_no_puede_exceder_el_monto(self):
        cargo = self.crear_cargo('5.00')
        with self.assertRaises(IntegrityError), transaction.atomic():
            CargoCantina.objects.filter(pk=cargo.pk).update(monto_pagado=Decimal('5.01'))
        with self.assertRaises(IntegrityError), transaction.atomic():
            CargoCantina.objects.filter(pk=cargo.pk).update(monto_pagado=Decimal('-0.01'))
        with self.assertRaises(IntegrityError), transaction.atomic():
            CargoCantina.objects.filter(pk=cargo.pk).update(monto_usd=Decimal('0'), monto_pagado=Decimal('0'))

    def test_el_flujo_normal_nunca_viola_las_constraints(self):
        self.crear_cargo('5.00', creado_hace_dias=2)
        self.crear_cargo('5.00', creado_hace_dias=1)
        op = self.post_abono(self.client_cajero, [self.linea_usd('7.00'), self.linea_usd('3.00')]).json()['operacion_uuid']
        self.assertEqual(services_cxc.saldo_representante(self.rep), Decimal('0.00'))
        services_cxc.anular_abono(op, self.admin)
        self.assertEqual(services_cxc.saldo_representante(self.rep), Decimal('10.00'))

    def test_abono_y_aplicacion_con_monto_cero_son_rechazados(self):
        self.crear_cargo('5.00')
        self.post_abono(self.client_cajero, [self.linea_usd('2.00')])
        abono = AbonoCantina.objects.get()
        with self.assertRaises(IntegrityError), transaction.atomic():
            AbonoCantina.objects.filter(pk=abono.pk).update(monto_usd=Decimal('0'))
        app = AplicacionAbonoCantina.objects.get()
        with self.assertRaises(IntegrityError), transaction.atomic():
            AplicacionAbonoCantina.objects.filter(pk=app.pk).update(monto_usd=Decimal('0'))

    def test_no_se_puede_borrar_un_abono_con_aplicaciones(self):
        self.crear_cargo('5.00')
        self.post_abono(self.client_cajero, [self.linea_usd('2.00')])
        with self.assertRaises(ProtectedError):
            AbonoCantina.objects.get().delete()


class CreditoCarreraTests(CxcBase):
    def test_get_or_create_con_integrity_error_reintenta_el_get(self):
        from unittest import mock

        existente = CreditoRepresentanteCantina.objects.create(representante=self.rep, limite_usd=Decimal('30'))
        with mock.patch.object(
            CreditoRepresentanteCantina.objects, 'get_or_create', side_effect=IntegrityError('carrera'),
        ):
            resp = self.client_admin.patch(
                f'{BASE}representantes/{self.rep.id}/credito/', {'bloqueado': True}, format='json',
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        existente.refresh_from_db()
        self.assertTrue(existente.bloqueado)
        self.assertEqual(existente.limite_usd, Decimal('30'))
