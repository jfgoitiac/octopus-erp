"""Panel ejecutivo — carril B2 (Fase 1). Contrato §2."""
import calendar
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, F, Q, Sum
from django.utils import timezone
from rest_framework.response import Response

from cantina.models import (
    AlertaCantina,
    AperturaCajaCantina,
    CierreCajaCantina,
    DetalleVentaCantina,
    ProductoCantina,
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
    """GET ?area=: KPIs del panel del Director. Todo se agrega en BD."""

    def get(self, request):
        try:
            area = parsear_area(request)
        except ParametroInvalido as exc:
            return error(str(exc))
        hoy = timezone.localdate()
        asegurar_revisiones()
        return Response({
            'generado_en': fecha_hora(timezone.now()),
            'ventas': self._ventas(hoy, area),
            'caja_hoy': self._caja_hoy(hoy, area),
            'diferencias_pendientes': self._diferencias_pendientes(area),
            'top_productos': self._top_productos(hoy, area),
            'bajo_inventario': self._bajo_inventario(area),
            'alertas': self._alertas(area),
        })

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
