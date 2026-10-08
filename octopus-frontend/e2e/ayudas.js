import { expect } from '@playwright/test';

/*
 * Ayudas compartidas por las pruebas de pantalla. La API se simula en el
 * mismo origen (/mock-api, ver playwright.config.js) con datos inventados; el
 * token es de prueba y solo se decodifica en el cliente (jwt-decode).
 */

export const NOMBRES = [
  'Ana Álvarez', 'Bruno Bello', 'Carla Castro', 'Diego Díaz', 'Elena Esté', 'Fabián Fermín',
  'Gabriela Gil', 'Héctor Henríquez', 'Isabel Ibarra', 'Javier Jiménez', 'Karla Key', 'Luis López',
  'María Márquez', 'Néstor Navas', 'Olga Ortiz', 'Pedro Pérez', 'Quiara Quintero', 'Rosa Rivas',
  'Samuel Salas', 'Tania Torres', 'Úrsula Uzcátegui', 'Víctor Vargas', 'Wendy Wilches', 'Ximena Xavier',
  'Yolanda Yépez', 'Zulay Zambrano', 'Alejandra de los Ángeles Rodríguez Montenegro', 'Benito Bracho',
];

export const ROSTER = NOMBRES.map((nombre, i) => ({
  id: null, alumno_id: i + 1, alumno_nombre: nombre, fecha: '2026-10-07',
  presente: null, justificada: false, estado: null, observacion: '',
  numero_lista: i + 1, alumno_foto: null,
}));

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

export const tokenDePrueba = (rol) => [
  b64url({ alg: 'none', typ: 'JWT' }),
  b64url({ username: `${rol}.prueba`, rol, nombre: 'Usuario Prueba', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'firma-de-prueba',
].join('.');

/**
 * Simula la API para `rol`. `extra(ruta, req)` puede responder rutas propias
 * (devuelve el objeto JSON o undefined). Asistencia y token van incluidos;
 * el resto responde [].
 */
export async function simularApi(page, rol, extra = () => undefined, roster = ROSTER) {
  const errores = [];
  page.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errores.push(`console: ${m.text()}`); });

  await page.route('**/mock-api/api/**', (route) => {
    const req = route.request();
    const ruta = new URL(req.url()).pathname.replace(/^\/mock-api\/api\//, '');
    if (ruta === 'token/refresh/') return route.fulfill({ json: { access: tokenDePrueba(rol) } });
    if (ruta.startsWith('academico/asistencia')) {
      return req.method() === 'POST'
        ? route.fulfill({ json: { guardadas: [], errores: [] } })
        : route.fulfill({ json: roster });
    }
    const respuesta = extra(ruta, req);
    return route.fulfill({ json: respuesta === undefined ? [] : respuesta });
  });
  return errores;
}

/** El <body> no scrollea en horizontal. */
export async function sinScrollHorizontal(page) {
  const { ancho, vista } = await page.evaluate(() => ({
    ancho: document.documentElement.scrollWidth,
    vista: window.innerWidth,
  }));
  expect(ancho, 'scroll horizontal en el documento').toBeLessThanOrEqual(vista);
}

/** Completamente dentro del viewport y sin nada encima (barras fijas u otras capas). */
export async function alAlcance(page, locator) {
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

export const anuncio = (page) => page.locator('p[aria-live="polite"]').first();
