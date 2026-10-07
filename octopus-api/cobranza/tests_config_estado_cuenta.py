from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from .models import BancoInstitucional, validar_config_estado_cuenta
from .tests_conciliacion_semiauto import crear_usuario

URL_ADMIN = '/api/cobranza/bancos/admin/'
CONFIG_OK = {
    'columnas': {'referencia': ['Nro. Op'], 'fecha': ['F. Valor'], 'monto': ['Importe']},
    'formato_fecha': 'dd/MM/yyyy',
    'separador_decimal': ',',
    'filas_encabezado_max': 20,
}


class ValidacionConfigEstadoCuentaTest(TestCase):
    def test_acepta_vacio_y_completo(self):
        validar_config_estado_cuenta({})
        validar_config_estado_cuenta(CONFIG_OK)

    def test_rechaza_invalidos(self):
        malos = [
            [], 'x', {'otra': 1},
            {'columnas': []}, {'columnas': {'banco': ['a']}},
            {'columnas': {'fecha': []}}, {'columnas': {'fecha': 'Fecha'}},
            {'columnas': {'fecha': ['']}}, {'columnas': {'fecha': [5]}},
            {'columnas': {'fecha': ['a' * 81]}},
            {'formato_fecha': 'yy-mm'}, {'separador_decimal': ';'},
            {'filas_encabezado_max': 0}, {'filas_encabezado_max': 51},
            {'filas_encabezado_max': '5'}, {'filas_encabezado_max': True},
        ]
        for valor in malos:
            with self.subTest(valor=valor):
                with self.assertRaises(ValidationError):
                    validar_config_estado_cuenta(valor)

    def test_clean_del_modelo(self):
        banco = BancoInstitucional(nombre='B Clean', config_estado_cuenta={'x': 1})
        with self.assertRaises(ValidationError) as ctx:
            banco.full_clean()
        self.assertIn('config_estado_cuenta', ctx.exception.message_dict)
        BancoInstitucional(nombre='B Ok', config_estado_cuenta=CONFIG_OK).full_clean()

    def test_default_es_dict_vacio(self):
        self.assertEqual(BancoInstitucional.objects.create(nombre='B Def').config_estado_cuenta, {})


class ConfigEstadoCuentaApiTest(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = APIClient()
        self.admin.force_authenticate(user=crear_usuario('cfg_dir', rol='director'))
        self.cajero = APIClient()
        self.cajero.force_authenticate(user=crear_usuario('cfg_caja', rol='cobranza'))

    def test_round_trip(self):
        r = self.admin.post(URL_ADMIN, {
            'nombre': 'Banco Nuevo Cfg', 'formato_estado_cuenta': 'generico',
            'color': '#112233', 'activo_conciliador': True,
            'config_estado_cuenta': CONFIG_OK,
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['config_estado_cuenta'], CONFIG_OK)
        pk = r.data['id']
        r = self.admin.patch(f'{URL_ADMIN}{pk}/', {'config_estado_cuenta': {'separador_decimal': '.'}}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        r = self.admin.get(f'{URL_ADMIN}{pk}/')
        self.assertEqual(r.data['config_estado_cuenta'], {'separador_decimal': '.'})
        self.assertEqual(r.data['color'], '#112233')

    def test_rechaza_config_invalida(self):
        r = self.admin.post(URL_ADMIN, {
            'nombre': 'Banco Malo Cfg', 'config_estado_cuenta': {'formato_fecha': 'x'},
        }, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('config_estado_cuenta', r.data)
        self.assertFalse(BancoInstitucional.objects.filter(nombre='Banco Malo Cfg').exists())

    def test_rol_sin_acceso_403(self):
        banco = BancoInstitucional.objects.create(nombre='B 403')
        self.assertEqual(self.cajero.get(URL_ADMIN).status_code, 403)
        r = self.cajero.patch(f'{URL_ADMIN}{banco.pk}/', {'config_estado_cuenta': CONFIG_OK}, format='json')
        self.assertEqual(r.status_code, 403)
        banco.refresh_from_db()
        self.assertEqual(banco.config_estado_cuenta, {})

    def test_para_conciliador_incluye_config(self):
        BancoInstitucional.objects.create(
            nombre='B Conc Cfg', activo=False, activo_conciliador=True,
            formato_estado_cuenta='bdt', color='#abcdef', config_estado_cuenta=CONFIG_OK,
        )
        r = self.cajero.get('/api/cobranza/bancos/?para=conciliador')
        self.assertEqual(r.status_code, 200)
        fila = next(b for b in r.data if b['nombre'] == 'B Conc Cfg')
        self.assertEqual(fila['config_estado_cuenta'], CONFIG_OK)
        self.assertEqual(fila['formato_estado_cuenta'], 'bdt')
        self.assertEqual(fila['color'], '#abcdef')
        self.assertTrue(fila['activo_conciliador'])
