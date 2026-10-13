"""
Tests del CRUD de reglas del motor (v4 fase D). Fechas fijas donde importa.
"""
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from multisede.models import PermisoSede, Sede
from usuarios.models import LogAuditoria

from .models import EnvioCobranza, ReglaCobranza
from .motor import REGLAS_POR_DEFECTO
from .test_motor_cobranza import MotorBase

User = get_user_model()
URL = '/api/cobranza/inteligente/reglas/'


def cuerpo(**extra):
    base = {'nombre': 'Aviso extra', 'etapa': 'temprana', 'dia_relativo': 5, 'canal': 'whatsapp',
            'plantilla': 'seguimiento_1'}
    base.update(extra)
    return base


class ReglasBase(MotorBase):
    def setUp(self):
        super().setUp()
        self.api = APIClient()
        self.api.force_authenticate(self.admin)

    def usuario(self, rol, nombre):
        u = User.objects.create_user(nombre, f'{nombre}@t.com', 'x')
        u.perfil.rol = rol
        u.perfil.save()
        return u


class ListarTest(ReglasBase):
    def test_lista_ordenada_por_dia_y_solo_activas_por_defecto(self):
        ReglaCobranza.objects.filter(sede=self.sede, dia_relativo=7).update(activa=False)
        r = self.api.get(URL, {'sede': self.sede.id})
        self.assertEqual(r.status_code, 200)
        dias = [x['dia_relativo'] for x in r.data['results']]
        self.assertEqual(dias, sorted(dias))
        self.assertNotIn(7, dias)
        self.assertEqual(r.data['count'], len(REGLAS_POR_DEFECTO) - 1)
        self.assertEqual(r.data['limites'], {'dia_min': -30, 'dia_max': 90})
        todas = self.api.get(URL, {'sede': self.sede.id, 'todas': 1})
        self.assertEqual(todas.data['count'], len(REGLAS_POR_DEFECTO))
        fila = todas.data['results'][0]
        for k in ('id', 'sede', 'nombre', 'etapa', 'dia_relativo', 'canal', 'plantilla',
                  'plantilla_meta', 'saldo_minimo', 'destinatario', 'activa', 'heredada'):
            self.assertIn(k, fila)
        self.assertFalse(fila['heredada'])
        self.assertEqual(fila['saldo_minimo'], '0.01')

    def test_sede_sin_reglas_propias_ve_las_globales_marcadas_heredadas(self):
        otra = Sede.objects.create(nombre='Sede Sur')
        crear = ReglaCobranza(sede=None, nombre='G', etapa='temprana', dia_relativo=2,
                              canal='email', plantilla='seguimiento_1')
        crear.save()
        r = self.api.get(URL, {'sede': otra.id, 'todas': 1})
        self.assertEqual([x['nombre'] for x in r.data['results']], ['G'])
        self.assertTrue(r.data['results'][0]['heredada'])

    def test_funciona_con_el_modulo_apagado(self):
        self.config(activo=False)
        self.assertEqual(self.api.get(URL, {'sede': self.sede.id}).status_code, 200)

    def test_sede_invalida_y_ajena(self):
        self.assertEqual(self.api.get(URL, {'sede': 'x'}).status_code, 400)
        otra = Sede.objects.create(nombre='Sede Sur')
        u = self.usuario('director', 'dir1')
        PermisoSede.objects.create(user=u, sede=self.sede, rol='director', activo=True)
        PermisoSede.objects.create(user=User.objects.create_user('z', 'z@t.com', 'x'),
                                   sede=otra, rol='director', activo=True)
        api = APIClient()
        api.force_authenticate(u)
        self.assertEqual(api.get(URL, {'sede': otra.id}).status_code, 404)
        self.assertEqual(api.get(URL, {'sede': self.sede.id}).status_code, 200)


