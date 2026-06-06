import { useRef, useState } from 'react';
import { X, Loader2, Wand2, AlertTriangle, Lock, Plus } from 'lucide-react';
import { toast } from 'react-toastify';
import { DIAS_GENERADOR } from '../../constants/horarios';
import { INPUT_STYLE } from '../../constants/styles';
import { useEscape } from '../../hooks/useEscape';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const INITIAL_CONFIG = {
  horas_por_dia:        6,
  hora_inicio:          '07:00',
  hora_fin:             '13:00',
  duracion_clase_min:   60,
  recesos:              [{ hora: '09:00', duracion_min: 20 }],
  dias:                 DIAS_GENERADOR.map(d => d.value),
  reemplazar_existente: false,
};

export const ModalGenerador = ({ generando, lockedIds, onClose, onGenerar, onGeneradoOk }) => {
  const [config, setConfig]             = useState(INITIAL_CONFIG);
  const [advertencias, setAdvertencias] = useState([]);
  const containerRef                    = useRef(null);

  // Bloqueado mientras genera para no perder el estado intermedio
  useEscape(!generando, onClose);
  useFocusTrap(containerRef);

  const set = (field, parse) => (e) =>
    setConfig(prev => ({ ...prev, [field]: parse ? parse(e.target.value) : e.target.value }));

  const toggleDia = (val) => setConfig(prev => ({
    ...prev,
    dias: prev.dias.includes(val)
      ? prev.dias.filter(d => d !== val)
      : [...prev.dias, val],
  }));

  const addReceso = () => setConfig(prev => ({
    ...prev,
    recesos: [...prev.recesos, { hora: '11:00', duracion_min: 15 }],
  }));

  const updateReceso = (idx, field, val) => setConfig(prev => ({
    ...prev,
    recesos: prev.recesos.map((r, i) => i === idx ? { ...r, [field]: val } : r),
  }));

  const removeReceso = (idx) => setConfig(prev => ({
    ...prev,
    recesos: prev.recesos.filter((_, i) => i !== idx),
  }));

  const handleGenerar = async () => {
    if (!config.dias.length) { toast.warning('Selecciona al menos un día de clases.'); return; }
    setAdvertencias([]);
    const payload = {
      ...config,
      clases_bloqueadas: lockedIds ? [...lockedIds] : [],
    };
    const result = await onGenerar(payload);
    if (!result.ok) return;
    const { data } = result;
    if (data.advertencias?.length) {
      setAdvertencias(data.advertencias);
      toast.success(`${data.clases_creadas} clases generadas con advertencias.`);
    } else {
      toast.success(`${data.clases_creadas} clases generadas correctamente.`);
      onGeneradoOk();
    }
  };

  return (
    <div
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(43,48,58,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget && !generando) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-generador-titulo"
    >
      <div
        ref={containerRef}
        className="rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-fadeIn"
        style={{ background: 'var(--porcelain)', maxHeight: '90vh', overflowY: 'auto' }}
      >

        {/* Header */}
        <div className="p-5 flex justify-between items-center sticky top-0 z-10"
          style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--pb)', color: '#fff' }}>
          <h3 id="modal-generador-titulo" className="font-bold text-base flex items-center gap-2">
            <Wand2 size={18} />
            Generar horario automático
          </h3>
          <button onClick={onClose} disabled={generando} aria-label="Cerrar modal"
            style={{ color: '#fff', opacity: generando ? 0.4 : 1 }}>
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* Advertencias del backend */}
          {advertencias.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: '#fffbeb', border: '1px solid #fcd34d' }}>
              <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: '#92400e' }}>
                <AlertTriangle size={14} />
                El horario se generó con las siguientes advertencias:
              </p>
              <ul className="mt-2 space-y-1">
                {advertencias.map((a, i) => (
                  <li key={i} className="text-xs" style={{ color: '#78350f' }}>• {a}</li>
                ))}
              </ul>
              <button onClick={onGeneradoOk}
                className="mt-3 w-full py-2 rounded-lg text-xs font-bold text-white"
                style={{ background: '#d97706' }}>
                Entendido — ver horario generado
              </button>
            </div>
          )}

          {/* Horas por día / duración */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                Horas por día
              </label>
              <input type="number" min={1} max={12}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE}
                value={config.horas_por_dia}
                onChange={set('horas_por_dia', v => parseInt(v, 10) || 6)} />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                Duración clase (min)
              </label>
              <select className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE}
                value={config.duracion_clase_min}
                onChange={set('duracion_clase_min', v => parseInt(v, 10))}>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
              </select>
            </div>
          </div>

          {/* Hora inicio / fin */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                Hora de inicio
              </label>
              <input type="time" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE}
                value={config.hora_inicio} onChange={set('hora_inicio')} />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                Hora de fin
              </label>
              <input type="time" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE}
                value={config.hora_fin} onChange={set('hora_fin')} />
            </div>
          </div>

          {/* Recreos — soporte para múltiples recesos */}
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--ash)' }}>
              Recreos / Recesos
            </label>
            <div className="space-y-2">
              {config.recesos.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="time"
                    className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE}
                    value={r.hora}
                    onChange={e => updateReceso(i, 'hora', e.target.value)} />
                  <select
                    className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE}
                    value={r.duracion_min}
                    onChange={e => updateReceso(i, 'duracion_min', parseInt(e.target.value, 10))}>
                    <option value={10}>10 min</option>
                    <option value={15}>15 min</option>
                    <option value={20}>20 min</option>
                    <option value={30}>30 min</option>
                  </select>
                  <button type="button" onClick={() => removeReceso(i)}
                    className="p-2 rounded-lg flex-shrink-0 transition-colors"
                    style={{ color: 'var(--red)', border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}
                    aria-label="Eliminar recreo">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addReceso}
              className="mt-2 w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              style={{ border: '0.5px dashed var(--border-md)', color: 'var(--ash)', background: 'transparent' }}>
              <Plus size={13} />
              Agregar otro recreo
            </button>
          </div>

          {/* Clases bloqueadas — info badge */}
          {lockedIds?.size > 0 && (
            <div className="rounded-xl p-3 flex items-center gap-2"
              style={{ background: '#f5f3ff', border: '0.5px solid #c4b5fd' }}>
              <Lock size={14} style={{ color: '#7c3aed', flexShrink: 0 }} />
              <p className="text-xs" style={{ color: '#5b21b6' }}>
                <span className="font-bold">{lockedIds.size} clase{lockedIds.size > 1 ? 's' : ''} bloqueada{lockedIds.size > 1 ? 's' : ''}</span> en la grilla — el generador las respetará y no las moverá.
              </p>
            </div>
          )}

          {/* Días */}
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--ash)' }}>
              Días de clases
            </label>
            <div className="flex flex-wrap gap-2">
              {DIAS_GENERADOR.map(d => (
                <button key={d.value} type="button" onClick={() => toggleDia(d.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={
                    config.dias.includes(d.value)
                      ? { background: 'var(--pb)', color: '#fff', border: '1px solid var(--pb)' }
                      : { background: 'var(--porcelain)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }
                  }>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reemplazar existente */}
          <div className="rounded-xl p-4" style={{
            background: config.reemplazar_existente ? '#fef2f2' : 'var(--porcelain)',
            border: `0.5px solid ${config.reemplazar_existente ? '#fca5a5' : 'var(--border-md)'}`,
          }}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-0.5 w-4 h-4 rounded"
                checked={config.reemplazar_existente}
                onChange={e => setConfig(prev => ({ ...prev, reemplazar_existente: e.target.checked }))} />
              <div>
                <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                  Reemplazar horario existente
                </span>
                {config.reemplazar_existente && (
                  <p className="text-xs mt-1" style={{ color: '#dc2626' }}>
                    Esto eliminará todas las clases actuales del grado y generará un horario nuevo.
                  </p>
                )}
              </div>
            </label>
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={generando}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm disabled:opacity-50"
              style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
              Cancelar
            </button>
            <button type="button" onClick={handleGenerar}
              disabled={generando || !config.dias.length}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white disabled:opacity-50"
              style={{ background: 'var(--pb)' }}>
              {generando ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
              {generando ? 'Generando...' : 'Generar'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
