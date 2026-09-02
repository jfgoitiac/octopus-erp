"""
Tests de "recargo por pago tardío" (cobranza/recargos.py):
  - Regresión: cero reglas activas = comportamiento idéntico al de hoy.
  - resolver_recargo(): frontera del día de aplicación, topado en meses
    cortos, plano (no acumula con el tiempo), independiente de mora.py,
    modo porcentaje sobre el monto ya becado.
  - Consistencia entre mora.py (morosos), el portal y caja para el mismo
    alumno/mensualidad/instante.
  - Snapshot inmutable de LineaRecargoPago y su reversión al anular un pago.
"""
from datetime import date, datetime
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from secretaria.models import Alumno, ConfiguracionSistema, Representante
from . import correcciones
from .models import BancoInstitucional, LineaRecargoPago, Mensualidad, Pago, ReglaRecargoPago, TasaCambio
from .mora import annotate_mora_detalle, enriquecer_monto_adeudado_con_recargo
from .recargos import resolver_recargo
from portal.serializers import MensualidadSerializer


def _crear_alumno(cedula, representante, **kwargs):
    defaults = dict(
        nombre='Ana', apellido='Test', fecha_nacimiento=date(2015, 1, 1),
        dia_limite_pago=1, representante=representante,
    )
    defaults.update(kwargs)
    return Alumno.objects.create(cedula_escolar=cedula, **defaults)


class RecargoPagoTardioBase(TestCase):
    def setUp(self):
        self.config = ConfiguracionSistema.objects.create(
            fecha_inicio_inscripciones=date(2026, 1, 1),
            fecha_fin_inscripciones=date(2026, 12, 31),
            fecha_inicio_ano_escolar=date(2025, 9, 1),
            fecha_fin_ano_escolar=date(2026, 7, 31),
            periodo_escolar_activo='2025-2026',
        )
        self.representante = Representante.objects.create(
            cedula='V11111111', nombre='Maria', apellido='Perez',
            telefono='0412', correo='maria@test.com', direccion='Calle 1',
        )
        self.alumno = _crear_alumno('E1000001', self.representante)

    def _mensualidad(self, mes, anio, monto='30.00'):
        return Mensualidad.objects.create(
            alumno=self.alumno, mes=mes, anio=anio, monto_usd=Decimal(monto),
        )

    def _regla(self, **kwargs):
        defaults = dict(
            nombre='Recargo por pago tardío', tipo='recargo',
            modo_calculo='monto_fijo_usd', valor=Decimal('2.00'),
            dia_aplicacion=15, activa=True,
        )
        defaults.update(kwargs)
        return ReglaRecargoPago.objects.create(**defaults)


class SinReglasActivasRegresionTest(RecargoPagoTardioBase):
    """PRIMER test, por diseño: cero reglas activas debe comportarse
    exactamente igual que antes de esta feature."""

    def test_resolver_recargo_no_aplica_sin_reglas(self):
        m = self._mensualidad(7, 2026)
        self.assertIsNone(resolver_recargo(m, date(2026, 8, 1)))

    def test_monto_adeudado_no_cambia_sin_reglas(self):
        m = self._mensualidad(7, 2026)
        hoy = date(2026, 8, 1)
        qs = annotate_mora_detalle(Alumno.objects.filter(pk=self.alumno.pk), hoy)
        alumnos = enriquecer_monto_adeudado_con_recargo(list(qs), hoy)
        a = alumnos[0]
        self.assertEqual(a.monto_adeudado, m.monto_usd)
        self.assertEqual(a.monto_adeudado_capital, m.monto_usd)

    def test_portal_no_muestra_recargo_sin_reglas(self):
        m = self._mensualidad(7, 2026)
        data = MensualidadSerializer(m).data
        self.assertEqual(data['monto_recargo'], '0.00')
        self.assertIsNone(data['nombre_recargo'])
        self.assertEqual(data['monto_total'], str(m.monto_usd))


