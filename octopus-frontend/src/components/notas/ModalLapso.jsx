import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, XCircle } from 'lucide-react';
import { NOMBRES_LAPSO } from '../../utils/notas.utils';
import { Modal } from '../ui/Modal';

const FIELD_STYLE = { borderColor: 'var(--border-md)', color: 'var(--jet)' };

export function ModalLapso({
  lapsoEditando,
  formLapso,
  setFormLapso,
  guardando,
  cerrando,
  reabriendo,
  confirmCerrar,
  checklist,
  loadingChecklist,
  impactoCierre,
  onConfirmCerrar,
  onCancelCerrar,
  onGuardar,
  onCerrarLapso,
  onReabrirLapso,
  onClose,
}) {
  const [override, setOverride] = useState(false);
  const [justificacion, setJustificacion] = useState('');
  const [motivoReapertura, setMotivoReapertura] = useState('');
  const resumen = checklist?.resumen || {};
  const inconsistencias = checklist?.inconsistencias || [];
  const tienePendientes = checklist && !checklist.puede_cerrar;
  const esCerrado = lapsoEditando && !lapsoEditando.activo;

  const footer = (
    <>
      <button
        onClick={onClose}
        className="w-full sm:w-auto rounded-xl px-4 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 transition-colors hover:bg-[var(--ash-light)]"
        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
      >
        Cancelar
      </button>
      <button
        onClick={onGuardar}
        disabled={guardando || esCerrado}
        className="w-full sm:w-auto text-white rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 transition-colors hover:enabled:bg-[var(--pb-mid)]"
        style={{ background: 'var(--pb)' }}
      >
        {guardando
          ? <><Loader2 size={14} className="animate-spin" /> Guardando...</>
          : 'Guardar'
        }
      </button>
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      titulo={lapsoEditando ? 'Editar lapso' : 'Nuevo lapso'}
      footer={footer}
      size="sm"
    >
      {/* Campos */}
      <div className="space-y-4">
        <div>
          <label htmlFor="lapso-nombre" className="block text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--ash)' }}>
            Nombre del lapso
          </label>
          <select
            id="lapso-nombre"
            autoFocus
            className="w-full px-3 py-2 rounded-xl text-base sm:text-sm outline-none border focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
            style={FIELD_STYLE}
            value={formLapso.nombre}
            disabled={esCerrado}
            onChange={e => setFormLapso(p => ({ ...p, nombre: e.target.value }))}
          >
            {NOMBRES_LAPSO.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="lapso-periodo" className="block text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--ash)' }}>
            Período escolar
          </label>
          <input
            id="lapso-periodo"
            type="text"
            placeholder="ej. 2024-2025"
            className="w-full px-3 py-2 rounded-xl text-base sm:text-sm outline-none border focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
            style={FIELD_STYLE}
            value={formLapso.periodo_escolar}
            disabled={esCerrado}
            onChange={e => setFormLapso(p => ({ ...p, periodo_escolar: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="lapso-fecha-inicio" className="block text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--ash)' }}>
              Fecha inicio
            </label>
            <input
              id="lapso-fecha-inicio"
              type="date"
              className="w-full px-3 py-2 rounded-xl text-base sm:text-sm outline-none border focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
              style={FIELD_STYLE}
              value={formLapso.fecha_inicio}
              disabled={esCerrado}
              onChange={e => setFormLapso(p => ({ ...p, fecha_inicio: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="lapso-fecha-fin" className="block text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--ash)' }}>
              Fecha fin
            </label>
            <input
              id="lapso-fecha-fin"
              type="date"
              className="w-full px-3 py-2 rounded-xl text-base sm:text-sm outline-none border focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
              style={FIELD_STYLE}
              value={formLapso.fecha_fin}
              disabled={esCerrado}
              onChange={e => setFormLapso(p => ({ ...p, fecha_fin: e.target.value }))}
            />
          </div>
        </div>

        {!lapsoEditando && <div className="flex items-center gap-2">
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
        </div>}
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
                disabled={loadingChecklist}
                className="text-xs font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 rounded"
                style={{ color: '#9a3412' }}
              >
                {loadingChecklist ? 'Verificando…' : 'Revisar y cerrar'}
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold mb-2" style={{ color: '#7c2d12' }}>
                Checklist de cierre
              </p>
              <div className="space-y-2 text-xs" style={{ color: '#7c2d12' }}>
                <EstadoChecklist ok={checklist?.planes_configurados} texto="Planes de evaluación configurados" />
                <EstadoChecklist ok={checklist?.notas_completas} texto="Notas completas" />
                <p>{resumen.materias_total ?? 0} materias · {resumen.materias_sin_plan ?? 0} sin plan · {resumen.notas_pendientes ?? 0} notas pendientes</p>
                {inconsistencias.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5" aria-label="Inconsistencias encontradas">
                    {inconsistencias.map((item, index) => (
                      <li key={`${index}-${String(item)}`}>
                        {typeof item === 'string'
                          ? item
                          : item.descripcion || item.error || (item.codigos || []).join(', ') || 'Inconsistencia académica'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {tienePendientes && (
                <div className="mt-3 space-y-2 rounded-xl bg-white/70 p-3">
                  <label className="flex items-start gap-2 text-xs font-medium" style={{ color: '#7c2d12' }}>
                    <input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} className="mt-0.5 h-4 w-4" />
                    Cerrar excepcionalmente aunque existan pendientes
                  </label>
                  {override && (
                    <div>
                      <label htmlFor="justificacion-cierre" className="block text-xs font-medium mb-1">Justificación obligatoria</label>
                      <textarea
                        id="justificacion-cierre"
                        value={justificacion}
                        onChange={e => setJustificacion(e.target.value)}
                        maxLength={500}
                        rows={3}
                        className="w-full resize-y rounded-xl border bg-white px-3 py-2 text-base sm:text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)]/30"
                        style={FIELD_STYLE}
                      />
                    </div>
                  )}
                </div>
              )}

              {impactoCierre && <p role="alert" className="mt-2 text-xs font-medium" style={{ color: 'var(--red)' }}>El servidor rechazó el cierre. Revisa los pendientes o documenta una excepción autorizada.</p>}

              <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row">
                <button
                  onClick={onCancelCerrar}
                  className="min-h-[44px] flex-1 text-sm py-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 transition-colors hover:bg-[var(--ash-light)]"
                  style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => onCerrarLapso({ override, justificacion: override ? justificacion.trim() : undefined })}
                  disabled={cerrando || (tienePendientes && (!override || !justificacion.trim()))}
                  className="min-h-[44px] flex-1 text-sm py-2 rounded-lg font-medium text-white disabled:opacity-50 flex items-center justify-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)]/40 transition-colors hover:enabled:brightness-90"
                  style={{ background: 'var(--red)' }}
                >
                  {cerrando ? <><Loader2 size={12} className="animate-spin" /> Cerrando...</> : 'Sí, cerrar definitivamente'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {lapsoEditando && !lapsoEditando.activo && (
        <div className="mt-5 rounded-xl p-3" style={{ background: '#eff6ff', border: '0.5px solid #bfdbfe' }}>
          <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#1e3a8a' }}><RotateCcw size={15} /> Reabrir lapso</p>
          <p className="mt-1 text-xs" style={{ color: '#1e40af' }}>La reapertura queda registrada con usuario, fecha y motivo.</p>
          <label htmlFor="motivo-reapertura" className="mt-3 block text-xs font-medium" style={{ color: '#1e3a8a' }}>Motivo obligatorio</label>
          <textarea
            id="motivo-reapertura"
            value={motivoReapertura}
            onChange={e => setMotivoReapertura(e.target.value)}
            maxLength={500}
            rows={3}
            className="mt-1 w-full resize-y rounded-xl border bg-white px-3 py-2 text-base sm:text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
            style={FIELD_STYLE}
          />
          <button
            type="button"
            onClick={() => onReabrirLapso(motivoReapertura)}
            disabled={reabriendo || !motivoReapertura.trim()}
            className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
          >
            {reabriendo ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
            {reabriendo ? 'Reabriendo…' : 'Reabrir con auditoría'}
          </button>
        </div>
      )}
    </Modal>
  );
}

function EstadoChecklist({ ok, texto }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <p className="flex items-center gap-2">
      <Icon size={15} aria-hidden="true" />
      <span>{texto}</span>
      <span className="sr-only">: {ok ? 'completo' : 'pendiente'}</span>
    </p>
  );
}
