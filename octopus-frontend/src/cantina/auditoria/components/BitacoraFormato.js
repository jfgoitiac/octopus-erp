import { ESTADOS_REVISION, usd } from './CierreFormato';

// Helpers de la bitácora, las alertas y los parámetros (CONTRATO §5–§7).
// Las fechas y montos se formatean con los helpers de F2 (CierreFormato.js).

// Tipos de `EventoAuditoriaCantina.TIPOS` (contrato §1). La etiqueta real
// llega en `tipo_etiqueta`; esta lista solo alimenta el filtro.
export const TIPOS_EVENTO = [
  { valor: 'cambio_precio', etiqueta: 'Cambio de precio o costo' },
  { valor: 'producto_creado', etiqueta: 'Producto creado' },
  { valor: 'anulacion_venta', etiqueta: 'Anulación de venta' },
  { valor: 'descuento_venta', etiqueta: 'Descuento en venta' },
  { valor: 'venta_manual', etiqueta: 'Venta manual' },
  { valor: 'movimiento_inventario', etiqueta: 'Entrada de inventario' },
  { valor: 'ajuste_inventario', etiqueta: 'Ajuste de inventario' },
  { valor: 'merma', etiqueta: 'Merma' },
  { valor: 'apertura_caja', etiqueta: 'Apertura de caja' },
  { valor: 'cierre_caja', etiqueta: 'Cierre de caja' },
  { valor: 'reapertura_caja', etiqueta: 'Reapertura de caja' },
  { valor: 'cierre_modificado', etiqueta: 'Cierre modificado' },
  { valor: 'revision_cierre', etiqueta: 'Revisión de cierre' },
  { valor: 'adjunto_cierre', etiqueta: 'Adjunto de cierre' },
  { valor: 'alerta_atendida', etiqueta: 'Alerta atendida' },
  { valor: 'parametros_auditoria', etiqueta: 'Parámetros de auditoría' },
];

// Color del punto de cada tipo (mismos tonos que la línea de tiempo de F2).
export const COLOR_TIPO_EVENTO = {
  revision_cierre: 'var(--pb)', adjunto_cierre: 'var(--teal)', reapertura_caja: 'var(--violet)',
  anulacion_venta: 'var(--red)', cierre_caja: 'var(--jet-mid)', apertura_caja: 'var(--green)',
  descuento_venta: 'var(--amber-ink)', venta_manual: 'var(--amber-ink)', cierre_modificado: 'var(--orange)',
  cambio_precio: 'var(--pb-mid)', producto_creado: 'var(--green)', merma: 'var(--red)',
  ajuste_inventario: 'var(--orange)', movimiento_inventario: 'var(--teal)',
  alerta_atendida: 'var(--green)', parametros_auditoria: 'var(--violet)',
};

export const ROL_ETIQUETA = {
  cajero: 'Cajero', administrador: 'Administrador', director: 'Director', superusuario: 'Superusuario',
};

// `objeto_tipo` llega como nombre de modelo en minúsculas (ContentType).
export const OBJETO_ETIQUETA = {
  productocantina: 'Producto',
  ventacantina: 'Venta',
  cierrecajacantina: 'Cierre',
  aperturacajacantina: 'Apertura',
  reaperturacajacantina: 'Reapertura',
  movimientoinventario: 'Movimiento',
  alertacantina: 'Alerta',
  parametroauditoriacantina: 'Parámetros',
};

