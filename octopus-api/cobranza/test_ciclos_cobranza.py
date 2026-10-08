"""
Tests de los ciclos de Cobranza Inteligente (PLAN_COBRANZA_INTELIGENTE.md, Fase 1).
`hoy` se fija siempre: nada depende de la fecha real salvo donde se indica.
"""
from datetime import date

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from multisede.models import Sede
from secretaria.models import Alumno, Representante

from .ciclos import (
    cerrar_ciclo_si_pagado, etapa_por_dias, evaluar_ciclos,
    evaluar_ciclos_sede, poner_al_dia_sede,
)
from .models import (
    CicloCobranza, ConfiguracionCobranzaInteligente, EventoCiclo, Mensualidad,
)
from .mora import annotate_en_mora

User = get_user_model()
HOY = date(2026, 7, 20)  # con dia_limite_pago=5, julio vence el 5/jul (+15 días)


class CicloBase(TestCase):
    def setUp(self):
        self.sede = Sede.objects.create(nombre='Sede Norte')
        self.rep = Representante.objects.create(
            cedula='V1', nombre='M', apellido='P', telefono='0412', correo='m@t.com', direccion='c')
        self.admin = User.objects.create_superuser('admin', 'a@t.com', 'x')

    def alumno(self, cedula='E1', **kw):
        return Alumno.objects.create(
            cedula_escolar=cedula, nombre='A', apellido=cedula,
            fecha_nacimiento=date(2015, 1, 1), dia_limite_pago=5,
            representante=self.rep, sede=self.sede, **kw)

    def mens(self, alumno, mes, anio=2026, monto=50, pagado=0):
        return Mensualidad.objects.create(
            alumno=alumno, mes=mes, anio=anio, monto_usd=monto, monto_pagado=pagado)

    def encender(self):
        ConfiguracionCobranzaInteligente.objects.update_or_create(
            sede=self.sede, defaults={'activo': True})


class EtapaTest(TestCase):
    def test_limites_de_etapa(self):
        casos = {-5: 'preventiva', -1: 'preventiva', 0: 'vencida', 2: 'vencida',
                 3: 'seguimiento', 14: 'seguimiento', 15: 'prioritaria',
                 29: 'prioritaria', 30: 'critica', 90: 'critica'}
        for dias, esperado in casos.items():
            self.assertEqual(etapa_por_dias(dias), esperado, dias)


