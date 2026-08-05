import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'react-toastify';
import { Megaphone, Paperclip, CheckCircle2 } from 'lucide-react';
import { getCirculares, confirmarLectura } from '../api/comunicacion.service';
import { SkeletonLine } from '../components/SkeletonCard';

const formatFecha = (fechaStr) => {
  if (!fechaStr) return '—';
  try {
    return format(new Date(fechaStr), "d 'de' MMM yyyy", { locale: es });
  } catch {
    return fechaStr;
  }
};

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
        toast.error('No se pudo cargar las comunicaciones.');
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
      toast.success('Circular marcada como leída.');
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
          <h1 className="text-lg font-bold text-gray-800">Comunicaciones</h1>
          <p className="text-xs text-gray-400 mt-0.5">Circulares y avisos del colegio</p>
        </div>
        {noLeidas > 0 && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 flex-shrink-0">
            {noLeidas} sin leer
          </span>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2 animate-pulse">
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
        <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center">
          <Megaphone size={32} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No hay circulares publicadas.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {circulares.map(c => (
            <div
              key={c.id}
              className={`bg-white rounded-2xl p-4 shadow-sm border ${c.leido ? 'border-gray-100' : ''}`}
              style={c.leido ? undefined : { borderColor: 'color-mix(in srgb, var(--portal-primary, #0fa3b1) 30%, white)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {!c.leido && <span className="w-2 h-2 rounded-full bg-[var(--portal-primary,#0fa3b1)] flex-shrink-0" />}
                  <p className="text-sm font-medium text-gray-800 truncate">{c.titulo}</p>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{formatFecha(c.fecha_publicacion)}</span>
              </div>

              <p className="text-sm text-gray-600 mt-2 whitespace-pre-line">{c.cuerpo}</p>

              <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
                {c.adjunto ? (
                  <a
                    href={c.adjunto}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs font-medium text-[var(--portal-primary,#0fa3b1)]"
                  >
                    <Paperclip size={13} /> Ver adjunto
                  </a>
                ) : <span />}

                {c.requiere_confirmacion && (
                  c.leido ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                      <CheckCircle2 size={14} /> Leído {c.fecha_lectura ? `— ${formatFecha(c.fecha_lectura)}` : ''}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleConfirmar(c.id)}
                      disabled={confirmando === c.id}
                      className="text-xs font-medium px-3 py-1.5 rounded-full text-white disabled:opacity-50 min-h-[32px]"
                      style={{ background: 'var(--portal-primary, #0fa3b1)' }}
                    >
                      {confirmando === c.id ? 'Confirmando...' : 'He leído'}
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
