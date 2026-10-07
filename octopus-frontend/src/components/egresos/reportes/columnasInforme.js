export function columnasInforme(tipo, fiscalActivo, moneda) {
  const equivalentes = moneda === 'original'
    ? [{ key: 'monto_usd', label: 'USD', tipo: 'monto', moneda: 'USD' }, { key: 'monto_ves', label: 'Bs.', tipo: 'monto', moneda: 'VES' }]
    : [{ key: moneda === 'usd' ? 'monto_usd' : 'monto_ves', label: moneda.toUpperCase(), tipo: 'monto', moneda: moneda.toUpperCase() }];
  if (tipo === 'relacion-detallada') return [{ key: 'fecha_egreso', label: 'Fecha de pago' }, { key: 'numero_documento', label: 'Documento' }, { key: 'proveedor', label: 'Proveedor' }, { key: 'categoria', label: 'Categoría' }, ...equivalentes];
  if (tipo === 'por-categoria') return [{ key: 'categoria__nombre', label: 'Categoría' }, ...equivalentes];
  if (tipo === 'por-proveedor') return [{ key: 'proveedor__razon_social', label: 'Proveedor' }, ...equivalentes];
  if (tipo === 'por-sede') return [{ key: 'sede__nombre', label: 'Sede' }, ...equivalentes];
  if (tipo === 'comparativo-mensual') return [{ key: 'mes', label: 'Mes' }, ...equivalentes];
  if (tipo === 'ejecucion-presupuestaria') return [{ key: 'categoria', label: 'Categoría' }, { key: 'moneda_presupuesto', label: 'Moneda presupuesto' }, { key: 'presupuesto', label: 'Presupuesto', tipo: 'monto' }, { key: 'pagado_usd', label: 'Pagado USD', tipo: 'monto', moneda: 'USD' }, { key: 'pagado_ves', label: 'Pagado Bs.', tipo: 'monto', moneda: 'VES' }, { key: 'porcentaje', label: '% consumido' }];
  if (tipo === 'historial-articulos') return [{ key: 'fecha_egreso', label: 'Fecha de pago' }, { key: 'articulo', label: 'Artículo' }, { key: 'proveedor', label: 'Proveedor' }, { key: 'cantidad', label: 'Cantidad' }, { key: 'precio_unitario', label: 'Precio unit.' }, ...equivalentes];
  const fiscales = fiscalActivo ? [{ key: 'rif', label: 'RIF' }, { key: 'numero_control', label: 'Control' }, { key: 'subtotal', label: 'Base imponible', tipo: 'monto' }, { key: 'iva', label: 'IVA', tipo: 'monto' }, { key: 'igtf', label: 'IGTF', tipo: 'monto' }, { key: 'retencion_iva', label: 'Ret. IVA', tipo: 'monto' }, { key: 'retencion_islr', label: 'Ret. ISLR', tipo: 'monto' }] : [];
  return [{ key: 'fecha_emision', label: 'Fecha de factura' }, { key: 'proveedor', label: 'Proveedor' }, { key: 'numero_documento', label: 'Factura' }, ...fiscales, { key: 'total_documento', label: 'Total documento', tipo: 'monto' }, ...equivalentes];
}
