import { expect, test } from '@playwright/test';

const token = [
  Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ exp: 4102444800, nombre: 'María', apellido: 'González', representante_id: 7 })).toString('base64url'),
  'firma',
].join('.');

const dashboard = {
  representante: { nombre: 'María', apellido: 'González' },
  alumnos: [
    { id: 1, nombre: 'Sofía', apellido: 'González', grado_seccion: '5.º A' },
    { id: 2, nombre: 'Mateo', apellido: 'González', grado_seccion: '2.º B' },
  ],
  resumen_financiero: {
    total_deuda_usd: 105,
    deuda_por_alumno: [
      { alumno_id: 1, alumno_nombre: 'Sofía González', deuda_usd: 70 },
      { alumno_id: 2, alumno_nombre: 'Mateo González', deuda_usd: 35 },
    ],
    tasa_bcv: { valor: '40.50', fecha: '2026-11-02' },
    mensualidades_vencidas: [
      { id: 10, alumno_id: 1, alumno_nombre: 'Sofía González', mes_nombre: 'Septiembre', anio: 2026, monto_usd: '35', monto_total: '35', dias_mora: 32 },
      { id: 11, alumno_id: 1, alumno_nombre: 'Sofía González', mes_nombre: 'Octubre', anio: 2026, monto_usd: '35', monto_total: '35', dias_mora: 1 },
      { id: 12, alumno_id: 2, alumno_nombre: 'Mateo González', mes_nombre: 'Octubre', anio: 2026, monto_usd: '35', monto_total: '35', dias_mora: 1 },
    ],
    proximos_vencimientos: [
      { id: 13, alumno_id: 1, alumno_nombre: 'Sofía González', mes_nombre: 'Noviembre', anio: 2026, monto_usd: '35', monto_total: '35', fecha_vencimiento: '2026-11-30' },
      { id: 14, alumno_id: 2, alumno_nombre: 'Mateo González', mes_nombre: 'Noviembre', anio: 2026, monto_usd: '35', monto_total: '35', fecha_vencimiento: '2026-11-30' },
    ],
    otros_conceptos_pendientes: [],
  },
  ultimos_pagos: [],
};

const consumos = {
  alumno: dashboard.alumnos[0],
  total_mes_usd: '12.50',
  total_consumido_usd: '12.50',
  total: 1,
  page: 1,
  page_size: 10,
  total_pages: 1,
  results: [{ id: 1, creado_en: '2026-11-02T12:00:00Z', area_display: 'Cantina', total_usd: '12.50', estado: 'completada', items: [{ id: 1, producto_nombre: 'Almuerzo', cantidad: 1, precio_unitario: '12.50', subtotal: '12.50' }] }],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((accessToken) => localStorage.setItem('portal_token', accessToken), token);
  await page.route('**/mock-api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body = {};
    if (path.endsWith('/config-colegio/')) body = { nombre_colegio: 'Colegio Octopus', color_primario: '#0fa3b1', color_secundario: '#1f3864' };
    else if (path.endsWith('/dashboard/')) body = dashboard;
    else if (path.endsWith('/comprobante/')) body = [];
    else if (path.endsWith('/comunicacion/circulares/')) body = [];
    else if (path.includes('/academico/rendimiento/')) body = { por_lapso: [] };
    else if (path.endsWith('/avisos/')) body = { no_leidos: 0, resultados: [] };
    else if (path.endsWith('/cantina/cuenta/')) body = { saldo_usd: '18.50', por_area: [{ area: 'cantina', area_display: 'Cantina', saldo_usd: '18.50' }], cargos: [], abonos: [] };
    else if (path.endsWith('/cantina/saldo/')) body = [{ alumno_id: 1, alumno_nombre: 'Sofía González', tiene_tarjeta: true, saldo: '32.00', estado: 'activa', estado_display: 'Activa' }];
    else if (path.endsWith('/cantina/consumos/')) body = consumos;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
});

test('desglosa la deuda familiar por estudiante sin desbordar la pantalla', async ({ page }) => {
  await page.goto('/portal');

  await expect(page.getByRole('heading', { name: 'Consulta por estudiante' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Toda la familia/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Sofía González', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Mateo González', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: /Sofía González/ }).click();
  await expect(page.getByRole('button', { name: /Sofía González/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Mateo González', { exact: true })).toHaveCount(1);

  const dimensiones = await page.evaluate(() => ({ anchoDocumento: document.documentElement.scrollWidth, anchoVista: document.documentElement.clientWidth }));
  expect(dimensiones.anchoDocumento).toBeLessThanOrEqual(dimensiones.anchoVista);
});

test('cantina conserva saldo y consumos sin mostrar recargas', async ({ page }) => {
  await page.goto('/portal/cantina');

  await expect(page.getByRole('heading', { name: 'Cantina', exact: true })).toBeVisible();
  await expect(page.getByText('Saldo de la tarjeta', { exact: true })).toBeVisible();
  await expect(page.getByText('REF. 32,00')).toBeVisible();
  await expect(page.getByRole('button', { name: /recargar/i })).toHaveCount(0);

  const dimensiones = await page.evaluate(() => ({ anchoDocumento: document.documentElement.scrollWidth, anchoVista: document.documentElement.clientWidth }));
  expect(dimensiones.anchoDocumento).toBeLessThanOrEqual(dimensiones.anchoVista);
});
