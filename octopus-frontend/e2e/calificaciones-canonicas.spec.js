import { test, expect } from '@playwright/test';
import { simularApi, sinScrollHorizontal } from './ayudas';

const MATERIA = { id: 1, nombre: 'Matemática', grado_seccion: '3er año A', tipo_evaluacion: 'numerica' };
const LAPSO = { id: 7, nombre: 'Primer lapso', periodo_escolar: '2026-2027', activo: true };
const NOTAS = [{
  alumno_id: 1,
  alumno_nombre: 'Ana Álvarez',
  evaluacion_1: 18,
  evaluacion_2: 16,
  evaluacion_3: 17,
  evaluacion_4: 15,
  resultado: {
    estado: 'completo',
    valor_provisional: 16.5,
    definitiva: null,
    aprobado: null,
    progreso: { evaluados: 4, esperados: 4, porcentaje: 100 },
  },
}];

test('notas completas de lapso abierto siguen visibles como provisionales y sin desborde', async ({ page }) => {
  const errores = await simularApi(page, 'docente', (ruta) => {
    if (ruta === 'academico/materias/1/') return MATERIA;
    if (ruta.startsWith('academico/lapsos')) return [LAPSO];
    if (ruta.startsWith('academico/notas')) return { resultados: NOTAS };
    if (ruta.startsWith('academico/rendimiento/comparacion')) return {};
    return undefined;
  });

  await page.goto('/portal-docente/materias/1?tab=notas');
  await page.getByLabel(/Lapso/i).selectOption('7');
  await expect(page.getByText('Provisional', { exact: true })).toBeVisible();
  await expect(page.getByText('16.5', { exact: true })).toBeVisible();
  await expect(page.getByText('Completo', { exact: true })).toBeVisible();
  await sinScrollHorizontal(page);
  expect(errores).toEqual([]);
});
