import { useEffect, useRef } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { NOMBRES_LAPSO } from '../../utils/notas.utils';

const FIELD_STYLE = { borderColor: 'var(--border-md)', color: 'var(--jet)' };
const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function ModalLapso({
  lapsoEditando,
  formLapso,
  setFormLapso,
  guardando,
  cerrando,
  confirmCerrar,
  onConfirmCerrar,
  onCancelCerrar,
  onGuardar,
  onCerrarLapso,
  onClose,
}) {
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);

  // Foco inicial en el primer campo + trampa de foco (Tab/Shift+Tab no salen del modal)
  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  const handleKeyDown = e => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !dialogRef.current) return;

    const focusables = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter(el => !el.disabled && el.offsetParent !== null);
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-lapso-titulo"
      tabIndex={-1}
    >
      <div ref={dialogRef} className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 id="modal-lapso-titulo" className="font-bold" style={{ color: 'var(--jet)' }}>
            {lapsoEditando ? 'Editar lapso' : 'Nuevo lapso'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 transition-colors hover:bg-[var(--ash-light)]"
            style={{ color: 'var(--ash)' }}
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Campos */}
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--ash)' }}>
              Nombre del lapso
            </label>
            <select
              ref={firstFieldRef}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none border focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
              style={FIELD_STYLE}
              value={formLapso.nombre}
              onChange={e => setFormLapso(p => ({ ...p, nombre: e.target.value }))}
            >
              {NOMBRES_LAPSO.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--ash)' }}>
              Período escolar
            </label>
            <input
              type="text"
              placeholder="ej. 2024-2025"
              className="w-full px-3 py-2 rounded-xl text-sm outline-none border focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
              style={FIELD_STYLE}
              value={formLapso.periodo_escolar}
              onChange={e => setFormLapso(p => ({ ...p, periodo_escolar: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--ash)' }}>
                Fecha inicio
              </label>
              <input
                type="date"
                className="w-full px-3 py-2 rounded-xl text-sm outline-none border focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
                style={FIELD_STYLE}
                value={formLapso.fecha_inicio}
                onChange={e => setFormLapso(p => ({ ...p, fecha_inicio: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--ash)' }}>
                Fecha fin
              </label>
              <input
                type="date"
                className="w-full px-3 py-2 rounded-xl text-sm outline-none border focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
                style={FIELD_STYLE}
                value={formLapso.fecha_fin}
                onChange={e => setFormLapso(p => ({ ...p, fecha_fin: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="lapso-activo"
              checked={formLapso.activo}
              onChange={e => setFormLapso(p => ({ ...p, activo: e.target.checked }))}
              className="w-4 h-4 rounded outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
            />
            <label htmlFor="lapso-activo" className="text-sm" style={{ color: 'var(--jet)' }}>
              Lapso activo (permite registro de notas)
            </label>
          </div>
        </div>

        {/* Zona de cierre — solo al editar un lapso activo. Acción irreversible: jerarquía distinta al resto del formulario */}
        {lapsoEditando?.activo && (
          <div className="mt-5 p-3 rounded-xl" style={{ background: '#fff7ed', border: '0.5px solid #fed7aa' }}>
            {!confirmCerrar ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs flex items-center gap-1" style={{ color: '#9a3412' }}>
                  <AlertTriangle size={13} />
                  Cerrar el lapso impedirá nuevas notas
                </p>
                <button
                  onClick={onConfirmCerrar}
                  className="text-xs font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 rounded"
                  style={{ color: '#9a3412' }}
                >
                  Cerrar lapso
                </button>
              </div>
            ) : (
              <div>
                <p className="text-xs font-medium mb-1 flex items-center gap-1" style={{ color: 'var(--red)' }}>
                  <AlertTriangle size={13} />
                  Acción irreversible
                </p>
                <p className="text-xs mb-2" style={{ color: '#7c2d12' }}>
                  ¿Confirmas cerrar "{lapsoEditando.nombre}"? Las notas existentes se conservan, pero no se podrán editar más.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={onCancelCerrar}
                    className="flex-1 text-xs py-1.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 transition-colors hover:bg-[var(--ash-light)]"
                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={onCerrarLapso}
                    disabled={cerrando}
                    className="flex-1 text-xs py-1.5 rounded-lg font-medium text-white disabled:opacity-50 flex items-center justify-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)]/40 transition-colors hover:enabled:brightness-90"
                    style={{ background: 'var(--red)' }}
                  >
                    {cerrando ? <><Loader2 size={12} className="animate-spin" /> Cerrando...</> : 'Sí, cerrar definitivamente'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 transition-colors hover:bg-[var(--ash-light)]"
            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
          >
            Cancelar
          </button>
          <button
            onClick={onGuardar}
            disabled={guardando}
            className="flex-1 text-white rounded-xl py-2 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 transition-colors hover:enabled:bg-[var(--pb-mid)]"
            style={{ background: 'var(--pb)' }}
          >
            {guardando
              ? <><Loader2 size={14} className="animate-spin" /> Guardando...</>
              : 'Guardar'
            }
          </button>
        </div>
      </div>
    </div>
  );
}
