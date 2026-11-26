// Respuesta de ejemplo de reportes/resumen-ejecutivo/ para las pruebas del frontend.
export const resumenFixture = (cambios = {}) => ({
  periodo: { fecha_inicio: '2026-11-01', fecha_fin: '2026-11-03', dias: 3 },
  filtros: { area: null, area_etiqueta: 'Cantina y Librería', cajero: null, comparar: false },
  generado_en: '2026-11-04T10:30:00-04:00',
  vacio: false,
  kpis: {
    ingresos_netos_usd: '9.00', ventas_completadas: 3, ticket_promedio_usd: '3.00',
    costo_mercancia_usd: '5.00', utilidad_bruta_usd: '2.40', margen_bruto_pct: '32.43',
    ingresos_con_costo_usd: '7.40', cobertura_costo_pct: '82.22', unidades_sin_costo: 1,
    descuentos_usd: '1.00', ventas_anuladas: 1, ventas_anuladas_usd: '4.00',
    cxc_generadas_cantidad: 1, cxc_generadas_usd: '5.00', abonos_recibidos_cantidad: 1,
    abonos_recibidos_usd: '2.00', saldo_cxc_pendiente_usd: '3.00',
  },
  comparacion: null,
  distribucion_area: [
    { clave: 'cantina', etiqueta: 'Cantina', ventas: 2, ingresos_usd: '6.00', porcentaje: '66.67' },
    { clave: 'libreria', etiqueta: 'Librería', ventas: 1, ingresos_usd: '3.00', porcentaje: '33.33' },
  ],
  distribucion_metodo_pago: [
    { clave: 'efectivo', etiqueta: 'Efectivo divisas', ventas: 3, ingresos_usd: '9.00', porcentaje: '100.00' },
  ],
  evolucion_diaria: [
    { fecha: '2026-11-01', ingresos_usd: '4.00', ventas: 1 },
    { fecha: '2026-11-02', ingresos_usd: '0.00', ventas: 0 },
    { fecha: '2026-11-03', ingresos_usd: '5.00', ventas: 2 },
  ],
  ranking: {
    productos_ingresos: [{ clave: '1', etiqueta: 'Empanada', unidades: 5, ingresos_usd: '4.40', costo_usd: '3.00', utilidad_usd: '1.40', margen_pct: '31.82', unidades_sin_costo: 0 }],
    categorias_ingresos: [{ clave: '1', etiqueta: 'Comida', unidades: 5, ingresos_usd: '4.40', costo_usd: '3.00', utilidad_usd: '1.40', margen_pct: '31.82', unidades_sin_costo: 0 }],
    productos_utilidad: [{ clave: '1', etiqueta: 'Empanada', unidades: 5, ingresos_usd: '4.40', costo_usd: '3.00', utilidad_usd: '1.40', margen_pct: '31.82', unidades_sin_costo: 0 }],
    categorias_utilidad: [{ clave: '1', etiqueta: 'Comida', unidades: 5, ingresos_usd: '4.40', costo_usd: '3.00', utilidad_usd: '1.40', margen_pct: '31.82', unidades_sin_costo: 0 }],
  },
  sin_costo: {
    unidades: 1, productos: 1, ingresos_usd: '1.60',
    lineas: [{ clave: '2', etiqueta: 'Jugo natural', unidades: 1, ingresos_usd: '1.60' }],
  },
  inventario: { entradas: 12, salidas: 3, ajustes: -2, mermas: 5, merma_valor_estimado_usd: '1.20', merma_unidades_sin_costo: 3 },
  caja: {
    cierres: 2, con_diferencia: 1, sin_conteo: 0, tolerancia_usd: '1.00',
    diferencia_neta_usd: '-3.50', faltantes_usd: '-4.00', sobrantes_usd: '0.50',
    detalle: [{ cierre_id: 7, fecha: '2026-11-02', area: 'cantina', cajero: { id: 3, nombre: 'Ana Pérez' }, diferencia_usd: '-4.00' }],
  },
  excepciones: {
    anulaciones: { cantidad: 1, monto_usd: '4.00' },
    descuentos: { cantidad: 1, monto_usd: '1.00' },
    manuales: { cantidad: 1 },
    anulaciones_por_cajero: [{ usuario: { id: 3, nombre: 'Ana Pérez' }, cantidad: 1, monto_usd: '4.00' }],
  },
  alertas: [
    { codigo: 'productos_sin_costo', severidad: 'advertencia', titulo: 'Productos vendidos sin costo registrado', detalle: '1 unidad vendida no tiene costo registrado y se excluye del margen.' },
    { codigo: 'mermas', severidad: 'advertencia', titulo: 'Mermas de inventario', detalle: '5 unidad(es) dadas de baja por merma.' },
  ],
  limitaciones: ['El saldo de cuentas por cobrar es el vigente al momento de la consulta.'],
  ...cambios,
});
