"""
Pago conjunto: una sola transferencia del banco cubre varias operaciones del
sistema (ej. un representante paga las mensualidades de sus dos hijos con una
única transferencia y caja las registró como operaciones separadas).
"""
from datetime import date
from decimal import Decimal

from secretaria.models import Alumno, Representante

from .models import ConciliacionBancaria, MovimientoBancarioConciliado
from .tests_conciliacion_masiva import URL_CONF, URL_PROP, MasivaBase, aware, tx
from .tests_conciliacion_semiauto import URL_CAND, URL_CONC

REF = '00123456'
# El modelo Pago no admite dos pagos con la misma referencia+método+banco: en
# la práctica el segundo hermano queda con una variante que coincide en los
# últimos dígitos (que es lo que cruza el conciliador).
REF2 = '99123456'
REF3 = '77123456'


class PagoConjuntoManualTest(MasivaBase):
    def conciliar(self, operaciones, monto='800.00', **extra):
        body = {
            'operaciones': operaciones,
            'banco': self.banco.id,
            'transaccion': {'referencia': REF, 'fecha': '2026-10-02', 'monto': monto},
            'tolerancia': 200,
            'archivo': 'estado.xlsx',
        }
        body.update(extra)
        return self.client.post(URL_CONC, body, format='json')

    def hermanos(self):
        a = self.pago_en(aware(2026, 10, 2), referencia=REF)                       # Luis: 400 Bs
        b = self.pago_en(aware(2026, 10, 2), referencia=REF2, alumno=self.hermano)  # Ana: 400 Bs
        return a, b

    def test_una_transferencia_dos_operaciones_cuadra_exacto(self):
        a, b = self.hermanos()
        r = self.conciliar([{'operacion_uuid': str(a.operacion_uuid)}, {'operacion_uuid': str(b.operacion_uuid)}])
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(len(r.data['conciliaciones']), 2)
        self.assertEqual(r.data['movimiento']['diferencia_ves'], '0.00')
        self.assertEqual(r.data['movimiento']['total_operaciones'], 2)
        self.assertFalse(r.data['movimiento']['fuera_tolerancia'])
        mov = MovimientoBancarioConciliado.objects.get()
        self.assertEqual(mov.monto_sistema_ves, Decimal('800.00'))
        concs = ConciliacionBancaria.objects.filter(movimiento=mov)
        self.assertEqual({c.monto_operacion_ves for c in concs}, {Decimal('400.00')})
        self.assertTrue(all(c.diferencia_ves == 0 and not c.fuera_tolerancia for c in concs))
        self.assertEqual(r.data['lote']['total_operaciones'], 2)

    def test_completar_un_pago_conjunto_conciliado_a_medias(self):
        """Se concilió solo la mensualidad de Luis (con observación por el excedente);
        luego se agrega la de Ana a la MISMA línea y el conjunto queda cuadrado."""
        a, b = self.hermanos()
        r = self.conciliar([{'operacion_uuid': str(a.operacion_uuid)}], observacion='Pagó a los dos')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(r.data['movimiento']['fuera_tolerancia'])

        r = self.conciliar([{'operacion_uuid': str(b.operacion_uuid)}])
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['movimiento']['diferencia_ves'], '0.00')
        self.assertEqual(MovimientoBancarioConciliado.objects.count(), 1)
        # La conciliación previa queda sincronizada con el agregado del movimiento.
        previa = ConciliacionBancaria.objects.get(operacion_uuid=a.operacion_uuid)
        self.assertFalse(previa.fuera_tolerancia)
        self.assertEqual(previa.diferencia_ves, Decimal('0.00'))
        self.assertEqual(previa.monto_sistema_ves, Decimal('800.00'))

    def test_completar_con_otro_monto_se_rechaza(self):
        a, b = self.hermanos()
        self.conciliar([{'operacion_uuid': str(a.operacion_uuid)}], observacion='Parcial')
        r = self.conciliar([{'operacion_uuid': str(b.operacion_uuid)}], monto='900.00')
        self.assertEqual(r.status_code, 400)
        self.assertIn('no coincide', r.data['error'])
        self.assertEqual(ConciliacionBancaria.objects.count(), 1)

    def test_sobrepasar_la_linea_exige_observacion(self):
        a, b = self.hermanos()
        c = self.pago_en(aware(2026, 10, 2), referencia=REF3, usd='20.00')  # 800 Bs extra
        r = self.conciliar([{'operacion_uuid': str(x.operacion_uuid)} for x in (a, b, c)])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(ConciliacionBancaria.objects.count(), 0)

    def test_representantes_distintos_exigen_observacion(self):
        otro_rep = Representante.objects.create(
            cedula='V70000099', nombre='Pedro', apellido='Pérez', correo='pedro@example.com',
        )
        ajeno = Alumno.objects.create(
            nombre='José', apellido='Pérez', cedula_escolar='E70000099',
            fecha_nacimiento=date(2016, 1, 1), representante=otro_rep,
        )
        a = self.pago_en(aware(2026, 10, 2), referencia=REF)
        b = self.pago_en(aware(2026, 10, 2), referencia=REF2, alumno=ajeno)
        ops = [{'operacion_uuid': str(a.operacion_uuid)}, {'operacion_uuid': str(b.operacion_uuid)}]
        r = self.conciliar(ops)
        self.assertEqual(r.status_code, 400)
        self.assertIn('representantes distintos', r.data['error'])
        r = self.conciliar(ops, observacion='Pagó la abuela por ambas familias')
        self.assertEqual(r.status_code, 201, r.data)

    def test_operacion_repetida_y_lista_vacia(self):
        a, _b = self.hermanos()
        op = {'operacion_uuid': str(a.operacion_uuid)}
        self.assertEqual(self.conciliar([op, op]).status_code, 400)
        self.assertEqual(self.conciliar([]).status_code, 400)
        self.assertEqual(ConciliacionBancaria.objects.count(), 0)

    def test_error_en_una_operacion_no_deja_efectos(self):
        a, _b = self.hermanos()
        r = self.conciliar([{'operacion_uuid': str(a.operacion_uuid)}, {'operacion_uuid': 'no-es-uuid'}])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(MovimientoBancarioConciliado.objects.count(), 0)
        self.assertEqual(ConciliacionBancaria.objects.count(), 0)

    def test_candidatos_exponen_movimientos_previos(self):
        a, _b = self.hermanos()
        self.conciliar([{'operacion_uuid': str(a.operacion_uuid)}], observacion='Parcial')
        r = self.client.get(URL_CAND, {'banco': self.banco.id, 'ref': '3456'})
        self.assertEqual(r.status_code, 200)
        previos = r.data['movimientos_previos']
        self.assertEqual(len(previos), 1)
        self.assertEqual(previos[0]['monto_sistema_ves'], '400.00')
        self.assertEqual(previos[0]['total_operaciones'], 1)
        self.assertEqual(previos[0]['alumnos'], ['Luis Mena'])


