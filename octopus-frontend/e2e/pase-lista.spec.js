import { test, expect } from '@playwright/test';

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

const NOMBRES = [
  'Ana Álvarez', 'Bruno Bello', 'Carla Castro', 'Diego Díaz', 'Elena Esté', 'Fabián Fermín',
  'Gabriela Gil', 'Héctor Henríquez', 'Isabel Ibarra', 'Javier Jiménez', 'Karla Key', 'Luis López',
  'María Márquez', 'Néstor Navas', 'Olga Ortiz', 'Pedro Pérez', 'Quiara Quintero', 'Rosa Rivas',
  'Samuel Salas', 'Tania Torres', 'Úrsula Uzcátegui', 'Víctor Vargas', 'Wendy Wilches', 'Ximena Xavier',
  'Yolanda Yépez', 'Zulay Zambrano', 'Alejandra de los Ángeles Rodríguez Montenegro', 'Benito Bracho',
];
const ROSTER = NOMBRES.map((nombre, i) => ({
  id: null, alumno_id: i + 1, alumno_nombre: nombre, fecha: '2026-10-07',
  presente: null, justificada: false, estado: null, observacion: '',
  numero_lista: i + 1, alumno_foto: null,
}));
const MATERIA = { id: 1, nombre: 'Matemática', grado_seccion: '3er año A', tipo_evaluacion: 'numerica' };

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const tokenDePrueba = () => [
  b64url({ alg: 'none', typ: 'JWT' }),
  b64url({ username: 'docente.prueba', rol: 'docente', nombre: 'Docente Prueba', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'firma-de-prueba',
].join('.');

async function prepararPagina(page) {
  const errores = [];
  page.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errores.push(`console: ${m.text()}`); });

  await page.route('**/mock-api/api/**', (route) => {
    const req = route.request();
    const ruta = new URL(req.url()).pathname.replace(/^\/mock-api\/api\//, '');
    if (ruta === 'token/refresh/') return route.fulfill({ json: { access: tokenDePrueba() } });
    if (ruta === 'academico/materias/1/') return route.fulfill({ json: MATERIA });
    if (ruta.startsWith('academico/asistencia')) {
      return req.method() === 'POST'
        ? route.fulfill({ json: { guardadas: [], errores: [] } })
        : route.fulfill({ json: ROSTER });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto('/portal-docente/materias/1?tab=asistencia');
  await expect(page.getByRole('button', { name: /Comenzar a pasar lista/ })).toBeVisible();
  return errores;
}

/** El <body> no scrollea en horizontal. */
async function sinScrollHorizontal(page) {
  const { ancho, vista } = await page.evaluate(() => ({
    ancho: document.documentElement.scrollWidth,
    vista: window.innerWidth,
  }));
  expect(ancho, 'scroll horizontal en el documento').toBeLessThanOrEqual(vista);
}

/** Completamente dentro del viewport y sin nada encima (no lo tapa la bottom nav ni otra capa). */
async function alAlcance(page, locator) {
  await expect(locator).toBeVisible();
  const resultado = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.left < 0 || r.bottom > window.innerHeight || r.right > window.innerWidth) {
      return `fuera del viewport (${Math.round(r.top)}–${Math.round(r.bottom)} de ${window.innerHeight})`;
    }
    const arriba = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return el === arriba || el.contains(arriba) ? true : `tapado por <${arriba?.tagName?.toLowerCase()}>`;
  });
  expect(resultado, `${(await locator.textContent())?.trim()}`).toBe(true);
}

const esperarScroll = (page) => page.waitForTimeout(700);
const anuncio = (page) => page.locator('p[aria-live="polite"]').first();

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
    await guardar.scrollIntoViewIfNeeded();
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
