/**
 * Ejecuta `fn` en una microtarea y devuelve la función de limpieza para usar
 * como retorno de un useEffect.
 *
 * Sirve para efectos que arrancan una carga de datos o sincronizan estado:
 * el setState (p. ej. `setLoading(true)`) ocurre dentro de un callback y no
 * de forma síncrona en el cuerpo del efecto (regla react-hooks/set-state-in-effect).
 *
 * - Si el efecto se limpia antes de que corra la microtarea, `fn` no se ejecuta.
 * - Si `fn` devuelve una función, se usa como limpieza (p. ej. `() => controller.abort()`).
 */
export function diferir(fn) {
  let cancelado = false;
  let limpiar;
  queueMicrotask(() => {
    if (!cancelado) limpiar = fn();
  });
  return () => {
    cancelado = true;
    if (typeof limpiar === 'function') limpiar();
  };
}
