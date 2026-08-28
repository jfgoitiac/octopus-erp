import { useState, useEffect, useCallback } from 'react';
import { FileEdit, Search, X, PlusCircle, Pencil, Ban } from 'lucide-react';
import { toast } from 'react-toastify';
import DatePickerES from '../DatePickerES';
import Pagination from '../shared/Pagination';
import { listarPagos } from '../../api/cobranza.service';
import { TableRowSkeleton } from '../shared/Skeleton';
import {
    today, daysAgo, fmt, getErrorMessage,
    METODO_LABELS, ESTATUS_STYLE, inputStyle,
} from '../../constants/reportes';
import CorregirPagoModal from './CorregirPagoModal';
import AnularPagoModal from './AnularPagoModal';
import CargarPagoRetroactivoModal from './CargarPagoRetroactivoModal';

const PAGE_SIZE = 20;

/**
 * @param bancosDisponibles lista de bancos compartida con Conciliación/Clasificación
 *        (se carga una sola vez en Reportes.jsx), reusada aquí en los selects de
 *        banco receptor de los dos modales de este tab.
 */
const CorreccionPagosTab = ({ bancosDisponibles }) => {
    const [fechaInicio, setFechaInicio] = useState(() => daysAgo(30));
    const [fechaFin, setFechaFin] = useState(today);
    const [busqueda, setBusqueda] = useState('');
    const [busquedaDebounced, setBusquedaDebounced] = useState('');
    const [metodoPago, setMetodoPago] = useState('todos');
    const [estatus, setEstatus] = useState('todos');

    const [pagos, setPagos] = useState([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);

    const [pagoACorregir, setPagoACorregir] = useState(null);
    const [pagoAAnular, setPagoAAnular] = useState(null);
    const [mostrarRetroactivo, setMostrarRetroactivo] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => {
            setBusquedaDebounced(busqueda.trim());
            setPage(1);
        }, 400);
        return () => clearTimeout(t);
    }, [busqueda]);

    useEffect(() => {
        setPage(1);
    }, [fechaInicio, fechaFin, metodoPago, estatus]);

    const fetchPagos = useCallback(async (fi, ff, buscar, metodo, est, pageNum) => {
        setLoading(true);
        try {
            const res = await listarPagos({
                fecha_desde: fi,
                fecha_hasta: ff,
                buscar: buscar || undefined,
                metodo_pago: metodo !== 'todos' ? metodo : undefined,
                estatus: est !== 'todos' ? est : undefined,
                page: pageNum,
                page_size: PAGE_SIZE,
            });
            // Mismo shape de paginación que estado-clasificacion:
            // {total, page, page_size, total_pages, results} (no el {count, next,
            // previous} genérico de DRF).
            setPagos(res.data?.results || []);
            setTotal(res.data?.total || 0);
            setTotalPages(res.data?.total_pages || 1);
        } catch (err) {
            toast.error(getErrorMessage(err, 'No se pudo cargar la lista de pagos.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPagos(fechaInicio, fechaFin, busquedaDebounced, metodoPago, estatus, page);
    }, [fetchPagos, fechaInicio, fechaFin, busquedaDebounced, metodoPago, estatus, page]);

    const refrescar = useCallback(() => {
        fetchPagos(fechaInicio, fechaFin, busquedaDebounced, metodoPago, estatus, page);
    }, [fetchPagos, fechaInicio, fechaFin, busquedaDebounced, metodoPago, estatus, page]);

    const handleCorreccionGuardada = () => {
        setPagoACorregir(null);
        refrescar();
        toast.success('Pago corregido correctamente.');
    };

    const handlePagoAnulado = () => {
        setPagoAAnular(null);
        refrescar();
        toast.success('Pago anulado correctamente.');
    };

    const handleRetroactivoGuardado = () => {
        setMostrarRetroactivo(false);
        refrescar();
        toast.success('Pago retroactivo registrado correctamente.');
    };

    const limpiarFiltros = () => {
        setBusqueda('');
        setMetodoPago('todos');
        setEstatus('todos');
        setFechaInicio(daysAgo(30));
        setFechaFin(today());
    };

    return (
        <section>
            <div className="mb-5 flex items-start justify-between flex-wrap gap-4">
                <div>
                    <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                        <FileEdit size={20} style={{ color: 'var(--pb)' }} />
                        Corrección de Pagos
                    </h2>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
                        Corrige datos de un pago ya registrado o carga un pago cuyo dinero se recibió en el pasado · período {fechaInicio} — {fechaFin}.
                    </p>
                </div>
                <button
                    onClick={() => setMostrarRetroactivo(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white whitespace-nowrap min-h-[44px]"
                    style={{ background: 'var(--pb)' }}>
                    <PlusCircle size={16} /> Cargar Pago Retroactivo
                </button>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-end gap-3 mb-4">
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Desde</label>
                    <DatePickerES
                        value={fechaInicio}
                        onChange={e => setFechaInicio(e.target.value)}
                        className="px-3 py-2 rounded-lg text-sm outline-none"
                        style={inputStyle}
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Hasta</label>
                    <DatePickerES
                        value={fechaFin}
                        onChange={e => setFechaFin(e.target.value)}
                        className="px-3 py-2 rounded-lg text-sm outline-none"
                        style={inputStyle}
                    />
                </div>
                <div className="relative flex-1 w-full min-w-[220px]">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                    <input
                        type="text"
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        placeholder="Cédula o nombre del representante, o del alumno (opcional)…"
                        className="w-full pl-9 pr-8 py-2 rounded-lg text-sm outline-none"
                        style={inputStyle}
                    />
                    {busqueda && (
                        <button
                            onClick={() => setBusqueda('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2"
                            style={{ color: 'var(--ash)' }}>
                            <X size={14} />
                        </button>
                    )}
                </div>
                <select
                    value={metodoPago}
                    onChange={e => setMetodoPago(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm outline-none"
                    style={inputStyle}>
                    <option value="todos">Todos los métodos</option>
                    {Object.entries(METODO_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                    ))}
                </select>
                <select
                    value={estatus}
                    onChange={e => setEstatus(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm outline-none"
                    style={inputStyle}>
                    <option value="todos">Todos los estatus</option>
                    {Object.entries(ESTATUS_STYLE).map(([val, s]) => (
                        <option key={val} value={val}>{s.label}</option>
                    ))}
                </select>
            </div>

            {/* Tabla */}
            <div className="rounded-xl overflow-x-auto" style={{ border: '0.5px solid var(--border-md)' }}>
                <table className="w-full text-sm min-w-[900px]">
                    <thead>
                        <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                            <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>Fecha</th>
                            <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>Alumno</th>
                            <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>Representante</th>
                            <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>Concepto</th>
                            <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>Método / Banco / Ref.</th>
                            <th className="text-right px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>Monto</th>
                            <th className="text-center px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>Estatus</th>
                            <th className="text-center px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <TableRowSkeleton cols={8} rows={8} />
                        ) : pagos.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="text-center py-10">
                                    <p className="text-sm mb-2" style={{ color: 'var(--ash)' }}>
                                        No hay pagos que coincidan con el filtro.
                                    </p>
                                    <button
                                        onClick={limpiarFiltros}
                                        className="text-xs font-medium px-3 py-1.5 rounded-lg"
                                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--pb)' }}>
                                        Limpiar filtros y ver últimos 30 días
                                    </button>
                                </td>
                            </tr>
                        ) : (
                            pagos.map((p, idx) => {
                                const estStyle = ESTATUS_STYLE[p.estatus] || { label: p.estatus || '—', color: 'var(--ash)', bg: 'var(--ash-light)' };
                                const esAnulado = p.estatus === 'anulado';
                                const fecha = p.fecha_pago
                                    ? new Date(p.fecha_pago).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                    : '—';
                                return (
                                    <tr key={p.id}
                                        style={{
                                            background: idx % 2 === 0 ? '#fff' : 'var(--porcelain)',
                                            borderBottom: '0.5px solid var(--border-md)',
                                        }}>
                                        <td className="px-4 py-3" style={{ color: 'var(--jet)' }}>{fecha}</td>
                                        <td className="px-4 py-3" style={{ color: 'var(--jet)' }}>
                                            {`${p.nombre_alumno || ''} ${p.apellido_alumno || ''}`.trim() || '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-xs font-medium" style={{ color: 'var(--jet)' }}>{p.representante_nombre || '—'}</p>
                                            <p className="text-[10px] font-mono" style={{ color: 'var(--ash)' }}>{p.representante_documento || '—'}</p>
                                        </td>
                                        <td className="px-4 py-3" style={{ color: 'var(--jet)' }}>{p.concepto_display || p.concepto || '—'}</td>
                                        <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--ash)' }}>
                                            {p.referencia || '—'}
                                            <span className="block font-sans not-italic" style={{ color: 'var(--pb)', fontSize: '10px' }}>
                                                {p.metodo_pago_display || METODO_LABELS[p.metodo_pago] || p.metodo_pago}
                                                {p.banco_nombre ? ` · ${p.banco_nombre}` : ''}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono font-semibold" style={{ color: '#16a34a' }}>${fmt(p.monto_usd)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase whitespace-nowrap"
                                                style={{ background: estStyle.bg, color: estStyle.color }}>
                                                {estStyle.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="inline-flex items-center gap-1.5">
                                                <button
                                                    onClick={() => setPagoACorregir(p)}
                                                    disabled={esAnulado}
                                                    title={esAnulado ? 'No se puede corregir un pago anulado' : 'Corregir este pago'}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                                                    style={esAnulado
                                                        ? { background: '#fff', border: '0.5px solid var(--border-md)', color: 'var(--ash)' }
                                                        : { background: 'var(--pb)', color: '#fff' }}>
                                                    <Pencil size={13} /> Corregir
                                                </button>
                                                <button
                                                    onClick={() => setPagoAAnular(p)}
                                                    disabled={esAnulado}
                                                    title={esAnulado ? 'Este pago ya está anulado' : 'Anular este pago'}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                                                    style={esAnulado
                                                        ? { background: '#fff', border: '0.5px solid var(--border-md)', color: 'var(--ash)' }
                                                        : { background: '#fff', border: '0.5px solid var(--red)', color: 'var(--red)' }}>
                                                    <Ban size={13} /> Anular
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
                <Pagination
                    page={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    total={total}
                    pageSize={PAGE_SIZE}
                />
            </div>

            {pagoACorregir && (
                <CorregirPagoModal
                    pago={pagoACorregir}
                    bancosDisponibles={bancosDisponibles}
                    onClose={() => setPagoACorregir(null)}
                    onGuardado={handleCorreccionGuardada}
                />
            )}

            {pagoAAnular && (
                <AnularPagoModal
                    pago={pagoAAnular}
                    onClose={() => setPagoAAnular(null)}
                    onAnulado={handlePagoAnulado}
                />
            )}

            {mostrarRetroactivo && (
                <CargarPagoRetroactivoModal
                    bancosDisponibles={bancosDisponibles}
                    onClose={() => setMostrarRetroactivo(false)}
                    onGuardado={handleRetroactivoGuardado}
                />
            )}
        </section>
    );
};

export default CorreccionPagosTab;
