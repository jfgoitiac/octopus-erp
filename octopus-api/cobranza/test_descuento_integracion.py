"""
Tests de integración de "descuento por pago dentro de rango" con el flujo de
cobro real (RegistrarPagoView) y anulación (correcciones.py::anular_pago).

La lógica pura de resolver_descuento() ya está cubierta en
test_descuento_pago.py — acá se valida el mecanismo de "abono fantasma":
Mensualidad.monto_pagado se acredita con el monto perdonado sin que el
representante lo haya pagado en efectivo/transferencia, Mensualidad.monto_usd
nunca cambia, y el snapshot (LineaDescuentoPago) se comporta igual que
LineaRecargoPago (inmutable, se borra al anular).
"""
from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from secretaria.models import Alumno, ConfiguracionSistema, Representante
from . import correcciones
from .models import BancoInstitucional, LineaDescuentoPago, Mensualidad, Pago, ReglaRecargoPago, TasaCambio
from .serializers import calcular_desglose_automatico
from .utils_pdf import generar_recibo_pdf


def _crear_alumno(cedula, representante, **kwargs):
    defaults = dict(
        nombre='Ana', apellido='Test', fecha_nacimiento=date(2015, 1, 1),
        dia_limite_pago=1, representante=representante,
    )
    defaults.update(kwargs)
    return Alumno.objects.create(cedula_escolar=cedula, **defaults)


