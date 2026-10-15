// Fixtures de la Auditoría de Cantina — copia fiel de las formas de
// CONTRATO_AUDITORIA_CANTINA.md. Solo se usan con VITE_AUDITORIA_MOCK=true.
// Si el contrato cambia, este archivo se actualiza en la integración.

const ana = { id: 7, nombre: 'Ana Pérez' };
const luis = { id: 8, nombre: 'Luis Rondón' };
const director = { id: 2, nombre: 'Director' };

const turno41 = {
  apertura_id: 41,
  etiqueta: 'Turno #41 · 07:02–12:30',
  inicio: '2026-10-14T07:02:00-04:00',
  fin: '2026-10-14T12:30:00-04:00',
};
const turno42 = {
  apertura_id: 42,
  etiqueta: 'Turno #42 · 12:31–17:45',
  inicio: '2026-10-14T12:31:00-04:00',
  fin: '2026-10-14T17:45:00-04:00',
};

/* ── §2 Panel ── */
export const panel = {
  generado_en: '2026-10-15T14:05:00-04:00',
  ventas: {
    hoy: { total_usd: '182.50', cantidad: 96, variacion_pct: '12.40' },
    semana: { total_usd: '940.00', cantidad: 512, variacion_pct: '-3.10' },
    mes: { total_usd: '3820.75', cantidad: 2101, variacion_pct: '5.00' },
  },
  caja_hoy: {
    esperado_usd: '120.00',
    reportado_usd: '117.50',
    diferencia_usd: '-2.50',
    cajas_abiertas: 1,
    cierres_realizados: 2,
  },
  diferencias_pendientes: {
    cantidad: 3,
    monto_total_usd: '-6.75',
    cierres: [
      { id: 88, fecha: '2026-10-14', cajero: ana, diferencia_usd: '-4.00', estado_revision: 'pendiente' },
      { id: 85, fecha: '2026-10-13', cajero: luis, diferencia_usd: '-2.25', estado_revision: 'observado' },
      { id: 81, fecha: '2026-10-12', cajero: ana, diferencia_usd: '-0.50', estado_revision: 'pendiente' },
    ],
  },
  top_productos: [
    { producto_id: 3, nombre: 'Empanada', cantidad: 210, total_usd: '210.00' },
    { producto_id: 9, nombre: 'Jugo natural', cantidad: 160, total_usd: '240.00' },
    { producto_id: 4, nombre: 'Tequeños (3 u.)', cantidad: 120, total_usd: '180.00' },
    { producto_id: 12, nombre: 'Agua 500 ml', cantidad: 95, total_usd: '76.00' },
    { producto_id: 15, nombre: 'Galleta de avena', cantidad: 80, total_usd: '64.00' },
  ],
  bajo_inventario: [
    { producto_id: 9, nombre: 'Jugo natural', stock_actual: 2, stock_minimo: 5, area: 'cantina' },
    { producto_id: 31, nombre: 'Cuaderno 100 hojas', stock_actual: 1, stock_minimo: 4, area: 'libreria' },
  ],
  alertas: {
    abiertas: 4,
    recientes: [
      { id: 12, tipo: 'exceso_anulaciones', severidad: 'advertencia', titulo: 'Ana Pérez anuló 5 ventas hoy', fecha: '2026-10-15' },
      { id: 11, tipo: 'diferencia_caja', severidad: 'critica', titulo: 'Cierre #88 con faltante de $4.00', fecha: '2026-10-14' },
      { id: 10, tipo: 'stock_bajo_minimo', severidad: 'info', titulo: 'Jugo natural bajo el mínimo', fecha: '2026-10-14' },
    ],
  },
};

/* ── §3 Cierres ── */
const cierreFila = {
  id: 88,
  fecha: '2026-10-14',
  area: 'cantina',
  cajero: ana,
  turno: turno41,
  total_ventas_usd: '182.50',
  esperado_efectivo_usd: '60.00',
  conteo_fisico_usd: '56.00',
  diferencia_usd: '-4.00',
  estado_revision: 'observado',
  revisado_por: director,
  revisado_en: '2026-10-15T09:10:00-04:00',
  tiene_adjuntos: true,
  fue_reabierto: false,
};

export const cierres = {
  count: 3,
  next: null,
  previous: null,
  results: [
    cierreFila,
    {
      ...cierreFila,
      id: 89,
      cajero: luis,
      turno: turno42,
      total_ventas_usd: '96.00',
      esperado_efectivo_usd: '40.00',
      conteo_fisico_usd: '40.00',
      diferencia_usd: '0.00',
      estado_revision: 'pendiente',
      revisado_por: null,
      revisado_en: null,
      tiene_adjuntos: false,
    },
    {
      ...cierreFila,
      id: 84,
      fecha: '2026-10-13',
      area: 'libreria',
      diferencia_usd: '0.00',
      estado_revision: 'aprobado',
      tiene_adjuntos: false,
    },
  ],
};

