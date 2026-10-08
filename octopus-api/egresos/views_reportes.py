from datetime import date
from decimal import Decimal

from django.db.models import F, Q
from django.db.models.functions import Coalesce
from django.utils.dateparse import parse_date
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from finanzas.models import PresupuestoCategoria
from .permissions import EsAdministradorODirector
from .models import ConfiguracionEgresos, Egreso, RenglonEgreso
from .reportes import (egresos_libro_compras, egresos_pagados, por_mes, rango_mes_actual,
                       sin_comprobante, sumar)


def formatear_monto(valor):
    """Contrato JSON monetario: Decimal, siempre con dos posiciones, nunca float."""
    return format(Decimal(valor or '0.00'), '.2f')


class BaseInformeView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsAdministradorODirector]

    def parametros(self, request):
        moneda = request.query_params.get('moneda', 'original').lower()
        if moneda not in ('usd', 'ves', 'original'):
            return None, Response({'detalle': 'moneda debe ser usd, ves u original.'}, status=status.HTTP_400_BAD_REQUEST)
        def fecha(nombre):
            valor = request.query_params.get(nombre)
            if not valor:
                return None
            resultado = parse_date(valor)
            if not resultado:
                raise ValueError(nombre)
            return resultado
        try:
            return (request.query_params.get('sede'), fecha('desde'), fecha('hasta'), moneda), None
        except ValueError as error:
            return None, Response({'detalle': 'Fecha inválida.', 'campos': {str(error): ['Use AAAA-MM-DD.']}}, status=status.HTTP_400_BAD_REQUEST)

    @staticmethod
    def dinero(fila, prefijo='monto'):
        """Serializa Decimal sin floats y conserva ambos equivalentes."""
        return {
            'monto_usd': formatear_monto(fila.get(f'{prefijo}_usd_pagado', fila.get(f'{prefijo}_usd', Decimal('0.00')))),
            'monto_ves': formatear_monto(fila.get(f'{prefijo}_ves_pagado', fila.get(f'{prefijo}_ves', Decimal('0.00')))),
        }


