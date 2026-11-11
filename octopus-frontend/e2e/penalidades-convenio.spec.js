import { expect, test } from '@playwright/test';
import { simularApi, sinScrollHorizontal, alAlcance, tokenDePrueba } from './ayudas';

const penalidad = {
  id: 91, tipo: 'recargo_convenio', convenio_id: 7, alumno_id: 1,
  alumno_nombre: 'Ana Pérez', concepto: 'Penalidad del convenio #7, período 1',
  descripcion: 'Penalidad del convenio #7, período 1', monto_usd: '5.00', fecha_programada: '2026-07-20',
};

test('portal muestra penalidad una vez dentro del saldo y respeta el filtro por hijo', async ({ page }, info) => {
  await page.addInitScript(token => localStorage.setItem('portal_token', token), tokenDePrueba('representante'));
  const errores = await simularApi(page, 'representante', ruta => {
    if (ruta.endsWith('config-colegio/')) return { nombre_colegio: 'Colegio Octopus', color_primario: '#0fa3b1', color_secundario: '#1f3864' };
    if (ruta === 'portal/dashboard/') return {
      alumnos: [{ id: 1, nombre: 'Ana', apellido: 'Pérez' }, { id: 2, nombre: 'Luis', apellido: 'Pérez' }],
      resumen_financiero: {
        total_deuda_usd: 5, total_penalidades_convenio_usd: '5.00', penalidades_convenio: [penalidad],
        deuda_por_alumno: [{ alumno_id: 1, alumno_nombre: 'Ana Pérez', deuda_usd: 5 }, { alumno_id: 2, alumno_nombre: 'Luis Pérez', deuda_usd: 0 }],
        mensualidades_vencidas: [], proximos_vencimientos: [], otros_conceptos_pendientes: [],
      }, ultimos_pagos: [],
    };
    if (ruta.includes('rendimiento/')) return { por_lapso: [] };
    if (ruta.endsWith('avisos/')) return { no_leidos: 0, resultados: [] };
    return undefined;
  });
  await page.goto('/portal');
  await expect(page.getByText('Consulta el detalle y coordina estos conceptos con administración.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Ana Pérez/ })).toContainText('1 concepto vencido');
  const resumen = page.locator('section[aria-labelledby="resumen-financiero"]');
  await expect(resumen.getByText(penalidad.concepto, { exact: true })).toHaveCount(1);
  await expect(resumen.getByText(/Incluida en tu saldo pendiente/)).toBeVisible();
  await resumen.scrollIntoViewIfNeeded();
  await sinScrollHorizontal(page);
  await info.attach('portal-penalidad', { body: await page.screenshot(), contentType: 'image/png' });
  const filtro = page.getByRole('group', { name: 'Filtrar deuda por estudiante' });
  await filtro.getByRole('button', { name: /Luis Pérez/ }).click();
  await expect(resumen.getByText(penalidad.concepto)).toHaveCount(0);
  expect(errores).toEqual([]);
});

test('caja conserva la penalidad separada y su acceso a Convenios queda al alcance', async ({ page }, info) => {
  const errores = await simularApi(page, 'cobranza', ruta => {
    if (ruta.startsWith('cobranza/buscar/')) return {
      representante: { id: 7, nombre: 'María', apellido: 'Pérez', cedula: '123' },
      alumnos: [{ id: 1, nombre: 'Ana', nombre_completo: 'Ana Pérez', grado: '5.º A',
        mensualidades_pendientes: [], mensualidades_futuras: [], cuotas_inscripcion_pendientes: [],
        cuotas_solvencia_pendientes: [], cuotas_proyecto_inversion_pendientes: [],
        penalidades_convenio: [penalidad], total_penalidades_convenio_usd: '5.00' }],
    };
    if (ruta.includes('tasa')) return { valor_bs: '40.00', valor: '40.00' };
    return undefined;
  });
  await page.goto('/cobranza');
  await page.getByLabel('Cédula del representante').fill('12345678');
  await expect(page.getByText(penalidad.descripcion, { exact: true })).toHaveCount(1);
  const enlace = page.getByRole('link', { name: 'Ir a Convenios' });
  await enlace.scrollIntoViewIfNeeded();
  await alAlcance(page, enlace);
  await sinScrollHorizontal(page);
  await info.attach('caja-penalidad', { body: await page.screenshot(), contentType: 'image/png' });
  await enlace.click();
  await expect(page.getByRole('tab', { name: 'Convenios' })).toHaveAttribute('aria-selected', 'true');
  expect(errores).toEqual([]);
});
