from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.db import connection
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from django.utils import timezone
from decimal import Decimal
from datetime import date, datetime, timedelta
from django.core.management import call_command
from io import StringIO
from unittest.mock import patch
from .models import Pago, CierreCaja, BancoInstitucional, TasaCambio, CuotaSolvencia, CuotaProyectoInversion
from .serializers import ComprobanteSerializer
from secretaria.models import Alumno, ConfiguracionGrado, ConfiguracionSistema, Inscripcion, Representante

User = get_user_model()

class ArqueoCajaMidnightTest(TestCase):
    """
    Suite de pruebas para validar la protección contra el 'Midnight Bug'
    en el proceso de Arqueo de Caja (CierreCaja).
    """

    def setUp(self):
        # 1. Crear usuario cajero
        self.user = User.objects.create_user(username='cajero_test', password='password123')
        
        # 2. Configuración mínima para pagos
        self.banco = BancoInstitucional.objects.create(nombre="Banco Institucional Test")
        self.tasa = TasaCambio.objects.create(valor_bs=Decimal('40.00'))
        
        # 3. Crear Representante y Alumno (Dependencias de Pago)
        self.representante = Representante.objects.create(
            cedula="V12345678",
            nombre="Juan",
            apellido="Perez",
            correo="juan.perez@example.com"
        )
        self.alumno = Alumno.objects.create(
            nombre="Pedro",
            apellido="Perez",
            cedula_escolar="E84000001",
            fecha_nacimiento=date(2015, 3, 10),
            representante=self.representante
        )

    def test_arqueo_incluye_pagos_multi_dia(self):
        """
        Verifica que un arqueo realizado en la madrugada incluya pagos
        de la noche anterior (antes de las 00:00) y de la madrugada actual,
        siempre que ocurran después del último cierre registrado.
        """
        ahora = timezone.now()
        
        # El último cierre fue AYER a las 6:00 PM
        tiempo_ultimo_cierre = (ahora - timedelta(days=1)).replace(hour=18, minute=0, second=0)
        
        # Pago A: AYER a las 11:50 PM (Antes de medianoche)
        tiempo_pago_a = (ahora - timedelta(days=1)).replace(hour=23, minute=50, second=0)
        
        # Pago B: HOY a las 12:15 AM (Después de medianoche)
        tiempo_pago_b = ahora.replace(hour=0, minute=15, second=0)

        # --- PASO 1: Registrar el cierre anterior ---
        cierre_previo = CierreCaja.objects.create(
            usuario_cierre=self.user,
            monto_declarado_ves=Decimal('500.00')
        )
        # Forzamos la fecha en la DB (bypass auto_now_add para el test)
        CierreCaja.objects.filter(id=cierre_previo.id).update(fecha_cierre=tiempo_ultimo_cierre)

        # --- PASO 2: Registrar pagos que cruzan la medianoche ---
        pago_a = Pago.objects.create(
            alumno=self.alumno, usuario_receptor=self.user, metodo_pago='transferencia',
            monto_usd=Decimal('10.00'), tasa_aplicada=Decimal('40.00'), estatus='completado'
        )
        Pago.objects.filter(id=pago_a.id).update(fecha_pago=tiempo_pago_a)

        pago_b = Pago.objects.create(
            alumno=self.alumno, usuario_receptor=self.user, metodo_pago='pago_movil',
            monto_usd=Decimal('20.00'), tasa_aplicada=Decimal('40.00'), estatus='completado'
        )
        Pago.objects.filter(id=pago_b.id).update(fecha_pago=tiempo_pago_b)

        # --- PASO 3: Realizar el nuevo Arqueo (Cierre de Caja) ---
        nuevo_arqueo = CierreCaja.objects.create(
            usuario_cierre=self.user,
            monto_declarado_ves=Decimal('1200.00') # Suma esperada: 400 + 800
        )

        # --- PASO 4: Verificación ---
        # El sistema debe haber sumado ambos pagos sin importar el cambio de fecha calendario
        self.assertEqual(nuevo_arqueo.monto_sistema_ves, Decimal('1200.00'))
        self.assertEqual(nuevo_arqueo.diferencia, Decimal('0.00'))