class TableroEgresosView(BaseInformeView):
    def get(self, request):
        parametros, error = self.parametros(request)
        if error:
            return error
        sede, desde, hasta, moneda = parametros
        inicio, anterior_inicio, anterior_fin = rango_mes_actual()
        actual_desde, actual_hasta = desde or inicio, hasta or date.today()
        actual = egresos_pagados(request.user, sede, actual_desde, actual_hasta)
        previo = egresos_pagados(request.user, sede, anterior_inicio, anterior_fin)
        totales = actual.aggregate(**sumar('monto_usd_pagado', 'monto_ves_pagado'))
        anteriores = previo.aggregate(**sumar('monto_usd_pagado', 'monto_ves_pagado'))
        faltantes = sin_comprobante(actual).count()
        categorias = list(actual.values('categoria_id', 'categoria__nombre').annotate(
            **sumar('monto_usd_pagado', 'monto_ves_pagado')).order_by('-monto_usd_pagado')[:5])
        proveedores = list(actual.values('proveedor_id', 'proveedor__razon_social').annotate(
            **sumar('monto_usd_pagado', 'monto_ves_pagado')).order_by('-monto_usd_pagado')[:5])
        comprometido = self._comprometido(request.user, sede)
        presupuestos = self._presupuestos(request.user, sede, actual_desde.year, actual_desde.month, actual, comprometido)
        alertas = [p for p in presupuestos if p['porcentaje_usd'] >= Decimal('80') or p['porcentaje_ves'] >= Decimal('80')]
        return Response({
            'periodo': {'desde': str(actual_desde), 'hasta': str(actual_hasta)},
            'moneda': moneda,
            'pagado_mes': self.dinero(totales),
            'mes_previo': self.dinero(anteriores),
            'variacion': self._variacion(totales, anteriores),
            'faltantes_comprobante': faltantes,
            'top_categorias': [dict(x, **self.dinero(x)) for x in categorias],
            'top_proveedores': [dict(x, **self.dinero(x)) for x in proveedores],
            'presupuesto_consumido': presupuestos,
            'alertas_presupuesto': alertas,
            # Deuda abierta real de CxP (pendiente/parcial, no anulada) según sedes autorizadas.
            'comprometido_pendiente': {'monto_usd': formatear_monto(comprometido['usd']), 'monto_ves': formatear_monto(comprometido['ves'])},
        })

    @staticmethod
    def _variacion(actual, previo):
        resultado = {}
        for moneda, campo in (('usd', 'monto_usd_pagado'), ('ves', 'monto_ves_pagado')):
            base = previo[campo]
            resultado[moneda] = str(Decimal('0.00') if not base else ((actual[campo] - base) * Decimal('100') / base).quantize(Decimal('0.01')))
        return resultado

    @staticmethod
    def _comprometido(usuario, sede):
        from cuentas_pagar.services import comprometido_abierto
        return comprometido_abierto(usuario, sede)

    def _presupuestos(self, usuario, sede, anio, mes, gastos, comprometido=None):
        from cobranza.permissions import filtrar_por_sede
        presupuestos = PresupuestoCategoria.objects.filter(anio=anio, mes=mes)
        presupuestos = filtrar_por_sede(usuario, presupuestos, campo='sede')
        if sede:
            presupuestos = presupuestos.filter(sede_id=sede)
        gastos_categoria = gastos.values('categoria_id').annotate(**sumar('monto_usd_pagado', 'monto_ves_pagado'))
        gastos_por_categoria = {x['categoria_id']: x for x in gastos_categoria}
        comprometido = comprometido if comprometido is not None else self._comprometido(usuario, sede)
        por_categoria = comprometido['por_categoria']
        resultado = []
        # La suma y agrupación ocurren en DB; este bucle solo une dos conjuntos agregados.
        for p in presupuestos.select_related('categoria'):
            gasto = gastos_por_categoria.get(p.categoria_id, {})
            usd, ves = gasto.get('monto_usd_pagado', Decimal('0.00')), gasto.get('monto_ves_pagado', Decimal('0.00'))
            presupuesto = p.monto
            consumo = usd if p.moneda == 'USD' else ves
            porcentaje = Decimal('0.00') if not presupuesto else (consumo * Decimal('100') / presupuesto).quantize(Decimal('0.01'))
            resultado.append({'categoria_id': p.categoria_id, 'categoria': p.categoria.nombre, 'moneda_presupuesto': p.moneda,
                              'presupuesto': formatear_monto(presupuesto), 'pagado_usd': formatear_monto(usd), 'pagado_ves': formatear_monto(ves),
                              'comprometido_usd': formatear_monto(por_categoria.get(p.categoria_id, {}).get('usd')),
                              'comprometido_ves': formatear_monto(por_categoria.get(p.categoria_id, {}).get('ves')),
                              'porcentaje_usd': porcentaje if p.moneda == 'USD' else Decimal('0.00'),
                              'porcentaje_ves': porcentaje if p.moneda == 'VES' else Decimal('0.00')})
        return resultado