export const cierreDetalle = {
  ...cierreFila,
  monto_inicial_usd: '20.00',
  totales_por_metodo: [
    { metodo: 'efectivo_usd', etiqueta: 'Efectivo USD', ventas_usd: '40.00', recargas_usd: '0.00', abonos_usd: '0.00', total_usd: '40.00' },
    { metodo: 'pago_movil', etiqueta: 'Pago móvil', ventas_usd: '62.50', recargas_usd: '15.00', abonos_usd: '5.00', total_usd: '82.50' },
    { metodo: 'tarjeta_prepago', etiqueta: 'Tarjeta Prepago', ventas_usd: '70.00', recargas_usd: '0.00', abonos_usd: '0.00', total_usd: '70.00' },
    { metodo: 'credito_representante', etiqueta: 'Cargo a cuenta', ventas_usd: '10.00', recargas_usd: '0.00', abonos_usd: '0.00', total_usd: '10.00' },
  ],
  observaciones_cajero: 'Faltó sencillo para vueltos.',
  revision: {
    estado: 'observado',
    comentario_director: 'Justificar el faltante con el registro de vueltos.',
    revisado_por: director,
    revisado_en: '2026-10-15T09:10:00-04:00',
    transiciones_permitidas: ['revisado', 'aprobado'],
  },
  adjuntos: [
    {
      id: 5,
      nombre: 'acta-faltante.pdf',
      url: '/media/cantina/auditoria/adjuntos/2026/10/acta-faltante.pdf',
      tipo_mime: 'application/pdf',
      tamano_bytes: 18233,
      descripcion: 'Acta firmada por la cajera',
      subido_por: director,
      subido_en: '2026-10-15T09:12:00-04:00',
      reemplaza_a: null,
    },
  ],
  reaperturas: [],
  resumen_ventas: { cantidad: 96, anuladas: 2, con_descuento: 1, manuales: 4 },
};

/* ── §4 Reportes ── */
export const reporteVentas = {
  fecha_inicio: '2026-10-01',
  fecha_fin: '2026-10-15',
  agrupar: 'producto',
  filas: [
    { clave: '9', etiqueta: 'Jugo natural', cantidad: 160, ventas: 150, total_usd: '240.00', descuento_usd: '1.50' },
    { clave: '3', etiqueta: 'Empanada', cantidad: 210, ventas: 180, total_usd: '210.00', descuento_usd: '0.00' },
    { clave: '4', etiqueta: 'Tequeños (3 u.)', cantidad: 120, ventas: 110, total_usd: '180.00', descuento_usd: '3.00' },
  ],
  totales: { cantidad: 490, ventas: 300, total_usd: '630.00', descuento_usd: '4.50' },
};

export const reporteExcepciones = {
  count: 2,
  next: null,
  previous: null,
  resumen: { cantidad: 2, monto_usd: '5.50' },
  por_responsable: [{ usuario: ana, cantidad: 2, monto_usd: '5.50' }],
  results: [
    {
      venta_id: 1201,
      fecha_hora: '2026-10-14T10:15:00-04:00',
      cajero: ana,
      turno: { apertura_id: 41, etiqueta: turno41.etiqueta },
      metodo_pago: 'efectivo_usd',
      total_usd: '3.00',
      descuento_usd: '0.00',
      motivo: 'Cliente desistió de la compra',
      anulada_por: ana,
      origen_producto: 'manual',
      origen_alumno: 'no_aplica',
    },
    {
      venta_id: 1188,
      fecha_hora: '2026-10-14T08:40:00-04:00',
      cajero: ana,
      turno: { apertura_id: 41, etiqueta: turno41.etiqueta },
      metodo_pago: 'tarjeta_prepago',
      total_usd: '2.50',
      descuento_usd: '0.00',
      motivo: 'Producto cobrado dos veces',
      anulada_por: ana,
      origen_producto: 'escaner',
      origen_alumno: 'escaner',
    },
  ],
};

export const reporteInventario = {
  count: 3,
  next: null,
  previous: null,
  resumen: { entrada: 120, salida: 96, ajuste: -2, merma: 5 },
  results: [
    { id: 77, fecha_hora: '2026-10-14T16:00:00-04:00', producto: { id: 9, nombre: 'Jugo natural' }, tipo: 'merma', cantidad: 3, stock_antes: 10, stock_despues: 7, motivo: 'Vencido', usuario: ana, venta_id: null },
    { id: 76, fecha_hora: '2026-10-14T09:00:00-04:00', producto: { id: 3, nombre: 'Empanada' }, tipo: 'entrada', cantidad: 60, stock_antes: 12, stock_despues: 72, motivo: 'Compra a proveedor', usuario: luis, venta_id: null },
    { id: 75, fecha_hora: '2026-10-13T17:30:00-04:00', producto: { id: 12, nombre: 'Agua 500 ml' }, tipo: 'ajuste', cantidad: -2, stock_antes: 30, stock_despues: 28, motivo: 'Conteo físico', usuario: luis, venta_id: null },
  ],
};