class CrearTest(ReglasBase):
    def test_crea_y_audita(self):
        r = self.api.post(URL + f'?sede={self.sede.id}', cuerpo(saldo_minimo='5', plantilla_meta='cobro_x'),
                          format='json')
        self.assertEqual(r.status_code, 201, r.data)
        regla = ReglaCobranza.objects.get(pk=r.data['id'])
        self.assertEqual((regla.sede_id, regla.dia_relativo, str(regla.saldo_minimo), regla.plantilla_meta,
                          regla.activa, regla.destinatario),
                         (self.sede.id, 5, '5.00', 'cobro_x', True, 'representante'))
        self.assertEqual(r.data['reglas_copiadas_de_globales'], 0)
        self.assertTrue(LogAuditoria.objects.filter(accion='COBRANZA_REGLA_CREADA').exists())

    def test_validaciones(self):
        casos = [
            (cuerpo(nombre='  '), 'nombre'),
            (cuerpo(etapa='x'), 'etapa'),
            (cuerpo(canal='sms'), 'canal'),
            (cuerpo(destinatario='otro'), 'destinatario'),
            (cuerpo(dia_relativo='abc'), 'día relativo'),
            (cuerpo(dia_relativo=500), 'entre'),
            (cuerpo(plantilla='inventada'), 'Plantilla'),
            (cuerpo(saldo_minimo='-1'), 'saldo'),
            (cuerpo(saldo_minimo='mucho'), 'saldo'),
            (cuerpo(dia_relativo=3), 'Ya existe'),     # el 3 ya está en las de por defecto
        ]
        for datos, texto in casos:
            r = self.api.post(URL + f'?sede={self.sede.id}', datos, format='json')
            self.assertEqual(r.status_code, 400, datos)
            self.assertIn(texto, r.data['detail'])
        faltante = cuerpo()
        del faltante['canal']
        self.assertEqual(self.api.post(URL + f'?sede={self.sede.id}', faltante, format='json').status_code, 400)

    def test_primer_post_en_sede_que_hereda_copia_las_globales(self):
        otra = Sede.objects.create(nombre='Sede Sur')
        ReglaCobranza.objects.create(sede=None, nombre='G1', etapa='temprana', dia_relativo=2,
                                     canal='email', plantilla='seguimiento_1')
        r = self.api.post(URL + f'?sede={otra.id}', cuerpo(), format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data['reglas_copiadas_de_globales'], 1)
        self.assertEqual(ReglaCobranza.objects.filter(sede=otra).count(), 2)
        self.assertEqual(ReglaCobranza.objects.filter(sede__isnull=True).count(), 1)

    def test_solo_director_o_admin_escribe(self):
        cobrador = self.usuario('cobranza', 'cob1')
        api = APIClient()
        api.force_authenticate(cobrador)
        self.assertEqual(api.get(URL, {'sede': self.sede.id}).status_code, 200)
        self.assertEqual(api.post(URL + f'?sede={self.sede.id}', cuerpo(), format='json').status_code, 403)
        regla = ReglaCobranza.objects.filter(sede=self.sede).first()
        self.assertEqual(api.patch(f'{URL}{regla.id}/', {'activa': False}, format='json').status_code, 403)


