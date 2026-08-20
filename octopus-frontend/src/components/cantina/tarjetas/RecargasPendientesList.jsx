import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Inbox, Check, XCircle, Loader2, Hash } from 'lucide-react';
import {
  getRecargasPendientes, aprobarRecarga, rechazarRecarga,
} from '../../../api/cantina.service';

const METODO_LABELS = {
  transferencia: 'Transferencia',
  pago_movil: 'Pago Móvil',
  zelle: 'Zelle',
  efectivo: 'Efectivo USD',
  efectivo_ves: 'Efectivo Bs.',
};

function SkeletonFila() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 animate-pulse">
      <div className="h-4 w-32 rounded" style={{ background: 'var(--border-md)' }} />
      <div className="h-4 w-20 rounded" style={{ background: 'var(--border-md)' }} />
      <div className="h-4 w-24 rounded" style={{ background: 'var(--border-md)' }} />
      <div className="h-4 w-20 rounded" style={{ background: 'var(--border-md)' }} />
      <div className="h-4 w-24 rounded ml-auto" style={{ background: 'var(--border-md)' }} />
      <div className="h-8 w-32 rounded-lg" style={{ background: 'var(--border-md)' }} />
    </div>
  );
}

function formatearFecha(iso) {
  if (!iso) return '—';
  try {
    return format(new Date(iso), "d 'de' MMMM, HH:mm", { locale: es });
  } catch {
    return iso;
  }
}

// Recargas creadas desde el portal (§5.6 cantina.md, RecargasPendientesView)
// en estatus='pendiente' — a diferencia de RecargaCajeroModal, estas SÍ
// requieren revisión explícita del admin antes de acreditar el saldo.
export default function RecargasPendientesList({ refreshSignal }) {
  const [recargas, setRecargas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [procesandoId, setProcesandoId] = useState(null);
  const abortRef = useRef(null);

  const cargar = useCallback(() => {
    setCargando(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    getRecargasPendientes(controller.signal)
      .then(res => setRecargas(Array.isArray(res.data) ? res.data : res.data?.results || []))
      .catch(err => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error(err.response?.data?.detail || 'No se pudieron cargar las recargas pendientes.');
      })
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    cargar();
    return () => abortRef.current?.abort();
  }, [cargar, refreshSignal]);

  const handleAprobar = async (id) => {
    setProcesandoId(id);
    try {
      await aprobarRecarga(id);
      toast.success('Recarga aprobada. Saldo acreditado.');
      cargar();
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error(err.response?.data?.detail || 'No se pudo aprobar la recarga.');
    } finally {
      setProcesandoId(null);
    }
  };

  const handleRechazar = async (id) => {
    setProcesandoId(id);
    try {
      await rechazarRecarga(id);
      toast.success('Recarga rechazada.');
      cargar();
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error(err.response?.data?.detail || 'No se pudo rechazar la recarga.');
    } finally {
      setProcesandoId(null);
    }
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
      <div className="px-4 py-3" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
        <h2 className="font-semibold text-sm" style={{ color: 'var(--jet)' }}>Recargas pendientes de revisión</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>Solicitadas desde el portal del representante.</p>
      </div>

      {cargando ? (
        <div className="divide-y" style={{ borderColor: 'var(--border-md)' }}>
          {[1, 2, 3].map(i => <SkeletonFila key={i} />)}
        </div>
      ) : recargas.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <Inbox size={28} style={{ color: 'var(--ash)' }} />
          <p className="text-sm" style={{ color: 'var(--ash)' }}>No hay recargas pendientes por revisar.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--porcelain)' }}>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--ash)' }}>Alumno</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--ash)' }}>Monto</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--ash)' }}>Método</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--ash)' }}>Referencia</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--ash)' }}>Fecha</th>
                <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--ash)' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {recargas.map(r => {
                const procesando = procesandoId === r.id;
                const alumno = r.tarjeta?.alumno || r.alumno;
                return (
                  <tr key={r.id} style={{ borderTop: '0.5px solid var(--border-md)' }}>
                    <td className="px-4 py-3" style={{ color: 'var(--jet)' }}>
                      {alumno ? `${alumno.nombre} ${alumno.apellido || ''}`.trim() : (r.tarjeta?.serial || '—')}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--jet)' }}>
                      {Number(r.monto_usd) > 0 ? `$${Number(r.monto_usd).toFixed(2)}` : `Bs. ${Number(r.monto_ves).toFixed(2)}`}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--ash)' }}>
                      {METODO_LABELS[r.metodo_pago] || r.metodo_pago}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--ash)' }}>
                      {r.referencia ? (
                        <span className="flex items-center gap-1"><Hash size={12} />{r.referencia}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--ash)' }}>
                      {formatearFecha(r.creado_en)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleAprobar(r.id)}
                          disabled={procesando}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50 min-h-[36px]"
                          style={{ background: '#16a34a' }}
                        >
                          {procesando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          Aprobar
                        </button>
                        <button
                          onClick={() => handleRechazar(r.id)}
                          disabled={procesando}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 min-h-[36px]"
                          style={{ border: '0.5px solid #dc2626', color: '#dc2626' }}
                        >
                          <XCircle size={12} />
                          Rechazar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
