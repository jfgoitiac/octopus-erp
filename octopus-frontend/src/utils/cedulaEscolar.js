// Las cédulas generadas automáticamente por el backend (cuando el alumno no
// tiene número real) tienen formato 99YYYYMMDDHHMMSSRRRR (20 dígitos) —
// ver generate_temporary_cedula_escolar en secretaria/services.py.
export const esCedulaTemporal = (cedula) => !!cedula && cedula.startsWith('99') && cedula.length >= 18;

// Para mostrar en listados/reportes: nunca exponer el número autogenerado.
export const mostrarCedula = (cedula, fallback = '—') =>
    (cedula && !esCedulaTemporal(cedula)) ? cedula : fallback;

// Para precargar en un input editable: si es autogenerada, se deja en blanco
// (el usuario puede escribir una real, o dejarla vacía y el sistema regenera otra).
export const cedulaParaEditar = (cedula) => esCedulaTemporal(cedula) ? '' : (cedula || '');
