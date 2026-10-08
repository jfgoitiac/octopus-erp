import { test, expect } from '@playwright/test';
import { ROSTER, simularApi, sinScrollHorizontal, alAlcance, anuncio } from './ayudas';

/*
 * Pase de lista por tarjetas — criterio de aceptación del ESTÁNDAR DE DISEÑO
 * RESPONSIVE en los 4 tamaños de referencia (un proyecto por tamaño):
 * nada inalcanzable, botones de modal visibles y clicables, <body> sin scroll
 * horizontal (también durante transiciones y swipe) y consola sin errores.
 *
 * La API se simula: el front apunta a /mock-api (playwright.config.js) y cada
 * prueba responde con datos inventados. El token es de prueba y solo se
 * decodifica en el cliente (jwt-decode); nunca sale del navegador.
 */

const MATERIA = { id: 1, nombre: 'Matemática', grado_seccion: '3er año A', tipo_evaluacion: 'numerica' };

async function prepararPagina(page) {
  const errores = await simularApi(page, 'docente', (ruta) => (ruta === 'academico/materias/1/' ? MATERIA : undefined));
  await page.goto('/portal-docente/materias/1?tab=asistencia');
  await expect(page.getByRole('button', { name: /Comenzar a pasar lista/ })).toBeVisible();
  return errores;
}

const esperarScroll = (page) => page.waitForTimeout(700);

