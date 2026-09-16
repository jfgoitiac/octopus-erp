import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Undo2, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';

// Modal post-generación: resume qué se colocó y qué quedó sin colocar (con
// motivo), más un botón para deshacer la última generación completa.
export const ResumenGeneracion = ({ resultado, deshaciendo, onClose, onDeshacer }) => {
  const [deshecho, setDeshecho] = useState(false);
  const colocadas   = resultado?.colocadas ?? [];
  const noColocadas = resultado?.no_colocadas ?? [];
  const advertencias = resultado?.advertencias ?? [];

  const handleDeshacer = async () => {
    const ok = await onDeshacer();
    if (ok) setDeshecho(true);
  };

  const footer = (
    <>
      <button type="button" onClick={onClose}
        className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-sm"
        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
        Cerrar
      </button>
      {!deshecho && (
        <button type="button" onClick={handleDeshacer} disabled={deshaciendo}
          className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ border: '0.5px solid var(--red)', color: 'var(--red)', background: 'transparent' }}>
          {deshaciendo ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />}
          Deshacer generación
        </button>
      )}
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      titulo="Resultado de la generación automática"
      footer={footer}
      size="md"
    >
      <div className="space-y-5">

        {deshecho && (
          <div className="rounded-xl p-3 flex items-center gap-2" style={{ background: '#f0fdf4', border: '0.5px solid #86efac' }}>
            <Undo2 size={14} style={{ color: '#16a34a' }} />
            <p className="text-xs font-medium" style={{ color: '#166534' }}>
              La generación fue deshecha. La grilla volvió a su estado anterior.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} style={{ color: '#16a34a' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>
            {colocadas.length} clase{colocadas.length !== 1 ? 's' : ''} colocada{colocadas.length !== 1 ? 's' : ''}
          </p>
        </div>

        {noColocadas.length > 0 && (
          <div>
            <p className="text-sm font-semibold flex items-center gap-2 mb-2" style={{ color: '#b45309' }}>
              <AlertTriangle size={15} />
              {noColocadas.length} materia{noColocadas.length !== 1 ? 's' : ''} sin colocar por completo
            </p>
            <ul className="space-y-1.5">
              {noColocadas.map((n, i) => (
                <li key={i} className="text-xs rounded-lg px-3 py-2" style={{ background: '#fffbeb', border: '0.5px solid #fcd34d', color: '#92400e' }}>
                  <span className="font-semibold">{n.materia}</span>
                  {n.grado ? ` (${n.grado})` : ''}
                  {n.horas_faltantes != null ? ` — faltaron ${n.horas_faltantes}h` : ''}
                  {n.motivo ? `: ${n.motivo}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {advertencias.length > 0 && (
          <div>
            <p className="text-sm font-semibold mb-2" style={{ color: 'var(--jet)' }}>Advertencias</p>
            <ul className="space-y-1">
              {advertencias.map((a, i) => (
                <li key={i} className="text-xs" style={{ color: 'var(--ash)' }}>• {a}</li>
              ))}
            </ul>
          </div>
        )}

        {!colocadas.length && !noColocadas.length && !advertencias.length && (
          <p className="text-sm" style={{ color: 'var(--ash)' }}>No hay detalles disponibles para esta generación.</p>
        )}
      </div>
    </Modal>
  );
};