class EvaluarCiclosTest(CicloBase):
    def test_modulo_apagado_no_crea_nada(self):
        self.mens(self.alumno(), 7)
        self.assertEqual(evaluar_ciclos(HOY), {})
        self.assertEqual(CicloCobranza.objects.count(), 0)

    def test_crea_ciclo_con_vencimiento_guardado_y_etapa(self):
        a = self.alumno()
        m = self.mens(a, 7)
        self.encender()
        evaluar_ciclos_sede(self.sede.id, HOY)
        c = m.ciclo
        self.assertEqual(c.fecha_vencimiento, date(2026, 7, 5))
        self.assertEqual(c.estado, 'prioritaria')  # +15
        # cambiar el día límite NO mueve la deuda ya creada
        a.dia_limite_pago = 28
        a.save()
        evaluar_ciclos_sede(self.sede.id, HOY)
        c.refresh_from_db()
        self.assertEqual(c.fecha_vencimiento, date(2026, 7, 5))

    def test_es_idempotente(self):
        self.mens(self.alumno(), 7)
        self.encender()
        evaluar_ciclos_sede(self.sede.id, HOY)
        eventos = EventoCiclo.objects.count()
        r = evaluar_ciclos_sede(self.sede.id, HOY)
        self.assertEqual(r, {'creados': 0, 'cerrados': 0, 'cambios_etapa': 0})
        self.assertEqual(EventoCiclo.objects.count(), eventos)
        self.assertEqual(CicloCobranza.objects.count(), 1)

    def test_cambio_de_etapa_con_el_paso_de_los_dias(self):
        m = self.mens(self.alumno(), 7)
        self.encender()
        evaluar_ciclos_sede(self.sede.id, date(2026, 7, 1))
        m.ciclo.refresh_from_db()
        self.assertEqual(m.ciclo.estado, 'preventiva')
        evaluar_ciclos_sede(self.sede.id, date(2026, 7, 5))
        m.ciclo.refresh_from_db()
        self.assertEqual(m.ciclo.estado, 'vencida')
        evaluar_ciclos_sede(self.sede.id, date(2026, 8, 10))
        m.ciclo.refresh_from_db()
        self.assertEqual(m.ciclo.estado, 'critica')
        self.assertEqual(
            EventoCiclo.objects.filter(ciclo=m.ciclo, tipo='cambio_etapa').count(), 2)

    def test_pagada_por_completo_cierra_en_el_acto(self):
        m = self.mens(self.alumno(), 7)
        self.encender()
        evaluar_ciclos_sede(self.sede.id, HOY)
        m.monto_pagado = 50
        m.save()  # la señal cierra el ciclo sin esperar a la tarea diaria
        m.ciclo.refresh_from_db()
        self.assertEqual(m.ciclo.estado, 'cerrada')
        self.assertEqual(m.ciclo.motivo_cierre, 'pagada')

    def test_pago_parcial_mantiene_el_ciclo_abierto_con_saldo_correcto(self):
        m = self.mens(self.alumno(), 7)
        self.encender()
        evaluar_ciclos_sede(self.sede.id, HOY)
        m.monto_pagado = 20
        m.save()
        m.ciclo.refresh_from_db()
        self.assertTrue(m.ciclo.abierto)
        self.assertEqual(m.monto_usd - m.monto_pagado, 30)

    def test_pausada_conserva_su_estado_aunque_pasen_los_dias(self):
        m = self.mens(self.alumno(), 7)
        self.encender()
        evaluar_ciclos_sede(self.sede.id, date(2026, 7, 6))
        CicloCobranza.objects.filter(pk=m.ciclo.pk).update(estado='pausada', motivo_pausa='reclamo')
        evaluar_ciclos_sede(self.sede.id, date(2026, 9, 1))
        m.ciclo.refresh_from_db()
        self.assertEqual(m.ciclo.estado, 'pausada')

    def test_alumno_retirado_cierra_el_ciclo(self):
        a = self.alumno()
        m = self.mens(a, 7)
        self.encender()
        evaluar_ciclos_sede(self.sede.id, HOY)
        Alumno.todos.filter(pk=a.pk).update(activo=False)
        evaluar_ciclos_sede(self.sede.id, HOY)
        m.ciclo.refresh_from_db()
        self.assertEqual(m.ciclo.motivo_cierre, 'retirado')

    def test_becados_y_pagadas_no_generan_ciclo(self):
        becado = self.alumno('E2', estatus_financiero='becado')
        self.mens(becado, 7)
        self.mens(self.alumno('E3'), 7, pagado=50)
        self.encender()
        evaluar_ciclos_sede(self.sede.id, HOY)
        self.assertEqual(CicloCobranza.objects.count(), 0)

    def test_mensualidad_nueva_con_modulo_encendido_crea_su_ciclo(self):
        a = self.alumno()
        self.encender()
        m = self.mens(a, 7)
        self.assertTrue(CicloCobranza.objects.filter(mensualidad=m).exists())

    def test_cerrar_sin_ciclo_no_falla(self):
        m = self.mens(self.alumno(), 7, pagado=50)
        self.assertFalse(cerrar_ciclo_si_pagado(m))

    def test_historial_es_de_solo_insercion(self):
        self.mens(self.alumno(), 7)
        self.encender()
        evaluar_ciclos_sede(self.sede.id, HOY)
        e = EventoCiclo.objects.first()
        e.tipo = 'otro'
        with self.assertRaises(ValidationError):
            e.save()
        with self.assertRaises(ValidationError):
            e.delete()


class CoincidenciaConMorososTest(CicloBase):
    def test_cartera_vencida_coincide_con_la_mora_canonica(self):
        a1, a2, a3, a4, a5 = (self.alumno(f'E{i}') for i in range(1, 6))
        becado = self.alumno('E9', estatus_financiero='becado')
        self.mens(a1, 5)              # mes pasado impago -> mora
        self.mens(a2, 7)              # venció el 5/jul -> mora
        a3.dia_limite_pago = 28
        a3.save()
        self.mens(a3, 7)              # vence el 28/jul -> aún no
        self.mens(a4, 7, pagado=50)   # pagada -> no
        self.mens(a5, 7, pagado=10)   # parcial vencida -> mora
        self.mens(becado, 5)          # becado -> excluido de ambos
        self.encender()
        evaluar_ciclos_sede(self.sede.id, HOY)

        en_ciclos = set(
            CicloCobranza.objects.exclude(estado='preventiva')
            .values_list('mensualidad__alumno_id', flat=True))
        base = Alumno.objects.filter(activo=True).exclude(estatus_financiero='becado')
        en_mora = set(annotate_en_mora(base, HOY).filter(en_mora=True).values_list('id', flat=True))
        self.assertEqual(en_ciclos, en_mora)
        self.assertEqual(en_mora, {a1.id, a2.id, a5.id})