export const reporteRentabilidad = {
  filas: [
    { clave: '3', etiqueta: 'Empanada', unidades: 210, ventas_usd: '210.00', costo_usd: '126.00', margen_usd: '84.00', margen_pct: '40.00', unidades_sin_costo: 0 },
    { clave: '9', etiqueta: 'Jugo natural', unidades: 160, ventas_usd: '240.00', costo_usd: '128.00', margen_usd: '112.00', margen_pct: '46.67', unidades_sin_costo: 0 },
    { clave: '4', etiqueta: 'Tequeños (3 u.)', unidades: 120, ventas_usd: '127.50', costo_usd: '76.50', margen_usd: '51.00', margen_pct: '40.00', unidades_sin_costo: 35 },
  ],
  totales: { ventas_usd: '577.50', costo_usd: '330.50', margen_usd: '247.00', margen_pct: '42.77', unidades_sin_costo: 35 },
  advertencia: '35 unidades vendidas no tienen costo registrado y se excluyen del margen.',
};

/* ── §5 Bitácora ── */
export const bitacora = {
  count: 3,
  next: null,
  previous: null,
  results: [
    {
      id: 503, tipo: 'revision_cierre', tipo_etiqueta: 'Revisión de cierre', creado_en: '2026-10-15T09:10:00-04:00',
      usuario: director, usuario_rol: 'director', area: 'cantina', objeto_tipo: 'cierrecajacantina', objeto_id: '88',
      objeto_etiqueta: 'Cierre #88', antes: { estado: 'pendiente' }, despues: { estado: 'observado' },
      motivo: 'Justificar el faltante con el registro de vueltos.', ip: '10.0.0.4',
    },
    {
      id: 502, tipo: 'anulacion_venta', tipo_etiqueta: 'Anulación de venta', creado_en: '2026-10-14T10:15:00-04:00',
      usuario: ana, usuario_rol: 'cajero', area: 'cantina', objeto_tipo: 'ventacantina', objeto_id: '1201',
      objeto_etiqueta: 'Venta #1201', antes: { estado: 'completada', total_usd: '3.00', metodo_pago: 'efectivo_usd' },
      despues: { estado: 'anulada' }, motivo: 'Cliente desistió de la compra', ip: '10.0.0.5',
    },
    {
      id: 501, tipo: 'cambio_precio', tipo_etiqueta: 'Cambio de precio o costo', creado_en: '2026-10-14T07:30:00-04:00',
      usuario: luis, usuario_rol: 'administrador', area: 'cantina', objeto_tipo: 'productocantina', objeto_id: '9',
      objeto_etiqueta: 'Jugo natural', antes: { precio: '1.50', costo: '0.80' }, despues: { precio: '2.00', costo: '0.80' },
      motivo: '', ip: '10.0.0.5',
    },
  ],
};

export const verificacionBitacora = { ok: true, total: 503, primer_error_id: null, motivo: '' };

/* ── §6 Alertas ── */
export const alertas = {
  count: 2,
  next: null,
  previous: null,
  results: [
    {
      id: 12, tipo: 'exceso_anulaciones', tipo_etiqueta: 'Exceso de anulaciones', severidad: 'advertencia',
      fecha: '2026-10-15', area: 'cantina', titulo: 'Ana Pérez anuló 5 ventas hoy (límite 3)',
      detalle: { cajero_id: 7, cantidad: 5, limite: 3 }, referencia_tipo: 'usuario', referencia_id: '7',
      estado: 'abierta', atendida_por: null, atendida_en: null, nota_atencion: '',
    },
    {
      id: 11, tipo: 'diferencia_caja', tipo_etiqueta: 'Diferencia de caja', severidad: 'critica',
      fecha: '2026-10-14', area: 'cantina', titulo: 'Cierre #88 con faltante de $4.00',
      detalle: { cierre_id: 88, diferencia_usd: '-4.00', tolerancia_usd: '1.00' }, referencia_tipo: 'cierre', referencia_id: '88',
      estado: 'abierta', atendida_por: null, atendida_en: null, nota_atencion: '',
    },
  ],
};

export const resumenAlertas = { abiertas: 4, por_severidad: { critica: 1, advertencia: 2, info: 1 } };

/* ── §7 Parámetros ── */
export const parametros = {
  tolerancia_diferencia_caja: '1.00',
  limite_anulaciones_dia_cajero: 3,
  limite_anulaciones_dia_total: 10,
  limite_descuentos_dia_cajero: 5,
  limite_descuento_porcentaje: '10.00',
  hora_tope_cierre: '18:00',
  actualizado_por: director,
  actualizado_en: '2026-10-10T08:00:00-04:00',
};
