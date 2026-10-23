import { useState } from 'react';
import { toast } from 'react-toastify';
import { CheckCircle2, Eye, Loader2, MessageSquareWarning, ShieldCheck } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { parseApiError } from '../../../utils/apiError';
import { revisarCierre } from '../api/auditoriaApi';
import EstadoRevisionBadge from './EstadoRevisionBadge';
import { ESTADOS_REVISION, ESTILO_CAMPO, ESTILO_TARJETA, fmtFechaHora } from './CierreFormato';

const ICONO_ACCION = { revisado: Eye, aprobado: CheckCircle2, observado: MessageSquareWarning };

const ESTILO_ACCION = {
  revisado: { background: 'var(--pb-light)', color: 'var(--pb-mid)', border: '0.5px solid var(--pb)' },
  aprobado: { background: 'var(--green)', color: '#fff' },
  observado: { background: 'var(--red-light)', color: 'var(--red)', border: '0.5px solid var(--red)' },
};

const COLOR_CONFIRMAR = { revisado: 'var(--pb)', aprobado: 'var(--green)', observado: 'var(--red)' };

const AYUDA_ACCION = {
  revisado: 'El cierre queda marcado como revisado. Aún podrás aprobarlo u observarlo después.',
  aprobado: 'La aprobación es definitiva: el cierre no podrá cambiar de estado.',
  observado: 'Explica qué debe justificar o corregir el cajero. El comentario queda en la bitácora.',
};

// Estado de revisión del cierre y acciones del Director (§3 POST cierres/<id>/revision/).
// Solo se muestran las transiciones que el backend declara permitidas.
export default function EstadoRevisionPanel({ cierreId, revision, onRevisado }) {
  const [accion, setAccion] = useState(null);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [intentado, setIntentado] = useState(false);

  const transiciones = revision?.transiciones_permitidas ?? [];
  const requiereComentario = accion === 'observado';
  const comentarioFaltante = requiereComentario && !comentario.trim();
  const mostrarError = intentado && comentarioFaltante;

  const abrir = (estado) => {
    setAccion(estado);
    setComentario('');
    setIntentado(false);
  };

  const cerrar = () => {
    if (!enviando) setAccion(null);
  };

  const confirmar = async () => {
    setIntentado(true);
    if (comentarioFaltante) return;
    setEnviando(true);
    try {
      const payload = { estado: accion };
      if (comentario.trim()) payload.comentario = comentario.trim();
      await revisarCierre(cierreId, payload);
      toast.success(`Cierre marcado como ${ESTADOS_REVISION[accion].etiqueta.toLowerCase()}.`);
      setAccion(null);
      onRevisado?.();
    } catch (err) {
      toast.error(`No se pudo registrar la revisión: ${parseApiError(err)}`);
    } finally {
      setEnviando(false);
    }
  };

  const meta = accion ? ESTADOS_REVISION[accion] : null;

  return (
    <section className="rounded-2xl p-4 sm:p-5 flex flex-col gap-4" style={ESTILO_TARJETA} aria-labelledby="cierre-revision">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="cierre-revision" className="inline-flex items-center gap-1.5 font-semibold text-sm" style={{ color: 'var(--jet)' }}>
          <ShieldCheck size={16} aria-hidden="true" style={{ color: 'var(--pb-mid)' }} />
          Revisión del Director
        </h2>
        <EstadoRevisionBadge estado={revision?.estado} />
      </div>

      {revision?.revisado_por ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs" style={{ color: 'var(--ash)' }}>
            {revision.revisado_por.nombre} · {fmtFechaHora(revision.revisado_en)}
          </p>
        </div>
      ) : (
        <p className="text-sm" style={{ color: 'var(--ash)' }}>Este cierre todavía no ha sido revisado.</p>
      )}

      {transiciones.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {transiciones.map((estado) => {
            const Icono = ICONO_ACCION[estado] ?? Eye;
            return (
              <button
                key={estado}
                type="button"
                onClick={() => abrir(estado)}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-sm font-semibold w-full sm:w-auto transition-opacity hover:opacity-90"
                style={ESTILO_ACCION[estado] ?? ESTILO_ACCION.revisado}
              >
                <Icono size={16} aria-hidden="true" />
                {ESTADOS_REVISION[estado]?.accion ?? estado}
              </button>
            );
          })}
        </div>
      )}
      {transiciones.length === 0 && revision?.estado === 'aprobado' && (
        <p className="text-xs" style={{ color: 'var(--green)' }}>Cierre aprobado: la revisión está cerrada.</p>
      )}

      <Modal
        open={Boolean(accion)}
        onClose={cerrar}
        size="sm"
        titulo={meta ? `${meta.accion} cierre` : ''}
        footer={
          <>
            <button
              type="button"
              onClick={cerrar}
              disabled={enviando}
              className="min-h-[44px] px-4 rounded-xl text-sm font-medium w-full sm:w-auto disabled:opacity-50"
              style={{ background: '#fff', border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={enviando}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-sm font-semibold w-full sm:w-auto disabled:opacity-60"
              style={{ background: COLOR_CONFIRMAR[accion] ?? 'var(--pb)', color: '#fff' }}
            >
              {enviando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              Confirmar
            </button>
          </>
        }
      >
        {accion && (
          <div className="flex flex-col gap-3">
            <p className="text-sm" style={{ color: 'var(--jet-mid)' }}>{AYUDA_ACCION[accion]}</p>
            <div>
              <label htmlFor="revision-comentario" className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                Comentario {requiereComentario ? '(obligatorio)' : '(opcional)'}
              </label>
              <textarea
                id="revision-comentario"
                rows={4}
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                maxLength={1000}
                aria-invalid={mostrarError}
                aria-describedby={mostrarError ? 'revision-comentario-error' : undefined}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-y focus:ring-2 focus:ring-[var(--pb)]"
                style={{ ...ESTILO_CAMPO, ...(mostrarError ? { border: '1px solid var(--red)' } : null) }}
                placeholder={requiereComentario ? 'Ej.: Justificar el faltante con el registro de vueltos.' : 'Nota para la bitácora'}
              />
              {mostrarError && (
                <p id="revision-comentario-error" className="text-xs mt-1" style={{ color: 'var(--red)' }}>
                  Para observar un cierre debes explicar el motivo.
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
