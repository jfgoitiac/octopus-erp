"""El pago de penalidades utiliza ingresos reales, exactos y auditables."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient

from authentication.models import PerfilUsuario
from multisede.models import PermisoSede, Sede
from secretaria.models import Representante

from . import gestion
from .correcciones import anular_pago, corregir_pago, elegibilidad_monto
from .models import EventoCiclo, Pago, RecargoConvenio
from .pagos_recargos_convenio import aplicar_pago_recargo
from .saldos_recargos_convenio import items_penalidades_convenio
from .test_motor_cobranza import AHORA, HOY
from .test_recargos_convenio import RecargoConvenioBase


class PagoRecargoConvenioTest(RecargoConvenioBase):
    def setUp(self):
        super().setUp()
        self.ciclo_pago, self.convenio = self.crear(configuracion=self.configuracion())
        gestion.incumplir_convenio(self.convenio, momento=AHORA)
        self.recargo = self.convenio.recargos_incumplimiento.get()
        self.api = APIClient()
        self.api.force_authenticate(self.admin)

    def pago(self, **cambios):
        datos = {
            'alumno': self.ciclo_pago.mensualidad.alumno, 'usuario_receptor': self.admin,
            'sede': self.sede, 'metodo_pago': 'efectivo', 'concepto': 'multa',
            'monto_usd': Decimal('5.00'), 'monto_ves': Decimal('500.00'),
            'tasa_aplicada': Decimal('100.00'), 'fecha_pago': AHORA,
        }
        datos.update(cambios)
        return Pago.objects.create(**datos)

    def url(self, recargo=None):
        return f'/api/cobranza/inteligente/convenios/recargos/{(recargo or self.recargo).id}/pagar/'

    def test_api_aplica_ingreso_real_sin_crear_otro_pago_y_audita(self):
        pago = self.pago()
        respuesta = self.api.post(self.url(), {'pago_id': pago.id}, format='json')
        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        self.recargo.refresh_from_db()
        self.assertEqual(self.recargo.estado, RecargoConvenio.PAGADO)
        self.assertEqual(self.recargo.pago_id, pago.id)
        self.assertEqual(self.recargo.pagado_por_id, self.admin.id)
        self.assertIsNotNone(self.recargo.pagado_en)
        self.assertEqual(Pago.objects.count(), 1)
        self.assertEqual(items_penalidades_convenio(representante_ids=[self.rep.id], hoy=HOY), [])
        evento = EventoCiclo.objects.get(tipo='recargo_convenio_pagado')
        self.assertEqual(evento.detalle['pago'], pago.id)
        self.assertEqual(evento.detalle['recargo'], self.recargo.id)

    def test_reintento_idempotente_no_duplica_eventos(self):
        pago = self.pago()
        aplicar_pago_recargo(self.recargo.id, pago.id, self.admin)
        original = RecargoConvenio.objects.get(pk=self.recargo.pk).pagado_en
        aplicar_pago_recargo(self.recargo.id, pago.id, self.admin)
        self.recargo.refresh_from_db()
        self.assertEqual(self.recargo.pagado_en, original)
        self.assertEqual(EventoCiclo.objects.filter(tipo='recargo_convenio_pagado').count(), 1)

    def test_un_ingreso_no_paga_dos_penalidades(self):
        otro = RecargoConvenio.objects.create(
            convenio=self.convenio, numero_periodo=2, fecha_programada=HOY,
            modo_calculo='monto_fijo_usd', valor_configurado='5.00',
            saldo_base_usd='50.00', monto_recargo_usd='5.00')
        pago = self.pago()
        aplicar_pago_recargo(self.recargo.id, pago.id, self.admin)
        with self.assertRaises(gestion.AccionInvalida):
            aplicar_pago_recargo(otro.id, pago.id, self.admin)
        otro.refresh_from_db()
        self.assertEqual(otro.estado, RecargoConvenio.PENDIENTE)
        self.assertIsNone(otro.pago_id)

    def test_no_sustituye_pago_completado_por_otro(self):
        pago, otro = self.pago(), self.pago()
        aplicar_pago_recargo(self.recargo.id, pago.id, self.admin)
        with self.assertRaises(gestion.AccionInvalida):
            aplicar_pago_recargo(self.recargo.id, otro.id, self.admin)

    def test_rechaza_estado_concepto_monto_vuelto_y_excedente(self):
        for cambios in (
            {'estatus': 'en_revision'}, {'estatus': 'anulado'}, {'concepto': 'otro'},
            {'monto_usd': Decimal('4.00'), 'monto_ves': Decimal('400.00')},
            {'vuelto_usd': Decimal('1.00')}, {'vuelto_ves': Decimal('1.00')},
            {'excedente_usd': Decimal('1.00')},
            {'excedente_ves': Decimal('1.00')},
        ):
            with self.subTest(cambios=cambios):
                pago = self.pago(**cambios)
                respuesta = self.api.post(self.url(), {'pago_id': pago.id}, format='json')
                self.assertEqual(respuesta.status_code, 400, respuesta.data)
                self.recargo.refresh_from_db()
                self.assertIsNone(self.recargo.pago_id)

    def test_no_reutiliza_ingreso_aplicado_a_mensualidad(self):
        pago = self.pago()
        pago.mensualidades_pagadas.add(self.ciclo_pago.mensualidad)
        with self.assertRaises(gestion.AccionInvalida):
            aplicar_pago_recargo(self.recargo.id, pago.id, self.admin)

    def test_no_paga_penalidad_anulada(self):
        self.recargo.estado = RecargoConvenio.ANULADO
        self.recargo.save(update_fields=['estado'])
        with self.assertRaises(gestion.AccionInvalida):
            aplicar_pago_recargo(self.recargo.id, self.pago().id, self.admin)

    def test_pago_ajeno_a_familia_o_estudiante_del_convenio_se_rechaza(self):
        otra_rep = Representante.objects.create(cedula='VOTRA', nombre='Otra', apellido='Familia')
        ajeno = self.alumno('EOTRO', rep=otra_rep)
        hermano_sin_convenio = self.alumno('EHERMANO')
        for alumno in (ajeno, hermano_sin_convenio):
            with self.subTest(alumno=alumno.id), self.assertRaises(gestion.AccionInvalida):
                aplicar_pago_recargo(self.recargo.id, self.pago(alumno=alumno).id, self.admin)

    def test_pago_de_sede_distinta_se_rechaza(self):
        otra_sede = Sede.objects.create(nombre='Sede ajena')
        pago = self.pago(sede=otra_sede)
        with self.assertRaises(gestion.AccionInvalida):
            aplicar_pago_recargo(self.recargo.id, pago.id, self.admin)

    def test_anular_ingreso_reabre_saldo_y_repago_conserva_evento_anterior(self):
        pago = self.pago()
        aplicar_pago_recargo(self.recargo.id, pago.id, self.admin)
        anular_pago(pago, self.admin, 'Reverso bancario')
        items = items_penalidades_convenio(representante_ids=[self.rep.id], hoy=HOY)
        self.assertEqual([item['id'] for item in items], [self.recargo.id])
        nuevo = self.pago()
        aplicar_pago_recargo(self.recargo.id, nuevo.id, self.admin)
        self.recargo.refresh_from_db()
        self.assertEqual(self.recargo.pago_id, nuevo.id)
        eventos = list(EventoCiclo.objects.filter(tipo='recargo_convenio_pagado').order_by('id'))
        self.assertEqual(len(eventos), 2)
        self.assertEqual(eventos[0].detalle['pago'], pago.id)
        self.assertEqual(eventos[1].detalle['pago_anterior'], pago.id)
        self.assertEqual(items_penalidades_convenio(representante_ids=[self.rep.id], hoy=HOY), [])

    def test_no_corrige_monto_ingreso_imputado_a_penalidad(self):
        pago = self.pago()
        aplicar_pago_recargo(self.recargo.id, pago.id, self.admin)
        self.assertFalse(elegibilidad_monto(pago)['editable'])
        with self.assertRaises(ValidationError):
            corregir_pago(pago, {'monto_usd': Decimal('1.00')}, self.admin, 'No debe alterar deuda')
        pago.refresh_from_db()
        self.assertEqual(pago.monto_usd, Decimal('5.00'))

    def test_api_respeta_permiso_sede_y_valida_identificador(self):
        otra = Sede.objects.create(nombre='Segunda sede')
        usuario = get_user_model().objects.create_user('cobranza-otra', password='x')
        PerfilUsuario.objects.update_or_create(user=usuario, defaults={'rol': 'cobranza'})
        PermisoSede.objects.create(user=usuario, sede=otra, rol='cobranza')
        from .models import ConfiguracionCobranzaInteligente
        ConfiguracionCobranzaInteligente.objects.create(sede=otra, activo=True)
        pago = self.pago()
        self.api.force_authenticate(usuario)
        respuesta = self.api.post(self.url(), {'pago_id': pago.id}, format='json')
        self.assertEqual(respuesta.status_code, 404)
        self.api.force_authenticate(self.admin)
        for identificador in (None, True, 'NaN', -1, '1.5', '9' * 25):
            with self.subTest(identificador=identificador):
                respuesta = self.api.post(self.url(), {'pago_id': identificador}, format='json')
                self.assertEqual(respuesta.status_code, 400, respuesta.data)

    def test_api_no_permite_ingreso_de_sede_inaccesible_aunque_vea_el_convenio(self):
        otra = Sede.objects.create(nombre='Sede del ingreso ajeno')
        usuario = get_user_model().objects.create_user('cobranza-local', password='x')
        PerfilUsuario.objects.update_or_create(user=usuario, defaults={'rol': 'cobranza'})
        PermisoSede.objects.create(user=usuario, sede=self.sede, rol='cobranza')
        pago = self.pago(sede=otra)
        self.api.force_authenticate(usuario)
        respuesta = self.api.post(self.url(), {'pago_id': pago.id}, format='json')
        self.assertEqual(respuesta.status_code, 404, respuesta.data)
        self.recargo.refresh_from_db()
        self.assertIsNone(self.recargo.pago_id)

    def test_api_exige_autenticacion(self):
        self.api.force_authenticate(user=None)
        respuesta = self.api.post(self.url(), {'pago_id': self.pago().id}, format='json')
        self.assertIn(respuesta.status_code, (401, 403))