class PuestaAlDiaYApiTest(CicloBase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_encender_por_api_hace_puesta_al_dia_sin_enviar_nada(self):
        self.mens(self.alumno(), 7)
        url = f'/api/cobranza/inteligente/configuracion/?sede={self.sede.id}'
        r = self.client.patch(url, {'activo': True}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(CicloCobranza.objects.count(), 1)
        self.assertTrue(EventoCiclo.objects.filter(tipo='modulo_encendido', sede=self.sede).exists())

    def test_apagar_deja_evento_y_conserva_los_datos(self):
        self.mens(self.alumno(), 7)
        url = f'/api/cobranza/inteligente/configuracion/?sede={self.sede.id}'
        self.client.patch(url, {'activo': True}, format='json')
        self.client.patch(url, {'activo': False, 'motivo': 'vacaciones'}, format='json')
        self.assertEqual(CicloCobranza.objects.count(), 1)
        e = EventoCiclo.objects.get(tipo='modulo_apagado')
        self.assertEqual(e.detalle['motivo'], 'vacaciones')

    def test_apagado_la_cartera_responde_409(self):
        r = self.client.get('/api/cobranza/inteligente/cartera/')
        self.assertEqual(r.status_code, 409)
        self.assertTrue(r.data['apagada'])

    def test_cartera_filtra_por_estado_y_muestra_dias_de_mora(self):
        self.mens(self.alumno('E1'), 7)
        self.mens(self.alumno('E2'), 12)   # diciembre: aún no vence
        self.encender()
        evaluar_ciclos_sede(self.sede.id, HOY)
        r = self.client.get('/api/cobranza/inteligente/cartera/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['count'], 2)
        r = self.client.get('/api/cobranza/inteligente/cartera/', {'estado': 'preventiva'})
        self.assertEqual(r.data['count'], 1)
        fila = r.data['results'][0]
        self.assertEqual(fila['estado'], 'preventiva')
        self.assertEqual(fila['dias_mora'], 0)
        self.assertEqual(fila['semaforo'], 'verde')

    def test_cartera_solo_incluye_sedes_encendidas(self):
        otra = Sede.objects.create(nombre='Sede Sur')
        a_otra = Alumno.objects.create(
            cedula_escolar='E7', nombre='B', apellido='S', fecha_nacimiento=date(2015, 1, 1),
            dia_limite_pago=5, representante=self.rep, sede=otra)
        self.mens(a_otra, 7)
        self.mens(self.alumno(), 7)
        self.encender()
        evaluar_ciclos_sede(self.sede.id, HOY)
        r = self.client.get('/api/cobranza/inteligente/cartera/')
        self.assertEqual(r.data['count'], 1)

    def test_expediente_del_representante(self):
        a = self.alumno()
        self.mens(a, 7)
        self.mens(a, 6)
        self.encender()
        evaluar_ciclos_sede(self.sede.id, HOY)
        r = self.client.get(f'/api/cobranza/inteligente/representantes/{self.rep.id}/expediente/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data['ciclos']), 2)
        self.assertEqual(r.data['saldo_total_usd'], '100.00')
        self.assertTrue(r.data['eventos'])
        r404 = self.client.get('/api/cobranza/inteligente/representantes/99999/expediente/')
        self.assertEqual(r404.status_code, 404)

    def test_morosos_no_cambia_con_el_modulo_apagado_y_trae_la_etapa_encendido(self):
        a = self.alumno()
        self.mens(a, 5)  # mes pasado impago: en mora
        r = self.client.get('/api/cobranza/morosos/')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data['cobranza_inteligente'])
        self.assertIsNone(r.data['results'][0]['etapa_cobranza'])

        self.client.patch(
            f'/api/cobranza/inteligente/configuracion/?sede={self.sede.id}',
            {'activo': True}, format='json')
        r = self.client.get('/api/cobranza/morosos/')
        self.assertTrue(r.data['cobranza_inteligente'])
        self.assertEqual(r.data['results'][0]['etapa_cobranza'], 'critica')

    def test_poner_al_dia_cierra_lo_pagado_mientras_estuvo_apagado(self):
        m = self.mens(self.alumno(), 7)
        self.encender()
        evaluar_ciclos_sede(self.sede.id, HOY)
        ConfiguracionCobranzaInteligente.objects.filter(sede=self.sede).update(activo=False)
        m.monto_pagado = 50
        m.save()  # apagado: la señal no toca el ciclo
        m.ciclo.refresh_from_db()
        self.assertTrue(m.ciclo.abierto)
        ConfiguracionCobranzaInteligente.objects.filter(sede=self.sede).update(activo=True)
        poner_al_dia_sede(self.sede.id, hoy=HOY)
        m.ciclo.refresh_from_db()
        self.assertEqual(m.ciclo.estado, 'cerrada')