class ComprobanteSerializerNPlusOneTest(TestCase):
    """
    ComprobanteSerializer.get_desglose_pagos/get_total_ves/get_total_usd
    disparaban 3 queries independientes por comprobante (N+1 al listar
    varias filas). Verifica que ahora comparten una sola consulta por
    operacion_uuid y que los totales siguen siendo correctos.
    """

    def setUp(self):
        self.user = User.objects.create_user(username='cajero_test2', password='password123')
        self.banco = BancoInstitucional.objects.create(nombre="Banco Institucional Test")
        self.representante = Representante.objects.create(
            cedula="V87654321", nombre="Ana", apellido="Gomez", correo="ana@example.com"
        )
        self.alumno = Alumno.objects.create(
            nombre="Luis", apellido="Gomez", cedula_escolar="E84000002",
            fecha_nacimiento=date(2015, 3, 10), representante=self.representante
        )

        # Operación 1: pago dividido en dos métodos (comparten operacion_uuid)
        self.pago_1a = Pago.objects.create(
            alumno=self.alumno, usuario_receptor=self.user, metodo_pago='transferencia',
            monto_usd=Decimal('10.00'), tasa_aplicada=Decimal('40.00'), estatus='completado'
        )
        self.pago_1b = Pago.objects.create(
            alumno=self.alumno, usuario_receptor=self.user, metodo_pago='pago_movil',
            monto_usd=Decimal('5.00'), tasa_aplicada=Decimal('40.00'), estatus='completado'
        )
        Pago.objects.filter(id=self.pago_1b.id).update(operacion_uuid=self.pago_1a.operacion_uuid)
        self.pago_1a.refresh_from_db()

        # Operación 2: pago único, propia operacion_uuid
        self.pago_2 = Pago.objects.create(
            alumno=self.alumno, usuario_receptor=self.user, metodo_pago='efectivo',
            monto_usd=Decimal('20.00'), tasa_aplicada=Decimal('40.00'), estatus='completado'
        )

    def test_totales_correctos_con_pago_dividido(self):
        data = ComprobanteSerializer(self.pago_1a).data
        self.assertEqual(len(data['desglose_pagos']), 2)
        self.assertEqual(data['total_usd'], '15.00')
        self.assertEqual(data['total_ves'], '600.00')

    def test_totales_correctos_con_pago_unico(self):
        data = ComprobanteSerializer(self.pago_2).data
        self.assertEqual(len(data['desglose_pagos']), 1)
        self.assertEqual(data['total_usd'], '20.00')
        self.assertEqual(data['total_ves'], '800.00')

    def test_metodos_de_totales_comparten_una_sola_query(self):
        """Antes del fix, get_desglose_pagos/get_total_ves/get_total_usd
        lanzaban 3 queries independientes para la misma operacion_uuid.
        Ahora deben compartir una única consulta cacheada por operación,
        sin importar cuántos métodos se invoquen ni cuántos hermanos haya."""
        serializer = ComprobanteSerializer(context={})
        with CaptureQueriesContext(connection) as ctx:
            serializer.get_desglose_pagos(self.pago_1a)
            serializer.get_total_ves(self.pago_1a)
            serializer.get_total_usd(self.pago_1a)
        self.assertEqual(len(ctx.captured_queries), 1)

    def test_query_count_no_escala_con_cantidad_de_hermanos(self):
        """El nº de queries para resolver una operación no debe crecer con
        la cantidad de pagos hermanos (antes escalaba porque cada método
        volvía a filtrar por operacion_uuid)."""
        # Agrega 3 hermanos más a la operación 1 (ahora tiene 5 pagos)
        for i in range(3):
            extra = Pago.objects.create(
                alumno=self.alumno, usuario_receptor=self.user, metodo_pago='efectivo',
                monto_usd=Decimal('1.00'), tasa_aplicada=Decimal('40.00'), estatus='completado'
            )
            Pago.objects.filter(id=extra.id).update(operacion_uuid=self.pago_1a.operacion_uuid)

        serializer = ComprobanteSerializer(context={})
        with CaptureQueriesContext(connection) as ctx:
            serializer.get_desglose_pagos(self.pago_1a)
            serializer.get_total_ves(self.pago_1a)
            serializer.get_total_usd(self.pago_1a)
        self.assertEqual(len(ctx.captured_queries), 1)
        self.assertEqual(len(serializer.get_desglose_pagos(self.pago_1a)), 5)


