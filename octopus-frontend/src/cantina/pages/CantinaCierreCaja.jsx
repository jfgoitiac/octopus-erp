import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Wallet, CheckCircle2, Loader2 } from 'lucide-react';
import { getCierreCajaHoy, cerrarCajaCantina } from '../../api/cantina.service';
import ResumenCierreCaja from '../../components/cantina/cierre/ResumenCierreCaja';

function SkeletonCierre() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Cargando cierre de caja">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-2xl animate-pulse"
            style={{ background: 'var(--border-md)' }}
          />
        ))}
      </div>
      <div className="h-56 rounded-2xl animate-pulse" style={{ background: 'var(--border-md)' }} />
    </div>
  );
}

function formatearFecha(iso) {
  if (!iso) return '—';
  try {
    return format(new Date(iso), "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es });
  } catch {
    return iso;
  }
}

// Fase 5 de cantina.md (§5.6/§8): cierre de caja diario del cajero. El
// backend resuelve "hoy" y "el cajero autenticado" — este componente solo
// decide qué pintar según `ya_cerrado`.
export default function CantinaCierreCaja() {
  const [cierre, setCierre] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sinApertura, setSinApertura] = useState(false);

  const [conteoFisico, setConteoFisico] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [enviando, setEnviando] = useState(false);

  const abortRef = useRef(null);

  const cargarCierre = useCallback((signal) => {
    setLoading(true);
    setSinApertura(false);
    return getCierreCajaHoy(signal)
      .then(res => setCierre(res.data))
      .catch(err => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        // 400 sin apertura abierta: no es un error de carga, es un estado
        // válido (el cajero todavía no abrió caja este turno) — se muestra
        // aparte, sin toast de error genérico.
        if (err.response?.status === 400) {
          setSinApertura(true);
          return;
        }
        toast.error(err.response?.data?.detail || 'No se pudo cargar el resumen de caja.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    cargarCierre(controller.signal);
    return () => controller.abort();
  }, [cargarCierre]);

  const handleCerrarCaja = async (e) => {
    e.preventDefault();
    if (conteoFisico === '' || Number.isNaN(Number(conteoFisico))) {
      toast.error('Ingresa el conteo físico de caja.');
      return;
    }
    setEnviando(true);
    try {
      const res = await cerrarCajaCantina({
        conteo_fisico: conteoFisico,
        observaciones: observaciones || undefined,
      });
      setCierre(res.data);
      toast.success('Caja cerrada correctamente.');
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error(err.response?.data?.detail || 'No se pudo cerrar la caja. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: 'var(--jet)' }}>
            <Wallet size={20} style={{ color: 'var(--pb)' }} />
            Cierre de Caja
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>Cargando resumen del día...</p>
        </div>
        <SkeletonCierre />
      </div>
    );
  }

  if (sinApertura) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: 'var(--jet)' }}>
            <Wallet size={20} style={{ color: 'var(--pb)' }} />
            Cierre de Caja
          </h1>
        </div>
        <div
          className="rounded-2xl p-6 text-sm max-w-lg"
          style={{ background: '#fff', border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
        >
          No tienes ninguna apertura de caja abierta — abre tu caja en el punto de venta antes de poder cerrarla.
        </div>
      </div>
    );
  }

  const yaCerrado = cierre?.ya_cerrado;
  const diferencia = yaCerrado ? parseFloat(cierre.diferencia || 0) : 0;
  const diferenciaColor = diferencia < 0 ? 'var(--red, #dc2626)' : '#16a34a';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: 'var(--jet)' }}>
          <Wallet size={20} style={{ color: 'var(--pb)' }} />
          Cierre de Caja
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
          {yaCerrado
            ? `Caja cerrada el ${formatearFecha(cierre.cerrado_en)} por ${cierre.cajero_nombre || cierre.cajero_username || 'ti'}.`
            : 'Revisa el resumen del día y registra el conteo físico para cerrar la caja.'}
        </p>
      </div>

      <ResumenCierreCaja resumen={cierre} />

      {yaCerrado ? (
        <div
          className="rounded-2xl p-6 flex flex-col gap-4"
          style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} style={{ color: '#16a34a' }} />
            <h2 className="font-semibold text-sm" style={{ color: 'var(--jet)' }}>Caja cerrada</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg px-4 py-3" style={{ background: 'var(--porcelain)' }}>
              <p className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Conteo físico</p>
              <p className="text-xl font-bold font-mono mt-1" style={{ color: 'var(--jet)' }}>
                ${parseFloat(cierre.conteo_fisico || 0).toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg px-4 py-3" style={{ background: 'var(--porcelain)' }}>
              <p className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Diferencia</p>
              <p className="text-xl font-bold font-mono mt-1" style={{ color: diferenciaColor }}>
                {diferencia > 0 ? '+' : ''}${diferencia.toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg px-4 py-3" style={{ background: 'var(--porcelain)' }}>
              <p className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Fecha de cierre</p>
              <p className="text-sm font-semibold mt-1.5" style={{ color: 'var(--jet)' }}>
                {formatearFecha(cierre.cerrado_en)}
              </p>
            </div>
          </div>

          {cierre.observaciones && (
            <div className="rounded-lg px-4 py-3" style={{ background: 'var(--porcelain)' }}>
              <p className="text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--ash)' }}>Observaciones</p>
              <p className="text-sm" style={{ color: 'var(--jet)' }}>{cierre.observaciones}</p>
            </div>
          )}
        </div>
      ) : (
        <form
          onSubmit={handleCerrarCaja}
          className="rounded-2xl p-6 flex flex-col gap-4 max-w-lg"
          style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}
        >
          <h2 className="font-semibold text-sm" style={{ color: 'var(--jet)' }}>Registrar cierre</h2>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--jet)' }}>
              Conteo físico de caja <span style={{ color: 'var(--red, #dc2626)' }}>*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={conteoFisico}
              onChange={e => setConteoFisico(e.target.value)}
              placeholder="0.00"
              required
              className="px-3 py-2.5 rounded-lg text-sm outline-none font-mono"
              style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--jet)' }}>
              Observaciones <span style={{ color: 'var(--ash)' }}>(opcional)</span>
            </label>
            <textarea
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              rows={3}
              placeholder="Notas sobre el cierre, faltantes, sobrantes, etc."
              className="px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
              style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
            />
          </div>

          <button
            type="submit"
            disabled={enviando}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white min-h-[44px] disabled:opacity-50"
            style={{ background: 'var(--pb)' }}
          >
            {enviando ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
            Cerrar caja
          </button>
        </form>
      )}
    </div>
  );
}
