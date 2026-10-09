import { useEffect, useState } from 'react';
import { getSedes } from '../../api/multisede.service';

const comoLista = (data) => (Array.isArray(data) ? data : (data?.results ?? []));

// Selector de sede por nombre. Entrega el id como texto, o '' para todas las sedes.
// Si la institución tiene una sola sede no hay nada que elegir, así que no se muestra.
export default function SelectorSede({ value, onChange, className = 'input', etiqueta = 'Sede' }) {
  const [sedes, setSedes] = useState([]);
  useEffect(() => {
    let activo = true;
    getSedes().then((data) => { if (activo) setSedes(comoLista(data).filter((s) => s.activa !== false)); }).catch(() => {});
    return () => { activo = false; };
  }, []);
  if (sedes.length < 2) return null;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className} aria-label={etiqueta}>
      <option value="">Todas las sedes</option>
      {sedes.map((s) => <option key={s.id} value={String(s.id)}>{s.nombre}</option>)}
    </select>
  );
}