class RegistrarPagoOperacionUuidTest(TestCase):
    """Un pago dividido en varios métodos (transferencia + pago móvil, etc.)
    debe generarse como una sola operación (mismo operacion_uuid), para que
    ConsultaComprobantesView los agrupe en un único comprobante en vez de
    mostrarlos como recibos separados."""

    def setUp(self):
        self.user = User.objects.create_superuser(
            username='cajero_super', password='password123', email='c@example.com'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        TasaCambio.objects.create(valor_bs=Decimal('40.00'))
        self.representante = Representante.objects.create(
            cedula="V11122233", nombre="Maria", apellido="Perez", correo="maria@example.com"
        )
        self.alumno = Alumno.objects.create(
            nombre="Pedro", apellido="Perez", cedula_escolar="E84000003",
            fecha_nacimiento=date(2015, 3, 10), representante=self.representante
        )

    def test_pago_multi_metodo_comparte_operacion_uuid(self):
        payload = {
            "alumnos": [{"alumno_id": self.alumno.id}],
            "concepto": "otro",
            "pagos": [
                {"metodo_pago": "efectivo", "monto_usd": "10.00", "referencia": "EFEC-001"},
                {"metodo_pago": "zelle", "monto_usd": "5.00", "referencia": "ZELLE-001"},
                {"metodo_pago": "pago_movil", "monto_ves": "100.00", "referencia": "PM-001"},
                {"metodo_pago": "punto_de_venta", "monto_ves": "50.00", "referencia": "1234", "numero_lote": "5678"},
            ],
        }
        response = self.client.post('/api/cobranza/registrar-pago/', payload, format='json')
        self.assertEqual(response.status_code, 201, response.content)

        pagos = Pago.objects.filter(alumno=self.alumno).order_by('id')
        self.assertEqual(pagos.count(), 4)
        uuids = {str(p.operacion_uuid) for p in pagos}
        self.assertEqual(len(uuids), 1)

        data = ComprobanteSerializer(pagos.first()).data
        self.assertEqual(len(data['desglose_pagos']), 4)


class BancosListViewCacheTest(TestCase):
    """
    BancosListView cachea la lista de bancos activos (catálogo estable).
    Verifica que la segunda llamada no golpee la BD y que crear/editar un
    banco invalide el cache (cobranza/signals.py).
    """

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        user = User.objects.create_user(username='cajero_cache', password='clave123456')
        token = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        self.banco = BancoInstitucional.objects.create(nombre='Banco Test', activo=True)

    def test_segunda_llamada_no_toca_la_bd(self):
        cache.clear()
        with CaptureQueriesContext(connection) as ctx1:
            resp1 = self.client.get('/api/cobranza/bancos/')
        self.assertEqual(len(resp1.data), 1)

        with CaptureQueriesContext(connection) as ctx2:
            resp2 = self.client.get('/api/cobranza/bancos/')
        self.assertEqual(resp2.data, resp1.data)
        # La 2da llamada se sirve del cache: 1 query menos que la 1ra
        # (la query de BancoInstitucional). El resto (auth JWT, etc.) es
        # overhead constante de cada request, no del catálogo de bancos.
        self.assertEqual(len(ctx2.captured_queries), len(ctx1.captured_queries) - 1)

    def test_crear_banco_invalida_el_cache(self):
        self.client.get('/api/cobranza/bancos/')  # cachea con 1 banco
        BancoInstitucional.objects.create(nombre='Banco Nuevo', activo=True)

        resp = self.client.get('/api/cobranza/bancos/')
        self.assertEqual(len(resp.data), 2)


class AgruparPagosHistoricosCommandTest(TestCase):
    """El management command debe fusionar bajo un mismo operacion_uuid los
    pagos históricos (previos al fix de RegistrarPagoView) que se dividieron
    en varios métodos dentro de una misma transacción, sin tocar pagos no
    relacionados."""

    def setUp(self):
        self.cajero = User.objects.create_user(username='cajero_hist', password='clave123456')
        self.otro_cajero = User.objects.create_user(username='cajero_hist2', password='clave123456')
        self.representante = Representante.objects.create(
            cedula='V30000001', nombre='Carla', apellido='Ruiz', correo='carla@example.com'
        )
        self.alumno = Alumno.objects.create(
            nombre='Pedro', apellido='Perez', cedula_escolar='E95000001',
            fecha_nacimiento=date(2016, 5, 20), representante=self.representante,
        )
        self.otro_alumno = Alumno.objects.create(
            nombre='Sofia', apellido='Ruiz', cedula_escolar='E95000002',
            fecha_nacimiento=date(2017, 5, 20), representante=self.representante,
        )

        # Operación histórica "rota": 4 métodos de pago del mismo alumno,
        # mismo cajero, mismo concepto, cada uno con su propio operacion_uuid
        # (el bug), guardados a segundos de diferencia entre sí.
        self.rotos = []
        base = timezone.now()
        for i, metodo in enumerate(['efectivo', 'zelle', 'pago_movil', 'punto_de_venta']):
            extra = {}
            if metodo == 'punto_de_venta':
                extra = {'referencia': '1234', 'numero_lote': '5678'}
            p = Pago.objects.create(
                alumno=self.alumno, usuario_receptor=self.cajero, metodo_pago=metodo,
                concepto='mensualidad', monto_usd=Decimal('10.00'), tasa_aplicada=Decimal('40.00'),
                estatus='completado', **extra,
            )
            Pago.objects.filter(id=p.id).update(fecha_pago=base + timedelta(seconds=i))
            p.refresh_from_db()
            self.rotos.append(p)

        # Pago suelto de otro alumno, ocurre en la misma ventana de tiempo
        # pero no debe fusionarse con el grupo de arriba.
        self.suelto = Pago.objects.create(
            alumno=self.otro_alumno, usuario_receptor=self.otro_cajero, metodo_pago='efectivo',
            concepto='mensualidad', monto_usd=Decimal('30.00'), tasa_aplicada=Decimal('40.00'),
            estatus='completado',
        )
        Pago.objects.filter(id=self.suelto.id).update(fecha_pago=base)
        self.suelto.refresh_from_db()

    def test_dry_run_no_escribe_nada(self):
        out = StringIO()
        call_command('agrupar_pagos_historicos', stdout=out)
        for p in self.rotos:
            p.refresh_from_db()
        uuids = {p.operacion_uuid for p in self.rotos}
        self.assertEqual(len(uuids), 4)
        self.assertIn('DRY-RUN', out.getvalue())

    def test_confirm_fusiona_el_grupo_roto_y_no_toca_pagos_ajenos(self):
        uuid_esperado = min(self.rotos, key=lambda p: p.id).operacion_uuid

        call_command('agrupar_pagos_historicos', '--confirm', stdout=StringIO())

        for p in self.rotos:
            p.refresh_from_db()
        uuids = {p.operacion_uuid for p in self.rotos}
        self.assertEqual(uuids, {uuid_esperado})

        self.suelto.refresh_from_db()
        self.assertNotEqual(self.suelto.operacion_uuid, uuid_esperado)

        data = ComprobanteSerializer(self.rotos[0]).data
        self.assertEqual(len(data['desglose_pagos']), 4)

    def test_es_idempotente(self):
        call_command('agrupar_pagos_historicos', '--confirm', stdout=StringIO())
        out = StringIO()
        call_command('agrupar_pagos_historicos', '--confirm', stdout=out)
        self.assertIn('No hay nada que fusionar', out.getvalue())


class CuotaSolvenciaDeudaDerivadaTest(TestCase):
    """
    `CuotaSolvencia.pagado` ya no se asigna a mano en ningún lugar: se deriva
    en save() a partir de monto_pagado vs monto_usd. Esto es lo que corrige
    el bug real: antes, subir monto_usd después de que la cuota ya estaba
    pagado=True dejaba esa deuda nueva invisible para cobranza/mora.py.
    """

    def setUp(self):
        representante = Representante.objects.create(
            cedula='V20000001', nombre='Luisa', apellido='Gomez', correo='luisa@example.com'
        )
        self.alumno = Alumno.objects.create(
            nombre='Sofia', apellido='Gomez', cedula_escolar='E92000001',
            fecha_nacimiento=date(2016, 5, 20), representante=representante,
        )

    def test_monto_cero_queda_pagado_automaticamente(self):
        cuota = CuotaSolvencia.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026', monto_usd=Decimal('0.00')
        )
        self.assertTrue(cuota.pagado)

    def test_monto_pagado_igual_a_monto_usd_marca_pagado(self):
        cuota = CuotaSolvencia.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026', monto_usd=Decimal('50.00')
        )
        self.assertFalse(cuota.pagado)

        cuota.monto_pagado = Decimal('50.00')
        cuota.save()
        cuota.refresh_from_db()
        self.assertTrue(cuota.pagado)
        self.assertIsNotNone(cuota.fecha_pago)

    def test_subir_monto_tras_pagado_vuelve_a_poner_en_mora(self):
        """El caso central del bug: alumno ya solventó $50, luego le suben
        el monto a $80 (nuevo cargo) — debe volver a pagado=False."""
        cuota = CuotaSolvencia.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026',
            monto_usd=Decimal('50.00'), monto_pagado=Decimal('50.00'),
        )
        self.assertTrue(cuota.pagado)

        cuota.monto_usd = Decimal('80.00')
        cuota.save()
        cuota.refresh_from_db()
        self.assertFalse(cuota.pagado)
        self.assertIsNone(cuota.fecha_pago)

    def test_update_or_create_respeta_derivacion_pese_a_update_fields(self):
        """Reproduce el flujo real de AlumnoUpdateSerializer.update(): usa
        update_or_create con defaults={monto_usd: ...}, que internamente
        llama a save(update_fields={'monto_usd'}). Sin el fix en save(), la
        columna `pagado` no se hubiera escrito en el UPDATE de SQL."""
        CuotaSolvencia.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026',
            monto_usd=Decimal('50.00'), monto_pagado=Decimal('50.00'),
        )
        CuotaSolvencia.objects.update_or_create(
            alumno=self.alumno, periodo_escolar='2025-2026',
            defaults={'monto_usd': Decimal('80.00')},
        )
        cuota = CuotaSolvencia.objects.get(alumno=self.alumno, periodo_escolar='2025-2026')
        self.assertFalse(cuota.pagado)


