import { useState, useEffect, useCallback, useMemo } from 'react';
import { CalendarDays, TrendingUp } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosInstance from '../../api/apiClient';
import { TableRowSkeleton } from '../shared/Skeleton';
import { currentYearMonth, fmt, getErrorMessage, MONTH_NAMES, inputStyle } from '../../constants/reportes';

const HistoricoMensualTab = () => {
    const [mesAno, setMesAno] = useState(currentYearMonth);
    const [histDias, setHistDias] = useState([]);
    const [loadingHist, setLoadingHist] = useState(true);

    const fetchHistorico = useCallback(async (mesAnoStr) => {
        const [year, month] = mesAnoStr.split('-');
        setLoadingHist(true);
        try {
            const res = await axiosInstance.get('cobranza/historico-mensual/', {
                params: { year, month },
            });
            setHistDias(res.data.dias || []);
        } catch (err) {
            toast.error(getErrorMessage(err, 'No se pudo cargar el histórico mensual.'));
        } finally {
            setLoadingHist(false);
        }
    }, []);

    useEffect(() => { fetchHistorico(mesAno); }, [fetchHistorico, mesAno]);

    const totalesMes = useMemo(() =>
        histDias.reduce(
            (acc, r) => ({
                total_usd:         acc.total_usd         + parseFloat(r.total_usd         || 0),
                efectivo_usd:      acc.efectivo_usd      + parseFloat(r.efectivo_usd      || 0),
                transferencia_ves: acc.transferencia_ves + parseFloat(r.transferencia_ves || 0),
                conteo_pagos:      acc.conteo_pagos      + parseInt(r.conteo_pagos        || 0, 10),
            }),
            { total_usd: 0, efectivo_usd: 0, transferencia_ves: 0, conteo_pagos: 0 },
        ),
    [histDias]);

    return (
        <section>
            {/* Encabezado + selector de mes */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                <div>
                    <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                        <TrendingUp size={20} style={{ color: 'var(--pb)' }} />
                        Histórico Mensual
                    </h2>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
                        Desglose día a día de los cobros de {MONTH_NAMES[parseInt(mesAno.split('-')[1], 10) - 1]} {mesAno.split('-')[0]}.
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
            <div className="rounded-xl overflow-x-auto" style={{ border: '0.5px solid var(--border-md)' }}>
                <table className="w-full text-sm min-w-[500px]">
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
                            <TableRowSkeleton cols={5} rows={6} />
                        ) : histDias.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center py-10 text-sm" style={{ color: 'var(--ash)' }}>
                                    Sin registros para {MONTH_NAMES[parseInt(mesAno.split('-')[1], 10) - 1]} {mesAno.split('-')[0]}. Prueba con otro mes.
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
    );
};

export default HistoricoMensualTab;