test.describe('Pase de lista por tarjetas', () => {
  test('la tarjeta y todos sus controles quedan al alcance sin scroll', async ({ page }, info) => {
    const errores = await prepararPagina(page);
    await page.getByRole('button', { name: /Comenzar a pasar lista/ }).click();
    await esperarScroll(page);

    await expect(anuncio(page)).toHaveText('Alumno 1 de 28: Ana Álvarez');
    await expect(page.getByRole('heading', { name: 'Ana Álvarez' })).toBeInViewport({ ratio: 1 });
    for (const nombre of ['Presente', 'Ausente', 'Justificado']) {
      await alAlcance(page, page.getByRole('button', { name: nombre, exact: true }));
    }
    await alAlcance(page, page.getByRole('button', { name: 'Llegó tarde' }));
    await alAlcance(page, page.getByRole('button', { name: /^Siguiente/ }).last());
    await alAlcance(page, page.getByRole('slider', { name: 'Ir a un alumno' }));
    await sinScrollHorizontal(page);
    await info.attach('tarjeta', { body: await page.screenshot(), contentType: 'image/png' });

    // Ausente abre la observación: el "Siguiente" de la tarjeta también debe quedar al alcance.
    await page.getByRole('button', { name: 'Ausente', exact: true }).click();
    await expect(page.getByLabel(/Observación/)).toBeVisible();
    await alAlcance(page, page.getByRole('button', { name: 'Siguiente', exact: true }).first());
    await info.attach('tarjeta-observacion', { body: await page.screenshot(), contentType: 'image/png' });

    expect(errores).toEqual([]);
  });

  test('un nombre largo en MAYÚSCULAS se ve completo aun en una pantalla baja', async ({ page }, info) => {
    const largo = 'ANTHONELLA YICET ALVARADO DE LOS ÁNGELES RODRÍGUEZ';
    await simularApi(page, 'docente', (ruta) => (ruta === 'academico/materias/1/' ? MATERIA : undefined),
      [{ ...ROSTER[0], alumno_nombre: largo }, ...ROSTER.slice(1)]);
    // Caso reportado: laptop ancha pero baja (zoom / barra de favoritos).
    const { width } = page.viewportSize();
    if (width >= 1024) await page.setViewportSize({ width, height: 600 });
    await page.goto('/portal-docente/materias/1?tab=asistencia');
    await page.getByRole('button', { name: /Comenzar a pasar lista/ }).click();
    await esperarScroll(page);

    const nombre = page.getByRole('heading', { name: 'Anthonella Yicet Alvarado de los Ángeles Rodríguez' });
    await expect(nombre).toBeVisible();
    const dentro = await nombre.evaluate((h) => {
      const tarjeta = h.closest('article').getBoundingClientRect();
      const r = h.getBoundingClientRect();
      return r.top >= tarjeta.top && r.bottom <= tarjeta.bottom - 4 && h.scrollHeight <= h.clientHeight + 1;
    });
    expect(dentro, 'el nombre queda cortado por la tarjeta').toBe(true);
    await info.attach('nombre-largo', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('las transiciones y el swipe no generan scroll horizontal', async ({ page }) => {
    const errores = await prepararPagina(page);
    await page.getByRole('button', { name: /Comenzar a pasar lista/ }).click();
    await esperarScroll(page);

    // Durante la salida de la tarjeta (≈260ms) se muestrea varias veces.
    await page.getByRole('button', { name: 'Presente', exact: true }).click();
    for (let i = 0; i < 8; i++) {
      await sinScrollHorizontal(page);
      await page.waitForTimeout(40);
    }
    await expect(anuncio(page)).toHaveText('Alumno 2 de 28: Bruno Bello');
    await page.waitForTimeout(400);

    // Swipe hacia la izquierda: pasa a la siguiente sin marcar.
    const tarjeta = page.locator('article:not(.pl-salir)').filter({ has: page.getByRole('heading', { name: 'Bruno Bello' }) });
    const caja = await tarjeta.boundingBox();
    const y = caja.y + caja.height / 3;
    await page.mouse.move(caja.x + caja.width / 2, y);
    await page.mouse.down();
    for (let paso = 1; paso <= 8; paso++) {
      await page.mouse.move(caja.x + caja.width / 2 - paso * (caja.width * 0.08), y);
      await sinScrollHorizontal(page);
    }
    await page.mouse.up();
    await expect(anuncio(page)).toHaveText('Alumno 3 de 28: Carla Castro');
    await sinScrollHorizontal(page);

    expect(errores).toEqual([]);
  });

  test('modo rápido, resumen y guardado', async ({ page }, info) => {
    const errores = await prepararPagina(page);
    await page.getByRole('button', { name: /Todos presentes/ }).click();
    await page.getByRole('button', { name: /^Luis López: Presente/ }).click();
    await expect(page.getByText('1 ausente')).toBeVisible();
    await alAlcance(page, page.getByRole('button', { name: /Listo, ver resumen/ }));
    await sinScrollHorizontal(page);
    await info.attach('modo-rapido', { body: await page.screenshot(), contentType: 'image/png' });

    await page.getByRole('button', { name: /Listo, ver resumen/ }).click();
    await expect(page.getByRole('heading', { name: 'Resumen del pase' })).toBeVisible();
    const guardar = page.getByRole('button', { name: 'Guardar asistencia' });
    // Como lo haría el docente: desplazar hasta tener el botón a la vista
    // (al borde inferior lo taparía la bottom nav, que es fija).
    await guardar.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await alAlcance(page, guardar);
    await sinScrollHorizontal(page);
    await info.attach('resumen', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

    await guardar.click();
    await expect(page.getByRole('heading', { name: 'Asistencia guardada' })).toBeVisible();
    expect(errores).toEqual([]);
  });

  test('con cambios sin guardar, el modal de confirmación es alcanzable', async ({ page }, info) => {
    const errores = await prepararPagina(page);
    await page.getByRole('button', { name: /Comenzar a pasar lista/ }).click();
    await esperarScroll(page);
    await page.getByRole('button', { name: 'Presente', exact: true }).click();
    await expect(anuncio(page)).toHaveText('Alumno 2 de 28: Bruno Bello');

    await page.getByRole('button', { name: 'Mis Materias' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal.getByRole('heading', { name: /Cambios sin guardar/ })).toBeVisible();
    for (const nombre of ['Seguir editando', 'Descartar cambios', 'Guardar y continuar']) {
      await alAlcance(page, modal.getByRole('button', { name: nombre }));
    }
    await sinScrollHorizontal(page);
    await info.attach('modal-cambios', { body: await page.screenshot(), contentType: 'image/png' });

    await modal.getByRole('button', { name: 'Seguir editando' }).click();
    await expect(modal).toBeHidden();
    expect(errores).toEqual([]);
  });
});
