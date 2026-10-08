from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from authentication.models import PerfilUsuario
from finanzas.models import CategoriaGasto, PresupuestoCategoria, Proveedor
from egresos.models import ArticuloFrecuente, Egreso, RenglonEgreso
from cuentas_pagar.models import CuentaPorPagar
from egresos.views_reportes import ReportesEgresosView, TableroEgresosView


class InformesEgresosTests(TestCase):
    """Datos fijos para los ocho cortes, incluidas monedas cruzadas y CxP pendiente."""
    def setUp(self):
        self.usuario = get_user_model().objects.create_user(username='directora', password='clave')
        self.usuario.perfil.rol = 'director'
        self.usuario.perfil.esta_activo = True
        self.usuario.perfil.save()
        self.categoria = CategoriaGasto.objects.create(nombre='Limpieza')
        self.proveedor = Proveedor.objects.create(razon_social='Proveedor Uno', rif='J-12345678-9')
        self.articulo = ArticuloFrecuente.objects.create(nombre='Jabón', categoria=self.categoria)
        hoy = date.today()
        self.pagado = Egreso.objects.create(
            proveedor=self.proveedor, categoria=self.categoria, fecha_emision=hoy, fecha_egreso=hoy,
            moneda='VES', tasa_aplicada=Decimal('100.0000'), total_documento=Decimal('1000.00'),
            monto_usd=Decimal('10.00'), monto_ves=Decimal('1000.00'),
            monto_usd_pagado=Decimal('10.00'), monto_ves_pagado=Decimal('1000.00'), total_pagado=Decimal('1000.00'),
            estado='registrado', numero_documento='F-1', condicion='contado',
        )
        RenglonEgreso.objects.create(egreso=self.pagado, articulo=self.articulo, descripcion='Jabón', cantidad=1,
                                     precio_unitario=Decimal('1000.00'), total=Decimal('1000.00'))
        # Representa una factura CxP impaga: debe estar solo en libro de compras.
        self.pendiente = Egreso.objects.create(
            proveedor=self.proveedor, categoria=self.categoria, fecha_emision=hoy, moneda='USD',
            tasa_aplicada=Decimal('100.0000'), total_documento=Decimal('20.00'), monto_usd=Decimal('20.00'),
            monto_ves=Decimal('2000.00'), estado='pendiente_pago', numero_documento='F-2', condicion='credito',
            origen='cuenta_por_pagar', cuenta_por_pagar_id=99,
        )
        PresupuestoCategoria.objects.create(categoria=self.categoria, anio=hoy.year, mes=hoy.month,
                                            moneda='USD', monto=Decimal('12.00'))
        self.factory = APIRequestFactory()

    def llamar(self, nombre, query=''):
        request = self.factory.get('/reportes/%s/?%s' % (nombre, query))
        force_authenticate(request, user=self.usuario)
        return ReportesEgresosView.as_view()(request, nombre=nombre)

    def test_ocho_informes_operan_y_excluyen_pendiente_de_gasto(self):
        nombres = ('relacion-detallada', 'por-categoria', 'por-proveedor', 'por-sede',
                   'comparativo-mensual', 'ejecucion-presupuestaria', 'libro-compras', 'historial-articulos')
        for nombre in nombres:
            respuesta = self.llamar(nombre, 'moneda=usd')
            self.assertEqual(respuesta.status_code, 200, nombre)
        relacion = self.llamar('relacion-detallada').data['resultados']
        self.assertEqual([fila['id'] for fila in relacion], [self.pagado.id])
        libro = self.llamar('libro-compras').data['resultados']
        self.assertEqual({fila['id'] for fila in libro}, {self.pagado.id, self.pendiente.id})

    def test_tablero_usa_snapshots_usd_ves_y_presupuesto(self):
        request = self.factory.get('/tablero/?moneda=ves')
        force_authenticate(request, user=self.usuario)
        respuesta = TableroEgresosView.as_view()(request)
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.data['pagado_mes'], {'monto_usd': '10.00', 'monto_ves': '1000.00'})
        self.assertEqual(respuesta.data['comprometido_pendiente'], {'monto_usd': '0.00', 'monto_ves': '0.00'})
        self.assertEqual(respuesta.data['presupuesto_consumido'][0]['pagado_usd'], '10.00')

    def test_rechaza_rol_fuera_de_alcance(self):
        self.usuario.perfil.rol = 'cajero'
        self.usuario.perfil.save()
        self.assertEqual(self.llamar('por-categoria').status_code, 403)

    def _egreso_fiscal(self, **extra):
        datos = dict(proveedor=self.proveedor, categoria=self.categoria, fecha_emision=date.today(), moneda='USD',
                     tasa_aplicada=Decimal('100.0000'), total_documento=Decimal('116.00'), subtotal=Decimal('100.00'),
                     monto_iva=Decimal('16.00'), porcentaje_iva=Decimal('16.0000'), monto_usd=Decimal('116.00'),
                     monto_ves=Decimal('11600.00'), estado='pendiente_pago', numero_documento='F-9', condicion='credito')
        datos.update(extra)
        return Egreso.objects.create(**datos)

    def test_informe_impuestos(self):
        fiscal = self._egreso_fiscal()
        filas = self.llamar('impuestos').data['resultados']
        self.assertEqual([f['id'] for f in filas], [fiscal.id])
        self.assertEqual(filas[0]['iva'], '16.00')
        self.assertEqual(filas[0]['porcentaje_iva'], '16.00')

    def test_informe_retenciones(self):
        retenido = self._egreso_fiscal(monto_retencion_iva=Decimal('12.00'), retiene_iva=True,
                                       porcentaje_retencion_iva=Decimal('75.0000'), numero_documento='F-10')
        filas = self.llamar('retenciones').data['resultados']
        self.assertEqual([f['id'] for f in filas], [retenido.id])
        self.assertEqual(filas[0]['retencion_iva'], '12.00')
        self.assertEqual(filas[0]['retencion_islr'], '0.00')

    def test_informe_variacion_precios(self):
        hoy = date.today()
        segundo = Egreso.objects.create(
            proveedor=self.proveedor, categoria=self.categoria, fecha_emision=hoy, fecha_egreso=hoy,
            moneda='VES', tasa_aplicada=Decimal('100.0000'), total_documento=Decimal('1500.00'),
            monto_usd_pagado=Decimal('15.00'), monto_ves_pagado=Decimal('1500.00'), estado='registrado',
            numero_documento='F-3', condicion='contado')
        RenglonEgreso.objects.create(egreso=segundo, articulo=self.articulo, descripcion='Jabón', cantidad=1,
                                     precio_unitario=Decimal('1500.00'), total=Decimal('1500.00'))
        respuesta = self.llamar('variacion-precios')
        self.assertEqual(respuesta.status_code, 200)
        fila = respuesta.data['resultados'][0]
        self.assertEqual(fila['articulo_id'], self.articulo.id)
        self.assertEqual(fila['compras'], 2)
        self.assertEqual(fila['variacion_porcentaje'], '50.00')
        self.assertTrue(fila['supera_umbral'])

    def test_comprometido_tablero_desde_cxp(self):
        base = dict(proveedor=self.proveedor, categoria=self.categoria, tasa_aplicada=Decimal('100.0000'),
                    fecha_vencimiento=date.today())
        CuentaPorPagar.objects.create(moneda='USD', monto_documento=Decimal('50.00'), saldo=Decimal('30.00'),
                                      estado='parcial', concepto='a', **base)
        CuentaPorPagar.objects.create(moneda='VES', monto_documento=Decimal('1000.00'), saldo=Decimal('1000.00'),
                                      estado='pendiente', concepto='b', **base)
        CuentaPorPagar.objects.create(moneda='USD', monto_documento=Decimal('99.00'), saldo=Decimal('99.00'),
                                      estado='anulada', concepto='c', **base)
        CuentaPorPagar.objects.create(moneda='USD', monto_documento=Decimal('70.00'), saldo=Decimal('0.00'),
                                      estado='pagada', concepto='d', **base)
        request = self.factory.get('/tablero/')
        force_authenticate(request, user=self.usuario)
        datos = TableroEgresosView.as_view()(request).data
        self.assertEqual(datos['comprometido_pendiente'], {'monto_usd': '40.00', 'monto_ves': '4000.00'})
        fila = datos['presupuesto_consumido'][0]
        self.assertEqual((fila['comprometido_usd'], fila['comprometido_ves']), ('40.00', '4000.00'))
