import { expect, test } from '@playwright/test';
import { simularApi, sinScrollHorizontal, alAlcance } from './ayudas';

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

test('la penalidad se liquida con un pago de caja desde un modal al alcance', async ({ page }, info) => {
  let aplicada = false;
  const convenio = {
    id: 9, estado: 'incumplido', representante: 7, cuotas: [],
    creado_en: '2026-07-20T10:00:00-04:00', total_recargos_pendientes_usd: '5.00',
    recargos: [{ id: 33, numero_periodo: 1, fecha_programada: '2026-07-20', saldo_base_usd: '50.00', monto_recargo_usd: '5.00', estado: 'pendiente' }],
  };
  const errores = await simularApi(page, 'cobranza', (ruta, req) => {
    if (ruta === 'cobranza/inteligente/bandeja/') return { results: [] };
    if (ruta === 'cobranza/inteligente/convenios/') return { results: [aplicada ? { ...convenio, total_recargos_pendientes_usd: '0.00', recargos: [{ ...convenio.recargos[0], estado: 'pagado', pago_id: 123 }] } : convenio] };
    if (ruta === 'cobranza/inteligente/convenios/recargos/33/pagar/') {
      expect(req.postDataJSON()).toEqual({ pago_id: '123' });
      aplicada = true;
      return {};
    }
    return undefined;
  });
  await page.goto('/cobranza/inteligente/gestion');
  await page.getByRole('tab', { name: 'Convenios' }).click();
  await page.getByRole('button', { name: 'Aplicar pago de caja' }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  await sinScrollHorizontal(page);
  await alAlcance(page, dialogo.getByRole('button', { name: 'Cancelar', exact: true }));
  await dialogo.getByLabel('ID del pago de caja').fill('123');
  const confirmar = dialogo.getByRole('button', { name: 'Aplicar pago', exact: true });
  await alAlcance(page, confirmar);
  await info.attach('modal-penalidad', { body: await page.screenshot(), contentType: 'image/png' });
  await confirmar.click();
  await expect(dialogo).toHaveCount(0);
  await expect(page.getByText(/base \$50.00 · Pagado/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aplicar pago de caja' })).toHaveCount(0);
  await sinScrollHorizontal(page);
  expect(errores).toEqual([]);
});

test('un caso con solo penalidades conserva su saldo y abre Convenios', async ({ page }) => {
  const errores = await simularApi(page, 'cobranza', ruta => {
    if (ruta === 'cobranza/inteligente/bandeja/') return { results: [{
      ...CASO_PAGO_EN_REVISION, saldo_total_usd: '5.00', saldo_principal_usd: '0.00',
      total_recargos_normales_usd: '0.00', total_penalidades_convenio_usd: '5.00',
      penalidades_convenio: [{ id: 33 }],
      accion_sugerida: { codigo: 'ver_convenios', texto: 'Revisar penalidades del convenio' },
    }] };
    if (ruta === 'cobranza/inteligente/convenios/') return { results: [] };
    return undefined;
  });
  await page.goto('/cobranza/inteligente/gestion');
  await expect(page.getByText('Principal $0,00 · Recargos normales $0,00 · Penalidades $5,00')).toBeVisible();
  await sinScrollHorizontal(page);
  await expect(page.getByRole('button', { name: 'Crear convenio', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Revisar penalidades del convenio' }).click();
  await expect(page.getByRole('tab', { name: 'Convenios' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Aún no hay convenios.')).toBeVisible();
  expect(errores).toEqual([]);
});