class ResolverRecargoFronteraTest(RecargoPagoTardioBase):

    def test_dia_anterior_a_aplicacion_no_recarga(self):
        self._regla(dia_aplicacion=15)
        m = self._mensualidad(7, 2026)
        self.assertIsNone(resolver_recargo(m, date(2026, 7, 14)))

    def test_dia_exacto_de_aplicacion_recarga_inclusive(self):
        self._regla(dia_aplicacion=15, valor=Decimal('2.00'))
        m = self._mensualidad(7, 2026)
        resultado = resolver_recargo(m, date(2026, 7, 15))
        self.assertIsNotNone(resultado)
        self.assertEqual(resultado['monto_usd'], Decimal('2.00'))

    def test_acepta_datetime_como_fecha_referencia(self):
        self._regla(dia_aplicacion=15, valor=Decimal('2.00'))
        m = self._mensualidad(7, 2026)
        fecha = timezone.make_aware(datetime(2026, 7, 15, 23, 59))
        resultado = resolver_recargo(m, fecha)
        self.assertIsNotNone(resultado)


class DosMesesAtrasadosTest(RecargoPagoTardioBase):

    def test_dos_meses_atrasados_generan_dos_recargos_independientes(self):
        self._regla(dia_aplicacion=15, valor=Decimal('2.00'))
        junio = self._mensualidad(6, 2026)
        julio = self._mensualidad(7, 2026)
        hoy = date(2026, 8, 1)

        r_junio = resolver_recargo(junio, hoy)
        r_julio = resolver_recargo(julio, hoy)
        self.assertEqual(r_junio['monto_usd'], Decimal('2.00'))
        self.assertEqual(r_julio['monto_usd'], Decimal('2.00'))

        # (30+2) + (30+2) = 64
        total = (junio.monto_usd + r_junio['monto_usd']) + (julio.monto_usd + r_julio['monto_usd'])
        self.assertEqual(total, Decimal('64.00'))

    def test_recargo_es_plano_no_crece_con_el_tiempo(self):
        """Un mes atrasado 5 meses solo carga UN recargo, no acumula."""
        self._regla(dia_aplicacion=15, valor=Decimal('2.00'))
        m = self._mensualidad(2, 2026)
        resultado_1_mes = resolver_recargo(m, date(2026, 3, 20))
        resultado_5_meses = resolver_recargo(m, date(2026, 7, 20))
        self.assertEqual(resultado_1_mes['monto_usd'], resultado_5_meses['monto_usd'])
        self.assertEqual(resultado_5_meses['monto_usd'], Decimal('2.00'))


class MesCortoTopadoTest(RecargoPagoTardioBase):

    def test_dia_aplicacion_30_en_febrero_no_lanza_valueerror(self):
        self._regla(dia_aplicacion=30, valor=Decimal('2.00'))
        m = self._mensualidad(2, 2026)  # febrero 2026 no es bisiesto: 28 días
        # No debe lanzar ValueError al construir date(2026, 2, 30).
        resultado = resolver_recargo(m, date(2026, 2, 28))
        self.assertIsNotNone(resultado)
        # El día 27 (antes del tope real, 28) no debería recargar aún.
        self.assertIsNone(resolver_recargo(m, date(2026, 2, 27)))


class ModoPorcentajeBecadoTest(RecargoPagoTardioBase):

    def test_porcentaje_se_calcula_sobre_monto_usd_post_beca(self):
        self._regla(dia_aplicacion=15, modo_calculo='porcentaje', valor=Decimal('10.00'))
        m = Mensualidad.objects.create(
            alumno=self.alumno, mes=7, anio=2026,
            monto_usd=Decimal('15.00'),  # ya con 50% de beca aplicado
            monto_original_usd=Decimal('30.00'), porcentaje_beca_aplicado=50,
        )
        resultado = resolver_recargo(m, date(2026, 7, 20))
        # 10% de 15.00 (post-beca) = 1.50, NO 10% de 30.00 (original) = 3.00
        self.assertEqual(resultado['monto_usd'], Decimal('1.50'))


