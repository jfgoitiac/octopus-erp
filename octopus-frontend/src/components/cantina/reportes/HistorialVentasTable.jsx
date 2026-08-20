import { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Printer, Loader2, Search, Ban } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { descargarReciboVenta } from '../../../api/cantina.service';

const METODO_LABELS = {
  efectivo: 'Efectivo USD',
  efectivo_ves: 'Efectivo VES',
  tarjeta_prepago: 'Tarjeta prepago',
};

function formatFechaHora(iso) {
  if (!iso) return '—';
  try { return format(parseISO(iso), "dd/MM/yyyy hh:mm a", { locale: es }); }
  catch { return iso; }
}

// Tabla del historial de ventas del rango (§7.4 cantina.md, FASE 7) — incluye
// filtro local por número de venta/alumno y botón "Reimprimir" por fila, que
// regenera el PDF vía ReciboVentaPDFView (misma vista de la Fase 4; si la
// venta fue anulada el PDF ya marca "ANULADA" solo, no hace falta nada
// especial acá). Espera `ventas`: [{ id, alumno_nombre, tarjeta_serial,
// cajero_username, metodo_pago, total_usd, total_ves, estado, creado_en,
// anulada_en }, ...] — ver el contrato en api/cantina.service.js.
export default function HistorialVentasTable({ ventas = [] }) {
  const [filtro, setFiltro] = useState('');
  const [imprimiendoId, setImprimiendoId] = useState(null);

  const ventasFiltradas = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return ventas;
    return ventas.filter(v => {
      const numero = String(v.id ?? '').toLowerCase();
      const alumno = (v.alumno_nombre ?? '').toLowerCase();
      return numero.includes(q) || alumno.includes(q);
    });
  }, [ventas, filtro]);

  const reimprimir = async (venta) => {
    if (imprimiendoId) return;
    setImprimiendoId(venta.id);
    try {
      const res = await descargarReciboVenta(venta.id);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank', 'noopener,noreferrer');
      // No revocamos la URL de inmediato: la pestaña nueva necesita seguir
      // teniendo acceso al blob mientras el usuario la tiene abierta.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      let msg = 'No se pudo regenerar el ticket.';
      if (err.response?.data instanceof Blob) {
        try {
          const texto = await err.response.data.text();
          const data = JSON.parse(texto);
          msg = data?.detail || data?.error || msg;
        } catch { /* no era JSON, se queda el mensaje genérico */ }
      } else {
        msg = err.response?.data?.detail || err.response?.data?.error || msg;
      }
      toast.error(msg);
    } finally {
      setImprimiendoId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
        <input
          type="text"
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          placeholder="Buscar por N° de venta o alumno"
          aria-label="Buscar por número de venta o alumno"
          className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none min-h-[40px]"
          style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
        />
      </div>

      <div className="rounded-xl overflow-hidden overflow-x-auto" style={{ border: '0.5px solid var(--border-md)' }}>
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr style={{ background: 'var(--porcelain)' }}>
              <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--ash)' }}>N°</th>
              <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--ash)' }}>Fecha</th>
              <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--ash)' }}>Alumno</th>
              <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--ash)' }}>Método</th>
              <th className="text-right px-4 py-2.5 font-medium" style={{ color: 'var(--ash)' }}>Total USD</th>
              <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--ash)' }}>Estado</th>
              <th className="text-right px-4 py-2.5 font-medium" style={{ color: 'var(--ash)' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ventasFiltradas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--ash)' }}>
                  {ventas.length === 0 ? 'No hay ventas en el rango seleccionado.' : 'Ninguna venta coincide con la búsqueda.'}
                </td>
              </tr>
            )}
            {ventasFiltradas.map(v => {
              const anulada = v.estado === 'anulada' || Boolean(v.anulada_en);
              return (
                <tr key={v.id} style={{ borderTop: '0.5px solid var(--border-md)' }}>
                  <td className="px-4 py-2.5 font-mono" style={{ color: 'var(--jet)' }}>#{v.id}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--jet)' }}>{formatFechaHora(v.creado_en)}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--jet)' }}>{v.alumno_nombre ?? '—'}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--jet)' }}>
                    {METODO_LABELS[v.metodo_pago] ?? v.metodo_pago ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium" style={{ color: 'var(--jet)' }}>
                    ${Number(v.total_usd ?? 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5">
                    {anulada ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                        <Ban size={11} /> Anulada
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: '#dcfce7', color: '#15803d' }}>
                        Completada
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => reimprimir(v)}
                      disabled={imprimiendoId === v.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                      style={{ border: '0.5px solid var(--border-md)', color: 'var(--pb)' }}
                    >
                      {imprimiendoId === v.id
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Printer size={13} />}
                      Reimprimir
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
