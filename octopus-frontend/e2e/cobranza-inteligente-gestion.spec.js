import { expect, test } from '@playwright/test';
import { simularApi, sinScrollHorizontal } from './ayudas';

const CASO_PAGO_EN_REVISION = {
  representante: { id: 7, nombre: 'Mariella Lugo', cedula: 'V-1234567', telefono: '0412-0000000' },
  puntaje: 10,
  razones: [{ texto: 'Pago en revisión hace más de 3 días', puntos: 10 }],
  saldo_total_usd: '0.00',
  dias_mora_max: 0,
  ciclos: [],
  estados: [],
  responsable: null,
  accion_sugerida: { codigo: 'revisar_pago', texto: 'Revisar el pago en revisión' },
};

test('un pago en revisión sin deuda vencida conserva acciones válidas y layout responsive', async ({ page }, info) => {
  const errores = await simularApi(page, 'cobranza', (ruta) => {
    if (ruta === 'cobranza/inteligente/bandeja/') {
      return { count: 1, results: [CASO_PAGO_EN_REVISION] };
    }
    return undefined;
  });

  await page.goto('/cobranza/inteligente/gestion');

  await expect(page.getByText('Mariella Lugo')).toBeVisible();
  await expect(page.getByText('10 pts')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revisar el pago en revisión' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar acción' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Crear convenio' })).toHaveCount(0);
  await sinScrollHorizontal(page);
  await info.attach('bandeja-pago-en-revision', { body: await page.screenshot(), contentType: 'image/png' });

  expect(errores).toEqual([]);
});