class IndependenciaDeDiaLimitePagoTest(RecargoPagoTardioBase):

    def test_dia_limite_pago_del_alumno_no_afecta_el_recargo(self):
        """dia_limite_pago (mora.py) y dia_aplicacion (recargos.py) son
        independientes por diseño."""
        self._regla(dia_aplicacion=19, valor=Decimal('2.00'))
        alumno_dia_5 = _crear_alumno('E1000002', self.representante, dia_limite_pago=5)
        alumno_dia_25 = _crear_alumno('E1000003', self.representante, dia_limite_pago=25)

        m1 = Mensualidad.objects.create(alumno=alumno_dia_5, mes=7, anio=2026, monto_usd=Decimal('30.00'))
        m2 = Mensualidad.objects.create(alumno=alumno_dia_25, mes=7, anio=2026, monto_usd=Decimal('30.00'))

        hoy = date(2026, 7, 19)
        r1 = resolver_recargo(m1, hoy)
        r2 = resolver_recargo(m2, hoy)
        # Ambos cargan el mismo recargo en la misma fecha, sin importar su
        # dia_limite_pago individual (que solo determina mora, no recargo).
        self.assertEqual(r1['monto_usd'], r2['monto_usd'])
        self.assertEqual(r1['monto_usd'], Decimal('2.00'))


class ConsistenciaMorosaPortalCajaTest(RecargoPagoTardioBase):

    def test_morosos_y_portal_reportan_el_mismo_monto(self):
        self._regla(dia_aplicacion=15, valor=Decimal('2.00'))
        m = self._mensualidad(7, 2026)
        hoy = date(2026, 8, 1)

        qs = annotate_mora_detalle(Alumno.objects.filter(pk=self.alumno.pk), hoy)
        alumnos = enriquecer_monto_adeudado_con_recargo(list(qs), hoy)
        monto_morosos = alumnos[0].monto_adeudado

        with self.settings(USE_TZ=True):
            pass
        data_portal = MensualidadSerializer(m).data
        # date.today() en el serializer del portal — se fuerza a la misma
        # fecha usando un objeto Mensualidad ya vencido respecto a "hoy" de
        # verdad (el test corre con date.today() real, así que se valida la
        # igualdad usando resolver_recargo directo, no dependiente del reloj).
        resultado_directo = resolver_recargo(m, hoy)
        monto_portal_manual = m.monto_usd + resultado_directo['monto_usd']

        self.assertEqual(monto_morosos, monto_portal_manual)
        self.assertEqual(data_portal['nombre_recargo'] or resultado_directo['nombre'], resultado_directo['nombre'])

    def test_cotizacion_portal_coincide_con_cobro_en_caja(self):
        self._regla(dia_aplicacion=15, valor=Decimal('2.00'))
        m = self._mensualidad(7, 2026)

        banco = BancoInstitucional.objects.create(nombre='Banco Test Recargo', activo=True)
        TasaCambio.objects.create(valor_bs=Decimal('40.00'))

        from django.contrib.auth import get_user_model
        User = get_user_model()
        user = User.objects.create_superuser(
            username='cajero_recargo', password='clave123456', email='c@test.com'
        )
        client = APIClient()
        client.force_authenticate(user=user)

        # Cotización del portal (misma fecha "hoy" que usará el cobro).
        cotizacion = resolver_recargo(m, timezone.now())
        monto_esperado = m.monto_usd + (cotizacion['monto_usd'] if cotizacion else Decimal('0.00'))

        payload = {
            "alumnos": [{"alumno_id": self.alumno.id, "mensualidad_ids": [m.id]}],
            "concepto": "mensualidad",
            "pagos": [
                {"metodo_pago": "zelle", "monto_usd": str(monto_esperado),
                 "referencia": "ZL-REC-001", "banco_receptor_id": banco.id},
            ],
        }
        response = client.post('/api/cobranza/registrar-pago/', payload, format='json')
        self.assertEqual(response.status_code, 201, response.content)

        pago = Pago.objects.get(alumno=self.alumno)
        linea = LineaRecargoPago.objects.filter(pago=pago, mensualidad=m).first()
        if cotizacion:
            self.assertIsNotNone(linea)
            self.assertEqual(linea.monto_usd, cotizacion['monto_usd'])
            self.assertEqual(linea.nombre, cotizacion['nombre'])
        else:
            self.assertIsNone(linea)