class ReportesEgresosView(BaseInformeView):
    NOMBRES = {
        'relacion-detallada': 'relacion', 'por-categoria': 'categoria', 'por-proveedor': 'proveedor',
        'por-sede': 'sede', 'comparativo-mensual': 'mensual', 'por-periodo': 'mensual',
        'ejecucion-presupuestaria': 'presupuesto', 'presupuesto': 'presupuesto',
        'libro-compras': 'libro', 'historial-articulos': 'articulos',
        'impuestos': 'impuestos', 'retenciones': 'retenciones', 'variacion-precios': 'variacion',
    }

    def get(self, request, nombre):
        parametros, error = self.parametros(request)
        if error:
            return error
        tipo = self.NOMBRES.get(nombre)
        if not tipo:
            return Response({'detalle': 'Reporte no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        sede, desde, hasta, moneda = parametros
        if tipo == 'libro':
            return Response({'reporte': nombre, 'resultados': self.libro(egresos_libro_compras(request.user, sede, desde, hasta))})
        if tipo in ('impuestos', 'retenciones'):
            documentos = egresos_libro_compras(request.user, sede, desde, hasta)
            return Response({'reporte': nombre, 'moneda': moneda, 'resultados': getattr(self, tipo)(documentos)})
        gastos = egresos_pagados(request.user, sede, desde, hasta)
        metodos = {'relacion': self.relacion, 'categoria': self.categoria, 'proveedor': self.proveedor,
                    'sede': self.sede, 'mensual': self.mensual, 'presupuesto': self.presupuesto,
                    'articulos': self.articulos, 'variacion': self.variacion}
        return Response({'reporte': nombre, 'moneda': moneda, 'resultados': metodos[tipo](gastos, request)})

    def relacion(self, qs, request):
        return [{
            'id': e.id, 'fecha_egreso': str(e.fecha_egreso), 'fecha_emision': str(e.fecha_emision),
            'proveedor': e.proveedor.razon_social, 'categoria': e.categoria.nombre, 'sede_id': e.sede_id,
            'numero_documento': e.numero_documento, 'moneda_original': e.moneda,
            'monto_usd': formatear_monto(e.monto_usd_pagado), 'monto_ves': formatear_monto(e.monto_ves_pagado),
        } for e in qs]

    def _grupo(self, qs, *campos):
        filas = qs.values(*campos).annotate(**sumar('monto_usd_pagado', 'monto_ves_pagado')).order_by('-monto_usd_pagado')
        return [dict(fila, **self.dinero(fila)) for fila in filas]

    def categoria(self, qs, request): return self._grupo(qs, 'categoria_id', 'categoria__nombre')
    def proveedor(self, qs, request): return self._grupo(qs, 'proveedor_id', 'proveedor__razon_social')
    def sede(self, qs, request): return self._grupo(qs, 'sede_id', 'sede__nombre')
    def mensual(self, qs, request):
        """Comparativo de los últimos doce meses, agrupado enteramente en BD."""
        hoy = date.today()
        anio, mes = hoy.year, hoy.month
        for _ in range(11):
            mes -= 1
            if mes == 0:
                anio, mes = anio - 1, 12
        qs = qs.filter(fecha_egreso__gte=date(anio, mes, 1))
        return [dict(fila, **self.dinero(fila)) for fila in por_mes(qs)]

    def presupuesto(self, qs, request):
        hoy = date.today()
        return TableroEgresosView()._presupuestos(request.user, request.query_params.get('sede'), hoy.year, hoy.month, qs)

    def libro(self, qs):
        # Los montos del libro son del documento fiscal, no los pagos.
        return [{
            'id': e.id, 'fecha_emision': str(e.fecha_emision), 'estado': e.estado,
            'proveedor': e.proveedor.razon_social, 'rif': e.proveedor.rif,
            'numero_documento': e.numero_documento, 'numero_control': e.numero_control,
            'subtotal': formatear_monto(e.subtotal), 'iva': formatear_monto(e.monto_iva), 'igtf': formatear_monto(e.monto_igtf),
            'retencion_iva': formatear_monto(e.monto_retencion_iva), 'retencion_islr': formatear_monto(e.monto_retencion_islr),
            'total_documento': formatear_monto(e.total_documento), 'moneda_original': e.moneda,
            'monto_usd': formatear_monto(e.monto_usd), 'monto_ves': formatear_monto(e.monto_ves),
        } for e in qs]

    def articulos(self, qs, request):
        articulo = request.query_params.get('articulo')
        renglones = RenglonEgreso.objects.filter(egreso__in=qs).select_related('articulo')
        if articulo:
            renglones = renglones.filter(articulo_id=articulo)
        return [
            {'articulo_id': r.articulo_id, 'articulo': r.articulo.nombre if r.articulo_id else r.descripcion,
             'fecha_egreso': str(r.egreso.fecha_egreso), 'proveedor': r.egreso.proveedor.razon_social,
             'cantidad': str(r.cantidad), 'precio_unitario': formatear_monto(r.precio_unitario), 'total': formatear_monto(r.total),
             'monto_usd': formatear_monto(r.egreso.monto_usd_pagado), 'monto_ves': formatear_monto(r.egreso.monto_ves_pagado)}
            for r in renglones.select_related('egreso__proveedor').order_by('-egreso__fecha_egreso', '-id')
        ]


    def impuestos(self, qs):
        """IVA e IGTF por documento fiscal (pendientes y registrados, no anulados)."""
        return [{
            'id': e.id, 'fecha_emision': str(e.fecha_emision), 'estado': e.estado,
            'proveedor': e.proveedor.razon_social, 'rif': e.proveedor.rif, 'sede_id': e.sede_id,
            'numero_documento': e.numero_documento, 'moneda_original': e.moneda,
            'subtotal': formatear_monto(e.subtotal),
            'porcentaje_iva': formatear_monto(e.porcentaje_iva), 'iva': formatear_monto(e.monto_iva),
            'igtf': formatear_monto(e.monto_igtf), 'total_documento': formatear_monto(e.total_documento),
            'monto_usd': formatear_monto(e.monto_usd), 'monto_ves': formatear_monto(e.monto_ves),
        } for e in qs.filter(Q(monto_iva__gt=0) | Q(monto_igtf__gt=0)).order_by('fecha_emision', 'id')]

    def retenciones(self, qs):
        """Retenciones de IVA e ISLR practicadas por documento fiscal."""
        return [{
            'id': e.id, 'fecha_emision': str(e.fecha_emision), 'estado': e.estado,
            'proveedor': e.proveedor.razon_social, 'rif': e.proveedor.rif, 'sede_id': e.sede_id,
            'numero_documento': e.numero_documento, 'moneda_original': e.moneda,
            'porcentaje_retencion_iva': formatear_monto(e.porcentaje_retencion_iva),
            'retencion_iva': formatear_monto(e.monto_retencion_iva),
            'porcentaje_retencion_islr': formatear_monto(e.porcentaje_retencion_islr),
            'retencion_islr': formatear_monto(e.monto_retencion_islr),
            'total_documento': formatear_monto(e.total_documento),
        } for e in qs.filter(Q(monto_retencion_iva__gt=0) | Q(monto_retencion_islr__gt=0)).order_by('fecha_emision', 'id')]

    def variacion(self, qs, request):
        """Variación del precio unitario por artículo entre su primera y última compra."""
        umbral = (ConfiguracionEgresos.objects.filter(pk=1).values_list('umbral_alerta_variacion', flat=True).first()
                  or Decimal('15.0000'))
        renglones = (RenglonEgreso.objects.filter(egreso__in=qs, articulo__isnull=False)
                     .select_related('articulo', 'egreso').order_by('egreso__fecha_egreso', 'id'))
        articulo = request.query_params.get('articulo')
        if articulo:
            renglones = renglones.filter(articulo_id=articulo)
        grupos = {}
        for r in renglones:
            grupos.setdefault(r.articulo_id, []).append(r)
        resultado = []
        for articulo_id, filas in grupos.items():
            primero, ultimo = filas[0], filas[-1]
            precios = [x.precio_unitario for x in filas]
            base = primero.precio_unitario
            pct = Decimal('0.00') if not base else ((ultimo.precio_unitario - base) * Decimal('100') / base).quantize(Decimal('0.01'))
            resultado.append({
                'articulo_id': articulo_id, 'articulo': primero.articulo.nombre, 'compras': len(filas),
                'precio_inicial': formatear_monto(base), 'fecha_inicial': str(primero.egreso.fecha_egreso),
                'precio_actual': formatear_monto(ultimo.precio_unitario), 'fecha_actual': str(ultimo.egreso.fecha_egreso),
                'precio_minimo': formatear_monto(min(precios)), 'precio_maximo': formatear_monto(max(precios)),
                'variacion_porcentaje': str(pct), 'supera_umbral': abs(pct) >= Decimal(umbral),
            })
        return sorted(resultado, key=lambda x: abs(Decimal(x['variacion_porcentaje'])), reverse=True)
