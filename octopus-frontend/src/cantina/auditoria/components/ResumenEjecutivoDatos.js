import {
  Ban, Banknote, Coins, Hourglass, Percent, Receipt, ShoppingCart, Tag, TrendingUp, Wallet, CreditCard,
} from 'lucide-react';
import { format, isValid, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatearCelda } from '../utils/exportarAuditoria';
import { textoFiltros } from './ReporteDatos';
import { ETIQUETA_AREA } from './CierreFormato';

// Definiciones compartidas del Resumen ejecutivo: KPIs, columnas de tablas y el
// informe que consumen PDF y Excel. Ningún monto se calcula aquí: todo llega
// del backend (`reportes/resumen-ejecutivo/`) y solo se da formato.

// `buenoSiSube`: el color de la variación solo se juzga en métricas con sentido claro.
export const KPIS_PRINCIPALES = [
  { clave: 'ingresos_netos_usd', etiqueta: 'Ingresos netos', tipo: 'monto', icono: Wallet, buenoSiSube: true },
  { clave: 'ventas_completadas', etiqueta: 'Ventas completadas', tipo: 'entero', icono: ShoppingCart, buenoSiSube: true },
  { clave: 'ticket_promedio_usd', etiqueta: 'Ticket promedio', tipo: 'monto', icono: Receipt },
  { clave: 'costo_mercancia_usd', etiqueta: 'Costo de mercancía vendida', tipo: 'monto', icono: Coins },
  { clave: 'utilidad_bruta_usd', etiqueta: 'Utilidad bruta', tipo: 'monto', icono: TrendingUp, buenoSiSube: true },
  { clave: 'margen_bruto_pct', etiqueta: 'Margen bruto', tipo: 'pct', icono: Percent, buenoSiSube: true },
  { clave: 'descuentos_usd', etiqueta: 'Descuentos otorgados', tipo: 'monto', icono: Tag },
  { clave: 'ventas_anuladas', etiqueta: 'Ventas anuladas', tipo: 'entero', icono: Ban, notaClave: 'ventas_anuladas_usd' },
];

export const KPIS_CARTERA = [
  { clave: 'cxc_generadas_usd', etiqueta: 'Cuentas por cobrar generadas', tipo: 'monto', icono: CreditCard, notaCantidad: 'cxc_generadas_cantidad', unidad: 'cuenta(s)' },
  { clave: 'abonos_recibidos_usd', etiqueta: 'Abonos recibidos', tipo: 'monto', icono: Banknote, buenoSiSube: true, notaCantidad: 'abonos_recibidos_cantidad', unidad: 'abono(s)' },
  { clave: 'saldo_cxc_pendiente_usd', etiqueta: 'Saldo por cobrar pendiente', tipo: 'monto', icono: Hourglass, nota: 'Al cierre del período' },
];

const signo = (n) => (Number(n) > 0 ? '+' : '');

// Texto de la variación frente al período anterior (null si no se comparó).
export const textoVariacion = (variacion) => {
  if (!variacion) return null;
  if (variacion.variacion_puntos != null) return `${signo(variacion.variacion_puntos)}${variacion.variacion_puntos} pp vs. anterior`;
  if (variacion.variacion_pct == null) return 'Sin base de comparación';
  return `${signo(variacion.variacion_pct)}${variacion.variacion_pct} % vs. anterior`;
};

export const colorVariacion = (variacion, buenoSiSube) => {
  const n = Number(variacion?.variacion_puntos ?? variacion?.variacion_pct);
  if (!buenoSiSube || !Number.isFinite(n) || n === 0) return 'var(--ash)';
  return n > 0 ? 'var(--green)' : 'var(--red)';
};

export const valorKpi = (def, kpis) => {
  if (def.clave === 'margen_bruto_pct' && kpis[def.clave] == null) return 'No calculable';
  return formatearCelda(def.tipo, kpis[def.clave]);
};

