import { test, expect } from '@playwright/test';
import { alAlcance, simularApi, sinScrollHorizontal } from './ayudas';

const MATERIA = { id: 4, nombre: 'Matemática', grado_seccion: '3er año A', tipo_evaluacion: 'numerica' };
const LAPSO_BASE = {
  id: 7,
  nombre: 'Primer Lapso',
  periodo_escolar: '2026-2027',
  fecha_inicio: '2026-09-15',
  fecha_fin: '2026-12-12',
};

test('cierre incompleto con override y reapertura auditada son alcanzables y responsive', async ({ page }, info) => {
  let lapsoActivo = true;
  let cierreRecibido = null;
  let reaperturaRecibida = null;

  const errores = await simularApi(page, 'director', (ruta, req) => {
    if (ruta === 'secretaria/configuracion-grados/') return [{ id: 1, grado_seccion: '3er año A' }];
    if (ruta.startsWith('academico/materias/')) return [MATERIA];
    if (ruta === 'academico/lapsos/') return [{ ...LAPSO_BASE, activo: lapsoActivo }];
    if (ruta === 'academico/lapsos/7/checklist-cierre/') {
      return {
        lapso_id: 7,
        puede_cerrar: false,
        planes_configurados: false,
        notas_completas: false,
        inconsistencias: [{ codigos: ['FUENTE_SIN_RESOLVER'] }],
        resumen: { materias_total: 4, materias_sin_plan: 1, notas_pendientes: 3 },
      };
    }
    if (ruta === 'academico/lapsos/7/cerrar/' && req.method() === 'POST') {
      cierreRecibido = req.postDataJSON();
      lapsoActivo = false;
      return { mensaje: 'Lapso cerrado', cierre: { id: 1, override: true } };
    }
    if (ruta === 'academico/lapsos/7/reabrir/' && req.method() === 'POST') {
      reaperturaRecibida = req.postDataJSON();
      lapsoActivo = true;
      return { mensaje: 'Lapso reabierto', reapertura: { id: 1 } };
    }
    if (ruta.startsWith('academico/notas/')) return { resultados: [] };
    return undefined;
  });

  await page.goto('/notas');
  await expect(page.getByRole('main').getByRole('heading', { name: 'Registro de Notas' })).toBeVisible();

  const selects = page.locator('select');
  await selects.nth(0).selectOption('3er año A');
  await selects.nth(1).selectOption('4');
  await selects.nth(2).selectOption('7');
  await page.getByRole('button', { name: 'Editar lapso seleccionado' }).click();

  await page.getByRole('button', { name: 'Revisar y cerrar' }).click();
  await expect(page.getByText('Checklist de cierre')).toBeVisible();
  const cerrar = page.getByRole('button', { name: /cerrar definitivamente/i });
  await expect(cerrar).toBeDisabled();
  await page.getByRole('checkbox', { name: /cerrar excepcionalmente/i }).check();
  await page.getByLabel('Justificación obligatoria').fill('Cierre excepcional autorizado por dirección');
  await expect(cerrar).toBeEnabled();
  await cerrar.scrollIntoViewIfNeeded();
  await alAlcance(page, cerrar);
  await sinScrollHorizontal(page);
  await cerrar.click();

  await expect.poll(() => cierreRecibido).toEqual({
    override: true,
    justificacion: 'Cierre excepcional autorizado por dirección',
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await selects.nth(2).selectOption('7');
  await page.getByRole('button', { name: 'Editar lapso seleccionado' }).click();
  const reabrir = page.getByRole('button', { name: 'Reabrir con auditoría' });
  await expect(reabrir).toBeDisabled();
  await page.getByLabel('Motivo obligatorio').fill('Corrección de una calificación autorizada');
  await expect(reabrir).toBeEnabled();
  await reabrir.scrollIntoViewIfNeeded();
  await alAlcance(page, reabrir);
  await sinScrollHorizontal(page);
  await info.attach('fase2-reapertura', { body: await page.screenshot(), contentType: 'image/png' });
  await reabrir.click();

  await expect.poll(() => reaperturaRecibida).toEqual({ motivo: 'Corrección de una calificación autorizada' });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await sinScrollHorizontal(page);
  expect(errores).toEqual([]);
});
