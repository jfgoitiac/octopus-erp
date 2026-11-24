import { test, expect } from '@playwright/test';
import { alAlcance, simularApi, sinScrollHorizontal } from './ayudas';

const MATERIA = { id: 1, nombre: 'Matemática', grado_seccion: '3er año A', tipo_evaluacion: 'numerica' };
const LAPSO = {
  id: 7,
  nombre: 'Primer lapso',
  periodo_escolar: '2026-2027',
  fecha_inicio: '2026-09-01',
  fecha_fin: '2026-12-15',
  activo: true,
};

test('crea y guarda un plan promedio sin desborde en los cuatro tamaños', async ({ page }) => {
  let payloadGuardado = null;
  const errores = await simularApi(page, 'docente', (ruta, req) => {
    if (ruta === 'academico/materias/1/') return MATERIA;
    if (ruta.startsWith('academico/lapsos')) return [LAPSO];
    if (ruta.startsWith('academico/notas')) return { resultados: [] };
    if (ruta.startsWith('academico/rendimiento/comparacion')) return {};
    if (ruta.startsWith('academico/docente/plan-evaluacion/notas')) return { alumnos: [] };
    if (ruta.startsWith('academico/docente/plan-evaluacion/')) {
      if (req.method() === 'POST') {
        payloadGuardado = req.postDataJSON();
        return {
          id: 10,
          materia_id: 1,
          lapso_id: 7,
          version: 1,
          bloques: payloadGuardado.bloques.map((bloque, indiceBloque) => ({
            ...bloque,
            id: indiceBloque + 20,
            items: bloque.items.map((item, indiceItem) => ({ ...item, id: indiceItem + 30 })),
          })),
        };
      }
      return null;
    }
    return undefined;
  });

  await page.goto('/portal-docente/materias/1?tab=plan-evaluacion');
  await page.getByLabel('Lapso').selectOption('7');
  await page.getByRole('button', { name: 'Crear plan de evaluación' }).click();

  await page.getByLabel('Nombre del bloque').fill('Contenido');
  await page.getByLabel('Total de puntos').fill('10');
  await page.getByLabel('Modo').selectOption('promedio');
  await page.getByPlaceholder(/Nombre del ítem/).fill('Examen parcial');
  await page.getByLabel(/Nota máxima/).fill('20');

  const guardar = page.getByRole('button', { name: 'Guardar plan de evaluación' });
  await guardar.scrollIntoViewIfNeeded();
  await alAlcance(page, guardar);
  await sinScrollHorizontal(page);
  await guardar.click();

  await expect.poll(() => payloadGuardado).not.toBeNull();
  expect(payloadGuardado.bloques[0].modo).toBe('promedio');
  expect(payloadGuardado.bloques[0].items[0].valor_maximo).toBe(20);
  expect(payloadGuardado.bloques[0].items[0].fecha).toBe('2026-11-23');
  expect(errores).toEqual([]);
});
