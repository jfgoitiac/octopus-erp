import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { normalizarPreferenciasPOS, PREFERENCIAS_POS_DEFAULT, usePreferenciasLayoutPOS } from './usePreferenciasLayoutPOS';

describe('preferencias de distribución del POS', () => {
  beforeEach(() => localStorage.clear());

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

  it('persiste los cambios y los aísla por cajero', () => {
    const { result, rerender } = renderHook(({ usuario }) => usePreferenciasLayoutPOS(usuario), {
      initialProps: { usuario: 'cajero-1' },
    });

    act(() => result.current.actualizar({ anchoCarrito: 444, densidadProductos: 'amplia' }));
    expect(JSON.parse(localStorage.getItem('cantina_pos_layout_v1_cajero-1'))).toMatchObject({
      anchoCarrito: 444,
      densidadProductos: 'amplia',
    });

    rerender({ usuario: 'cajero-2' });
    expect(result.current.preferencias).toMatchObject(PREFERENCIAS_POS_DEFAULT);
    act(() => result.current.actualizar({ anchoCarrito: 333 }));
    expect(JSON.parse(localStorage.getItem('cantina_pos_layout_v1_cajero-2'))).toMatchObject({ anchoCarrito: 333 });
    expect(JSON.parse(localStorage.getItem('cantina_pos_layout_v1_cajero-1'))).toMatchObject({ anchoCarrito: 444 });
  });
});
