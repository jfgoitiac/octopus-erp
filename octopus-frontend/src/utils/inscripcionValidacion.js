// Campos considerados críticos para inscribir: si faltan en un alumno/representante
// ya existente, el proceso de inscripción debe forzar a completarlos antes de continuar.
const CAMPOS_CRITICOS_ALUMNO = [
    { campo: 'fecha_nacimiento', label: 'Fecha de nacimiento' },
    { campo: 'genero',           label: 'Género' },
    { campo: 'direccion',        label: 'Dirección' },
    { campo: 'contacto_emergencia_nombre',     label: 'Contacto de emergencia' },
    { campo: 'contacto_emergencia_telefono',   label: 'Teléfono de emergencia' },
    { campo: 'contacto_emergencia_parentesco', label: 'Parentesco del contacto' },
];

const CAMPOS_CRITICOS_REPRESENTANTE = [
    { campo: 'nombre',    label: 'Nombre' },
    { campo: 'apellido',  label: 'Apellido' },
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

// Deriva los datos de contacto de emergencia a partir del representante —
// en la gran mayoría de los casos el representante ES el contacto de
// emergencia, así que evita pedirle al usuario que retipee lo mismo dos veces.
export function contactoEmergenciaDesdeRepresentante(representante) {
    if (!representante) return { contacto_emergencia_nombre: '', contacto_emergencia_telefono: '', contacto_emergencia_parentesco: '' };
    return {
        contacto_emergencia_nombre:     `${representante.nombre || ''} ${representante.apellido || ''}`.trim(),
        contacto_emergencia_telefono:   representante.telefono || '',
        contacto_emergencia_parentesco: labelParentesco(representante.parentesco),
    };
}

export { CAMPOS_CRITICOS_ALUMNO, CAMPOS_CRITICOS_REPRESENTANTE };
