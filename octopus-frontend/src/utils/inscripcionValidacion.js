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

export { CAMPOS_CRITICOS_ALUMNO, CAMPOS_CRITICOS_REPRESENTANTE };
