import { useState, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import { ETIQUETA_AREA } from '../../../../cantina/aperturaEvento';

// Carrito de una venta a crédito. Misma forma que el del POS: cada línea
// recuerda por dónde entró ('escaner' | 'manual') para que el backend marque
// la venta como manual (auditoría D2).
export function origenProductos(carrito) {
  const origenes = new Set(carrito.flatMap(l => l.origenes));
  if (origenes.size > 1) return 'mixto';
  return origenes.has('escaner') ? 'escaner' : 'manual';
}

export default function useCarritoVenta(areaCaja) {
  const [carrito, setCarrito] = useState([]);

  const agregar = useCallback((producto, origen = 'manual') => {
    if (producto.area && areaCaja && producto.area !== areaCaja) {
      toast.warning(`"${producto.nombre}" pertenece a ${ETIQUETA_AREA[producto.area] ?? producto.area}; tu caja abierta es ${ETIQUETA_AREA[areaCaja] ?? areaCaja}.`);
      return;
    }
    setCarrito(prev => {
      const existente = prev.find(l => l.producto.id === producto.id);
      const deseada = (existente?.cantidad ?? 0) + 1;
      if (producto.stock_actual != null && deseada > producto.stock_actual) {
        toast.warning(`Stock insuficiente de "${producto.nombre}" (disponible: ${producto.stock_actual}).`);
        return prev;
      }
      if (existente) {
        return prev.map(l => (l.producto.id === producto.id
          ? { ...l, cantidad: deseada, origenes: l.origenes.includes(origen) ? l.origenes : [...l.origenes, origen] }
          : l));
      }
      return [...prev, { producto, cantidad: 1, origenes: [origen] }];
    });
  }, [areaCaja]);

  const cambiarCantidad = useCallback((productoId, nueva) => {
    setCarrito(prev => {
      if (nueva <= 0) return prev.filter(l => l.producto.id !== productoId);
      return prev.map(l => {
        if (l.producto.id !== productoId) return l;
        const tope = l.producto.stock_actual;
        if (tope != null && nueva > tope) {
          toast.warning(`Stock insuficiente de "${l.producto.nombre}" (disponible: ${tope}).`);
          return l;
        }
        return { ...l, cantidad: nueva };
      });
    });
  }, []);

  const quitar = useCallback((productoId) => {
    setCarrito(prev => prev.filter(l => l.producto.id !== productoId));
  }, []);

  const subtotalUsd = useMemo(
    () => carrito.reduce((acc, l) => acc + Number(l.producto.precio) * l.cantidad, 0),
    [carrito],
  );

  return { carrito, agregar, cambiarCantidad, quitar, subtotalUsd };
}
