import { GRADOS_PRIMARIA, GRADOS_MEDIA } from '../constants/grados';

const GradoSelect = ({ value, onChange, className, style, incluirVacio = false }) => (
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

export default GradoSelect;
