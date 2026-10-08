import { test, expect } from '@playwright/test';
import { simularApi, sinScrollHorizontal, alAlcance, anuncio } from './ayudas';

/*
 * Control de Asistencia del panel administrativo (/asistencia): mismo pase de
 * lista por tarjetas que el portal docente, dentro de MainLayout. Se verifica
 * en los 4 tamaños de referencia del ESTÁNDAR DE DISEÑO RESPONSIVE.
 */

const GRADOS = [{ id: 1, grado_seccion: '3er año A' }];

async function prepararPanel(page) {
  const errores = await simularApi(page, 'secretaria', (ruta) => (ruta === 'secretaria/configuracion-grados/' ? GRADOS : undefined));
  await page.goto('/asistencia');
  await page.locator('#filtro-grado').selectOption('3er año A');
  return errores;
}

test.describe('Panel administrativo — asistencia por tarjetas', () => {
  test('el pase de lista por tarjetas queda al alcance sin scroll', async ({ page }, info) => {
    const errores = await prepararPanel(page);
    await page.getByRole('button', { name: 'Tarjetas', exact: true }).click();
    await page.getByRole('button', { name: /Comenzar a pasar lista/ }).click();
    await page.waitForTimeout(700);

    await expect(anuncio(page)).toHaveText('Alumno 1 de 28: Ana Álvarez');
    await expect(page.getByRole('heading', { name: 'Ana Álvarez' })).toBeInViewport({ ratio: 1 });
    for (const nombre of ['Presente', 'Ausente', 'Justificado']) {
      await alAlcance(page, page.getByRole('button', { name: nombre, exact: true }));
    }
    await alAlcance(page, page.getByRole('button', { name: 'Llegó tarde' }));
    await alAlcance(page, page.getByRole('button', { name: /^Siguiente/ }).last());
    await alAlcance(page, page.getByRole('button', { name: 'Tarjetas', exact: true }));
    await sinScrollHorizontal(page);
    await info.attach('panel-tarjeta', { body: await page.screenshot(), contentType: 'image/png' });

    await page.getByRole('button', { name: 'Presente', exact: true }).click();
    await expect(anuncio(page)).toHaveText('Alumno 2 de 28: Bruno Bello');
    await sinScrollHorizontal(page);
    expect(errores).toEqual([]);
  });

  test('vista Lista: no se guarda con alumnos sin marcar', async ({ page }) => {
    const errores = await prepararPanel(page);
    await page.getByRole('button', { name: 'Lista', exact: true }).click();
    await page.getByRole('button', { name: 'Presente', exact: true }).first().click();
    await expect(page.getByText(/Faltan 27 alumnos por marcar/)).toBeVisible();

    const guardar = page.getByRole('button', { name: 'Guardar asistencia' }).filter({ visible: true }).first();
    await expect(guardar).toBeDisabled();
    await page.getByRole('button', { name: 'Marcar todos presentes' }).click();
    await expect(guardar).toBeEnabled();
    await sinScrollHorizontal(page);
    expect(errores).toEqual([]);
  });
});
