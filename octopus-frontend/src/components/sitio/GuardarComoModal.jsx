import { useEffect, useRef, useState } from 'react';
import { LayoutTemplate, Loader2 } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

/**
 * Modal minimo para nombrar una PlantillaPagina nueva ("guardar esta pagina
 * como plantilla"), Fase 2 de personalizacion. Mismo patron visual que
 * ConfirmDeleteModal.
 */
const GuardarComoModal = ({
  nombreSugerido,
  guardando,
  onConfirmar,
  onCancelar,
  titulo = 'Guardar como plantilla',
  descripcion = 'Las secciones de esta página quedarán disponibles para crear páginas nuevas a partir de ellas.',
  labelInput = 'Nombre de la plantilla',
}) => {
  const [nombre, setNombre] = useState(nombreSugerido || '');
  const containerRef = useRef(null);
  useFocusTrap(containerRef);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !guardando) onCancelar(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancelar, guardando]);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[100] p-4" style={{ background: 'rgba(43,48,58,0.55)' }}>
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guardar-plantilla-title"
        className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl animate-fadeInUp"
        style={{ background: 'var(--porcelain)' }}
      >
        <div className="p-6 flex flex-col items-center text-center" style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
          <LayoutTemplate size={28} className="mb-3" aria-hidden="true" />
          <h3 id="guardar-plantilla-title" className="text-base font-bold">{titulo}</h3>
          <p className="text-sm mt-1 opacity-80">
            {descripcion}
          </p>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); if (nombre.trim()) onConfirmar(nombre.trim()); }}
          className="p-6 space-y-4"
        >
          <div>
            <label htmlFor="nombre-plantilla" className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
              {labelInput}
            </label>
            <input
              id="nombre-plantilla"
              type="text"
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={100}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onCancelar} disabled={guardando}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: 'var(--bg)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}>
              Cancelar
            </button>
            <button type="submit" disabled={guardando || !nombre.trim()}
              className="flex-[2] py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'var(--pb)' }}>
              {guardando ? <Loader2 className="animate-spin" size={16} /> : <LayoutTemplate size={16} />}
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GuardarComoModal;
