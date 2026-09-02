import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import DatePicker, { registerLocale } from 'react-datepicker';
import { es } from 'date-fns/locale/es';
import 'react-datepicker/dist/react-datepicker.css';
import { datepickerPopperContainer } from '../../utils/datepickerPortal';
import { BarChart3, Download, Loader2 } from 'lucide-react';
import { getReporteVentas, exportarVentasExcel } from '../../api/cantina.service';
import VentasChart from '../../components/cantina/reportes/VentasChart';
import ProductosMasVendidos from '../../components/cantina/reportes/ProductosMasVendidos';
import HistorialVentasTable from '../../components/cantina/reportes/HistorialVentasTable';

// Nota de aislamiento (§6 cantina.md): este módulo NO importa DatePickerES de
// src/components/ (genérico del admin) — registra el locale 'es' acá mismo,
// react-datepicker deja registrar el mismo locale varias veces sin problema.
registerLocale('es', es);

function parseLocalDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toISODate(date) {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function hoyISO() {
  return toISODate(new Date());
}

function haceNDiasISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISODate(d);
}

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '15px' };

function SkeletonBloque({ altura = 200 }) {
  return (
    <div
      className="rounded-xl animate-pulse"
      style={{ height: altura, background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
      aria-busy="true"
    />
  );
}

// Reportes de ventas y reimpresión de tickets (§6/§7.4 cantina.md, FASE 7).
// Contrato real de GET reportes/ventas/ documentado en api/cantina.service.js
// (getReporteVentas).
export default function CantinaReportes() {
  const [fechaInicio, setFechaInicio] = useState(haceNDiasISO(30));
  const [fechaFin, setFechaFin] = useState(hoyISO());
  const [alumnoId, setAlumnoId] = useState('');
  const [reporte, setReporte] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);

  const abortRef = useRef(null);

  const cargarReporte = useCallback(async (signal) => {
    setLoading(true);
    try {
      const params = { fecha_inicio: fechaInicio, fecha_fin: fechaFin };
      if (alumnoId.trim()) params.alumno_id = alumnoId.trim();
      const res = await getReporteVentas(params, signal);
      setReporte(res.data ?? null);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error(err.response?.data?.detail || 'No se pudo cargar el reporte de ventas.');
      setReporte(null);
    } finally {
      setLoading(false);
    }
  }, [fechaInicio, fechaFin, alumnoId]);

  useEffect(() => {
    if (!fechaInicio || !fechaFin) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    cargarReporte(controller.signal);
    return () => controller.abort();
  }, [cargarReporte, fechaInicio, fechaFin]);

  const handleExportar = async () => {
    if (exportando) return;
    setExportando(true);
    try {
      const params = { fecha_inicio: fechaInicio, fecha_fin: fechaFin };
      if (alumnoId.trim()) params.alumno_id = alumnoId.trim();
      const res = await exportarVentasExcel(params);
      const url = URL.createObjectURL(new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const nombre = `ventas_cantina_${fechaInicio}_${fechaFin}.xlsx`;
      const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Archivo Excel descargado.');
    } catch (err) {
      let msg = 'No se pudo generar el Excel.';
      if (err.response?.data instanceof Blob) {
        try {
          const texto = await err.response.data.text();
          const data = JSON.parse(texto);
          msg = data?.detail || msg;
        } catch { /* no era JSON, se queda el mensaje genérico */ }
      } else {
        msg = err.response?.data?.detail || msg;
      }
      toast.error(msg);
    } finally {
      setExportando(false);
    }
  };

  const totales = reporte?.totales ?? {};
  const porDia = reporte?.ventas_por_dia ?? [];
  const productosMasVendidos = reporte?.productos_mas_vendidos ?? [];
  const ventas = reporte?.ventas ?? [];
  // El backend no agrega total_ves (solo total_vendido_usd/cantidad_ventas en
  // `totales`) — se deriva acá sumando las ventas completadas del rango, que
  // ya vienen con total_ves calculado por VentaCantinaSerializer.
  const totalVes = ventas
    .filter(v => v.estado !== 'anulada')
    .reduce((acc, v) => acc + Number(v.total_ves ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: 'var(--jet)' }}>
            <BarChart3 size={20} style={{ color: 'var(--pb)' }} />
            Reportes de Cantina
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
            Ventas por rango de fechas, productos más vendidos y reimpresión de tickets.
          </p>
        </div>

        <button
          onClick={handleExportar}
          disabled={exportando || loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white min-h-[44px] disabled:opacity-50"
          style={{ background: 'var(--pb)' }}
        >
          {exportando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          Exportar Excel
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-xl p-4" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Desde
          </label>
          <DatePicker
            locale="es"
            selected={parseLocalDate(fechaInicio)}
            onChange={(date) => setFechaInicio(toISODate(date))}
            dateFormat="dd/MM/yyyy"
            maxDate={parseLocalDate(fechaFin) || new Date()}
            wrapperClassName="w-36"
            popperContainer={datepickerPopperContainer}
            customInput={<input className="w-36 px-3 py-2 rounded-lg text-sm outline-none min-h-[40px]" style={FIELD_STYLE} autoComplete="off" />}
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Hasta
          </label>
          <DatePicker
            locale="es"
            selected={parseLocalDate(fechaFin)}
            onChange={(date) => setFechaFin(toISODate(date))}
            dateFormat="dd/MM/yyyy"
            minDate={parseLocalDate(fechaInicio)}
            maxDate={new Date()}
            wrapperClassName="w-36"
            popperContainer={datepickerPopperContainer}
            customInput={<input className="w-36 px-3 py-2 rounded-lg text-sm outline-none min-h-[40px]" style={FIELD_STYLE} autoComplete="off" />}
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Alumno (opcional)
          </label>
          <input
            type="text"
            value={alumnoId}
            onChange={e => setAlumnoId(e.target.value)}
            placeholder="ID de alumno"
            className="w-36 px-3 py-2 rounded-lg text-sm outline-none min-h-[40px]"
            style={FIELD_STYLE}
          />
        </div>
        <p className="text-xs ml-auto" style={{ color: 'var(--ash)' }}>
          {loading ? 'Cargando…' : `${ventas.length} venta${ventas.length !== 1 ? 's' : ''} en el rango`}
        </p>
      </div>

      {/* Totales agregados */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SkeletonBloque altura={80} />
          <SkeletonBloque altura={80} />
          <SkeletonBloque altura={80} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl p-4" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
            <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Ventas</p>
            <p className="text-2xl font-semibold mt-1" style={{ color: 'var(--jet)' }}>{totales.cantidad_ventas ?? ventas.length}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
            <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Total USD</p>
            <p className="text-2xl font-semibold mt-1" style={{ color: 'var(--jet)' }}>
              ${Number(totales.total_vendido_usd ?? 0).toFixed(2)}
            </p>
          </div>
          <div className="rounded-xl p-4" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
            <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Total VES</p>
            <p className="text-2xl font-semibold mt-1" style={{ color: 'var(--jet)' }}>
              {totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}

      {/* Ventas por día */}
      <div>
        <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--jet)' }}>Ventas por día</h2>
        {loading ? <SkeletonBloque altura={280} /> : <VentasChart porDia={porDia} />}
      </div>

      {/* Productos más vendidos */}
      <div>
        <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--jet)' }}>Productos más vendidos</h2>
        {loading ? <SkeletonBloque altura={200} /> : <ProductosMasVendidos productos={productosMasVendidos} />}
      </div>

      {/* Historial de ventas + reimpresión */}
      <div>
        <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--jet)' }}>Historial de ventas</h2>
        {loading ? <SkeletonBloque altura={240} /> : <HistorialVentasTable ventas={ventas} />}
      </div>
    </div>
  );
}
