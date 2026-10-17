from datetime import datetime, time, timedelta
from decimal import Decimal
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import BancoInstitucional, MetaBanco, Pago, ParametroGlobal, TasaCambio
from secretaria.models import Alumno, Representante


class MetaBancoProgresoTests(APITestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser('meta-admin', 'meta@example.com', 'clave-segura')
        self.sin_permiso = get_user_model().objects.create_user('meta-sin-permiso', password='clave-segura')
        self.banco = BancoInstitucional.objects.create(
            nombre='Banco Meta', activo=True, tipos=['transferencia', 'pago_movil']
        )
        self.representante = Representante.objects.create(
            cedula='V990001', nombre='Ana', apellido='Meta', correo='ana.meta@example.com'
        )
        self.alumno = Alumno.objects.create(
            nombre='Luis', apellido='Meta', cedula_escolar='META-001',
            fecha_nacimiento=timezone.localdate().replace(year=2015), representante=self.representante,
        )
        self.inicio = timezone.localdate().replace(day=1)
        self.fin = self.inicio.replace(day=28)
        ParametroGlobal.objects.create(clave='META_BANCO_HABILITADA', valor='true')
        self.meta = MetaBanco.objects.create(
            banco=self.banco, metodo_pago='transferencia', objetivo_usd=Decimal('100.00'),
            fecha_inicio=self.inicio, fecha_fin=self.fin,
        )

    def _pago(self, monto, metodo='transferencia', fecha=None, **extra):
        pago = Pago.objects.create(
            alumno=self.alumno, usuario_receptor=self.admin, banco_receptor=self.banco,
            metodo_pago=metodo, monto_usd=Decimal(monto), tasa_aplicada=Decimal('40.00'),
            estatus=extra.pop('estatus', 'completado'), concepto=extra.pop('concepto', 'mensualidad'), **extra,
        )
        if fecha:
            Pago.objects.filter(pk=pago.pk).update(fecha_pago=fecha)
        return pago

    def _progreso(self):
        return self.client.get('/api/cobranza/metas-banco/progreso/', {
            'banco': self.banco.id, 'metodo': 'transferencia', 'fecha': self.inicio.isoformat(),
        })

    def test_suma_snapshots_en_limites_inclusivos_y_no_reconvierte_tasa(self):
        zona = timezone.get_current_timezone()
        self._pago('10.00', fecha=timezone.make_aware(datetime.combine(self.inicio, time.min), zona))
        self._pago('15.00', fecha=timezone.make_aware(datetime.combine(self.fin, time.max), zona))
        self._pago('99.00', fecha=timezone.make_aware(datetime.combine(self.fin + timedelta(days=1), time.min), zona))
        TasaCambio.objects.create(valor_bs=Decimal('9999.00'))
        self.client.force_authenticate(self.admin)
        respuesta = self._progreso()
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertEqual(respuesta.data['acumulado_usd'], '25.00')
        self.assertEqual(respuesta.data['restante_usd'], '75.00')

    def test_excluye_anulados_y_otros_metodos(self):
        self._pago('20.00')
        self._pago('30.00', estatus='anulado')
        self._pago('40.00', metodo='pago_movil')
        self.client.force_authenticate(self.admin)
        respuesta = self._progreso()
        self.assertEqual(respuesta.data['acumulado_usd'], '20.00')

    def test_pago_multi_metodo_aporta_una_vez_por_cada_pago(self):
        operacion = uuid4()
        self._pago('10.00', operacion_uuid=operacion)
        self._pago('8.00', metodo='pago_movil', operacion_uuid=operacion)
        self._pago('5.00', operacion_uuid=operacion)
        self.client.force_authenticate(self.admin)
        respuesta = self._progreso()
        # La línea pago móvil no coincide con la meta; las dos transferencias sí,
        # una única vez por registro Pago aunque compartan operación/cuotas.
        self.assertEqual(respuesta.data['acumulado_usd'], '15.00')

    def test_desactivada_y_permisos_de_configuracion(self):
        ParametroGlobal.objects.filter(clave='META_BANCO_HABILITADA').update(valor='false')
        self.client.force_authenticate(self.admin)
        self.assertEqual(self._progreso().data, {'habilitada': False})
        self.client.force_authenticate(self.sin_permiso)
        respuesta = self.client.post('/api/cobranza/metas-banco/', {
            'banco': self.banco.id, 'metodo_pago': 'transferencia', 'objetivo_usd': '10.00',
            'fecha_inicio': self.inicio.isoformat(), 'fecha_fin': self.fin.isoformat(),
        }, format='json')
        self.assertEqual(respuesta.status_code, status.HTTP_403_FORBIDDEN)

    def test_impide_solapamiento_activo(self):
        self.client.force_authenticate(self.admin)
        respuesta = self.client.post('/api/cobranza/metas-banco/', {
            'banco': self.banco.id, 'metodo_pago': 'transferencia', 'objetivo_usd': '10.00',
            'fecha_inicio': self.inicio.isoformat(), 'fecha_fin': self.fin.isoformat(),
        }, format='json')
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('fecha_inicio', respuesta.data)
