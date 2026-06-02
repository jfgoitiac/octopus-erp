export const GRADOS_PRIMARIA = [
    '1er Grado', '2do Grado', '3er Grado', '4to Grado', '5to Grado', '6to Grado',
];

export const GRADOS_MEDIA = [
    '1er Año', '2do Año', '3er Año', '4to Año', '5to Año',
];

export const TODOS_LOS_GRADOS = [...GRADOS_PRIMARIA, ...GRADOS_MEDIA];

export const GradoSelect = ({ value, onChange, className, style, incluirVacio = false }) => (
    <select value={value || ''} onChange={onChange} className={className} style={style}>
        {incluirVacio && <option value="">Seleccionar grado...</option>}
        <optgroup label="Primaria">
            {GRADOS_PRIMARIA.map(g => <option key={g} value={g}>{g}</option>)}
        </optgroup>
        <optgroup label="Media General">
            {GRADOS_MEDIA.map(g => <option key={g} value={g}>{g}</option>)}
        </optgroup>
    </select>
);
