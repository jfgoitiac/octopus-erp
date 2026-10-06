// STUB de la Fase 0 — la implementación real (debounce 300 ms, saldo y alumnos
// por resultado) es del Agente C. Props fijas: { onSelect, autoFocus, placeholder }.
const BuscadorRepresentanteCxc = ({ placeholder = 'Buscar representante o alumno…' }) => (
  <input
    type="text"
    disabled
    placeholder={placeholder}
    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
  />
);

export default BuscadorRepresentanteCxc;