const ETIQUETA_CAMPO = {
  estado: 'Estado', precio: 'Precio', costo: 'Costo', stock: 'Stock', stock_actual: 'Stock',
  total_usd: 'Total', subtotal_usd: 'Subtotal', descuento_usd: 'Descuento', metodo_pago: 'Método de pago',
  monto_inicial: 'Monto inicial', total_ventas: 'Total ventas', total_efectivo: 'Efectivo',
  conteo_fisico: 'Conteo físico', diferencia: 'Diferencia', nombre: 'Archivo', adjunto_id: 'Adjunto',
  apertura_id: 'Apertura', apertura_nueva_id: 'Apertura nueva', cierre_id: 'Cierre', area: 'Área',
  origen_producto: 'Origen del producto', origen_alumno: 'Origen del alumno',
  tolerancia_diferencia_caja: 'Tolerancia de diferencia', limite_anulaciones_dia_cajero: 'Anulaciones/día por cajero',
  limite_anulaciones_dia_total: 'Anulaciones/día total', limite_descuentos_dia_cajero: 'Descuentos/día por cajero',
  limite_descuento_porcentaje: 'Descuento máximo (%)', hora_tope_cierre: 'Hora tope de cierre',
};

const CLAVES_MONTO = /(_usd$|^precio$|^costo$|^monto|^total|^diferencia$|^conteo_fisico$|^tolerancia)/;

export const etiquetaCampo = (clave) => ETIQUETA_CAMPO[clave] ?? clave.replace(/_/g, ' ');

export const formatearValor = (clave, valor) => {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (clave === 'estado' && ESTADOS_REVISION[valor]) return ESTADOS_REVISION[valor].etiqueta;
  if (CLAVES_MONTO.test(clave) && !Number.isNaN(Number(valor))) return usd(valor);
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor).replace(/_/g, ' ');
};

// Unión de claves de antes/después, marcando cuáles cambiaron. Un campo que
// solo existe de un lado (p. ej. una creación) no cuenta como "cambio".
export const diferenciasEvento = (antes, despues) => {
  const a = antes ?? {};
  const d = despues ?? {};
  return [...new Set([...Object.keys(a), ...Object.keys(d)])].map((clave) => {
    const tieneAntes = clave in a;
    const tieneDespues = clave in d;
    const cambio = tieneAntes && tieneDespues && JSON.stringify(a[clave]) !== JSON.stringify(d[clave]);
    return { clave, tieneAntes, tieneDespues, antes: a[clave], despues: d[clave], cambio };
  });
};

export const SEVERIDADES_ALERTA = {
  critica: { texto: 'Crítica', color: 'var(--red)', fondo: 'var(--red-light)' },
  advertencia: { texto: 'Advertencia', color: 'var(--amber-ink)', fondo: 'var(--yellow-light)' },
  info: { texto: 'Info', color: 'var(--teal)', fondo: 'var(--teal-light)' },
};

// Reglas del motor (contrato §6). La etiqueta real llega en `tipo_etiqueta`.
export const TIPOS_ALERTA = [
  { valor: 'diferencia_caja', etiqueta: 'Diferencia de caja' },
  { valor: 'exceso_anulaciones', etiqueta: 'Exceso de anulaciones' },
  { valor: 'exceso_descuentos', etiqueta: 'Exceso de descuentos' },
  { valor: 'inventario_inconsistente', etiqueta: 'Inventario inconsistente' },
  { valor: 'cierre_faltante', etiqueta: 'Cierre faltante' },
  { valor: 'stock_bajo_minimo', etiqueta: 'Stock bajo mínimo' },
];

// `referencia_tipo` de una alerta → `objeto_tipo` de bitácora, para abrir sus
// eventos. Los cierres tienen pantalla propia (ver AlertaTarjeta).
export const REFERENCIA_A_OBJETO = {
  producto: 'productocantina',
  venta: 'ventacantina',
  apertura: 'aperturacajacantina',
  cierre: 'cierrecajacantina',
};

export const ESTILO_BOTON_SECUNDARIO = { background: '#fff', border: '0.5px solid var(--border-md)', color: 'var(--jet)' };
export const ESTILO_BOTON_PRIMARIO = { background: 'var(--pb)', color: '#fff' };
export const CLASE_CAMPO = 'w-full px-3 py-2 rounded-xl text-sm outline-none min-h-[44px] focus:ring-2 focus:ring-[var(--pb)]';
export const CLASE_ETIQUETA = 'block text-xs uppercase tracking-widest mb-1.5';
