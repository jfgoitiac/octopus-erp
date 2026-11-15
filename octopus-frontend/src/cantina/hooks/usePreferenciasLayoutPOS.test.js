import { describe, expect, it } from 'vitest';
import { normalizarPreferenciasPOS, PREFERENCIAS_POS_DEFAULT } from './usePreferenciasLayoutPOS';

describe('preferencias de distribución del POS', () => {
  it('restaura valores seguros cuando el contenido no es válido', () => {
    expect(normalizarPreferenciasPOS({ version: 99 })).toEqual(PREFERENCIAS_POS_DEFAULT);
  });

  it('limita el ancho del carrito y valida la densidad', () => {
    expect(normalizarPreferenciasPOS({ version: 1, anchoCarrito: 999, densidadProductos: 'mínima' })).toMatchObject({
      anchoCarrito: 520,
      densidadProductos: 'normal',
    });
    expect(normalizarPreferenciasPOS({ version: 1, anchoCarrito: 100, densidadProductos: 'compacta' })).toMatchObject({
      anchoCarrito: 320,
      densidadProductos: 'compacta',
    });
  });
});
