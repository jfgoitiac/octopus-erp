"""Panel ejecutivo — carril B2 (Fase 1). Contrato §2."""
import calendar
from datetime import datetime, timedelta
from decimal import Decimal

from django.db.models import Count, F, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.response import Response

from cantina.models import (
    AlertaCantina,
    AperturaCajaCantina,
    CierreCajaCantina,
    DetalleVentaCantina,
    ProductoCantina,
    RecargaTarjeta,
    TarjetaPrepago,
    VentaCantina,
)

from .serializers_cierres import (
    asegurar_revisiones,
    dinero,
    expresion_esperado_efectivo,
    fecha_hora,
    usuario_dict,
)
from .views_base import VistaAuditoria
from .views_cierres import ParametroInvalido, error, parsear_area

CERO = Decimal('0.00')
ESTADOS_REVISION_PENDIENTES = ('pendiente', 'observado')
MAX_DIFERENCIAS = 5
MAX_TOP_PRODUCTOS = 5
MAX_ALERTAS_RECIENTES = 5

ETIQUETAS_METODO = dict(VentaCantina.METODOS_PAGO)
ETIQUETAS_METODO.update({
    'transferencia': 'Transferencia bancaria',
    'pago_movil': 'Pago móvil',
    'punto_de_venta': 'Punto de venta',
    'efectivo': 'Efectivo divisas',
    'efectivo_ves': 'Efectivo bolívares',
    'tarjeta_prepago': 'Tarjeta prepago',
    'credito_representante': 'Cargo a cuenta',
})


def _restar_un_mes(fecha):
    """Mismo día del mes anterior (recortado al último día si no existe)."""
    anio, mes = (fecha.year - 1, 12) if fecha.month == 1 else (fecha.year, fecha.month - 1)
    return fecha.replace(year=anio, month=mes, day=min(fecha.day, calendar.monthrange(anio, mes)[1]))


def periodos(hoy):
    """
    Ventanas (inicio, fin) inclusivas de cada período y de su anterior
    equivalente. Semana y mes se comparan "a la fecha": lunes→hoy contra el
    mismo tramo de la semana pasada; 1→hoy contra el mismo tramo del mes
    pasado. Así la variación no castiga una semana o un mes en curso.
    """
    ayer = hoy - timedelta(days=1)
    inicio_semana = hoy - timedelta(days=hoy.weekday())
    inicio_mes = hoy.replace(day=1)
    return {
        'hoy': ((hoy, hoy), (ayer, ayer)),
        'semana': ((inicio_semana, hoy), (inicio_semana - timedelta(days=7), hoy - timedelta(days=7))),
        'mes': ((inicio_mes, hoy), (_restar_un_mes(inicio_mes), _restar_un_mes(hoy))),
    }


def variacion_pct(actual, anterior):
    if not anterior:
        return None
    return str(((actual - anterior) * 100 / anterior).quantize(Decimal('0.01')))


