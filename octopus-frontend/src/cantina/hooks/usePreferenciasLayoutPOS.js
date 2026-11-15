import { useCallback, useEffect, useMemo, useState } from 'react';

const VERSION = 1;
export const ANCHO_CARRITO_MIN = 320;
export const ANCHO_CARRITO_MAX = 520;

export const PREFERENCIAS_POS_DEFAULT = Object.freeze({
  version: VERSION,
  anchoCarrito: 380,
  densidadProductos: 'normal',
  plantillasAbiertas: true,
  carritoMovilCompleto: true,
});

const densidades = new Set(['compacta', 'normal', 'amplia']);
const limitarAncho = (valor) => Math.min(ANCHO_CARRITO_MAX, Math.max(ANCHO_CARRITO_MIN, Number(valor) || PREFERENCIAS_POS_DEFAULT.anchoCarrito));
const clave = (usuario) => `cantina_pos_layout_v${VERSION}_${usuario}`;

export function normalizarPreferenciasPOS(valor) {
  if (!valor || typeof valor !== 'object' || valor.version !== VERSION) return { ...PREFERENCIAS_POS_DEFAULT };
  return {
    version: VERSION,
    anchoCarrito: limitarAncho(valor.anchoCarrito),
    densidadProductos: densidades.has(valor.densidadProductos) ? valor.densidadProductos : 'normal',
    plantillasAbiertas: valor.plantillasAbiertas !== false,
    carritoMovilCompleto: valor.carritoMovilCompleto !== false,
  };
}

function leer(usuario) {
  if (!usuario) return { ...PREFERENCIAS_POS_DEFAULT };
  try {
    return normalizarPreferenciasPOS(JSON.parse(localStorage.getItem(clave(usuario))));
  } catch {
    return { ...PREFERENCIAS_POS_DEFAULT };
  }
}

export function usePreferenciasLayoutPOS(usuario) {
  const [preferenciasPorUsuario, setPreferenciasPorUsuario] = useState(() => (
    usuario ? { [usuario]: leer(usuario) } : {}
  ));
  const preferencias = preferenciasPorUsuario[usuario] ?? leer(usuario);

  useEffect(() => {
    if (!usuario) return;
    try { localStorage.setItem(clave(usuario), JSON.stringify(preferencias)); } catch { /* continúa sin persistencia */ }
  }, [preferencias, usuario]);

  const actualizar = useCallback((cambios) => {
    if (!usuario) return;
    setPreferenciasPorUsuario(prev => ({
      ...prev,
      [usuario]: normalizarPreferenciasPOS({ ...(prev[usuario] ?? leer(usuario)), ...cambios, version: VERSION }),
    }));
  }, [usuario]);
  const restablecer = useCallback(() => {
    if (!usuario) return;
    setPreferenciasPorUsuario(prev => ({ ...prev, [usuario]: { ...PREFERENCIAS_POS_DEFAULT } }));
  }, [usuario]);

  return useMemo(() => ({ preferencias, actualizar, restablecer }), [preferencias, actualizar, restablecer]);
}
