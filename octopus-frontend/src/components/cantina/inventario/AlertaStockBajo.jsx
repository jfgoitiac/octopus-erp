import { useEffect, useState, useRef } from 'react';
import { toast } from 'react-toastify';
import { AlertTriangle } from 'lucide-react';
import { getStockCritico } from '../../../api/cantina.service';

function SkeletonAlerta() {
  return (
    <div
      className="rounded-xl px-4 py-3 animate-pulse"
      style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
      aria-busy="true"
      aria-label="Cargando stock crítico"
    >
      <div className="h-4 w-52 rounded" style={{ background: 'var(--border-md)' }} />
    </div>
  );
}

export default function AlertaStockBajo({ refreshKey }) {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading]     = useState(true);
  const abortRef = useRef(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      setLoading(true);
      try {
        const res = await getStockCritico(controller.signal);
        setProductos(res.data?.results ?? res.data ?? []);
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error('Error al cargar el reporte de stock crítico.');
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [refreshKey]);

  if (loading) return <SkeletonAlerta />;
  if (productos.length === 0) return null;

  return (
    <div
      role="status"
      className="rounded-xl px-4 py-3 flex items-start gap-3"
      style={{ background: 'var(--red-light)', border: '0.5px solid var(--red)' }}
    >
      <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--red)' }} />
      <div className="flex flex-col gap-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--red)' }}>
          {productos.length} producto{productos.length !== 1 ? 's' : ''} con stock bajo
        </p>
        <p className="text-xs" style={{ color: 'var(--red)' }}>
          {productos.slice(0, 6).map(p => p.nombre).join(', ')}
          {productos.length > 6 ? ` y ${productos.length - 6} más...` : ''}
        </p>
      </div>
    </div>
  );
}
