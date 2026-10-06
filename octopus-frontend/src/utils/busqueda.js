/** Normaliza texto para buscar sin depender de mayúsculas, tildes o espacios. */
export const normalizarBusqueda = (valor) => String(valor ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/ñ/g, 'n')
  .toLocaleLowerCase('es')
  .trim()
  .replace(/\s+/g, ' ');

/** Busca todas las palabras escritas, sin importar el orden. */
export const coincideBusqueda = (texto, consulta) => {
  const terminos = normalizarBusqueda(consulta).split(' ').filter(Boolean);
  if (!terminos.length) return true;
  const textoNormalizado = normalizarBusqueda(texto);
  return terminos.every(termino => textoNormalizado.includes(termino));
};