class CuotaProyectoInversionDeudaDerivadaTest(TestCase):
    """
    Mismo bug y mismo fix que CuotaSolvenciaDeudaDerivadaTest, pero para
    CuotaProyectoInversion (cuota a nivel de representante, no de alumno):
    `pagado` ya no se asigna a mano (antes en views.py al registrar el pago),
    se deriva en save() a partir de monto_pagado vs monto_usd.
    """

    def setUp(self):
        from cobranza.services import tipo_cargo_proyecto_inversion
        self.representante = Representante.objects.create(
            cedula='V20000003', nombre='Marta', apellido='Diaz', correo='marta@example.com'
        )
        self.tipo_proyecto = tipo_cargo_proyecto_inversion()

    def test_monto_cero_queda_pagado_automaticamente(self):
        cuota = CuotaProyectoInversion.objects.create(
            representante=self.representante, periodo_escolar='2025-2026',
            tipo_concepto=self.tipo_proyecto, monto_usd=Decimal('0.00')
        )
        self.assertTrue(cuota.pagado)

    def test_monto_pagado_igual_a_monto_usd_marca_pagado(self):
        cuota = CuotaProyectoInversion.objects.create(
            representante=self.representante, periodo_escolar='2025-2026',
            tipo_concepto=self.tipo_proyecto, monto_usd=Decimal('50.00')
        )
        self.assertFalse(cuota.pagado)

        cuota.monto_pagado = Decimal('50.00')
        cuota.save()
        cuota.refresh_from_db()
        self.assertTrue(cuota.pagado)
        self.assertIsNotNone(cuota.fecha_pago)

    def test_subir_monto_tras_pagado_vuelve_a_poner_en_mora(self):
        """El caso central del bug: representante ya pagó $50 de proyecto de
        inversión, luego el director le sube el monto a $80 desde el módulo
        de Representantes — debe volver a pagado=False."""
        cuota = CuotaProyectoInversion.objects.create(
            representante=self.representante, periodo_escolar='2025-2026',
            tipo_concepto=self.tipo_proyecto,
            monto_usd=Decimal('50.00'), monto_pagado=Decimal('50.00'),
        )
        self.assertTrue(cuota.pagado)

        cuota.monto_usd = Decimal('80.00')
        cuota.save()
        cuota.refresh_from_db()
        self.assertFalse(cuota.pagado)
        self.assertIsNone(cuota.fecha_pago)

    def test_update_or_create_respeta_derivacion_pese_a_update_fields(self):
        """Reproduce el flujo real de RepresentanteSerializer.update(): usa
        update_or_create con defaults={monto_usd: ...}, que internamente
        llama a save(update_fields={'monto_usd'}). Sin el fix en save(), la
        columna `pagado` no se hubiera escrito en el UPDATE de SQL."""
        CuotaProyectoInversion.objects.create(
            representante=self.representante, periodo_escolar='2025-2026',
            tipo_concepto=self.tipo_proyecto,
            monto_usd=Decimal('50.00'), monto_pagado=Decimal('50.00'),
        )
        CuotaProyectoInversion.objects.update_or_create(
            representante=self.representante, periodo_escolar='2025-2026',
            tipo_concepto=self.tipo_proyecto, numero_cuota=1,
            defaults={'monto_usd': Decimal('80.00')},
        )
        cuota = CuotaProyectoInversion.objects.get(
            representante=self.representante, periodo_escolar='2025-2026'
        )
        self.assertFalse(cuota.pagado)


