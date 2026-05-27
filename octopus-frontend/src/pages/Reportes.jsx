import { useState, useEffect, useCallback } from 'react';
import {
    Download, DollarSign, Wallet, Hash, Loader2,
    Search, FileSpreadsheet, CalendarDays, TrendingUp,
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

        </div>
    );
};

export default Reportes;
