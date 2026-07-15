// Campos considerados críticos para inscribir: si faltan en un alumno/representante
// ya existente, el proceso de inscripción debe forzar a completarlos antes de continuar.
const CAMPOS_CRITICOS_ALUMNO = [
    { campo: 'nombre',           label: 'Nombre' },
    { campo: 'apellido',         label: 'Apellido' },
    { campo: 'fecha_nacimiento', label: 'Fecha de nacimiento' },
    { campo: 'genero',           label: 'Género' },
];

const CAMPOS_CRITICOS_REPRESENTANTE = [
    { campo: 'nombre',    label: 'Nombre' },
    { campo: 'apellido',  label: 'Apellido' },
    { campo: 'cedula',    label: 'Cédula' },
    { campo: 'telefono',  label: 'Teléfono' },
    { campo: 'correo',    label: 'Correo electrónico' },
    { campo: 'direccion', label: 'Dirección' },
];

function camposFaltantes(objeto, campos) {
    if (!objeto) return campos.map(c => c.campo);
    return campos
        .filter(({ campo }) => !String(objeto[campo] ?? '').trim())
        .map(({ campo }) => campo);
}

export function camposFaltantesAlumno(alumno) {
    return camposFaltantes(alumno, CAMPOS_CRITICOS_ALUMNO);
}

export function camposFaltantesRepresentante(representante) {
    return camposFaltantes(representante, CAMPOS_CRITICOS_REPRESENTANTE);
}

// Parentesco del representante respecto al alumno — se reutiliza como fuente
// por defecto del contacto de emergencia (ver useContactoEmergencia).
export const PARENTESCO_OPTIONS = [
    { value: 'padre', label: 'Padre' },
    { value: 'madre', label: 'Madre' },
    { value: 'tutor', label: 'Tutor' },
    { value: 'otro',  label: 'Otro' },
];

export function labelParentesco(value) {
    return PARENTESCO_OPTIONS.find(o => o.value === value)?.label || value || '';
}

export { CAMPOS_CRITICOS_ALUMNO, CAMPOS_CRITICOS_REPRESENTANTE };