class RegistrarPagoSolvenciaTest(TestCase):
    """El pago de una CuotaSolvencia debe saldarla vía monto_pagado (no un
    bulk .update(pagado=True) que se saltaba save())."""

    def setUp(self):
        self.user = User.objects.create_superuser(
            username='cajero_solv', password='password123', email='cs@example.com'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        TasaCambio.objects.create(valor_bs=Decimal('40.00'))
        self.representante = Representante.objects.create(
            cedula='V20000002', nombre='Carlos', apellido='Ruiz', correo='carlos@example.com'
        )
        self.alumno = Alumno.objects.create(
            nombre='Ana', apellido='Ruiz', cedula_escolar='E92000002',
            fecha_nacimiento=date(2016, 5, 20), representante=self.representante,
        )
        self.cuota = CuotaSolvencia.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026', monto_usd=Decimal('30.00')
        )

    def test_pagar_solvencia_la_salda_y_queda_pagado(self):
        payload = {
            "alumnos": [{"alumno_id": self.alumno.id, "cuota_solvencia_ids": [self.cuota.id]}],
            "concepto": "solvencia",
            "pagos": [
                {"metodo_pago": "efectivo", "monto_usd": "30.00", "referencia": "EFEC-SOLV-1"},
            ],
        }
        response = self.client.post('/api/cobranza/registrar-pago/', payload, format='json')
        self.assertEqual(response.status_code, 201, response.content)

        self.cuota.refresh_from_db()
        self.assertTrue(self.cuota.pagado)
        self.assertEqual(self.cuota.monto_pagado, Decimal('30.00'))
        self.assertIsNotNone(self.cuota.fecha_pago)


class SincronizarSolvenciasCommandTest(TestCase):
    """El management command debe saldar solvencias de alumnos solventes o
    inscritos, y NUNCA tocar la deuda de un alumno en mora."""

    def setUp(self):
        ConfiguracionSistema.objects.create(
            fecha_inicio_inscripciones=date(2026, 1, 1),
            fecha_fin_inscripciones=date(2026, 12, 31),
            fecha_inicio_ano_escolar=date(2025, 9, 1),
            fecha_fin_ano_escolar=date(2026, 7, 31),
            periodo_escolar_activo='2025-2026',
        )
        self.usuario = User.objects.create_user(username='secretaria_test', password='clave123456')
        self.representante = Representante.objects.create(
            cedula='V20000003', nombre='Elena', apellido='Diaz', correo='elena@example.com'
        )

        # Alumno solvente (sin ninguna deuda), con solvencia pendiente por
        # datos desactualizados: debe saldarse.
        self.alumno_solvente = Alumno.objects.create(
            nombre='Mateo', apellido='Diaz', cedula_escolar='E93000001',
            fecha_nacimiento=date(2016, 5, 20), representante=self.representante,
        )
        self.cuota_solvente = CuotaSolvencia.objects.create(
            alumno=self.alumno_solvente, periodo_escolar='2025-2026', monto_usd=Decimal('20.00')
        )

        # Alumno en mora por una cuota de inscripción impaga: su solvencia
        # NO debe tocarse aunque esté "inscrito".
        self.alumno_mora = Alumno.objects.create(
            nombre='Luca', apellido='Diaz', cedula_escolar='E93000002',
            fecha_nacimiento=date(2017, 3, 15), representante=self.representante,
        )
        from .models import CuotaInscripcion
        CuotaInscripcion.objects.create(
            alumno=self.alumno_mora, periodo_escolar='2025-2026', monto_usd=Decimal('100.00'), pagado=False
        )
        self.cuota_mora = CuotaSolvencia.objects.create(
            alumno=self.alumno_mora, periodo_escolar='2025-2026', monto_usd=Decimal('20.00')
        )
        ConfiguracionGrado.objects.create(grado_seccion='1A', cupos_maximos=30)
        Inscripcion.objects.create(
            alumno=self.alumno_mora, periodo_escolar='2025-2026', grado_seccion='1A',
            tipo_ingreso='regular', usuario_registro=self.usuario,
        )

    def test_dry_run_no_escribe_nada(self):
        out = StringIO()
        call_command('sincronizar_solvencias', stdout=out)
        self.cuota_solvente.refresh_from_db()
        self.cuota_mora.refresh_from_db()
        self.assertFalse(self.cuota_solvente.pagado)
        self.assertFalse(self.cuota_mora.pagado)
        self.assertIn('DRY-RUN', out.getvalue())

    def test_confirm_salda_solventes_pero_no_a_los_en_mora(self):
        out = StringIO()
        call_command('sincronizar_solvencias', '--confirm', stdout=out)

        self.cuota_solvente.refresh_from_db()
        self.assertTrue(self.cuota_solvente.pagado)
        self.assertEqual(self.cuota_solvente.monto_pagado, Decimal('20.00'))

        self.cuota_mora.refresh_from_db()
        self.assertFalse(self.cuota_mora.pagado)
        self.assertEqual(self.cuota_mora.monto_pagado, Decimal('0.00'))

    def test_es_idempotente(self):
        call_command('sincronizar_solvencias', '--confirm', stdout=StringIO())
        out = StringIO()
        call_command('sincronizar_solvencias', '--confirm', stdout=out)
        self.assertIn('No hay nada que saldar', out.getvalue())