class EditarTest(ReglasBase):
    def regla(self, dia=3):
        return ReglaCobranza.objects.get(sede=self.sede, dia_relativo=dia)

    def test_patch_parcial_y_audita(self):
        r = self.api.patch(f'{URL}{self.regla().id}/', {'activa': False, 'nombre': 'Nuevo', 'saldo_minimo': 10},
                           format='json')
        self.assertEqual(r.status_code, 200, r.data)
        regla = self.regla()
        self.assertEqual((regla.activa, regla.nombre, str(regla.saldo_minimo)), (False, 'Nuevo', '10.00'))
        log = LogAuditoria.objects.get(accion='COBRANZA_REGLA_EDITADA')
        self.assertTrue(log.detalles['antes']['activa'])

    def test_no_cambia_la_sede_ni_pisa_el_dia_de_otra(self):
        otra = Sede.objects.create(nombre='Sede Sur')
        regla = self.regla()
        self.api.patch(f'{URL}{regla.id}/', {'sede': otra.id}, format='json')
        regla.refresh_from_db()
        self.assertEqual(regla.sede_id, self.sede.id)
        r = self.api.patch(f'{URL}{regla.id}/', {'dia_relativo': 7}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.api.patch(f'{URL}{regla.id}/', {'dia_relativo': 4}, format='json').status_code, 200)

    def test_inexistente_404_y_regla_con_envios_se_puede_desactivar(self):
        self.assertEqual(self.api.patch(f'{URL}99999/', {'activa': False}, format='json').status_code, 404)
        self.mens(self.alumno(dia_limite=17))
        self.preparar()
        self.assertTrue(EnvioCobranza.objects.exists())
        self.assertEqual(self.api.patch(f'{URL}{self.regla().id}/', {'activa': False}, format='json').status_code, 200)

    def test_sede_ajena_da_404(self):
        otra = Sede.objects.create(nombre='Sede Sur')
        u = self.usuario('director', 'dir1')
        PermisoSede.objects.create(user=u, sede=otra, rol='director', activo=True)
        PermisoSede.objects.create(user=User.objects.create_user('z', 'z@t.com', 'x'),
                                   sede=self.sede, rol='director', activo=True)
        api = APIClient()
        api.force_authenticate(u)
        self.assertEqual(api.patch(f'{URL}{self.regla().id}/', {'activa': False}, format='json').status_code, 404)


class CopiarGlobalesTest(ReglasBase):
    URL_COPIAR = URL + 'copiar-globales/'

    def setUp(self):
        super().setUp()
        self.otra = Sede.objects.create(nombre='Sede Sur')
        ReglaCobranza.objects.create(sede=None, nombre='G1', etapa='temprana', dia_relativo=2,
                                     canal='email', plantilla='seguimiento_1')

    def test_copia_las_globales_a_la_sede_que_hereda(self):
        globales = ReglaCobranza.objects.filter(sede__isnull=True).count()
        r = self.api.post(self.URL_COPIAR, {'sede': self.otra.id}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual((r.data['count'], r.data['copiadas']), (globales, globales))
        self.assertEqual(len(r.data['results']), globales)
        self.assertTrue(all(f['sede'] == self.otra.id and not f['heredada'] for f in r.data['results']))
        self.assertEqual(ReglaCobranza.objects.filter(sede__isnull=True).count(), globales)
        self.assertTrue(LogAuditoria.objects.filter(accion='COBRANZA_REGLAS_COPIADAS_DE_GLOBALES').exists())

    def test_idempotente_si_ya_tiene_propias(self):
        self.api.post(self.URL_COPIAR, {'sede': self.otra.id}, format='json')
        propias = ReglaCobranza.objects.filter(sede=self.otra).count()
        r = self.api.post(self.URL_COPIAR + f'?sede={self.otra.id}', format='json')
        self.assertEqual((r.status_code, r.data['copiadas'], r.data['count']), (200, 0, propias))
        self.assertEqual(ReglaCobranza.objects.filter(sede=self.otra).count(), propias)
        self.assertEqual(LogAuditoria.objects.filter(accion='COBRANZA_REGLAS_COPIADAS_DE_GLOBALES').count(), 1)

    def test_sin_sede_es_400(self):
        self.assertEqual(self.api.post(self.URL_COPIAR, {}, format='json').status_code, 400)
        self.assertEqual(self.api.post(self.URL_COPIAR, {'sede': 'x'}, format='json').status_code, 400)

    def test_permisos(self):
        api = APIClient()
        api.force_authenticate(self.usuario('cobranza', 'cob1'))
        self.assertEqual(api.post(self.URL_COPIAR, {'sede': self.otra.id}, format='json').status_code, 403)
        u = self.usuario('director', 'dir1')
        PermisoSede.objects.create(user=u, sede=self.sede, rol='director', activo=True)
        api.force_authenticate(u)
        self.assertEqual(api.post(self.URL_COPIAR, {'sede': self.otra.id}, format='json').status_code, 404)