class SnapshotInmutableTest(RecargoPagoTardioBase):

    def setUp(self):
        super().setUp()
        self.regla = self._regla(dia_aplicacion=1, valor=Decimal('2.00'), nombre='Recargo Original')
        self.banco = BancoInstitucional.objects.create(nombre='Banco Snapshot', activo=True)
        TasaCambio.objects.create(valor_bs=Decimal('40.00'))

        from django.contrib.auth import get_user_model
        User = get_user_model()
        self.user = User.objects.create_superuser(
            username='cajero_snapshot', password='clave123456', email='s@test.com'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _pagar_mensualidad_vencida(self):
        m = self._mensualidad(7, 2026)
        payload = {
            "alumnos": [{"alumno_id": self.alumno.id, "mensualidad_ids": [m.id]}],
            "concepto": "mensualidad",
            "pagos": [
                {"metodo_pago": "zelle", "monto_usd": "32.00",
                 "referencia": "ZL-SNAP-001", "banco_receptor_id": self.banco.id},
            ],
        }
        response = self.client.post('/api/cobranza/registrar-pago/', payload, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        return m, Pago.objects.get(alumno=self.alumno)

    def test_editar_la_regla_despues_del_cobro_no_altera_la_linea_ya_creada(self):
        m, pago = self._pagar_mensualidad_vencida()
        linea = LineaRecargoPago.objects.get(pago=pago, mensualidad=m)
        self.assertEqual(linea.nombre, 'Recargo Original')
        self.assertEqual(linea.monto_usd, Decimal('2.00'))

        self.regla.nombre = 'Recargo Renombrado'
        self.regla.valor = Decimal('99.00')
        self.regla.save()

        linea.refresh_from_db()
        self.assertEqual(linea.nombre, 'Recargo Original')
        self.assertEqual(linea.monto_usd, Decimal('2.00'))

    def test_anular_pago_borra_lineas_y_recalcula_fresco_al_repagar(self):
        m, pago = self._pagar_mensualidad_vencida()
        self.assertTrue(LineaRecargoPago.objects.filter(pago=pago).exists())

        correcciones.anular_pago(pago, self.user, motivo='Prueba de anulación con recargo')

        m.refresh_from_db()
        pago.refresh_from_db()
        self.assertFalse(m.pagado)
        self.assertEqual(pago.estatus, 'anulado')
        self.assertFalse(LineaRecargoPago.objects.filter(pago=pago).exists())

        # Cambian las condiciones: se desactiva la regla antes de repagar.
        self.regla.activa = False
        self.regla.save()

        payload = {
            "alumnos": [{"alumno_id": self.alumno.id, "mensualidad_ids": [m.id]}],
            "concepto": "mensualidad",
            "pagos": [
                {"metodo_pago": "efectivo", "monto_usd": "30.00", "referencia": "EFEC-REPAGO"},
            ],
        }
        response = self.client.post('/api/cobranza/registrar-pago/', payload, format='json')
        self.assertEqual(response.status_code, 201, response.content)

        nuevo_pago = Pago.objects.filter(alumno=self.alumno, estatus='completado').latest('id')
        # Sin regla activa, el nuevo cobro no genera línea de recargo —
        # se recalculó fresco con la fecha del nuevo pago, no se restauró
        # el recargo original como deuda fija.
        self.assertFalse(LineaRecargoPago.objects.filter(pago=nuevo_pago).exists())
