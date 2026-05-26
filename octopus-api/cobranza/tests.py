from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from decimal import Decimal
from datetime import timedelta
from .models import Pago, CierreCaja, BancoInstitucional, TasaCambio
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