class DesgloseConceptosTest(TestCase):
    """Un pago 'mixto' (mensualidad atrasada + inscripción de dos hermanos en
    una sola transacción) debe poder desglosarse línea por línea en vez de
    mostrar el texto crudo 'Pago Mixto', y la mensualidad atrasada debe
    clasificarse como tal comparando su mes/año contra la fecha del pago."""

    def setUp(self):
        from .models import Mensualidad, CuotaInscripcion

        self.user = User.objects.create_superuser(
            username='cajero_mixto', password='password123', email='mixto@example.com'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        TasaCambio.objects.create(valor_bs=Decimal('40.00'))
        self.representante = Representante.objects.create(
            cedula="V55566677", nombre="Rosa", apellido="Blanco", correo="rosa@example.com"
        )
        self.alumno_1 = Alumno.objects.create(
            nombre="Carla", apellido="Blanco", cedula_escolar="E84000005",
            fecha_nacimiento=date(2015, 3, 10), representante=self.representante
        )
        self.alumno_2 = Alumno.objects.create(
            nombre="Diego", apellido="Blanco", cedula_escolar="E84000006",
            fecha_nacimiento=date(2016, 6, 20), representante=self.representante
        )

        hoy = timezone.now()
        mes_pasado = hoy.month - 1 or 12
        anio_pasado = hoy.year if hoy.month > 1 else hoy.year - 1
        self.mensualidad = Mensualidad.objects.create(
            alumno=self.alumno_1, mes=mes_pasado, anio=anio_pasado, monto_usd=Decimal('100.00')
        )
        self.cuota_1 = CuotaInscripcion.objects.create(
            alumno=self.alumno_1, periodo_escolar='2025-2026', monto_usd=Decimal('50.00')
        )
        self.cuota_2 = CuotaInscripcion.objects.create(
            alumno=self.alumno_2, periodo_escolar='2025-2026', monto_usd=Decimal('50.00')
        )

    def test_desglose_conceptos_reemplaza_pago_mixto(self):
        payload = {
            "alumnos": [
                {
                    "alumno_id": self.alumno_1.id,
                    "mensualidad_ids": [self.mensualidad.id],
                    "cuota_inscripcion_ids": [self.cuota_1.id],
                },
                {
                    "alumno_id": self.alumno_2.id,
                    "cuota_inscripcion_ids": [self.cuota_2.id],
                },
            ],
            "pagos": [{"metodo_pago": "efectivo", "monto_usd": "200.00"}],
        }
        # Pagar una mensualidad dispara una notificación async (Celery/Redis),
        # no relevante para este test y no disponible en el entorno de test.
        # RegistrarPagoView la importa dentro de la función (no a nivel de
        # módulo), así que se parchea en su origen: notificaciones.tasks.
        with patch('notificaciones.tasks.task_notificar_pago_exitoso.delay'):
            response = self.client.post('/api/cobranza/registrar-pago/', payload, format='json')
        self.assertEqual(response.status_code, 201, response.content)

        pago = Pago.objects.filter(alumno=self.alumno_1).order_by('id').first()
        self.assertEqual(pago.concepto, 'mixto')

        lineas = ComprobanteSerializer(pago).data['desglose_conceptos']
        self.assertEqual(len(lineas), 3)

        mensualidad_linea = next(l for l in lineas if l['concepto'] == 'mensualidad')
        self.assertEqual(mensualidad_linea['monto_usd'], '100.00')
        self.assertEqual(mensualidad_linea['clasificacion_temporal'], 'atrasado')

        inscripcion_lineas = [l for l in lineas if l['concepto'] == 'inscripcion']
        self.assertEqual(len(inscripcion_lineas), 2)
        self.assertEqual({l['monto_usd'] for l in inscripcion_lineas}, {'50.00'})
        self.assertEqual(
            {l['alumno'] for l in inscripcion_lineas},
            {'Carla Blanco', 'Diego Blanco'},
        )

    def test_pago_simple_tambien_trae_desglose_de_una_linea(self):
        """Una mensualidad al día, pagada sola (sin mezclar conceptos), debe
        seguir devolviendo desglose_conceptos con 1 línea y clasificación
        'al_dia', no solo el concepto crudo."""
        hoy = timezone.now()
        from .models import Mensualidad
        mensualidad_al_dia = Mensualidad.objects.create(
            alumno=self.alumno_2, mes=hoy.month, anio=hoy.year, monto_usd=Decimal('80.00')
        )
        payload = {
            "alumnos": [{"alumno_id": self.alumno_2.id, "mensualidad_ids": [mensualidad_al_dia.id]}],
            "pagos": [{"metodo_pago": "efectivo", "monto_usd": "80.00"}],
        }
        with patch('notificaciones.tasks.task_notificar_pago_exitoso.delay'):
            response = self.client.post('/api/cobranza/registrar-pago/', payload, format='json')
        self.assertEqual(response.status_code, 201, response.content)

        pago = Pago.objects.filter(alumno=self.alumno_2).order_by('id').first()
        self.assertEqual(pago.concepto, 'mensualidad')

        lineas = ComprobanteSerializer(pago).data['desglose_conceptos']
        self.assertEqual(len(lineas), 1)
        self.assertEqual(lineas[0]['clasificacion_temporal'], 'al_dia')


class DesgloseContableManualPriorityTest(TestCase):
    """Para una operación ANTERIOR a FECHA_CORTE_DESGLOSE_AUTOMATICO que tiene
    tanto M2M automático (viejo/residual) como una ClasificacionPagoManual
    posterior, DesgloseContableView (el Excel/PDF) debe imprimir la línea
    MANUAL, no la automática — mismo criterio que ya usa la pantalla
    (EstadoClasificacionPagosView) vía _desglose_automatico_para_clasificacion.
    Antes este endpoint llamaba a calcular_desglose_automatico() directo, así
    que siempre mostraba el automático viejo e ignoraba lo que el contador
    reclasificó a mano, y los filtros de estado/concepto (que sí usan el
    criterio correcto) no encontraban coincidencia con esas filas → 0
    resultados aunque en pantalla sí hubiera datos."""

    def setUp(self):
        from .models import CuotaInscripcion, ClasificacionPagoManual

        self.user = User.objects.create_superuser(
            username='cajero_desglose_manual', password='password123', email='dm@example.com'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        TasaCambio.objects.create(valor_bs=Decimal('40.00'))
        self.representante = Representante.objects.create(
            cedula="V55566688", nombre="Nora", apellido="Salas", correo="nora@example.com"
        )
        self.alumno = Alumno.objects.create(
            nombre="Elio", apellido="Salas", cedula_escolar="E84000007",
            fecha_nacimiento=date(2015, 3, 10), representante=self.representante
        )
        cuota = CuotaInscripcion.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026', monto_usd=Decimal('50.00')
        )

        payload = {
            "alumnos": [{"alumno_id": self.alumno.id, "cuota_inscripcion_ids": [cuota.id]}],
            "pagos": [{"metodo_pago": "efectivo", "monto_usd": "50.00"}],
        }
        response = self.client.post('/api/cobranza/registrar-pago/', payload, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        self.pago = Pago.objects.filter(alumno=self.alumno).order_by('id').first()

        # Simula una operación vieja: fuerza fecha_pago a antes del corte
        # (auto_now_add no deja setearla al crear).
        Pago.objects.filter(id=self.pago.id).update(fecha_pago=timezone.make_aware(datetime(2025, 1, 1)))
        self.pago.refresh_from_db()

        # El contador reclasifica a mano el mismo pago con un concepto
        # DISTINTO al que ya tenía enlazado por M2M (inscripcion), para poder
        # distinguir sin ambigüedad cuál de las dos fuentes ganó.
        ClasificacionPagoManual.objects.create(
            pago=self.pago, tipo='proyecto_inversion', monto_usd=Decimal('50.00'),
            creado_por=self.user,
        )

    def _get_desglose(self, **params):
        base = {
            'fecha_desde': '2025-01-01', 'fecha_hasta': '2025-01-01',
        }
        base.update(params)
        return self.client.get('/api/cobranza/pagos/desglose-contable/', base)

    def test_export_prioriza_manual_sobre_automatico_viejo(self):
        response = self._get_desglose()
        self.assertEqual(response.status_code, 200, response.content)
        filas = response.data['results']
        self.assertEqual(len(filas), 1)
        self.assertEqual(filas[0]['origen'], 'manual')
        self.assertEqual(filas[0]['categoria_concepto'], 'proyecto_inversion')
        self.assertEqual(filas[0]['monto_usd'], '50.00')

    def test_filtro_estado_y_concepto_manual_no_devuelve_vacio(self):
        response = self._get_desglose(estado='completo_manual', concepto='proyecto_inversion')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(len(response.data['results']), 1)

    def test_filtro_concepto_automatico_viejo_ya_no_aparece(self):
        # 'inscripcion' era el concepto del M2M automático (ignorado por ser
        # una operación pre-corte) — ya no debe encontrarse ninguna fila.
        response = self._get_desglose(concepto='inscripcion')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(len(response.data['results']), 0)


class CalcularDatosAdministrativosInscripcionTest(TestCase):
    """calcular_datos_administrativos_inscripcion no debe inflar el monto de
    inscripción cuando el Pago que la cubre es 'mixto' (cubre inscripción y
    otro concepto en una misma transacción por el mismo método)."""

    def setUp(self):
        self.user = User.objects.create_user(username='cajero_test3', password='password123')
        self.representante = Representante.objects.create(
            cedula="V99988877", nombre="Carlos", apellido="Diaz", correo="carlos@example.com"
        )
        self.alumno = Alumno.objects.create(
            nombre="Sofia", apellido="Diaz", cedula_escolar="E84000007",
            fecha_nacimiento=date(2015, 3, 10), representante=self.representante
        )

    def test_monto_no_se_infla_con_pago_mixto(self):
        from types import SimpleNamespace
        from .models import CuotaInscripcion
        from .services import calcular_datos_administrativos_inscripcion

        cuota = CuotaInscripcion.objects.create(
            alumno=self.alumno, periodo_escolar='2025-2026', monto_usd=Decimal('50.00')
        )
        # Pago mixto: $150 por Zelle cubre $50 de inscripción + $100 de otro concepto.
        pago = Pago.objects.create(
            alumno=self.alumno, usuario_receptor=self.user, metodo_pago='zelle',
            concepto='mixto', monto_usd=Decimal('150.00'), tasa_aplicada=Decimal('40.00'),
            estatus='completado',
        )
        cuota.pagos.add(pago)

        inscripcion = SimpleNamespace(
            alumno=self.alumno, periodo_escolar='2025-2026',
            fecha_inscripcion=timezone.now(), nro_solvencia=None,
        )
        datos = calcular_datos_administrativos_inscripcion(inscripcion)

        total = sum((g['monto'] for g in datos['metodos_pago']), Decimal('0.00'))
        self.assertEqual(total, Decimal('50.00'))


class AnularPagoTests(TestCase):
    """Función C del módulo de Corrección de Pagos (cobranza/correcciones.py)."""

    def setUp(self):
        self.user = User.objects.create_superuser(
            username='sistemas_anular', password='password123', email='an@example.com'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        TasaCambio.objects.create(valor_bs=Decimal('40.00'))
        self.representante = Representante.objects.create(
            cedula='V30000001', nombre='Rosa', apellido='Lugo', correo='rosa@example.com'
        )
        self.alumno = Alumno.objects.create(
            nombre='Tomas', apellido='Lugo', cedula_escolar='E95000001',
            fecha_nacimiento=date(2016, 5, 20), representante=self.representante,
        )

    def _registrar_pago_mensualidad(self, referencia='TRF-ANULAR-1', mes_offset=0):
        from .models import Mensualidad
        hoy = date.today()
        mes = ((hoy.month - 1 + mes_offset) % 12) + 1
        anio = hoy.year + ((hoy.month - 1 + mes_offset) // 12)
        mensualidad = Mensualidad.objects.create(
            alumno=self.alumno, mes=mes, anio=anio, monto_usd=Decimal('60.00')
        )
        payload = {
            "alumnos": [{"alumno_id": self.alumno.id, "mensualidad_ids": [mensualidad.id]}],
            "concepto": "mensualidad",
            "pagos": [
                {"metodo_pago": "transferencia", "monto_usd": "60.00", "referencia": referencia},
            ],
        }
        resp = self.client.post('/api/cobranza/registrar-pago/', payload, format='json')
        assert resp.status_code == 201, resp.content
        mensualidad.refresh_from_db()
        pago = mensualidad.pagos.get()
        return mensualidad, pago

    def test_anular_revierte_mensualidad_a_pendiente(self):
        mensualidad, pago = self._registrar_pago_mensualidad()
        self.assertTrue(mensualidad.pagado)

        resp = self.client.post(f'/api/cobranza/pagos/{pago.id}/anular/', {
            'motivo': 'Reverso bancario confirmado por el banco',
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)

        pago.refresh_from_db()
        mensualidad.refresh_from_db()
        self.assertEqual(pago.estatus, 'anulado')
        self.assertIsNotNone(pago.anulado_en)
        self.assertEqual(pago.anulado_por_id, self.user.id)
        self.assertIn('[ANULACIÓN]', pago.observaciones)
        self.assertFalse(mensualidad.pagado)
        self.assertIsNone(mensualidad.fecha_pago)

    def test_no_se_puede_anular_dos_veces(self):
        _, pago = self._registrar_pago_mensualidad()
        primero = self.client.post(f'/api/cobranza/pagos/{pago.id}/anular/', {'motivo': 'Motivo valido uno'}, format='json')
        self.assertEqual(primero.status_code, 200)

        segundo = self.client.post(f'/api/cobranza/pagos/{pago.id}/anular/', {'motivo': 'Motivo valido dos'}, format='json')
        self.assertEqual(segundo.status_code, 400)

    def test_anular_libera_la_referencia_bancaria(self):
        """La unique constraint de Pago excluye estatus='anulado' — un pago
        anulado no debe bloquear que otro pago reuse su número de referencia."""
        mensualidad, pago = self._registrar_pago_mensualidad(referencia='TRF-REUSABLE')
        self.client.post(f'/api/cobranza/pagos/{pago.id}/anular/', {'motivo': 'Referencia duplicada por error'}, format='json')

        mensualidad2, pago2 = self._registrar_pago_mensualidad(referencia='TRF-REUSABLE', mes_offset=1)
        self.assertEqual(pago2.estatus, 'completado')

    def test_motivo_muy_corto_es_rechazado(self):
        _, pago = self._registrar_pago_mensualidad()
        resp = self.client.post(f'/api/cobranza/pagos/{pago.id}/anular/', {'motivo': 'corto'}, format='json')
        self.assertEqual(resp.status_code, 400)
