"""
Tests del módulo de reportes de solvencia (cobranza/solvencia_reportes.py):
  - Bloque 1: catálogo dinámico de conceptos cobrables.
  - Bloque 2: solvencia por grado/mes (agregado, anónimo, sin N+1).
  - Bloque 3: estado de pagos por concepto (resumen agregado + detalle con
    nombres, paginado).
  - Bloque 4: estado de cuenta del representante.
  - Control de acceso por rol, igual patrón que PagosListView/ListaMorososView.

Estilo y fixtures siguiendo cobranza/test_recargo_pago_tardio.py.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.db import connection
from rest_framework.test import APIClient

from authentication.models import PerfilUsuario
from secretaria.models import Alumno, ConfiguracionSistema, Representante

from .models import (
    CuotaProyectoInversion,
    CuotaSolvencia,
    Mensualidad,
    Pago,
    TipoCargoEspecial,
)

User = get_user_model()


def _crear_representante(cedula, **kwargs):
    defaults = dict(
        nombre='Luis', apellido='Perez', telefono='0412-1234567',
        correo=f'{cedula}@test.com', direccion='Calle 1',
    )
    defaults.update(kwargs)
    return Representante.objects.create(cedula=cedula, **defaults)


def _crear_alumno(cedula, representante, **kwargs):
    defaults = dict(
        nombre='Ana', apellido='Test', fecha_nacimiento=date(2015, 1, 1),
        dia_limite_pago=5, representante=representante, grado_seccion='1er Grado A',
    )
    defaults.update(kwargs)
    return Alumno.objects.create(cedula_escolar=cedula, **defaults)


class SolvenciaReportesBase(TestCase):
    def setUp(self):
        self.config = ConfiguracionSistema.objects.create(
            fecha_inicio_inscripciones=date(2026, 1, 1),
            fecha_fin_inscripciones=date(2026, 12, 31),
            fecha_inicio_ano_escolar=date(2026, 9, 1),
            fecha_fin_ano_escolar=date(2026, 10, 31),
            periodo_escolar_activo='2026-2027',
        )
        self.admin = User.objects.create_superuser(
            username='admin_solvencia', password='clave123456', email='admin@test.com'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def _usuario_con_rol(self, rol, username):
        user = User.objects.create_user(username=username, password='clave123456')
        # Un signal (authentication/signals.py) ya crea el PerfilUsuario al
        # crear el User (con rol por defecto 'cajero') y dentro del MISMO
        # post_save deja `user.perfil` cacheado en la instancia. Hay que
        # mutar ESE objeto cacheado (no hacer un update_or_create aparte):
        # si no, `request.user.perfil` en la vista sigue viendo el rol
        # 'cajero' viejo cacheado en memoria, aunque la fila en BD ya diga
        # 'docente' (mismo objeto Python que se autentica en el test).
        user.perfil.rol = rol
        user.perfil.save()
        return user


# ──────────────────────────────────────────────────────────────────────────────
# Bloque 1 — Conceptos cobrables
# ──────────────────────────────────────────────────────────────────────────────

class ConceptosCobrablesTest(SolvenciaReportesBase):

    def test_incluye_fijos_y_cargo_especial_activo_excluye_inactivo(self):
        # NOTA: la migración de datos 0035 (backfill de "Proyecto de
        # Inversión") ya siembra un TipoCargoEspecial activo por defecto, así
        # que no se asume que la lista parta vacía — solo que el nuevo activo
        # esté y el inactivo no.
        activo = TipoCargoEspecial.objects.create(
            nombre='Zzz Cargo Nuevo Activo', monto_defecto_usd=Decimal('50.00'),
        )
        inactivo = TipoCargoEspecial.objects.create(
            nombre='Cargo Inactivo', monto_defecto_usd=Decimal('20.00'), activo=False,
        )

        response = self.client.get('/api/cobranza/conceptos-cobrables/')
        self.assertEqual(response.status_code, 200)
        claves = [c['clave'] for c in response.data['conceptos']]

        self.assertIn('mensualidad', claves)
        self.assertIn('inscripcion', claves)
        self.assertIn('solvencia', claves)
        self.assertIn(f'cargo_especial:{activo.id}', claves)
        self.assertNotIn(f'cargo_especial:{inactivo.id}', claves)


# ──────────────────────────────────────────────────────────────────────────────
# Bloque 2 — Solvencia mensual
# ──────────────────────────────────────────────────────────────────────────────

class SolvenciaMensualTest(SolvenciaReportesBase):

    def setUp(self):
        super().setUp()
        self.representante = _crear_representante('V20000001')
        self.a1 = _crear_alumno('E2000001', self.representante, grado_seccion='1er Grado A')
        self.a2 = _crear_alumno('E2000002', self.representante, grado_seccion='1er Grado A')
        self.a3 = _crear_alumno(
            'E2000003', self.representante, grado_seccion='1er Grado A',
            estatus_financiero='becado',
        )

    def test_conteos_y_porcentajes_excluye_becado_incluye_meses_sin_datos(self):
        Mensualidad.objects.create(alumno=self.a1, mes=9, anio=2026, monto_usd=Decimal('30.00'), pagado=True)
        Mensualidad.objects.create(alumno=self.a2, mes=9, anio=2026, monto_usd=Decimal('30.00'), pagado=False)
        # El becado también tiene mensualidad, pero debe quedar excluido del denominador.
        Mensualidad.objects.create(alumno=self.a3, mes=9, anio=2026, monto_usd=Decimal('30.00'), pagado=True)
        # Octubre no tiene ninguna mensualidad generada: debe salir en ceros.

        response = self.client.get('/api/cobranza/solvencia-mensual/')
        self.assertEqual(response.status_code, 200)
        data = response.data

        self.assertEqual(data['periodo_escolar'], '2026-2027')
        meses = {(m['mes'], m['anio']): m for m in data['meses']}
        self.assertEqual(set(meses.keys()), {(9, 2026), (10, 2026)})

        mes9 = meses[(9, 2026)]
        self.assertEqual(mes9['total_alumnos'], 2)
        self.assertEqual(mes9['solventes'], 1)
        self.assertEqual(mes9['pendientes'], 1)
        self.assertEqual(mes9['porcentaje'], 50.0)

        mes10 = meses[(10, 2026)]
        self.assertEqual(mes10['total_alumnos'], 0)
        self.assertEqual(mes10['solventes'], 0)
        self.assertEqual(mes10['pendientes'], 0)
        self.assertEqual(mes10['porcentaje'], 0.0)

        self.assertEqual(data['totales']['total_alumnos'], 2)
        self.assertEqual(data['totales']['solventes'], 1)
        self.assertEqual(data['totales']['pendientes'], 1)
        self.assertEqual(data['totales']['porcentaje'], 50.0)

        por_grado = {g['grado_seccion']: g for g in data['por_grado']}
        self.assertIn('1er Grado A', por_grado)
        meses_grado = {(m['mes'], m['anio']): m for m in por_grado['1er Grado A']['meses']}
        self.assertEqual(meses_grado[(9, 2026)]['total_alumnos'], 2)
        self.assertEqual(meses_grado[(9, 2026)]['solventes'], 1)

    def test_respuesta_no_contiene_nombres_ni_cedulas(self):
        Mensualidad.objects.create(alumno=self.a1, mes=9, anio=2026, monto_usd=Decimal('30.00'), pagado=True)
        response = self.client.get('/api/cobranza/solvencia-mensual/')
        contenido = str(response.data)
        self.assertNotIn(self.a1.nombre, contenido)
        self.assertNotIn(self.a1.apellido, contenido)
        self.assertNotIn(self.a1.cedula_escolar, contenido)
        self.assertNotIn(self.representante.cedula, contenido)

    def test_no_dispara_n_mas_1_al_crecer_de_3_a_30_alumnos(self):
        # Ya hay 3 alumnos (setUp). Con eso:
        with CaptureQueriesContext(connection) as ctx_chico:
            response = self.client.get('/api/cobranza/solvencia-mensual/')
        self.assertEqual(response.status_code, 200)
        queries_chico = len(ctx_chico.captured_queries)

        # Se agregan 27 alumnos más (30 en total) con mensualidad en septiembre.
        for i in range(27):
            a = _crear_alumno(f'E2001{i:03d}', self.representante, grado_seccion='1er Grado A')
            Mensualidad.objects.create(alumno=a, mes=9, anio=2026, monto_usd=Decimal('30.00'), pagado=(i % 2 == 0))

        with CaptureQueriesContext(connection) as ctx_grande:
            response = self.client.get('/api/cobranza/solvencia-mensual/')
        self.assertEqual(response.status_code, 200)
        queries_grande = len(ctx_grande.captured_queries)

        self.assertEqual(
            queries_chico, queries_grande,
            f"El número de queries creció con más alumnos ({queries_chico} -> {queries_grande}): posible N+1.",
        )
        # Cota fija razonable (config + 2 agregadas + margen), no debe volar por las nubes.
        self.assertLessEqual(queries_grande, 8)


# ──────────────────────────────────────────────────────────────────────────────
# Bloque 3 — Estado por concepto (resumen y detalle)
# ──────────────────────────────────────────────────────────────────────────────

class ResumenPorConceptoTest(SolvenciaReportesBase):

    def setUp(self):
        super().setUp()
        self.representante = _crear_representante('V30000001')
        self.alumno = _crear_alumno('E3000001', self.representante)

    def test_concepto_periodico_una_linea_por_mes(self):
        Mensualidad.objects.create(alumno=self.alumno, mes=9, anio=2026, monto_usd=Decimal('30.00'), pagado=True)
        Mensualidad.objects.create(alumno=self.alumno, mes=10, anio=2026, monto_usd=Decimal('30.00'), pagado=False)

        response = self.client.get('/api/cobranza/estado-por-concepto/resumen/?concepto=mensualidad')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['periodico'])
        self.assertEqual(len(response.data['lineas']), 2)
        for linea in response.data['lineas']:
            self.assertIsNotNone(linea['mes'])
            self.assertIsNotNone(linea['anio'])

    def test_concepto_no_periodico_una_sola_linea_con_mes_anio_null(self):
        CuotaSolvencia.objects.create(
            alumno=self.alumno, periodo_escolar='2026-2027',
            monto_usd=Decimal('40.00'), monto_pagado=Decimal('0.00'),
        )
        response = self.client.get('/api/cobranza/estado-por-concepto/resumen/?concepto=solvencia')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['periodico'])
        self.assertEqual(len(response.data['lineas']), 1)
        self.assertIsNone(response.data['lineas'][0]['mes'])
        self.assertIsNone(response.data['lineas'][0]['anio'])

    def test_concepto_no_periodico_con_varias_cuotas_una_linea_por_cuota(self):
        tipo = TipoCargoEspecial.objects.create(
            nombre='Proyecto Trimestral', monto_defecto_usd=Decimal('30.00'),
            periodicidad='trimestral', numero_cuotas=3, fecha_primera_cuota=date(2026, 9, 1),
        )
        for n in range(1, 4):
            CuotaProyectoInversion.objects.create(
                representante=self.representante, periodo_escolar='2026-2027', tipo_concepto=tipo,
                numero_cuota=n, monto_usd=Decimal('30.00'),
            )
        response = self.client.get(f'/api/cobranza/estado-por-concepto/resumen/?concepto=cargo_especial:{tipo.id}')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['lineas']), 3)
        for linea in response.data['lineas']:
            self.assertIsNone(linea['mes'])
            self.assertIsNone(linea['anio'])


class EstadoPorConceptoDetalleTest(SolvenciaReportesBase):

    def setUp(self):
        super().setUp()
        self.representante = _crear_representante('V31000001')
        self.alumno = _crear_alumno('E3100001', self.representante)

    def test_estados_disjuntos_y_union_es_todos(self):
        CuotaSolvencia.objects.create(
            alumno=self.alumno, periodo_escolar='2026-2027', monto_usd=Decimal('100.00'), monto_pagado=Decimal('100.00'),
        )
        otro_alumno = _crear_alumno('E3100002', self.representante)
        CuotaSolvencia.objects.create(
            alumno=otro_alumno, periodo_escolar='2026-2027', monto_usd=Decimal('100.00'), monto_pagado=Decimal('0.00'),
        )
        tercero = _crear_alumno('E3100003', self.representante)
        CuotaSolvencia.objects.create(
            alumno=tercero, periodo_escolar='2026-2027', monto_usd=Decimal('100.00'), monto_pagado=Decimal('40.00'),
        )

        def _ids(estado):
            r = self.client.get(f'/api/cobranza/estado-por-concepto/?concepto=solvencia&estado={estado}&page_size=100')
            self.assertEqual(r.status_code, 200)
            return {fila['alumno_id'] for fila in r.data['results']}

        pagados = _ids('pagado')
        pendientes = _ids('pendiente')
        parciales = _ids('parcial')
        todos = _ids('todos')

        self.assertEqual(pagados & pendientes, set())
        self.assertEqual(pagados & parciales, set())
        self.assertEqual(pendientes & parciales, set())
        self.assertEqual(pagados | pendientes | parciales, todos)

        self.assertIn(self.alumno.id, pagados)
        self.assertIn(otro_alumno.id, pendientes)
        self.assertIn(tercero.id, parciales)

        # El estado parcial de CuotaSolvencia con monto_pagado intermedio.
        fila_tercero = next(
            f['estado'] for f in self.client.get(
                '/api/cobranza/estado-por-concepto/?concepto=solvencia&estado=todos&page_size=100'
            ).data['results'] if f['alumno_id'] == tercero.id
        )
        self.assertEqual(fila_tercero, 'parcial')

    def test_resumen_cuadra_con_total_sin_paginar(self):
        for i in range(25):
            a = _crear_alumno(f'E32{i:05d}', self.representante)
            CuotaSolvencia.objects.create(
                alumno=a, periodo_escolar='2026-2027', monto_usd=Decimal('100.00'),
                monto_pagado=Decimal('100.00') if i % 2 == 0 else Decimal('0.00'),
            )
        response = self.client.get('/api/cobranza/estado-por-concepto/?concepto=solvencia&page_size=5')
        self.assertEqual(response.status_code, 200)
        resumen = response.data['resumen']
        self.assertEqual(resumen['total_filas'], 25)
        self.assertEqual(resumen['pagados'], 13)
        self.assertEqual(resumen['pendientes'], 12)
        self.assertEqual(resumen['parciales'], 0)
        # La página actual debe ser mucho más chica que el total.
        self.assertEqual(len(response.data['results']), 5)

    def test_cargo_especial_representante_con_dos_hijos_una_sola_fila(self):
        tipo = TipoCargoEspecial.objects.create(
            nombre='Proyecto Único', monto_defecto_usd=Decimal('50.00'),
        )
        hijo2 = _crear_alumno('E3100099', self.representante)
        CuotaProyectoInversion.objects.create(
            representante=self.representante, periodo_escolar='2026-2027', tipo_concepto=tipo,
            numero_cuota=1, monto_usd=Decimal('50.00'), monto_pagado=Decimal('20.00'),
        )
        response = self.client.get(
            f'/api/cobranza/estado-por-concepto/?concepto=cargo_especial:{tipo.id}&page_size=100'
        )
        self.assertEqual(response.status_code, 200)
        filas = response.data['results']
        self.assertEqual(len(filas), 1)
        self.assertEqual(filas[0]['nivel'], 'representante')
        self.assertEqual(filas[0]['representante_id'], self.representante.id)
        self.assertEqual(filas[0]['estado'], 'parcial')
        self.assertIn(f"{self.alumno.nombre} {self.alumno.apellido}", filas[0]['alumnos'])
        self.assertIn(f"{hijo2.nombre} {hijo2.apellido}", filas[0]['alumnos'])


# ──────────────────────────────────────────────────────────────────────────────
# Bloque 4 — Estado de cuenta del representante
# ──────────────────────────────────────────────────────────────────────────────

class EstadoCuentaRepresentanteTest(SolvenciaReportesBase):

    def setUp(self):
        super().setUp()
        self.representante = _crear_representante('V40000001')
        self.alumno = _crear_alumno('E4000001', self.representante)

    def _pago(self, **kwargs):
        defaults = dict(
            alumno=self.alumno, usuario_receptor=self.admin, metodo_pago='zelle',
            monto_usd=Decimal('30.00'), tasa_aplicada=Decimal('40.0000'), monto_ves=Decimal('1200.00'),
        )
        defaults.update(kwargs)
        return Pago.objects.create(**defaults)

    def test_representante_inexistente_404(self):
        response = self.client.get('/api/cobranza/representantes/999999/estado-cuenta/')
        self.assertEqual(response.status_code, 404)

    def test_pago_anulado_aparece_pero_no_suma_a_pagado_total(self):
        self._pago(estatus='anulado', referencia='ANUL-1')

        response = self.client.get(f'/api/cobranza/representantes/{self.representante.id}/estado-cuenta/')
        self.assertEqual(response.status_code, 200)
        historial_ids = [p['id'] for p in response.data['historial_pagos']['results']]
        self.assertTrue(len(historial_ids) >= 1)
        # No hay ninguna mensualidad/cuota pagada en este test: pagado_total_usd debe quedar en 0.
        self.assertEqual(response.data['totales']['pagado_total_usd'], '0.00')

    def test_pago_retroactivo_por_cedula_suelta_aparece_en_historial(self):
        otro_representante = _crear_representante('V40000002')
        otro_alumno = _crear_alumno('E4000002', otro_representante)
        pago_retroactivo = Pago.objects.create(
            alumno=otro_alumno, usuario_receptor=self.admin, metodo_pago='efectivo',
            monto_usd=Decimal('15.00'), tasa_aplicada=Decimal('40.0000'), monto_ves=Decimal('600.00'),
            referencia='RETRO-1', representante_documento=self.representante.cedula,
        )
        response = self.client.get(f'/api/cobranza/representantes/{self.representante.id}/estado-cuenta/')
        self.assertEqual(response.status_code, 200)
        historial_ids = [p['id'] for p in response.data['historial_pagos']['results']]
        self.assertIn(pago_retroactivo.id, historial_ids)

    def test_cargos_incluye_conceptos_del_representante(self):
        Mensualidad.objects.create(alumno=self.alumno, mes=9, anio=2026, monto_usd=Decimal('30.00'), pagado=True)
        tipo = TipoCargoEspecial.objects.create(nombre='Proyecto Único', monto_defecto_usd=Decimal('50.00'))
        CuotaProyectoInversion.objects.create(
            representante=self.representante, periodo_escolar='2026-2027', tipo_concepto=tipo,
            numero_cuota=1, monto_usd=Decimal('50.00'),
        )
        response = self.client.get(f'/api/cobranza/representantes/{self.representante.id}/estado-cuenta/')
        self.assertEqual(response.status_code, 200)
        conceptos = {c['concepto'] for c in response.data['cargos']}
        self.assertIn('mensualidad', conceptos)
        self.assertIn(f'cargo_especial:{tipo.id}', conceptos)


# ──────────────────────────────────────────────────────────────────────────────
# Control de acceso por rol
# ──────────────────────────────────────────────────────────────────────────────

class ControlAccesoPorRolTest(SolvenciaReportesBase):

    def setUp(self):
        super().setUp()
        self.representante = _crear_representante('V50000001')
        self.alumno = _crear_alumno('E5000001', self.representante)
        self.docente = self._usuario_con_rol('docente', 'docente_solvencia')
        self.client_docente = APIClient()
        self.client_docente.force_authenticate(user=self.docente)

    def test_rol_no_permitido_recibe_403_en_los_cuatro_endpoints(self):
        endpoints = [
            '/api/cobranza/solvencia-mensual/',
            '/api/cobranza/estado-por-concepto/resumen/?concepto=mensualidad',
            '/api/cobranza/estado-por-concepto/?concepto=mensualidad',
            f'/api/cobranza/representantes/{self.representante.id}/estado-cuenta/',
        ]
        for url in endpoints:
            response = self.client_docente.get(url)
            self.assertEqual(response.status_code, 403, f"{url} no devolvió 403 para rol docente")