const fechaHoraLarga = (iso) => {
  const d = iso ? parseISO(iso) : new Date();
  return format(isValid(d) ? d : new Date(), "d 'de' MMMM yyyy, HH:mm", { locale: es });
};

/* ── Columnas ── */

const columnasRanking = (primera) => [
  { key: 'etiqueta', label: primera, tipo: 'texto' },
  { key: 'unidades', label: 'Unidades', tipo: 'entero' },
  { key: 'ingresos_usd', label: 'Ingresos', tipo: 'monto' },
  { key: 'costo_usd', label: 'Costo', tipo: 'monto' },
  { key: 'utilidad_usd', label: 'Utilidad', tipo: 'monto' },
  { key: 'margen_pct', label: 'Margen %', tipo: 'pct' },
  { key: 'unidades_sin_costo', label: 'Sin costo', tipo: 'entero' },
];
export const COL_RANKING_PRODUCTO = columnasRanking('Producto');
export const COL_RANKING_CATEGORIA = columnasRanking('Categoría');

const columnasDistribucion = (primera) => [
  { key: 'etiqueta', label: primera, tipo: 'texto' },
  { key: 'ventas', label: 'Ventas', tipo: 'entero' },
  { key: 'ingresos_usd', label: 'Ingresos', tipo: 'monto' },
  { key: 'porcentaje', label: '% del total', tipo: 'pct' },
];
export const COL_DIST_AREA = columnasDistribucion('Área');
export const COL_DIST_METODO = columnasDistribucion('Método de pago');

export const COL_SIN_COSTO = [
  { key: 'etiqueta', label: 'Producto', tipo: 'texto' },
  { key: 'unidades', label: 'Unidades', tipo: 'entero' },
  { key: 'ingresos_usd', label: 'Ingresos sin costo', tipo: 'monto' },
];

export const COL_DIFERENCIAS = [
  { key: 'fecha', label: 'Fecha', tipo: 'fecha' },
  { key: 'area', label: 'Área', tipo: 'texto', valor: (f) => ETIQUETA_AREA[f.area] ?? f.area },
  { key: 'cajero', label: 'Cajero', tipo: 'texto', valor: (f) => f.cajero?.nombre },
  { key: 'diferencia_usd', label: 'Diferencia', tipo: 'monto' },
];

const COL_EVOLUCION = [
  { key: 'fecha', label: 'Fecha', tipo: 'fecha' },
  { key: 'ventas', label: 'Ventas', tipo: 'entero' },
  { key: 'ingresos_usd', label: 'Ingresos', tipo: 'monto' },
];
const COL_INVENTARIO = [
  { key: 'concepto', label: 'Concepto', tipo: 'texto' },
  { key: 'unidades', label: 'Unidades', tipo: 'entero' },
  { key: 'valor_usd', label: 'Valor estimado', tipo: 'monto' },
];
const COL_EXCEPCIONES = [
  { key: 'tipo', label: 'Tipo', tipo: 'texto' },
  { key: 'cantidad', label: 'Cantidad', tipo: 'entero' },
  { key: 'monto_usd', label: 'Monto', tipo: 'monto' },
];
const COL_ANULACIONES_CAJERO = [
  { key: 'usuario', label: 'Cajero', tipo: 'texto', valor: (f) => f.usuario?.nombre },
  { key: 'cantidad', label: 'Anulaciones', tipo: 'entero' },
  { key: 'monto_usd', label: 'Monto', tipo: 'monto' },
];
const COL_CAJA = [
  { key: 'concepto', label: 'Concepto', tipo: 'texto' },
  { key: 'cantidad', label: 'Cantidad', tipo: 'entero' },
  { key: 'monto_usd', label: 'Monto', tipo: 'monto' },
];
const COL_ALERTAS = [
  { key: 'severidad', label: 'Severidad', tipo: 'texto' },
  { key: 'titulo', label: 'Alerta', tipo: 'texto' },
  { key: 'detalle', label: 'Detalle', tipo: 'texto' },
];
const COL_KPI_PDF = [
  { key: 'indicador', label: 'Indicador', tipo: 'texto' },
  { key: 'valor', label: 'Valor', tipo: 'texto' },
  { key: 'variacion', label: 'Variación vs. período anterior', tipo: 'texto' },
];
const COL_KPI_EXCEL = [
  { key: 'indicador', label: 'Indicador', tipo: 'texto' },
  { key: 'monto', label: 'Monto (USD)', tipo: 'monto' },
  { key: 'cantidad', label: 'Cantidad', tipo: 'entero' },
  { key: 'porcentaje', label: 'Porcentaje', tipo: 'pct' },
  { key: 'var_pct', label: 'Variación %', tipo: 'pct' },
  { key: 'var_pp', label: 'Variación (pp)', tipo: 'pct' },
];

