import { test, expect } from '@playwright/test';
import { alAlcance, simularApi, sinScrollHorizontal } from './ayudas';

const PAQUETES = [{
  id: 1, nombre: 'Horario Primaria', periodo_escolar: '2026-2027',
  sede: 1, estado: 'borrador', grados: [{ id: 1, seccion_id: 12, grado_seccion: '5to A' }],
}];
const GRADOS = [{ id: 1, seccion_id: 12, grado_seccion: '5to A', nombre: '5to A' }];
const BLOQUES = [
  { id: 100, dia_semana: 'lunes', orden: 1, hora_inicio: '07:00', hora_fin: '08:00', tipo: 'clase' },
  { id: 101, dia_semana: 'martes', orden: 1, hora_inicio: '07:00', hora_fin: '08:00', tipo: 'clase' },
];
const MATERIAS = [{ id: 10, nombre: 'Matemáticas', horas_academicas: 5, activa: true }];
const HORARIOS = [{
  id: 1, materia: { id: 10, nombre: 'Matemáticas' }, bloque_id: 100,
  dia_semana: 'lunes', dia_semana_label: 'Lunes', hora_inicio: '07:00', hora_fin: '08:00',
  aula: 'Aula 1', pineado: false,
}];

async function preparar(page) {
  const errores = await simularApi(page, 'director', (ruta) => {
    if (ruta === 'academico/paquetes-horario/') return PAQUETES;
    if (ruta === 'academico/paquetes-horario/1/grados/') return GRADOS;
    if (ruta === 'academico/paquetes-horario/1/bloques/') return BLOQUES;
    if (ruta === 'academico/horarios/') return HORARIOS;
    if (ruta === 'academico/materias/') return MATERIAS;
    return undefined;
  });
  await page.goto('/horarios?paquete=1');
  await page.getByRole('combobox').filter({ has: page.locator('option') }).first().selectOption('12');
  await expect(page.getByLabel('Editar Matemáticas')).toBeVisible();
  return errores;
}

test.describe('Fase 5 — horarios responsive', () => {
  test('grilla, acciones y modal permanecen alcanzables', async ({ page }, info) => {
    const errores = await preparar(page);
    await sinScrollHorizontal(page);

    for (const nombre of ['Editar bloques', 'Agregar clase', 'Generar automático']) {
      const boton = page.getByRole('button', { name: nombre, exact: true });
      await boton.scrollIntoViewIfNeeded();
      await alAlcance(page, boton);
    }

    await page.locator('button[aria-label="Editar Matemáticas"]').click();
    await expect(page.getByRole('heading', { name: 'Editar Clase' })).toBeVisible();
    const guardar = page.getByRole('button', { name: 'Actualizar' });
    await guardar.scrollIntoViewIfNeeded();
    await alAlcance(page, guardar);
    await sinScrollHorizontal(page);
    await info.attach('horarios-fase5', { body: await page.screenshot(), contentType: 'image/png' });
    expect(errores).toEqual([]);
  });
});
