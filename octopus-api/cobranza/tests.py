from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.db import connection
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from django.utils import timezone
from decimal import Decimal
from datetime import date, timedelta
from .models import Pago, CierreCaja, BancoInstitucional, TasaCambio
from .serializers import ComprobanteSerializer
from secretaria.models import Alumno, Representante

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