const SEVERIDAD = { critica: 'Crítica', advertencia: 'Advertencia', info: 'Informativa' };
const COLUMNA_KPI = { monto: 'monto', entero: 'cantidad', pct: 'porcentaje' };

/* ── Informe exportable ── */

const filasKpiExcel = (data) => {
  const comparacion = data.comparacion?.variaciones;
  const defs = [...KPIS_PRINCIPALES, ...KPIS_CARTERA];
  return defs.flatMap((def) => {
    const v = comparacion?.[def.clave];
    const fila = {
      indicador: def.etiqueta,
      [COLUMNA_KPI[def.tipo]]: data.kpis[def.clave],
      var_pct: v?.variacion_pct,
      var_pp: v?.variacion_puntos,
    };
    return v ? [fila, { indicador: `${def.etiqueta} (período anterior)`, [COLUMNA_KPI[def.tipo]]: v.anterior }] : [fila];
  });
};

export function construirInforme(data, filtros, cajeros, institucion) {
  const { kpis, inventario: inv, caja, excepciones: exc, sin_costo: sc } = data;
  const comparacion = data.comparacion?.variaciones;
  const extra = [
    data.comparacion
      ? `Comparado con ${data.comparacion.periodo.fecha_inicio} a ${data.comparacion.periodo.fecha_fin}`
      : 'Sin comparación con período anterior',
  ];

  const kpisPdf = {
    titulo: 'Indicadores principales',
    columnas: COL_KPI_PDF,
    filas: [...KPIS_PRINCIPALES, ...KPIS_CARTERA].map((def) => ({
      indicador: def.etiqueta,
      valor: valorKpi(def, kpis),
      variacion: textoVariacion(comparacion?.[def.clave]) ?? '—',
    })),
  };

  const tablaInventario = {
    titulo: 'Movimientos de inventario',
    columnas: COL_INVENTARIO,
    filas: [
      { concepto: 'Entradas', unidades: inv.entradas },
      { concepto: 'Salidas', unidades: inv.salidas },
      { concepto: 'Ajustes (neto)', unidades: inv.ajustes },
      { concepto: 'Mermas', unidades: inv.mermas, valor_usd: inv.merma_valor_estimado_usd },
    ],
  };
  const tablaExcepciones = {
    titulo: 'Excepciones del período',
    columnas: COL_EXCEPCIONES,
    filas: [
      { tipo: 'Ventas anuladas', cantidad: exc.anulaciones.cantidad, monto_usd: exc.anulaciones.monto_usd },
      { tipo: 'Ventas con descuento', cantidad: exc.descuentos.cantidad, monto_usd: exc.descuentos.monto_usd },
      { tipo: 'Ventas manuales', cantidad: exc.manuales.cantidad },
    ],
  };
  const tablaCaja = {
    titulo: 'Diferencias de caja',
    columnas: COL_CAJA,
    filas: [
      { concepto: 'Cierres de caja', cantidad: caja.cierres },
      { concepto: `Con diferencia sobre la tolerancia ($${caja.tolerancia_usd})`, cantidad: caja.con_diferencia },
      { concepto: 'Sin conteo físico', cantidad: caja.sin_conteo },
      { concepto: 'Diferencia neta', monto_usd: caja.diferencia_neta_usd },
      { concepto: 'Faltantes', monto_usd: caja.faltantes_usd },
      { concepto: 'Sobrantes', monto_usd: caja.sobrantes_usd },
    ],
  };

  const hojas = [
    {
      nombre: 'Resumen',
      tablas: [
        { titulo: 'Indicadores principales', columnas: COL_KPI_EXCEL, filas: filasKpiExcel(data) },
        {
          titulo: 'Alertas ejecutivas', columnas: COL_ALERTAS, soloExcel: true,
          filas: data.alertas.map((a) => ({ ...a, severidad: SEVERIDAD[a.severidad] ?? a.severidad })),
        },
        {
          titulo: 'Limitaciones', soloExcel: true, columnas: [{ key: 'texto', label: 'Nota', tipo: 'texto' }],
          filas: data.limitaciones.map((texto) => ({ texto })),
        },
      ],
    },
    {
      nombre: 'Ventas',
      tablas: [
        {
          titulo: 'Evolución diaria de ingresos', columnas: COL_EVOLUCION, filas: data.evolucion_diaria,
          totales: { ventas: kpis.ventas_completadas, ingresos_usd: kpis.ingresos_netos_usd },
        },
        { titulo: 'Ingresos por área', columnas: COL_DIST_AREA, filas: data.distribucion_area },
        { titulo: 'Productos con mayores ingresos', columnas: COL_RANKING_PRODUCTO, filas: data.ranking.productos_ingresos },
        { titulo: 'Categorías con mayores ingresos', columnas: COL_RANKING_CATEGORIA, filas: data.ranking.categorias_ingresos },
      ],
    },
    {
      nombre: 'Rentabilidad',
      tablas: [
        { titulo: 'Productos con mayor utilidad', columnas: COL_RANKING_PRODUCTO, filas: data.ranking.productos_utilidad },
        { titulo: 'Categorías con mayor utilidad', columnas: COL_RANKING_CATEGORIA, filas: data.ranking.categorias_utilidad },
        { titulo: 'Productos vendidos sin costo registrado', columnas: COL_SIN_COSTO, filas: sc.lineas },
      ],
    },
    {
      nombre: 'Métodos de pago',
      tablas: [{ titulo: 'Ingresos por método de pago', columnas: COL_DIST_METODO, filas: data.distribucion_metodo_pago }],
    },
    { nombre: 'Inventario', tablas: [tablaInventario] },
    {
      nombre: 'Excepciones',
      tablas: [
        tablaExcepciones,
        { titulo: 'Anulaciones por cajero', columnas: COL_ANULACIONES_CAJERO, filas: exc.anulaciones_por_cajero },
        tablaCaja,
        { titulo: 'Cierres con mayor diferencia', columnas: COL_DIFERENCIAS, filas: caja.detalle },
      ],
    },
  ];

  const secciones = [kpisPdf, ...hojas.flatMap((h, i) => (i === 0 ? [] : h.tablas)).filter((t) => !t.soloExcel)];
  const area = filtros.area ? ETIQUETA_AREA[filtros.area] : 'Cantina y Librería';
  return {
    titulo: 'Resumen ejecutivo de Cantina y Librería',
    institucion,
    desde: data.periodo.fecha_inicio,
    hasta: data.periodo.fecha_fin,
    filtros: textoFiltros(filtros, cajeros, extra),
    area,
    generado: fechaHoraLarga(data.generado_en),
    alertas: [
      ...data.alertas,
      ...data.limitaciones.map((texto) => ({ severidad: 'info', titulo: 'Nota', detalle: texto })),
    ],
    secciones,
    hojas,
  };
}
