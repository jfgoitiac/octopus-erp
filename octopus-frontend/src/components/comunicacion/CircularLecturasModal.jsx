import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { Loader2, CheckCircle2, Circle } from 'lucide-react';
import { getLecturasCircular } from '../../api/comunicacion.service';
import { fmtFecha } from '../../utils/format';
import { Modal } from '../ui/Modal';

export default function CircularLecturasModal({ circularId, onClose }) {
  const [lecturas, setLecturas] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    getLecturasCircular(circularId, controller.signal)
      .then(res => setLecturas(res.data || []))
      .catch(err => {
        if (err.code === 'ERR_CANCELED') return;
        toast.error('No se pudieron cargar las lecturas.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [circularId]);

  return (
    <Modal open onClose={onClose} titulo="¿Quién leyó?" size="sm">
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin" size={24} style={{ color: 'var(--pb)' }} />
        </div>
      ) : lecturas.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: 'var(--ash)' }}>
          Sin representantes destinatarios.
        </p>
      ) : (
        <div className="space-y-1">
          {lecturas.map(l => (
            <div key={l.id} className="flex items-center justify-between gap-3 py-2 px-1 text-sm" style={{ borderBottom: '0.5px solid var(--border)' }}>
              <div className="min-w-0">
                <p className="truncate" style={{ color: 'var(--jet)' }}>{l.representante_nombre}</p>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>{l.representante_cedula}</p>
              </div>
              {l.leido ? (
                <span className="flex items-center gap-1 text-xs font-medium flex-shrink-0" style={{ color: 'var(--pb)' }}>
                  <CheckCircle2 size={14} /> {fmtFecha(l.fecha_lectura)}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs flex-shrink-0" style={{ color: 'var(--ash)' }}>
                  <Circle size={14} /> Sin leer
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
