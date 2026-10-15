import { useState } from 'react';
import { Download, FileText, Image as ImageIcon, Paperclip, Plus, Replace } from 'lucide-react';
import AdjuntoSubirModal from './AdjuntoSubirModal';
import { ESTILO_TARJETA, fmtFechaHora, fmtTamano, urlAbsoluta } from './CierreFormato';

// Respaldos del Director para el cierre (§3). Nada se borra: un adjunto
// reemplazado sigue visible, marcado como tal.
export default function AdjuntoPanel({ cierreId, adjuntos = [], onCambio }) {
  const [modal, setModal] = useState({ abierto: false, reemplazaA: null });

  const reemplazados = new Set(adjuntos.map((a) => a.reemplaza_a).filter((v) => v != null));
  const nombrePorId = Object.fromEntries(adjuntos.map((a) => [a.id, a.nombre]));

  const abrir = (reemplazaA = null) => setModal({ abierto: true, reemplazaA });
  const cerrar = () => setModal({ abierto: false, reemplazaA: null });

  return (
    <section className="rounded-2xl p-4 sm:p-5 flex flex-col gap-3" style={ESTILO_TARJETA} aria-labelledby="cierre-adjuntos">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:flex-col lg:items-stretch xl:flex-row xl:items-center">
        <h2 id="cierre-adjuntos" className="inline-flex items-center gap-1.5 font-semibold text-sm" style={{ color: 'var(--jet)' }}>
          <Paperclip size={16} aria-hidden="true" style={{ color: 'var(--pb-mid)' }} />
          Adjuntos
          <span className="text-xs font-normal" style={{ color: 'var(--ash)' }}>({adjuntos.length})</span>
        </h2>
        <button
          type="button"
          onClick={() => abrir()}
          className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-sm font-semibold w-full sm:w-auto lg:w-full xl:w-auto"
          style={{ background: 'var(--pb)', color: '#fff' }}
        >
          <Plus size={16} aria-hidden="true" />
          Subir adjunto
        </button>
      </div>

      {adjuntos.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ash)' }}>Aún no hay respaldos para este cierre.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {adjuntos.map((a) => {
            const esPdf = a.tipo_mime === 'application/pdf';
            const Icono = esPdf ? FileText : ImageIcon;
            const fueReemplazado = reemplazados.has(a.id);
            return (
              <li
                key={a.id}
                className="flex flex-col gap-2 rounded-xl p-3"
                style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border)', opacity: fueReemplazado ? 0.7 : 1 }}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <span
                    className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl"
                    style={esPdf ? { background: 'var(--red-light)', color: 'var(--red)' } : { background: 'var(--teal-light)', color: 'var(--teal)' }}
                  >
                    <Icono size={18} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-all" style={{ color: 'var(--jet)' }}>{a.nombre}</p>
                    {a.descripcion && <p className="text-xs break-words" style={{ color: 'var(--jet-mid)' }}>{a.descripcion}</p>}
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>
                      {fmtTamano(a.tamano_bytes)} · {a.subido_por?.nombre ?? '—'} · {fmtFechaHora(a.subido_en)}
                    </p>
                    {(fueReemplazado || a.reemplaza_a) && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {fueReemplazado && (
                          <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: 'var(--ash-light)', color: 'var(--jet-mid)' }}>Reemplazado</span>
                        )}
                        {a.reemplaza_a && (
                          <span className="rounded-full px-2 py-0.5 text-xs break-all" style={{ background: 'var(--yellow-light)', color: 'var(--amber-ink)' }}>
                            Reemplaza a {nombrePorId[a.reemplaza_a] ?? `#${a.reemplaza_a}`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <a
                    href={urlAbsoluta(a.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={a.nombre}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-xl text-xs font-medium"
                    style={{ background: '#fff', border: '0.5px solid var(--border-md)', color: 'var(--pb-mid)' }}
                  >
                    <Download size={14} aria-hidden="true" />
                    Descargar
                  </a>
                  {!fueReemplazado && (
                    <button
                      type="button"
                      onClick={() => abrir(a)}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-xl text-xs font-medium"
                      style={{ background: '#fff', border: '0.5px solid var(--border-md)', color: 'var(--jet-mid)' }}
                    >
                      <Replace size={14} aria-hidden="true" />
                      Reemplazar
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AdjuntoSubirModal
        open={modal.abierto}
        cierreId={cierreId}
        reemplazaA={modal.reemplazaA}
        onClose={cerrar}
        onSubido={() => { cerrar(); onCambio?.(); }}
      />
    </section>
  );
}
