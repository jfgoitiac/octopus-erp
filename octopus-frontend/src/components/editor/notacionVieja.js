// Mapeo de la notación vieja ❴❴campo❵❵ (U+2774 / U+2775, no llaves normales)
// hacia los tokens nuevos {{grupo.campo}}. Algunos campos dependen del
// `destinatario` del editor ('alumno' | 'trabajador').
// Mismo mapeo que usa el motor de render del backend — aquí se replica
// solo para la conversión visual inmediata al pegar.

const MAPA_FIJO = {
  CI: 'alumno.cedula',
  CIE: 'alumno.cedula_escolar',
  edad: 'alumno.edad',
  grado: 'alumno.grado',
  gradoa: 'alumno.grado',
  nivel: 'alumno.nivel',
  nivela: 'alumno.nivel',
  añoescolara: 'alumno.anio_escolar',
  gradop: 'alumno.grado_promocion',
  nivelp: 'alumno.nivel_promocion',
  horario: 'alumno.horario',
  fecha: 'documento.fecha_numero',
  fechanac: 'alumno.fecha_nacimiento',
  fechaingreso: 'trabajador.fecha_ingreso',
  sueldo: 'trabajador.sueldo',
  bono: 'trabajador.bono',
  apellidosmadre: 'familia.madre_apellidos',
  nombresmadre: 'familia.madre_nombres',
  cimadre: 'familia.madre_cedula',
  apellidospadre: 'familia.padre_apellidos',
  nombrespadre: 'familia.padre_nombres',
  cipadre: 'familia.padre_cedula',
};

// Campos cuyo destino depende del `destinatario` del editor.
const MAPA_POR_DESTINATARIO = {
  apellidos: { alumno: 'alumno.apellidos', trabajador: 'trabajador.apellidos' },
  nombres: { alumno: 'alumno.nombres', trabajador: 'trabajador.nombres' },
  cargo: { alumno: 'trabajador.cargo', trabajador: 'trabajador.cargo' },
};

/**
 * Resuelve el token nuevo para un campo de la notación vieja.
 * @param {string} campo - nombre del campo dentro de ❴❴...❵❵
 * @param {'alumno'|'trabajador'} destinatario
 * @returns {string|null} token nuevo tipo "grupo.campo", o null si no se reconoce
 */
export const resolverTokenViejo = (campo, destinatario = 'alumno') => {
  if (MAPA_POR_DESTINATARIO[campo]) {
    return MAPA_POR_DESTINATARIO[campo][destinatario] || MAPA_POR_DESTINATARIO[campo].alumno;
  }
  if (campo === 'CI' && destinatario === 'trabajador') return 'trabajador.cedula';
  return MAPA_FIJO[campo] || null;
};

// ❴ = U+2774, ❵ = U+2775
export const REGEX_NOTACION_VIEJA = /❴❴([^❴❵]+)❵❵/g;

export const contieneNotacionVieja = (texto = '') => {
  REGEX_NOTACION_VIEJA.lastIndex = 0;
  return REGEX_NOTACION_VIEJA.test(texto);
};

/**
 * Reemplaza en un string HTML (o texto) toda ocurrencia de ❴❴campo❵❵ por el
 * marcado de la píldora de placeholder (span[data-token]), lista para ser
 * parseada por el schema de TipTap (PlaceholderNode.parseHTML).
 *
 * @param {string} html
 * @param {'alumno'|'trabajador'} destinatario
 * @param {Map<string,string>} catalogoEtiquetas - token -> etiqueta legible
 */
export const convertirNotacionVieja = (html, destinatario, catalogoEtiquetas) => {
  REGEX_NOTACION_VIEJA.lastIndex = 0;
  return html.replace(REGEX_NOTACION_VIEJA, (match, campo) => {
    const token = resolverTokenViejo(campo.trim(), destinatario);
    if (!token) return match; // no reconocido: se deja intacto
    const etiqueta = (catalogoEtiquetas && catalogoEtiquetas.get(token)) || token;
    const etiquetaEscapada = etiqueta.replace(/"/g, '&quot;');
    return `<span data-token="${token}" data-label="${etiquetaEscapada}" class="octo-placeholder-pill" contenteditable="false">${etiqueta}</span>`;
  });
};
