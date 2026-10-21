import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { Megaphone, Paperclip, CheckCircle2 } from 'lucide-react';
import { getCirculares, confirmarLectura } from '../api/comunicacion.service';
import { SkeletonLine } from '../components/SkeletonCard';
import { fmtFecha as formatFecha } from '../utils/fechas';

const PortalComunicaciones = () => {
  const [circulares, setCirculares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmando, setConfirmando] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    getCirculares(controller.signal)
      .then(res => setCirculares(res.data || []))
      .catch(err => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error('No se pudieron cargar los avisos. Intenta más tarde.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const handleConfirmar = async (circularId) => {
    setConfirmando(circularId);
    try {
      await confirmarLectura(circularId);
      setCirculares(prev => prev.map(c =>
        c.id === circularId ? { ...c, leido: true, fecha_lectura: new Date().toISOString() } : c
      ));
      toast.success('Listo, el colegio sabe que leíste este aviso.');
    } catch {
      toast.error('No se pudo confirmar la lectura.');
    } finally {
      setConfirmando(null);
    }
  };

  const noLeidas = circulares.filter(c => !c.leido).length;

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[var(--jet)]">Avisos del colegio</h1>
          <p className="text-xs text-[var(--ash)] mt-0.5">Circulares y comunicados para tu familia</p>
        </div>
        {noLeidas > 0 && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--yellow-light)] text-[var(--yellow)] flex-shrink-0">
            {noLeidas} sin leer
          </span>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[var(--surface)] rounded-2xl p-4 border border-[var(--border)] space-y-2 animate-pulse">
              <div className="flex justify-between">
                <SkeletonLine width="w-2/5" height="h-4" />
                <SkeletonLine width="w-1/5" height="h-4" />
              </div>
              <SkeletonLine width="w-full" height="h-3" />
              <SkeletonLine width="w-1/3" height="h-3" />
            </div>
          ))}
        </div>
      ) : circulares.length === 0 ? (
        <div className="bg-[var(--surface)] rounded-2xl p-8 border border-[var(--border)] text-center">
          <Megaphone size={32} className="text-[var(--border-md)] mx-auto mb-3" />
          <p className="text-sm text-[var(--ash)]">El colegio aún no ha publicado avisos.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {circulares.map(c => (
            <div
              key={c.id}
              className={`bg-[var(--surface)] rounded-2xl p-4 border ${c.leido ? 'border-[var(--border)]' : ''}`}
              style={c.leido ? undefined : { borderColor: 'color-mix(in srgb, var(--portal-primary) 30%, white)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {!c.leido && <span className="w-2 h-2 rounded-full bg-[var(--portal-primary)] flex-shrink-0" />}
                  <p className="text-sm font-semibold text-[var(--jet)] break-words">{c.titulo}</p>
                </div>
                <span className="text-xs text-[var(--ash)] flex-shrink-0">{formatFecha(c.fecha_publicacion)}</span>
              </div>

              <p className="text-sm text-[var(--jet-mid)] mt-2 whitespace-pre-line">{c.cuerpo}</p>

              <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
                {c.adjunto ? (
                  <a
                    href={c.adjunto}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm font-medium text-[var(--portal-primary)] min-h-[44px]"
                  >
                    <Paperclip size={13} /> Ver adjunto
                  </a>
                ) : <span />}

                {c.requiere_confirmacion && (
                  c.leido ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-[var(--green)]">
                      <CheckCircle2 size={14} /> Leído {c.fecha_lectura ? `— ${formatFecha(c.fecha_lectura)}` : ''}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleConfirmar(c.id)}
                      disabled={confirmando === c.id}
                      className="text-sm font-semibold px-4 rounded-full text-white disabled:opacity-50 min-h-[44px]"
                      style={{ background: 'var(--portal-primary)' }}
                    >
                      {confirmando === c.id ? 'Confirmando…' : 'Confirmar que lo leí'}
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PortalComunicaciones;
