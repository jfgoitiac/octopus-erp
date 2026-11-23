import csv
from datetime import date
from decimal import Decimal
from io import StringIO
from tempfile import TemporaryDirectory

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from secretaria.models import Alumno, ConfiguracionSistema, Representante

from .models import AplicacionPago, BancoInstitucional, Mensualidad, Pago, TasaCambio


class IntegridadRegistroPagoTest(TestCase):
    def setUp(self):
        ConfiguracionSistema.objects.create(
            fecha_inicio_inscripciones=date(2026, 1, 1),
            fecha_fin_inscripciones=date(2026, 12, 31),
            fecha_inicio_ano_escolar=date(2025, 9, 1),
            fecha_fin_ano_escolar=date(2026, 7, 31),
            periodo_escolar_activo='2025-2026',
        )
        representante = Representante.objects.create(
            cedula='V19999999', nombre='Representante', apellido='Integridad',
            telefono='04120000000', correo='integridad@example.com', direccion='Prueba',
        )
        self.alumno = Alumno.objects.create(
            cedula_escolar='E19999999', nombre='Alumno', apellido='Integridad',
            fecha_nacimiento=date(2015, 1, 1), representante=representante,
        )
        self.mensualidad = Mensualidad.objects.create(
            alumno=self.alumno, mes=7, anio=2026, monto_usd=Decimal('30.00'),
        )
        self.banco = BancoInstitucional.objects.create(nombre='Banco Integridad', activo=True)
        TasaCambio.objects.create(valor_bs=Decimal('40.00'))
        usuario = get_user_model().objects.create_superuser(
            username='integridad', password='clave', email='integridad-admin@example.com',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=usuario)

    def _payload(self, recibido, aplicado):
        return {
            'alumnos': [{
                'alumno_id': self.alumno.id,
                'mensualidad_ids': [self.mensualidad.id],
            }],
            'concepto': 'mensualidad',
            'montos_mensualidades': {str(self.mensualidad.id): str(aplicado)},
            'pagos': [{
                'metodo_pago': 'zelle', 'monto_usd': str(recibido),
                'referencia': f'INT-{recibido}-{aplicado}',
                'banco_receptor_id': self.banco.id,
            }],
        }

    def test_rechaza_recibo_mayor_que_la_aplicacion_y_revierte_todo(self):
        respuesta = self.client.post(
            '/api/cobranza/registrar-pago/', self._payload('35.00', '20.00'), format='json',
        )

        self.assertEqual(respuesta.status_code, 400, respuesta.content)
        self.assertIn('conciliacion', respuesta.data)
        self.assertEqual(Pago.objects.count(), 0)
        self.assertEqual(AplicacionPago.objects.count(), 0)
        self.mensualidad.refresh_from_db()
        self.assertEqual(self.mensualidad.monto_pagado, Decimal('0.00'))
        self.assertFalse(self.mensualidad.pagado)

    def test_acepta_abono_parcial_cuando_recibido_y_aplicado_coinciden(self):
        respuesta = self.client.post(
            '/api/cobranza/registrar-pago/', self._payload('20.00', '20.00'), format='json',
        )

        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        self.mensualidad.refresh_from_db()
        self.assertEqual(self.mensualidad.monto_pagado, Decimal('20.00'))
        self.assertFalse(self.mensualidad.pagado)


class SincronizarAplicacionesPagosTest(TestCase):
    def setUp(self):
        representante = Representante.objects.create(
            cedula='V18888888', nombre='Representante', apellido='Reparacion',
            telefono='04120000001', correo='reparacion@example.com', direccion='Prueba',
        )
        alumno = Alumno.objects.create(
            cedula_escolar='E18888888', nombre='Alumno', apellido='Reparacion',
            fecha_nacimiento=date(2015, 1, 1), representante=representante,
        )
        self.mensualidad = Mensualidad.objects.create(
            alumno=alumno, mes=6, anio=2026, monto_usd=Decimal('30.00'),
        )
        usuario = get_user_model().objects.create_user(
            username='reparador', email='reparador@example.com', password='clave',
        )
        pago = Pago.objects.create(
            alumno=alumno, usuario_receptor=usuario,
            metodo_pago='efectivo', concepto='mensualidad',
            monto_usd=Decimal('30.00'), tasa_aplicada=Decimal('40.00'),
            monto_ves=Decimal('1200.00'),
        )
        AplicacionPago.objects.create(
            pago=pago,
            content_type=ContentType.objects.get_for_model(self.mensualidad),
            object_id=self.mensualidad.id,
            monto_nominal_usd=Decimal('30.00'),
            monto_abonado_usd=Decimal('30.00'),
            saldo_resultante_usd=Decimal('0.00'),
        )

    def test_dry_run_informa_sin_modificar(self):
        salida = StringIO()
        call_command('sincronizar_aplicaciones_pagos', stdout=salida)
        self.mensualidad.refresh_from_db()
        self.assertIn('reparables=1', salida.getvalue())
        self.assertEqual(self.mensualidad.monto_pagado, Decimal('0.00'))

    def test_confirm_repara_saldo_y_estado(self):
        call_command('sincronizar_aplicaciones_pagos', '--confirm', stdout=StringIO())
        self.mensualidad.refresh_from_db()
        self.assertEqual(self.mensualidad.monto_pagado, Decimal('30.00'))
        self.assertTrue(self.mensualidad.pagado)

    def test_reporta_recibo_enlazado_a_deuda_abierta_sin_aplicacion(self):
        pago = Pago.objects.get()
        otra = Mensualidad.objects.create(
            alumno=self.mensualidad.alumno, mes=5, anio=2026,
            monto_usd=Decimal('30.00'),
        )
        otra.pagos.add(pago)
        salida = StringIO()

        call_command('sincronizar_aplicaciones_pagos', stdout=salida)

        self.assertIn('sin AplicacionPago', salida.getvalue())
        otra.refresh_from_db()
        self.assertFalse(otra.pagado)

    def test_csv_forense_incluye_identidad_y_disponible_sin_aplicar(self):
        pago = Pago.objects.get()
        otra = Mensualidad.objects.create(
            alumno=self.mensualidad.alumno, mes=5, anio=2026,
            monto_usd=Decimal('30.00'),
        )
        otra.pagos.add(pago)

        with TemporaryDirectory() as temporal:
            ruta = f'{temporal}/auditoria.csv'
            call_command(
                'sincronizar_aplicaciones_pagos', '--output', ruta,
                stdout=StringIO(),
            )
            with open(ruta, encoding='utf-8-sig', newline='') as archivo:
                filas = list(csv.DictReader(archivo))

        revisar = next(f for f in filas if f['deuda'].endswith(f'#{otra.pk}'))
        self.assertEqual(revisar['alumno_id'], str(self.mensualidad.alumno_id))
        self.assertIn('Alumno', revisar['alumno'])
        self.assertEqual(revisar['total_operacion_usd'], '30.00')
        self.assertEqual(revisar['total_aplicado_existente_usd'], '30.00')
        self.assertEqual(revisar['disponible_sin_aplicar_usd'], '0.00')
        self.assertIn('cobranza.Mensualidad', revisar['deudas_vinculadas'])
        self.assertIn('estado=ABIERTA', revisar['deudas_estado'])
        self.assertIn(f'pago#{pago.pk}', revisar['pagos_relacionados_deudas'])
        self.assertIn('cobranza.mensualidad', revisar['aplicaciones_existentes'])