class DescuentoIntegracionBase(TestCase):
    def setUp(self):
        self.config = ConfiguracionSistema.objects.create(
            fecha_inicio_inscripciones=date(2026, 1, 1),
            fecha_fin_inscripciones=date(2026, 12, 31),
            fecha_inicio_ano_escolar=date(2025, 9, 1),
            fecha_fin_ano_escolar=date(2026, 7, 31),
            periodo_escolar_activo='2025-2026',
        )
        self.representante = Representante.objects.create(
            cedula='V33333333', nombre='Maria', apellido='Perez',
            telefono='0412', correo='maria2@test.com', direccion='Calle 1',
        )
        self.alumno = _crear_alumno('E3000001', self.representante)
        self.regla = ReglaRecargoPago.objects.create(
            nombre='Descuento por pronto pago', tipo='descuento',
            modo_calculo='monto_fijo_usd', valor=Decimal('30.00'),
            dia_desde=15, dia_hasta=18, activa=True,
        )
        self.banco = BancoInstitucional.objects.create(nombre='Banco Test Descuento', activo=True)
        TasaCambio.objects.create(valor_bs=Decimal('40.00'))

        from django.contrib.auth import get_user_model
        User = get_user_model()
        self.user = User.objects.create_superuser(
            username='cajero_descuento', password='clave123456', email='cd@test.com'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _mensualidad(self, mes, anio, monto='32.00'):
        return Mensualidad.objects.create(
            alumno=self.alumno, mes=mes, anio=anio, monto_usd=Decimal(monto),
        )

    def _pagar(self, mensualidad, monto_str, fecha_pago_iso=None, referencia='ZL-DESC-001'):
        payload = {
            "alumnos": [{"alumno_id": self.alumno.id, "mensualidad_ids": [mensualidad.id]}],
            "concepto": "mensualidad",
            "montos_mensualidades": {str(mensualidad.id): monto_str},
            "pagos": [
                {"metodo_pago": "zelle", "monto_usd": monto_str,
                 "referencia": referencia, "banco_receptor_id": self.banco.id},
            ],
        }
        if fecha_pago_iso:
            payload["fecha_pago"] = fecha_pago_iso
            payload["tasa_aplicada"] = "40.0000"
            payload["motivo"] = "Pago retroactivo de prueba"
        response = self.client.post('/api/cobranza/registrar-pago/', payload, format='json')
        return response


class AbonoFantasmaTest(DescuentoIntegracionBase):

    def test_pago_retroactivo_fuera_del_rango_no_descuenta(self):
        m = self._mensualidad(7, 2026, monto='32.00')
        response = self._pagar(m, '32.00', fecha_pago_iso="2026-07-10T10:00:00Z")
        self.assertEqual(response.status_code, 201, response.content)

        m.refresh_from_db()
        self.assertEqual(m.monto_pagado, Decimal('32.00'))
        pago = Pago.objects.get(alumno=self.alumno)
        self.assertFalse(LineaDescuentoPago.objects.filter(pago=pago, mensualidad=m).exists())

    def test_pago_retroactivo_dentro_del_rango_si_descuenta_y_cierra_la_mensualidad(self):
        m = self._mensualidad(7, 2026, monto='32.00')
        response = self._pagar(m, '30.00', fecha_pago_iso="2026-07-16T10:00:00Z")
        self.assertEqual(response.status_code, 201, response.content)

        m.refresh_from_db()
        # monto_usd NUNCA cambia — sigue siendo 32.00 (mecanismo de "abono
        # fantasma", no una rebaja permanente del precio).
        self.assertEqual(m.monto_usd, Decimal('32.00'))
        # monto_pagado = 30.00 reales + 2.00 acreditados por el descuento.
        self.assertEqual(m.monto_pagado, Decimal('32.00'))
        self.assertTrue(m.pagado)
        self.assertEqual(m.fecha_pago.date(), date(2026, 7, 16))

        pago = Pago.objects.get(alumno=self.alumno)
        linea = LineaDescuentoPago.objects.get(pago=pago, mensualidad=m)
        self.assertEqual(linea.monto_descontado_usd, Decimal('2.00'))
        self.assertEqual(linea.nombre, self.regla.nombre)


class AbonoParcialCongeladoTest(DescuentoIntegracionBase):

    def test_primer_abono_dentro_del_rango_congela_el_descuento_para_el_resto(self):
        m = self._mensualidad(7, 2026, monto='32.00')

        # Primer abono: 10.00 reales, dentro del rango (16 de julio) —
        # dispara el descuento, acredita 2.00 fantasma.
        r1 = self._pagar(m, '10.00', fecha_pago_iso="2026-07-16T10:00:00Z", referencia='ZL-DESC-PARCIAL-1')
        self.assertEqual(r1.status_code, 201, r1.content)
        m.refresh_from_db()
        # monto_pagado = 10.00 (real) + 2.00 (fantasma) = 12.00.
        self.assertEqual(m.monto_pagado, Decimal('12.00'))
        self.assertFalse(m.pagado)
        # Saldo restante para cerrar: 32.00 - 12.00 = 20.00 (= 30.00 - 10.00,
        # el monto final de la regla menos lo ya abonado).
        self.assertEqual(m.monto_usd - m.monto_pagado, Decimal('20.00'))

        # Segundo abono: el resto (20.00), FUERA del rango (25 de julio). No
        # debe generarse un segundo crédito fantasma (guard de existencia de
        # LineaDescuentoPago) — el descuento ya quedó congelado en el primero.
        r2 = self._pagar(m, '20.00', fecha_pago_iso="2026-07-25T10:00:00Z", referencia='ZL-DESC-PARCIAL-2')
        self.assertEqual(r2.status_code, 201, r2.content)
        m.refresh_from_db()
        self.assertEqual(m.monto_pagado, Decimal('32.00'))
        self.assertTrue(m.pagado)

        self.assertEqual(LineaDescuentoPago.objects.filter(mensualidad=m).count(), 1)


class SnapshotInmutableDescuentoTest(DescuentoIntegracionBase):

    def test_editar_la_regla_despues_del_cobro_no_altera_la_linea_ya_creada(self):
        m = self._mensualidad(7, 2026, monto='32.00')
        response = self._pagar(m, '30.00', fecha_pago_iso="2026-07-16T10:00:00Z")
        self.assertEqual(response.status_code, 201, response.content)

        pago = Pago.objects.get(alumno=self.alumno)
        linea = LineaDescuentoPago.objects.get(pago=pago, mensualidad=m)
        self.assertEqual(linea.monto_descontado_usd, Decimal('2.00'))

        self.regla.valor = Decimal('10.00')
        self.regla.save()

        linea.refresh_from_db()
        self.assertEqual(linea.monto_descontado_usd, Decimal('2.00'))

    def test_anular_pago_borra_linea_y_recalcula_fresco_al_repagar(self):
        m = self._mensualidad(7, 2026, monto='32.00')
        response = self._pagar(m, '30.00', fecha_pago_iso="2026-07-16T10:00:00Z")
        self.assertEqual(response.status_code, 201, response.content)
        pago = Pago.objects.get(alumno=self.alumno)
        self.assertTrue(LineaDescuentoPago.objects.filter(pago=pago).exists())

        correcciones.anular_pago(pago, self.user, motivo='Prueba de anulación con descuento')

        m.refresh_from_db()
        pago.refresh_from_db()
        self.assertFalse(m.pagado)
        self.assertEqual(m.monto_pagado, Decimal('0.00'))
        self.assertEqual(pago.estatus, 'anulado')
        self.assertFalse(LineaDescuentoPago.objects.filter(pago=pago).exists())

        # Cambian las condiciones: se desactiva la regla antes de repagar.
        self.regla.activa = False
        self.regla.save()

        response2 = self._pagar(m, '32.00', fecha_pago_iso="2026-07-16T10:00:00Z", referencia='ZL-DESC-REPAGO')
        self.assertEqual(response2.status_code, 201, response2.content)

        nuevo_pago = Pago.objects.filter(alumno=self.alumno, estatus='completado').latest('id')
        self.assertFalse(LineaDescuentoPago.objects.filter(pago=nuevo_pago).exists())
        m.refresh_from_db()
        self.assertTrue(m.pagado)
        self.assertEqual(m.monto_pagado, Decimal('32.00'))


class DesgloseReciboTest(DescuentoIntegracionBase):
    """El descuento debe verse como línea NEGATIVA en el desglose contable
    (calcular_desglose_automatico) y en el recibo PDF, junto a la línea de
    la mensualidad — mismo criterio de indexado sin N+1 que el recargo."""

    def test_desglose_automatico_incluye_linea_negativa_de_descuento(self):
        m = self._mensualidad(7, 2026, monto='32.00')
        response = self._pagar(m, '30.00', fecha_pago_iso="2026-07-16T10:00:00Z")
        self.assertEqual(response.status_code, 201, response.content)

        pago = Pago.objects.get(alumno=self.alumno)
        lineas = calcular_desglose_automatico(pago)
        conceptos = [l['concepto'] for l in lineas]
        self.assertIn('mensualidad', conceptos)
        self.assertIn('descuento_pago', conceptos)

        linea_descuento = next(l for l in lineas if l['concepto'] == 'descuento_pago')
        self.assertEqual(linea_descuento['monto_usd'], '-2.00')
        self.assertEqual(linea_descuento['descripcion'], self.regla.nombre)

    def test_recibo_pdf_se_genera_sin_error_con_descuento(self):
        m = self._mensualidad(7, 2026, monto='32.00')
        response = self._pagar(m, '30.00', fecha_pago_iso="2026-07-16T10:00:00Z")
        self.assertEqual(response.status_code, 201, response.content)

        pago = Pago.objects.get(alumno=self.alumno)
        pdf_bytes = generar_recibo_pdf(pago)
        self.assertTrue(bytes(pdf_bytes).startswith(b'%PDF'))


class PantallaDeCobroAdminTest(DescuentoIntegracionBase):
    """BuscarAlumnoCobranzaView (pantalla de cobro del panel admin) debe
    mostrar el descuento/recargo prospectivo en el preview — deuda técnica
    detectada: antes de esta feature, esta pantalla no mostraba el recargo
    en absoluto (ver plan de la feature)."""

    def setUp(self):
        super().setUp()
        # self.regla (rango fijo 15-18) no sirve para un test determinístico
        # contra date.today() — se reemplaza por un rango que cubre casi
        # cualquier día del mes en que corra la suite.
        self.regla.activa = False
        self.regla.save()
        self.hoy = date.today()
        self.regla_hoy = ReglaRecargoPago.objects.create(
            nombre='Descuento vigente hoy', tipo='descuento',
            modo_calculo='monto_fijo_usd', valor=Decimal('30.00'),
            dia_desde=1, dia_hasta=28, activa=True,
        )

    def test_buscar_alumno_muestra_descuento_disponible_hoy(self):
        self._mensualidad(self.hoy.month, self.hoy.year, monto='32.00')
        response = self.client.get(f'/api/cobranza/buscar/{self.alumno.cedula_escolar}/')
        self.assertEqual(response.status_code, 200, response.content)

        mensualidades = response.data['alumnos'][0]['mensualidades_pendientes']
        self.assertEqual(len(mensualidades), 1)
        m = mensualidades[0]
        self.assertEqual(m['monto_descuento'], '2.00')
        self.assertEqual(m['nombre_descuento'], self.regla_hoy.nombre)
        self.assertEqual(m['saldo_a_pagar_hoy'], '30.00')
        self.assertEqual(m['monto_recargo'], '0.00')

    def test_buscar_alumno_sin_regla_vigente_muestra_saldo_normal(self):
        self.regla_hoy.activa = False
        self.regla_hoy.save()
        self._mensualidad(self.hoy.month, self.hoy.year, monto='32.00')
        response = self.client.get(f'/api/cobranza/buscar/{self.alumno.cedula_escolar}/')
        self.assertEqual(response.status_code, 200, response.content)

        m = response.data['alumnos'][0]['mensualidades_pendientes'][0]
        self.assertEqual(m['monto_descuento'], '0.00')
        self.assertEqual(m['saldo_a_pagar_hoy'], m['saldo'])