class PagoConjuntoAutomaticoTest(MasivaBase):
    def propone(self, transacciones):
        return self.client.post(URL_PROP, {
            'banco': self.banco.id, 'desde': '2026-10-01', 'hasta': '2026-10-31',
            'tolerancia': 200, 'transacciones': transacciones,
        }, format='json')

    def test_propone_pago_conjunto_de_hermanos(self):
        a = self.pago_en(aware(2026, 10, 2), referencia=REF)
        b = self.pago_en(aware(2026, 10, 2), referencia=REF2, alumno=self.hermano)
        r = self.propone([tx('123456', '800.00')])
        self.assertEqual(r.status_code, 200, r.data)
        por_op = {p['operacion_uuid']: p for p in r.data['propuestas']}
        for op in (a, b):
            p = por_op[str(op.operacion_uuid)]
            self.assertEqual(p['estado'], 'exacta')
            self.assertEqual(p['diferencia_ves'], '0.00')
            self.assertTrue(p['seleccionada_por_defecto'])
            self.assertEqual(p['grupo']['operaciones'], 2)
            self.assertEqual(p['grupo']['monto_sistema_ves'], '800.00')
            self.assertEqual(p['transaccion'], tx('123456', '800.00'))
        self.assertEqual(r.data['resumen']['pagos_conjuntos'], 1)
        self.assertEqual(r.data['resumen']['ambiguas'], 0)

    def test_no_agrupa_representantes_distintos(self):
        otro_rep = Representante.objects.create(
            cedula='V70000098', nombre='Pedro', apellido='Pérez', correo='p2@example.com',
        )
        ajeno = Alumno.objects.create(
            nombre='José', apellido='Pérez', cedula_escolar='E70000098',
            fecha_nacimiento=date(2016, 1, 1), representante=otro_rep,
        )
        self.pago_en(aware(2026, 10, 2), referencia=REF)
        self.pago_en(aware(2026, 10, 2), referencia=REF2, alumno=ajeno)
        r = self.propone([tx('123456', '800.00')])
        self.assertTrue(all(p['grupo'] is None for p in r.data['propuestas']))
        self.assertEqual(r.data['resumen']['pagos_conjuntos'], 0)

    def test_combinacion_ambigua_no_se_propone(self):
        for ref in (REF, REF2, REF3):  # tres operaciones de 400: cualquier par cuadra 800
            self.pago_en(aware(2026, 10, 2), referencia=ref)
        r = self.propone([tx('123456', '800.00')])
        self.assertTrue(all(p['grupo'] is None for p in r.data['propuestas']))

    def test_propone_completar_linea_conciliada_a_medias(self):
        a = self.pago_en(aware(2026, 10, 2), referencia=REF)
        b = self.pago_en(aware(2026, 10, 2), referencia=REF2, alumno=self.hermano)
        self.client.post(URL_CONC, {
            'operacion_uuid': str(a.operacion_uuid), 'banco': self.banco.id,
            'transaccion': tx('123456', '800.00'), 'tolerancia': 200, 'observacion': 'Parcial',
        }, format='json')
        r = self.propone([tx('123456', '800.00')])
        p = r.data['propuestas'][0]
        self.assertEqual(p['operacion_uuid'], str(b.operacion_uuid))
        self.assertEqual(p['estado'], 'exacta')
        self.assertEqual(p['grupo']['monto_previo_ves'], '400.00')
        self.assertEqual(r.data['sin_operacion'], [])

    def test_confirmar_pago_conjunto(self):
        a = self.pago_en(aware(2026, 10, 2), referencia=REF)
        b = self.pago_en(aware(2026, 10, 2), referencia=REF2, alumno=self.hermano)
        r = self.client.post(URL_CONF, {
            'banco': self.banco.id, 'tolerancia': 200, 'archivo': 'estado.xlsx',
            'items': [
                {'operacion_uuid': str(a.operacion_uuid), 'transaccion': tx('123456', '800.00')},
                {'operacion_uuid': str(b.operacion_uuid), 'transaccion': tx('123456', '800.00')},
            ],
        }, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual([c['indice'] for c in r.data['conciliadas']], [0, 1])
        self.assertEqual(r.data['errores'], [])
        mov = MovimientoBancarioConciliado.objects.get()
        self.assertEqual(mov.conciliaciones.count(), 2)
        self.assertEqual(mov.diferencia_ves, Decimal('0.00'))
