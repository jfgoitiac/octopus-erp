import { useId, useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2, NotebookPen, Pencil } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { parseApiError } from '../../../utils/apiError';
import { actualizarNotasCierre } from '../api/auditoriaApi';
import { ESTILO_CAMPO, ESTILO_TARJETA } from './CierreFormato';
import { ESTILO_BOTON_SECUNDARIO } from './BitacoraFormato';

const MIN_MOTIVO = 5;
const MAX_NOTAS = 2000;

function EditorNotas({ cierreId, notas, onClose, onGuardado }) {
  const uid = useId();
  const [texto, setTexto] = useState(notas ?? '');
  const [motivo, setMotivo] = useState('');
  const [intentado, setIntentado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const errorMotivo = motivo.trim().length < MIN_MOTIVO ? `Explica por qué cambias la nota (mínimo ${MIN_MOTIVO} caracteres).` : null;
  const sinCambios = texto.trim() === (notas ?? '').trim();

  const cerrar = () => { if (!enviando) onClose(); };

  const guardar = async () => {
    setIntentado(true);
    if (errorMotivo) return;
    if (sinCambios) {
      toast.info('La nota no ha cambiado.');
      return;
    }
    setEnviando(true);
    try {
      await actualizarNotasCierre(cierreId, { motivo: motivo.trim(), notas_director: texto.trim() });
      toast.success('Notas del Director actualizadas.');
      onGuardado?.();
    } catch (err) {
      toast.error(`No se pudieron guardar las notas: ${parseApiError(err)}`);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      open
      onClose={cerrar}
      size="md"
      titulo="Notas del Director"
      footer={
        <>
          <button type="button" onClick={cerrar} disabled={enviando} className="min-h-[44px] w-full rounded-xl px-4 text-sm font-medium disabled:opacity-50 sm:w-auto" style={ESTILO_BOTON_SECUNDARIO}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={enviando}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
            style={{ background: 'var(--pb)' }}
          >
            {enviando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            Guardar notas
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor={`${uid}-notas`} className="mb-1.5 block text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Nota</label>
          <textarea
            id={`${uid}-notas`}
            rows={5}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={MAX_NOTAS}
            className="min-h-[120px] w-full resize-y rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--pb)]"
            style={ESTILO_CAMPO}
          />
          <p className="mt-1 flex justify-between gap-2 text-xs" style={{ color: 'var(--ash)' }}><span>Déjala vacía para borrar la nota.</span><span>{texto.length}/{MAX_NOTAS}</span></p>
        </div>
        <div>
          <label htmlFor={`${uid}-motivo`} className="mb-1.5 block text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>
            Motivo del cambio <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <textarea
            id={`${uid}-motivo`}
            rows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={500}
            aria-invalid={intentado && Boolean(errorMotivo)}
            aria-describedby={`${uid}-motivo-ayuda`}
            className="min-h-[72px] w-full resize-y rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--pb)]"
            style={{ ...ESTILO_CAMPO, ...(intentado && errorMotivo ? { border: '1px solid var(--red)' } : null) }}
          />
          <p
            id={`${uid}-motivo-ayuda`}
            role={intentado && errorMotivo ? 'alert' : undefined}
            className="mt-1 text-xs"
            style={{ color: intentado && errorMotivo ? 'var(--red)' : 'var(--ash)' }}
          >
            {intentado && errorMotivo ? errorMotivo : 'Obligatorio. Queda en la bitácora.'}
          </p>
        </div>
      </div>
    </Modal>
  );
}

// Notas internas del Director sobre un cierre (PATCH cierres/<id>/notas/).
// Distintas del comentario de revisión: no cambian el estado del cierre.
export default function NotasDirectorPanel({ cierreId, notas, onCambio }) {
  const [editando, setEditando] = useState(false);

  return (
    <section className="flex flex-col gap-3 rounded-2xl p-4 sm:p-5" style={ESTILO_TARJETA} aria-labelledby="cierre-notas-director">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="cierre-notas-director" className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--jet)' }}>
          <NotebookPen size={16} aria-hidden="true" style={{ color: 'var(--pb-mid)' }} />
          Notas del Director
        </h2>
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-[var(--pb-light)]"
          style={{ color: 'var(--pb-mid)' }}
        >
          <Pencil size={14} aria-hidden="true" />
          {notas ? 'Editar' : 'Agregar'}
        </button>
      </div>
      {notas ? (
        <p className="whitespace-pre-line break-words rounded-xl p-3 text-sm" style={{ background: 'var(--porcelain)', color: 'var(--jet)', border: '0.5px solid var(--border)' }}>
          {notas}
        </p>
      ) : (
        <p className="text-sm italic" style={{ color: 'var(--ash)' }}>Sin notas. Úsalas para dejar contexto interno sobre este cierre.</p>
      )}
      {editando && (
        <EditorNotas
          cierreId={cierreId}
          notas={notas}
          onClose={() => setEditando(false)}
          onGuardado={() => { setEditando(false); onCambio?.(); }}
        />
      )}
    </section>
  );
}