class PanelEjecutivoView(VistaAuditoria):
    """GET ?area=&fecha_inicio=&fecha_fin=: panel contable del Director."""

    def get(self, request):
        try:
            area = parsear_area(request)
            fecha_inicio, fecha_fin = self._rango(request)
        except ParametroInvalido as exc:
            return error(str(exc))
        hoy = timezone.localdate()
        asegurar_revisiones()
        return Response({
            'generado_en': fecha_hora(timezone.now()),
            'periodo': {'fecha_inicio': fecha_inicio.isoformat(), 'fecha_fin': fecha_fin.isoformat()},
            'ventas': self._ventas(hoy, area),
            'rendicion': self._rendicion(fecha_inicio, fecha_fin, area),
            'caja_hoy': self._caja_hoy(hoy, area),
            'diferencias_pendientes': self._diferencias_pendientes(area),
            'top_productos': self._top_productos(hoy, area),
            'bajo_inventario': self._bajo_inventario(area),
            'alertas': self._alertas(area),
        })

    @staticmethod
    def _rango(request):
        hoy = timezone.localdate()
        try:
            fecha_inicio = datetime.strptime(
                request.query_params.get('fecha_inicio'), '%Y-%m-%d',
            ).date() if request.query_params.get('fecha_inicio') else hoy.replace(day=1)
            fecha_fin = datetime.strptime(
                request.query_params.get('fecha_fin'), '%Y-%m-%d',
            ).date() if request.query_params.get('fecha_fin') else hoy
        except ValueError:
            raise ParametroInvalido('Formato de fecha inválido. Use YYYY-MM-DD.')
        if fecha_inicio > fecha_fin:
            raise ParametroInvalido('fecha_inicio no puede ser posterior a fecha_fin.')
        if fecha_fin > hoy:
            raise ParametroInvalido('fecha_fin no puede ser posterior a hoy.')
        return fecha_inicio, fecha_fin

    @staticmethod
    def _filtrar_area(queryset, area, campo='area'):
        return queryset.filter(**{campo: area}) if area else queryset

    def _ventas(self, hoy, area):
        """Hoy/semana/mes y sus períodos anteriores en UNA sola consulta."""
        ventanas = periodos(hoy)
        desde = min(anterior[0] for _, anterior in ventanas.values())
        ventas = self._filtrar_area(
            VentaCantina.objects.filter(estado='completada', creado_en__date__gte=desde, creado_en__date__lte=hoy),
            area,
        )
        agregados = {}
        for nombre, (actual, anterior) in ventanas.items():
            for sufijo, (inicio, fin) in (('actual', actual), ('anterior', anterior)):
                rango = Q(creado_en__date__gte=inicio, creado_en__date__lte=fin)
                agregados[f'{nombre}_{sufijo}_total'] = Sum('total_usd', filter=rango)
                agregados[f'{nombre}_{sufijo}_cantidad'] = Count('id', filter=rango)
        fila = ventas.aggregate(**agregados)

        resultado = {}
        for nombre in ventanas:
            total = fila[f'{nombre}_actual_total'] or CERO
            anterior = fila[f'{nombre}_anterior_total'] or CERO
            resultado[nombre] = {
                'total_usd': dinero(total),
                'cantidad': fila[f'{nombre}_actual_cantidad'],
                'variacion_pct': variacion_pct(total, anterior),
            }
        return resultado

    @staticmethod
    def _metodo(fila, campo_total='monto'):
        metodo = fila['metodo_pago']
        return {
            'metodo': metodo,
            'etiqueta': ETIQUETAS_METODO.get(metodo, metodo.replace('_', ' ').title()),
            'total_usd': dinero(fila[campo_total] or CERO),
            'cantidad': fila['cantidad'],
        }

    def _rendicion(self, fecha_inicio, fecha_fin, area):
        ventas = VentaCantina.objects.filter(
            estado='completada', creado_en__date__range=(fecha_inicio, fecha_fin),
        )
        ventas = self._filtrar_area(ventas, area)

        resumen_ventas = ventas.aggregate(total=Sum('total_usd'), cantidad=Count('id'))
        por_metodo_qs = (
            ventas.values('metodo_pago')
            .annotate(monto=Sum('total_usd'), cantidad=Count('id'))
            .order_by('-monto', 'metodo_pago')
        )
        por_metodo = [self._metodo(f) for f in por_metodo_qs]

        por_dia = []
        dias = (
            ventas.annotate(fecha=TruncDate('creado_en'))
            .values('fecha').annotate(monto=Sum('total_usd'), cantidad=Count('id'))
            .order_by('fecha')
        )
        metodos_dia = {}
        for fila in (
            ventas.annotate(fecha=TruncDate('creado_en'))
            .values('fecha', 'metodo_pago')
            .annotate(monto=Sum('total_usd'), cantidad=Count('id'))
            .order_by('fecha', '-monto')
        ):
            metodos_dia.setdefault(fila['fecha'], []).append(self._metodo(fila))
        for fila in dias:
            por_dia.append({
                'fecha': fila['fecha'].isoformat(),
                'total_usd': dinero(fila['monto'] or CERO),
                'cantidad': fila['cantidad'],
                'por_metodo': metodos_dia.get(fila['fecha'], []),
            })

        areas = []
        for fila in (
            ventas.values('area').annotate(
                monto=Sum('total_usd'), cantidad=Count('id'),
                consumo_recargas=Sum('total_usd', filter=Q(metodo_pago='tarjeta_prepago')),
            ).order_by('area')
        ):
            areas.append({
                'area': fila['area'],
                'total_usd': dinero(fila['monto'] or CERO),
                'cantidad': fila['cantidad'],
                'consumo_recargas_usd': dinero(fila['consumo_recargas'] or CERO),
            })

        recargas_periodo = RecargaTarjeta.objects.filter(
            estatus='aprobado', revisado_en__date__range=(fecha_inicio, fecha_fin),
        )
        recargas_resumen = recargas_periodo.aggregate(total=Sum('monto_usd'), cantidad=Count('id'))
        recargas_metodo = [
            self._metodo(f)
            for f in recargas_periodo.values('metodo_pago').annotate(
                monto=Sum('monto_usd'), cantidad=Count('id'),
            ).order_by('-monto', 'metodo_pago')
        ]
        consumo_periodo = ventas.filter(metodo_pago='tarjeta_prepago').aggregate(
            total=Sum('total_usd'), cantidad=Count('id'),
        )
        consumo_historico = VentaCantina.objects.filter(
            estado='completada', metodo_pago='tarjeta_prepago',
        ).aggregate(
            total=Sum('total_usd'), cantidad=Count('id'),
        )
        captado_historico = RecargaTarjeta.objects.filter(estatus='aprobado').aggregate(
            total=Sum('monto_usd'), cantidad=Count('id'),
        )
        saldos = TarjetaPrepago.objects.aggregate(
            disponible=Sum('saldo', filter=Q(saldo__gt=0)),
            saldo_neto=Sum('saldo'),
            tarjetas_con_saldo=Count('id', filter=Q(saldo__gt=0)),
        )

        cajas = self._cajas_rendicion(ventas, area)
        return {
            'ventas': {
                'total_usd': dinero(resumen_ventas['total'] or CERO),
                'cantidad': resumen_ventas['cantidad'],
            },
            'por_dia': por_dia,
            'por_metodo': por_metodo,
            'por_area': areas,
            'recargas': {
                'captado_periodo_usd': dinero(recargas_resumen['total'] or CERO),
                'captado_periodo_cantidad': recargas_resumen['cantidad'],
                'consumido_periodo_usd': dinero(consumo_periodo['total'] or CERO),
                'consumido_periodo_cantidad': consumo_periodo['cantidad'],
                'captado_historico_usd': dinero(captado_historico['total'] or CERO),
                'consumido_historico_usd': dinero(consumo_historico['total'] or CERO),
                'saldo_disponible_usd': dinero(saldos['disponible'] or CERO),
                'saldo_neto_usd': dinero(saldos['saldo_neto'] or CERO),
                'tarjetas_con_saldo': saldos['tarjetas_con_saldo'],
                'por_metodo': recargas_metodo,
            },
            'cajas': cajas,
        }

    def _cajas_rendicion(self, ventas, area):
        ids_con_ventas = ventas.exclude(apertura_id__isnull=True).values('apertura_id')
        aperturas = AperturaCajaCantina.objects.filter(id__in=ids_con_ventas).select_related('cajero')
        aperturas = self._filtrar_area(aperturas, area)
        aperturas = list(aperturas.order_by('-fecha_hora_apertura', '-id'))
        por_caja = {}
        for fila in (
            ventas.exclude(apertura_id__isnull=True)
            .values('apertura_id', 'metodo_pago')
            .annotate(monto=Sum('total_usd'), cantidad=Count('id'))
            .order_by('apertura_id', '-monto')
        ):
            por_caja.setdefault(fila['apertura_id'], []).append(self._metodo(fila))
        resultado = []
        for apertura in aperturas:
            metodos = por_caja.get(apertura.id, [])
            resultado.append({
                'apertura_id': apertura.id,
                'area': apertura.area,
                'cajero': usuario_dict(apertura.cajero),
                'inicio': fecha_hora(apertura.fecha_hora_apertura),
                'fin': fecha_hora(apertura.cerrada_en) if apertura.cerrada_en else None,
                'estado': apertura.estado,
                'total_usd': dinero(sum((Decimal(m['total_usd']) for m in metodos), CERO)),
                'cantidad': sum(m['cantidad'] for m in metodos),
                'por_metodo': metodos,
            })
        return resultado

    def _caja_hoy(self, hoy, area):
        cierres = self._filtrar_area(CierreCajaCantina.objects.filter(fecha=hoy), area)
        fila = cierres.aggregate(
            esperado=Sum(expresion_esperado_efectivo()),
            reportado=Sum('conteo_fisico'),
            cantidad=Count('id'),
        )
        esperado = Decimal(str(fila['esperado'] or CERO))
        reportado = Decimal(str(fila['reportado'] or CERO))
        abiertas = self._filtrar_area(AperturaCajaCantina.objects.filter(estado='abierta'), area).count()
        return {
            'esperado_usd': dinero(esperado),
            'reportado_usd': dinero(reportado),
            'diferencia_usd': dinero(reportado - esperado),
            'cajas_abiertas': abiertas,
            'cierres_realizados': fila['cantidad'],
        }

    def _diferencias_pendientes(self, area):
        cierres = self._filtrar_area(
            CierreCajaCantina.objects
            .exclude(diferencia__isnull=True).exclude(diferencia=0)
            .filter(revision__estado__in=ESTADOS_REVISION_PENDIENTES),
            area,
        )
        resumen = cierres.aggregate(cantidad=Count('id'), monto=Sum('diferencia'))
        recientes = (
            cierres.select_related('cajero', 'revision')
            .order_by('-fecha', '-cerrado_en', '-id')[:MAX_DIFERENCIAS]
        )
        return {
            'cantidad': resumen['cantidad'],
            'monto_total_usd': dinero(resumen['monto'] or CERO),
            'cierres': [
                {
                    'id': c.id,
                    'fecha': c.fecha.isoformat(),
                    'cajero': usuario_dict(c.cajero),
                    'diferencia_usd': dinero(c.diferencia),
                    'estado_revision': c.revision.estado,
                }
                for c in recientes
            ],
        }

    def _top_productos(self, hoy, area):
        detalles = self._filtrar_area(
            DetalleVentaCantina.objects.filter(
                venta__estado='completada',
                venta__creado_en__date__gte=hoy.replace(day=1), venta__creado_en__date__lte=hoy,
            ),
            area, campo='venta__area',
        )
        filas = (
            detalles.values('producto_id', 'producto__nombre')
            .annotate(cantidad=Sum('cantidad'), total=Sum('subtotal'))
            .order_by('-cantidad', '-total', 'producto_id')[:MAX_TOP_PRODUCTOS]
        )
        return [
            {
                'producto_id': f['producto_id'],
                'nombre': f['producto__nombre'],
                'cantidad': f['cantidad'],
                'total_usd': dinero(f['total'] or CERO),
            }
            for f in filas
        ]

    def _bajo_inventario(self, area):
        productos = self._filtrar_area(
            ProductoCantina.objects.filter(activo=True, stock_actual__lt=F('stock_minimo')),
            area,
        ).order_by(F('stock_actual') - F('stock_minimo'), 'nombre')
        return [
            {
                'producto_id': p['id'],
                'nombre': p['nombre'],
                'stock_actual': p['stock_actual'],
                'stock_minimo': p['stock_minimo'],
                'area': p['area'],
            }
            for p in productos.values('id', 'nombre', 'stock_actual', 'stock_minimo', 'area')
        ]

    def _alertas(self, area):
        abiertas = AlertaCantina.objects.filter(estado='abierta')
        if area:
            # Las alertas sin área (globales) se muestran en ambos filtros.
            abiertas = abiertas.filter(Q(area=area) | Q(area__isnull=True))
        recientes = abiertas.order_by('-fecha', '-creado_en', '-id')[:MAX_ALERTAS_RECIENTES]
        return {
            'abiertas': abiertas.count(),
            'recientes': [
                {
                    'id': a['id'],
                    'tipo': a['tipo'],
                    'severidad': a['severidad'],
                    'titulo': a['titulo'],
                    'fecha': a['fecha'].isoformat(),
                }
                for a in recientes.values('id', 'tipo', 'severidad', 'titulo', 'fecha')
            ],
        }
