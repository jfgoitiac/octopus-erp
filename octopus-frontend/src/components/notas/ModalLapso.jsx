import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { NOMBRES_LAPSO } from '../../utils/notas.utils';

const FIELD_STYLE = { borderColor: 'var(--border-md)', color: 'var(--jet)' };

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
  const handleOverlayClick = e => { if (e.target === e.currentTarget) onClose(); };
  const handleKeyDown      = e => { if (e.key === 'Escape') onClose(); };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-lapso-titulo"
      tabIndex={-1}
    >
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 id="modal-lapso-titulo" className="font-bold" style={{ color: 'var(--jet)' }}>
            {lapsoEditando ? 'Editar lapso' : 'Nuevo lapso'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg"
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
              className="w-full px-3 py-2 rounded-xl text-sm outline-none border"
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
              className="w-full px-3 py-2 rounded-xl text-sm outline-none border"
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
                className="w-full px-3 py-2 rounded-xl text-sm outline-none border"
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
                className="w-full px-3 py-2 rounded-xl text-sm outline-none border"
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
              className="w-4 h-4 rounded"
            />
            <label htmlFor="lapso-activo" className="text-sm" style={{ color: 'var(--jet)' }}>
              Lapso activo (permite registro de notas)
            </label>
          </div>
        </div>

        {/* Zona de cierre — solo al editar un lapso activo */}
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
                  className="text-xs font-medium underline underline-offset-2"
                  style={{ color: '#9a3412' }}
                >
                  Cerrar lapso
                </button>
              </div>
            ) : (
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: '#7c2d12' }}>
                  ¿Confirmas cerrar "{lapsoEditando.nombre}"? Las notas existentes se conservan.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={onCancelCerrar}
                    className="flex-1 text-xs py-1.5 rounded-lg"
                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={onCerrarLapso}
                    disabled={cerrando}
                    className="flex-1 text-xs py-1.5 rounded-lg font-medium text-white disabled:opacity-50 flex items-center justify-center gap-1"
                    style={{ background: '#f97316' }}
                  >
                    {cerrando ? <><Loader2 size={12} className="animate-spin" /> Cerrando...</> : 'Sí, cerrar'}
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
            className="flex-1 rounded-xl py-2 text-sm"
            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
          >
            Cancelar
          </button>
          <button
            onClick={onGuardar}
            disabled={guardando}
            className="flex-1 text-white rounded-xl py-2 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
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
