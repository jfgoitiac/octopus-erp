export const SECCIONES_CAMPOS_PREINSCRIPCION = [
    {
        titulo: 'Datos del estudiante',
        campos: [
            { key: 'apellido_estudiante', label: 'Apellidos' },
            { key: 'nombre_estudiante', label: 'Nombres' },
            { key: 'fecha_nacimiento', label: 'Fecha de nacimiento' },
            { key: 'lugar_nacimiento', label: 'Lugar de nacimiento' },
            { key: 'pais_nacimiento', label: 'País' },
            { key: 'estado_nacimiento', label: 'Estado' },
            { key: 'cedula_estudiante', label: 'Cédula' },
            { key: 'sexo', label: 'Sexo' },
            { key: 'peso', label: 'Peso' },
            { key: 'estatura', label: 'Estatura' },
            { key: 'direccion_estudiante', label: 'Dirección' },
            { key: 'edad', label: 'Edad' },
            { key: 'institucion_procedencia', label: 'Institución de procedencia' },
            { key: 'bautizado', label: 'Bautizado' },
            { key: 'cursara', label: 'Cursará' },
            { key: 'alergico', label: 'Alérgico' },
        ],
    },
    {
        titulo: 'Datos del representante',
        campos: [
            { key: 'apellido_representante', label: 'Apellidos' },
            { key: 'nombre_representante', label: 'Nombres' },
            { key: 'cedula_representante', label: 'Cédula' },
            { key: 'parentesco', label: 'Parentesco' },
            { key: 'direccion_representante', label: 'Dirección' },
            { key: 'nacionalidad', label: 'Nacionalidad' },
            { key: 'telefono', label: 'Teléfono' },
            { key: 'nivel_estudio', label: 'Nivel de estudio' },
        ],
    },
    {
        titulo: 'Datos administrativos',
        campos: [
            { key: 'nro_solvencia', label: 'N° Solvencia' },
            { key: 'nro_transferencia', label: 'N° de transferencia' },
            { key: 'monto_transferencia', label: 'Monto transferencia' },
            { key: 'monto_efectivo', label: 'Monto efectivo' },
            { key: 'banco_procedencia', label: 'Banco de procedencia' },
            { key: 'banco_destino', label: 'Banco destino' },
            { key: 'fecha_pago', label: 'Fecha de pago' },
            { key: 'fecha_inscripcion', label: 'Fecha de inscripción' },
        ],
    },
];

export const TODOS_LOS_CAMPOS_PREINSCRIPCION = SECCIONES_CAMPOS_PREINSCRIPCION
    .flatMap((seccion) => seccion.campos.map((campo) => campo.key));

export const LOCALSTORAGE_KEY_CAMPOS_PREINSCRIPCION = 'preinscripcion_campos_seleccionados';
