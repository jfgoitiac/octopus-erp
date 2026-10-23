"""Tests del envío por WhatsApp de la plantilla de cobro de CxC (envío mockeado)."""
from unittest import mock

from rest_framework import status

from .tests_cxc import BASE
from .tests_plantilla_cobro import PlantillaCobroBase

URL = BASE + 'plantilla-cobro/whatsapp/'
VISTA = 'cantina.views_plantilla_cobro'


class PlantillaCobroWhatsAppTests(PlantillaCobroBase):
    def setUp(self):
        super().setUp()
        self.cargo_con_detalle(3)

    def enviar(self, cuerpo=None, cliente=None, configurado=True, enviado=True):
        cuerpo = cuerpo if cuerpo is not None else {'representante': self.rep.id}
        with mock.patch(f'{VISTA}._whatsapp_meta_configurado', return_value=configurado), \
                mock.patch(f'{VISTA}.enviar_whatsapp_documento', return_value=enviado) as envio:
            res = (cliente or self.client_cajero).post(URL, cuerpo, format='json')
        return res, envio

    def test_envia_pdf_al_telefono_del_titular(self):
        res, envio = self.enviar()
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data['telefono'], '+584141111111')
        args, kwargs = envio.call_args
        self.assertEqual(args[0], '+584141111111')
        self.assertTrue(args[1].startswith(b'%PDF'))
        self.assertTrue(args[2].endswith('.pdf'))
        self.assertEqual(kwargs['tipo'], 'cobro_whatsapp')
        self.assertEqual(kwargs['representante_cedula'], 'V-12345678')

    def test_telefono_indicado_tiene_prioridad(self):
        res, envio = self.enviar({'representante': self.rep.id, 'telefono': '0424-2222222'})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(envio.call_args.args[0], '+584242222222')

    def test_telefono_indicado_invalido(self):
        res, envio = self.enviar({'representante': self.rep.id, 'telefono': '12'})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        envio.assert_not_called()

    def test_titular_sin_telefono(self):
        self.rep.telefono = ''
        self.rep.save()
        res, envio = self.enviar()
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('teléfono', res.data['detail'])
        envio.assert_not_called()

    def test_whatsapp_no_configurado(self):
        res, envio = self.enviar(configurado=False)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('WhatsApp no está configurado', res.data['detail'])
        envio.assert_not_called()

    def test_whatsapp_no_configurado_por_defecto(self):
        # Sin mocks de configuración: no hay proveedor Meta en el entorno de pruebas.
        with mock.patch(f'{VISTA}.enviar_whatsapp_documento') as envio:
            res = self.client_cajero.post(URL, {'representante': self.rep.id}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        envio.assert_not_called()

    def test_falla_del_proveedor_da_502(self):
        res, _ = self.enviar(enviado=False)
        self.assertEqual(res.status_code, status.HTTP_502_BAD_GATEWAY)

    def test_sin_cargos_pendientes(self):
        otro = type(self.rep).objects.create(
            cedula='V-99999999', nombre='Otro', apellido='Sin Deuda',
            telefono='0414-3333333', correo='o@example.com', direccion='X',
        )
        res, envio = self.enviar({'representante': otro.id})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        envio.assert_not_called()

    def test_parametros_invalidos(self):
        for cuerpo in ({}, {'representante': self.rep.id, 'cliente': 1},
                       {'representante': self.rep.id, 'area': 'x'},
                       {'representante': self.rep.id, 'fecha_inicio': 'mal'}):
            res, envio = self.enviar(cuerpo)
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, cuerpo)
            envio.assert_not_called()

    def test_permisos(self):
        from rest_framework.test import APIClient
        res, _ = self.enviar(cliente=APIClient())
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        res, _ = self.enviar(cliente=self.client_admin)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
