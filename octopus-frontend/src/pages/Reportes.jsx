import { useState, useEffect, useCallback } from 'react';
import {
    Download, DollarSign, Wallet, Hash, Loader2,
    Search, FileSpreadsheet, CalendarDays, TrendingUp,
    TrendingDown, BarChart2, Target, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import DatePickerES from '../components/DatePickerES';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';

const today = () => new Date().toISOString().split('T')[0];

const currentYearMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const fmt = (val) => parseFloat(val || 0).toFixed(2);
const fmtInt = (val) => parseInt(val || 0, 10).toLocaleString();

const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const Reportes = () => {
    /* ── Cierre del día ── */
    const [caja, setCaja] = useState({ efectivo: 0, transferencia: 0, total_usd: 0, total_ves: 0, conteo_pagos: 0 });
    const [loadingCierre, setLoadingCierre] = useState(false);
    const [errorCierre, setErrorCierre] = useState(null);
    const [fechaInicio, setFechaInicio] = useState(today);
    const [fechaFin, setFechaFin] = useState(today);

    const fetchCierre = useCallback(async (fi, ff) => {
        setErrorCierre(null);
        setLoadingCierre(true);
        try {
            const res = await axiosInstance.get('cobranza/auditoria-diaria/', {
                params: { fecha_inicio: fi, fecha_fin: ff },
            });
            setCaja({
                efectivo:      res.data.efectivo_usd      || 0,
                transferencia: res.data.transferencia_ves || 0,
                total_usd:     res.data.total_usd         || 0,
                total_ves:     res.data.total_ves         || 0,
                conteo_pagos:  res.data.conteo_pagos      || 0,
            });
        } catch {
            setErrorCierre('No se pudo cargar el resumen.');
        } finally {
            setLoadingCierre(false);
        }
    }, []);

    useEffect(() => { fetchCierre(today(), today()); }, [fetchCierre]);

    /* ── Histórico mensual ── */
    const [mesAno, setMesAno] = useState(currentYearMonth);
    const [histDias, setHistDias] = useState([]);
    const [loadingHist, setLoadingHist] = useState(false);

    const fetchHistorico = useCallback(async (mesAnoStr) => {
        const [year, month] = mesAnoStr.split('-');
        setLoadingHist(true);
        try {
            const res = await axiosInstance.get('cobranza/historico-mensual/', {
                params: { year, month },
            });
            setHistDias(res.data.dias || []);
        } catch {
            toast.error('No se pudo cargar el histórico mensual.');
        } finally {
            setLoadingHist(false);
        }
    }, []);

    useEffect(() => { fetchHistorico(mesAno); }, [fetchHistorico, mesAno]);

    /* ── Exports ── */
    const [exportingExcel, setExportingExcel] = useState(false);

    /* ── Business Intelligence ── */
    const [biStats, setBiStats] = useState(null);
    const [biPagos, setBiPagos] = useState([]);
    const [biPagosAnt, setBiPagosAnt] = useState([]);
    const [loadingBI, setLoadingBI] = useState(false);
    const [biAnioFiltro, setBiAnioFiltro] = useState(() => new Date().getFullYear());

    const handleExportExcel = async () => {
        setExportingExcel(true);
        try {
            const res = await axiosInstance.get('cobranza/exportar-excel/', {
                params: { fecha_inicio: fechaInicio, fecha_fin: fechaFin },
                responseType: 'blob',
            });
            const url = URL.createObjectURL(new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }));
            const a = Object.assign(document.createElement('a'), {
                href: url,
                download: `reporte_cobranza_${fechaInicio}_${fechaFin}.xlsx`,
            });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Archivo Excel descargado.');
        } catch {
            toast.error('No se pudo generar el Excel.');
        } finally {
            setExportingExcel(false);
        }
    };

    const handleExportCSV = () => {
        const rows = [
            ['Concepto', 'Valor'],
            ['Total USD', caja.total_usd],
            ['Efectivo USD', caja.efectivo],
            ['Transferencias VES', caja.transferencia],
            ['Total VES', caja.total_ves],
            ['Cantidad de Pagos', caja.conteo_pagos],
            ['Fecha Inicio', fechaInicio],
            ['Fecha Fin', fechaFin],
        ];
        const csv = rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const a = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(blob),
            download: `reporte_${fechaInicio}_${fechaFin}.csv`,
        });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        toast.success('Archivo CSV descargado.');
    };

    /* ── Business Intelligence ── */
    const fetchBI = useCallback(async (anio) => {
        setLoadingBI(true);
        try {
            const hoy = new Date();
            const mesActual = String(hoy.getMonth() + 1).padStart(2, '0');
            const anioActual = hoy.getFullYear();

            // Stats generales (morosos por grado, cobrado_hoy_usd, etc.)
            const resStats = await axiosInstance.get('cobranza/stats/');

            // Pagos del mes actual completo
            const fechaDesde = `${anioActual}-${mesActual}-01`;
            const ultimoDia = new Date(anioActual, hoy.getMonth() + 1, 0).getDate();
            const fechaHasta = `${anioActual}-${mesActual}-${String(ultimoDia).padStart(2, '0')}`;
            const resPagos = await axiosInstance.get('cobranza/pagos/lista/', {
                params: { fecha_desde: fechaDesde, fecha_hasta: fechaHasta, page_size: 1000 },
            });

            // Pagos para comparativa: año escolar actual vs anterior
            const anioEscolarActualDesde = `${anio}-09-01`;
            const anioEscolarActualHasta = `${anio + 1}-07-31`;
            const anioEscolarAntDesde = `${anio - 1}-09-01`;
            const anioEscolarAntHasta = `${anio}-07-31`;

            const [resAnioAct, resAnioAnt] = await Promise.all([
                axiosInstance.get('cobranza/pagos/lista/', {
                    params: { fecha_desde: anioEscolarActualDesde, fecha_hasta: anioEscolarActualHasta, page_size: 2000 },
                }),
                axiosInstance.get('cobranza/pagos/lista/', {
                    params: { fecha_desde: anioEscolarAntDesde, fecha_hasta: anioEscolarAntHasta, page_size: 2000 },
                }),
            ]);

            setBiStats(resStats.data);
            setBiPagos(resPagos.data?.results || resPagos.data || []);
            const actArr = resAnioAct.data?.results || resAnioAct.data || [];
            const antArr = resAnioAnt.data?.results || resAnioAnt.data || [];
            // Store both periods together for comparison
            setBiPagosAnt({ actual: actArr, anterior: antArr });
        } catch {
            // BI es informativo — no mostrar toast de error crítico
        } finally {
            setLoadingBI(false);
        }
    }, []);

    useEffect(() => { fetchBI(biAnioFiltro); }, [fetchBI, biAnioFiltro]);

    /* ── BI helpers ── */
    const sumPagos = (arr) => arr.reduce((s, p) => s + parseFloat(p.monto_usd || p.monto || 0), 0);
    const countUniqAlumnos = (arr) => new Set(arr.map(p => p.alumno_id || p.alumno)).size;
    const mesConMayorRecaudacion = (arr) => {
        const byMonth = {};
        arr.forEach(p => {
            const m = (p.fecha || '').slice(0, 7);
            if (m) byMonth[m] = (byMonth[m] || 0) + parseFloat(p.monto_usd || p.monto || 0);
        });
        if (!Object.keys(byMonth).length) return '—';
        const best = Object.entries(byMonth).sort((a, b) => b[1] - a[1])[0];
        const [y, mo] = best[0].split('-');
        return `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y}`;
    };

    /* ── Totales del mes ── */
    const totalesMes = histDias.reduce(
        (acc, r) => ({
            total_usd:         acc.total_usd         + parseFloat(r.total_usd         || 0),
            efectivo_usd:      acc.efectivo_usd      + parseFloat(r.efectivo_usd      || 0),
            transferencia_ves: acc.transferencia_ves + parseFloat(r.transferencia_ves || 0),
            conteo_pagos:      acc.conteo_pagos      + parseInt(r.conteo_pagos        || 0, 10),
        }),
        { total_usd: 0, efectivo_usd: 0, transferencia_ves: 0, conteo_pagos: 0 },
    );

    const inputStyle = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' };
    const cardStyle  = { border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' };

    return (
        <div className="animate-fadeIn p-4 md:p-0 space-y-10">

            {/* ── SECCIÓN 1: Cierre del Día ── */}
            <section>
                <div className="mb-5">
                    <h2 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>Cierre de Caja</h2>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>Resumen de ingresos por período.</p>
                </div>

                {/* Filtro */}
                <div className="flex flex-wrap items-end gap-3 mb-6">
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
                    <button
                        onClick={() => fetchCierre(fechaInicio, fechaFin)}
                        disabled={loadingCierre}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        style={{ background: 'var(--pb)' }}
                    >
                        {loadingCierre ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                        Buscar
                    </button>
                </div>

                {errorCierre && <p className="text-sm text-red-500 mb-4">{errorCierre}</p>}

                {/* Cards */}
                <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 ${loadingCierre ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className="rounded-xl p-6" style={cardStyle}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 rounded-lg" style={{ background: '#dcfce7', color: '#16a34a' }}>
                                <DollarSign size={20} />
                            </div>
                            <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>
                                Total Recaudado (USD)
                            </label>
                        </div>
                        <p className="text-3xl font-bold font-mono" style={{ color: 'var(--pb)' }}>
                            ${fmt(caja.total_usd)}
                        </p>
                    </div>

                    <div className="rounded-xl p-6" style={cardStyle}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 rounded-lg" style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
                                <Wallet size={20} />
                            </div>
                            <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Distribución por Método</h3>
                        </div>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Efectivo USD:</span>
                                <span className="text-sm font-bold" style={{ color: 'var(--jet)' }}>${fmt(caja.efectivo)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Transferencias VES:</span>
                                <span className="text-sm font-bold" style={{ color: 'var(--jet)' }}>Bs. {fmt(caja.transferencia)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl p-6" style={cardStyle}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 rounded-lg" style={{ background: '#fef9c3', color: '#ca8a04' }}>
                                <Hash size={20} />
                            </div>
                            <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Total de Pagos</h3>
                        </div>
                        <p className="text-3xl font-bold font-mono" style={{ color: 'var(--jet)' }}>
                            {fmtInt(caja.conteo_pagos)}
                        </p>
                        <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>transacciones completadas</p>
                    </div>
                </div>

                {/* Botones exportar */}
                <div className="mt-6 flex flex-wrap gap-3">
                    <button
                        onClick={handleExportExcel}
                        disabled={loadingCierre || exportingExcel}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
                        style={{ background: 'var(--jet)' }}
                    >
                        {exportingExcel ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                        Exportar Excel
                    </button>
                    <button
                        onClick={handleExportCSV}
                        disabled={loadingCierre}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                        style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                    >
                        <Download size={16} />
                        Exportar CSV
                    </button>
                </div>
            </section>

            {/* ── SECCIÓN 2: Histórico Mensual ── */}
            <section>
                {/* Encabezado + selector de mes */}
                <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                    <div>
                        <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                            <TrendingUp size={20} style={{ color: 'var(--pb)' }} />
                            Histórico Mensual
                        </h2>
                        <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
                            Desglose día a día de los cobros del mes.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <CalendarDays size={16} style={{ color: 'var(--ash)' }} />
                        <input
                            type="month"
                            value={mesAno}
                            onChange={e => setMesAno(e.target.value)}
                            className="px-3 py-2 rounded-lg text-sm outline-none"
                            style={inputStyle}
                        />
                    </div>
                </div>

                {/* Tabla */}
                <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-medium"
                                    style={{ color: 'var(--ash)' }}>
                                    Fecha
                                </th>
                                <th className="text-right px-4 py-3 text-[11px] uppercase tracking-widest font-medium"
                                    style={{ color: 'var(--ash)' }}>
                                    Pagos
                                </th>
                                <th className="text-right px-4 py-3 text-[11px] uppercase tracking-widest font-medium"
                                    style={{ color: 'var(--ash)' }}>
                                    Total USD
                                </th>
                                <th className="text-right px-4 py-3 text-[11px] uppercase tracking-widest font-medium"
                                    style={{ color: 'var(--ash)' }}>
                                    Efectivo USD
                                </th>
                                <th className="text-right px-4 py-3 text-[11px] uppercase tracking-widest font-medium"
                                    style={{ color: 'var(--ash)' }}>
                                    Transf. VES
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {loadingHist ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-10">
                                        <Loader2 size={20} className="animate-spin inline-block" style={{ color: 'var(--pb)' }} />
                                    </td>
                                </tr>
                            ) : histDias.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-10 text-sm" style={{ color: 'var(--ash)' }}>
                                        Sin registros para {MONTH_NAMES[parseInt(mesAno.split('-')[1], 10) - 1]} {mesAno.split('-')[0]}.
                                    </td>
                                </tr>
                            ) : (
                                histDias.map((row, idx) => {
                                    const d = new Date(row.fecha + 'T12:00:00');
                                    const label = d.toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit', month: 'short' });
                                    return (
                                        <tr
                                            key={row.fecha}
                                            style={{
                                                background: idx % 2 === 0 ? '#fff' : 'var(--porcelain)',
                                                borderBottom: '0.5px solid var(--border-md)',
                                            }}
                                        >
                                            <td className="px-4 py-3 font-medium capitalize" style={{ color: 'var(--jet)' }}>
                                                {label}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono" style={{ color: 'var(--jet)' }}>
                                                {row.conteo_pagos}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono font-semibold" style={{ color: '#16a34a' }}>
                                                ${fmt(row.total_usd)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono" style={{ color: 'var(--jet)' }}>
                                                ${fmt(row.efectivo_usd)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono" style={{ color: 'var(--jet)' }}>
                                                Bs. {fmt(row.transferencia_ves)}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                        {histDias.length > 0 && !loadingHist && (
                            <tfoot>
                                <tr style={{ background: 'var(--porcelain)', borderTop: '1px solid var(--border-md)' }}>
                                    <td className="px-4 py-3 text-[11px] uppercase tracking-widest font-semibold"
                                        style={{ color: 'var(--ash)' }}>
                                        Total del mes
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono font-semibold" style={{ color: 'var(--jet)' }}>
                                        {totalesMes.conteo_pagos}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono font-bold" style={{ color: '#16a34a' }}>
                                        ${totalesMes.total_usd.toFixed(2)}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono font-semibold" style={{ color: 'var(--jet)' }}>
                                        ${totalesMes.efectivo_usd.toFixed(2)}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono font-semibold" style={{ color: 'var(--jet)' }}>
                                        Bs. {totalesMes.transferencia_ves.toFixed(2)}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </section>

            {/* ── SECCIÓN 3: Business Intelligence ── */}
            <section>
                <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                            <BarChart2 size={20} style={{ color: 'var(--pb)' }} />
                            Business Intelligence
                        </h2>
                        <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
                            Proyecciones, morosidad histórica y comparativa de períodos.
                        </p>
                    </div>
                    {loadingBI && <Loader2 size={18} className="animate-spin" style={{ color: 'var(--pb)' }} />}
                </div>

                {/* ── BI 1: Proyección de ingresos mensuales ── */}
                <div className="rounded-xl overflow-hidden mb-6" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                    <div className="px-5 py-3.5 flex items-center gap-3" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                        <div className="p-1.5 rounded-lg" style={{ background: '#dcfce7' }}>
                            <Target size={15} style={{ color: '#16a34a' }} />
                        </div>
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Proyección de Ingresos — Mes Actual</h3>
                    </div>
                    <div className="p-5">
                        {loadingBI ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="animate-spin" size={22} style={{ color: 'var(--pb)' }} />
                            </div>
                        ) : (() => {
                            const cobradoMes = sumPagos(biPagos);
                            const potencial = biStats?.ingreso_potencial_mensual
                                || biStats?.total_mensualidades_mes
                                || (cobradoMes > 0 ? cobradoMes * 1.4 : 0); // fallback estimado
                            const porCobrar = Math.max(0, potencial - cobradoMes);
                            const pct = potencial > 0 ? Math.min(100, (cobradoMes / potencial) * 100) : 0;

                            // Top 5 deudores del mes
                            const deudoresMes = (biStats?.grados || [])
                                .flatMap(g => (g.top_deudores || []))
                                .sort((a, b) => parseFloat(b.deuda_usd || 0) - parseFloat(a.deuda_usd || 0))
                                .slice(0, 5);

                            return (
                                <div className="space-y-5">
                                    {/* Cards métricas */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="rounded-xl p-4" style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="p-1.5 rounded-lg" style={{ background: 'var(--pb-light)' }}>
                                                    <DollarSign size={14} style={{ color: 'var(--pb)' }} />
                                                </div>
                                                <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Ingreso potencial</span>
                                            </div>
                                            <p className="text-2xl font-bold font-mono" style={{ color: 'var(--pb)' }}>${fmt(potencial)}</p>
                                            <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>si todos los alumnos pagaran</p>
                                        </div>
                                        <div className="rounded-xl p-4" style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="p-1.5 rounded-lg" style={{ background: '#dcfce7' }}>
                                                    <TrendingUp size={14} style={{ color: '#16a34a' }} />
                                                </div>
                                                <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Cobrado hasta hoy</span>
                                            </div>
                                            <p className="text-2xl font-bold font-mono" style={{ color: '#16a34a' }}>${fmt(cobradoMes)}</p>
                                            <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>{biPagos.length} pagos registrados</p>
                                        </div>
                                        <div className="rounded-xl p-4" style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="p-1.5 rounded-lg" style={{ background: '#fef9c3' }}>
                                                    <TrendingDown size={14} style={{ color: '#ca8a04' }} />
                                                </div>
                                                <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Por cobrar</span>
                                            </div>
                                            <p className="text-2xl font-bold font-mono" style={{ color: porCobrar > 0 ? '#ca8a04' : '#16a34a' }}>${fmt(porCobrar)}</p>
                                            <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>estimado pendiente</p>
                                        </div>
                                    </div>

                                    {/* Barra de progreso */}
                                    <div>
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="text-xs font-medium" style={{ color: 'var(--jet)' }}>Progreso de recaudación</span>
                                            <span className="text-xs font-bold font-mono" style={{ color: 'var(--pb)' }}>{pct.toFixed(1)}%</span>
                                        </div>
                                        <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--ash-light)' }}>
                                            <div className="h-full rounded-full transition-all duration-700"
                                                style={{
                                                    width: `${pct}%`,
                                                    background: pct >= 80 ? '#16a34a' : pct >= 50 ? 'var(--pb)' : '#ca8a04',
                                                }} />
                                        </div>
                                    </div>

                                    {/* Top deudores */}
                                    {deudoresMes.length > 0 && (
                                        <div>
                                            <p className="text-[11px] uppercase tracking-widest mb-2 font-medium" style={{ color: 'var(--pb)' }}>Top 5 deudores del mes</p>
                                            <div className="space-y-1.5">
                                                {deudoresMes.map((d, i) => (
                                                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--bg)', border: '0.5px solid var(--border)' }}>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-bold w-4 text-center" style={{ color: 'var(--ash)' }}>{i + 1}</span>
                                                            <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{d.nombre || d.alumno || '—'}</span>
                                                        </div>
                                                        <span className="text-sm font-bold font-mono" style={{ color: 'var(--red)' }}>
                                                            ${fmt(d.deuda_usd || d.deuda || 0)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* ── BI 2: Tasa de morosidad por grado ── */}
                <div className="rounded-xl overflow-hidden mb-6" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                    <div className="px-5 py-3.5 flex items-center gap-3" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                        <div className="p-1.5 rounded-lg" style={{ background: 'var(--red-light)' }}>
                            <TrendingDown size={15} style={{ color: 'var(--red)' }} />
                        </div>
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Tasa de Morosidad por Grado</h3>
                        <div className="ml-auto flex items-center gap-2">
                            <span className="text-[11px]" style={{ color: 'var(--ash)' }}>Año:</span>
                            <select
                                value={biAnioFiltro}
                                onChange={e => setBiAnioFiltro(parseInt(e.target.value))}
                                className="px-2.5 py-1 rounded-lg text-xs outline-none"
                                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                                {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="p-5">
                        {loadingBI ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="animate-spin" size={22} style={{ color: 'var(--pb)' }} />
                            </div>
                        ) : (biStats?.grados || []).length === 0 ? (
                            <div className="flex flex-col items-center py-10" style={{ color: 'var(--ash)' }}>
                                <TrendingDown size={30} className="mb-2 opacity-20" />
                                <p className="text-sm">Sin datos de morosidad por grado.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {(biStats?.grados || []).map((g, idx) => {
                                    const pct = g.total_alumnos > 0
                                        ? Math.min(100, (g.morosos / g.total_alumnos) * 100)
                                        : 0;
                                    const color = pct > 20 ? 'var(--red)' : pct > 10 ? '#ca8a04' : '#16a34a';
                                    const bg = pct > 20 ? 'var(--red-light)' : pct > 10 ? '#fef9c3' : '#dcfce7';
                                    return (
                                        <div key={idx} className="p-3 rounded-xl" style={{ border: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{g.grado || g.nombre || `Grado ${idx + 1}`}</span>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs" style={{ color: 'var(--ash)' }}>{g.morosos || 0}/{g.total_alumnos || 0} morosos</span>
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ background: bg, color }}>
                                                        {pct.toFixed(1)}%
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--ash-light)' }}>
                                                    <div className="h-full rounded-full transition-all duration-500"
                                                        style={{ width: `${pct}%`, background: color }} />
                                                </div>
                                                {g.deuda_total_usd != null && (
                                                    <span className="text-xs font-mono font-bold w-20 text-right" style={{ color: 'var(--red)' }}>
                                                        ${fmt(g.deuda_total_usd)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── BI 3: Comparativa de períodos escolares ── */}
                <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                    <div className="px-5 py-3.5 flex items-center gap-3" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                        <div className="p-1.5 rounded-lg" style={{ background: 'var(--pb-light)' }}>
                            <BarChart2 size={15} style={{ color: 'var(--pb)' }} />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Comparativa de Períodos Escolares</h3>
                            <p className="text-[11px]" style={{ color: 'var(--ash)' }}>
                                {biAnioFiltro - 1}-{biAnioFiltro} vs {biAnioFiltro}-{biAnioFiltro + 1}
                            </p>
                        </div>
                    </div>
                    <div className="p-5">
                        {loadingBI ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="animate-spin" size={22} style={{ color: 'var(--pb)' }} />
                            </div>
                        ) : (() => {
                            const actArr = biPagosAnt?.actual || [];
                            const antArr = biPagosAnt?.anterior || [];

                            const cobradoAct = sumPagos(actArr);
                            const cobradoAnt = sumPagos(antArr);
                            const alumnosAct = countUniqAlumnos(actArr);
                            const alumnosAnt = countUniqAlumnos(antArr);

                            // Morosidad aproximada (morosos en stats / total alumnos activos)
                            const totalAlumnos = (biStats?.grados || []).reduce((s, g) => s + (g.total_alumnos || 0), 0);
                            const totalMorosos = (biStats?.grados || []).reduce((s, g) => s + (g.morosos || 0), 0);
                            const morosidadAct = totalAlumnos > 0 ? (totalMorosos / totalAlumnos) * 100 : 0;

                            const mesActual = mesConMayorRecaudacion(actArr);
                            const mesAnterior = mesConMayorRecaudacion(antArr);

                            const diff = (a, b) => {
                                if (b === 0) return null;
                                return ((a - b) / b) * 100;
                            };
                            const TrendBadge = ({ val }) => {
                                if (val === null) return null;
                                const up = val >= 0;
                                return (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                        style={{ background: up ? '#dcfce7' : 'var(--red-light)', color: up ? '#16a34a' : 'var(--red)' }}>
                                        {up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                                        {Math.abs(val).toFixed(1)}%
                                    </span>
                                );
                            };

                            const rows = [
                                {
                                    label: 'Total cobrado (USD)',
                                    act: `$${fmt(cobradoAct)}`,
                                    ant: `$${fmt(cobradoAnt)}`,
                                    trend: diff(cobradoAct, cobradoAnt),
                                },
                                {
                                    label: 'Alumnos únicos con pago',
                                    act: alumnosAct.toLocaleString(),
                                    ant: alumnosAnt.toLocaleString(),
                                    trend: diff(alumnosAct, alumnosAnt),
                                },
                                {
                                    label: 'Tasa de morosidad (actual)',
                                    act: `${morosidadAct.toFixed(1)}%`,
                                    ant: '—',
                                    trend: null,
                                },
                                {
                                    label: 'Mes con mayor recaudación',
                                    act: mesActual,
                                    ant: mesAnterior,
                                    trend: null,
                                },
                            ];

                            return (
                                <div className="overflow-x-auto rounded-xl" style={{ border: '0.5px solid var(--border-md)' }}>
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr style={{ background: 'var(--bg)', borderBottom: '0.5px solid var(--border-md)' }}>
                                                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>
                                                    Métrica
                                                </th>
                                                <th className="text-center px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>
                                                    {biAnioFiltro - 1}-{biAnioFiltro}
                                                </th>
                                                <th className="text-center px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>
                                                    {biAnioFiltro}-{biAnioFiltro + 1}
                                                </th>
                                                <th className="text-center px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>
                                                    Variación
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((row, idx) => (
                                                <tr key={idx} style={{
                                                    background: idx % 2 === 0 ? '#fff' : 'var(--porcelain)',
                                                    borderBottom: '0.5px solid var(--border-md)',
                                                }}>
                                                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--jet)' }}>{row.label}</td>
                                                    <td className="px-4 py-3 text-center font-mono text-xs" style={{ color: 'var(--ash)' }}>{row.ant}</td>
                                                    <td className="px-4 py-3 text-center font-mono text-xs font-semibold" style={{ color: 'var(--jet)' }}>{row.act}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        <TrendBadge val={row.trend} />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </section>

        </div>
    );
};

export default Reportes;
