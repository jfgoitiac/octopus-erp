import { expect, test } from '@playwright/test';
import { alAlcance, simularApi, sinScrollHorizontal } from './ayudas';

const PERIODO = { id: 1, nombre: '2026-2027', estado: 'activo' };
const LAPSO = { id: 7, nombre: 'Primer lapso', periodo_escolar: '2026-2027', periodo_detalle: PERIODO, activo: true };
const ALUMNO = { id: 3, nombre: 'Ana', apellido: 'Álvarez', grado_seccion: '5to A', cedula_escolar: 'CE-3' };
const BOLETIN = {
  alumno: ALUMNO,
  lapso: LAPSO,
  materias: [{
    materia_id: 9,
    materia_nombre: 'Ciencias Naturales',
    resultado: {
      fuente: 'plan', tipo: 'numerica', estado: 'en_progreso',
      progreso: { evaluados: 2, esperados: 4, porcentaje: 50 },
      valor_provisional: '14.00', definitiva: null, aprobado: null,
    },
  }],
  promedio_general: null,
  asistencia: { dias_presentes: 18, total_dias: 20, ausencias: 2 },
  colegio: { nombre_colegio: 'Colegio de Prueba' },
};

test('boletín de plan omite columnas legacy y permanece alcanzable', async ({ page }) => {
  const errores = await simularApi(page, 'director', (ruta) => {
    if (ruta.startsWith('academico/periodos-escolares/')) return [PERIODO];
    if (ruta.startsWith('academico/lapsos/')) return [LAPSO];
    if (ruta.startsWith('secretaria/alumnos/')) return [ALUMNO];
    if (ruta.startsWith('academico/boletin/')) return BOLETIN;
    return undefined;
  });

  await page.goto('/boletin');
  await page.getByPlaceholder('Nombre o cédula escolar...').fill('Ana');
  await page.getByRole('button', { name: /Ana Álvarez/ }).click();
  await page.locator('select:has(option[value="7"])').selectOption('7');
  await page.getByRole('button', { name: 'Vista previa' }).click();

  await expect(page.getByRole('columnheader', { name: 'Progreso' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Eval 1' })).toHaveCount(0);
  await expect(page.getByText('2/4 (50%)')).toBeVisible();
  await expect(page.getByText('14.00')).toBeVisible();
  await sinScrollHorizontal(page);

  const descargar = page.getByRole('button', { name: 'Descargar PDF' });
  await descargar.scrollIntoViewIfNeeded();
  await alAlcance(page, descargar);
  expect(errores).toEqual([]);
});
