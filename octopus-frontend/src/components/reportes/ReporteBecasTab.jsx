import { useState, useEffect, useCallback } from 'react';
import { GraduationCap, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import axiosInstance from '../../api/apiClient';
import { CardSkeleton } from '../shared/Skeleton';
import { getErrorMessage } from '../../constants/reportes';
import { Card } from '../ui/Card';
import { TablaScroll } from '../ui/TablaScroll';

const TIPO_COLORS = ['#0fa3b1', '#f59e0b', '#dc2626', '#7c3aed', '#16a34a', '#64748b'];

const ReporteBecasTab = () => {
    const [reporte, setReporte] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchReporte = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get('cobranza/reporte-becas/');
            setReporte(res.data);
        } catch (err) {
            toast.warning(getErrorMessage(err, 'No se pudo cargar el reporte de becas.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchReporte(); }, [fetchReporte]);

    const exportarExcel = () => {
        if (!reporte || reporte.detalle.length === 0) return;
        const rows = reporte.detalle.map(d => ({
            'Alumno': d.alumno_nombre,
            'Grado': d.grado_seccion,
            'Tipo de Beca': d.tipo_beca_display,
            'Mes': d.mes,
            'Año': d.anio,
            'Monto Original (USD)': Number(d.monto_original_usd),
            'Monto con Beca (USD)': Number(d.monto_usd),
            'Exonerado (USD)': Number(d.exonerado_usd),
            'Pagado': d.pagado ? 'Sí' : 'No',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Costo de Becas');
        XLSX.writeFile(wb, `costo_becas_${reporte.periodo_escolar}.xlsx`);
    };

    if (loading) {
        return (
            <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <CardSkeleton /><CardSkeleton />
                </div>
            </div>
        );
    }

    if (!reporte || reporte.detalle.length === 0) {
        return (
            <Card className="flex flex-col items-center py-10">
                <GraduationCap size={32} className="mb-2 opacity-20" style={{ color: 'var(--pb)' }} />
                <p className="text-sm" style={{ color: 'var(--ash)' }}>
                    Sin mensualidades con beca aplicada en el período {reporte?.periodo_escolar || 'activo'}.
                </p>
            </Card>
        );
    }

    return (
        <section>
            <div className="mb-5 flex items-start justify-between flex-wrap gap-4">
                <div>
                    <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                        <GraduationCap size={20} style={{ color: 'var(--pb)' }} />
                        Costo de Becas
                    </h2>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
                        Total exonerado en mensualidades · período {reporte.periodo_escolar}
                    </p>
                </div>
                <button type="button" onClick={exportarExcel}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white"
                    style={{ background: 'var(--pb)' }}>
                    <Download size={14} /> Exportar Excel
                </button>
            </div>

            <div className="space-y-5">
                <Card>
                    <p className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Total exonerado</p>
                    <p className="text-3xl font-bold font-mono" style={{ color: 'var(--pb)' }}>
                        ${Number(reporte.total_exonerado_usd).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                        <p className="text-sm font-medium mb-3" style={{ color: 'var(--jet)' }}>Por tipo de beca</p>
                        <div className="space-y-2.5">
                            {reporte.por_tipo.map((t, i) => (
                                <div key={t.tipo}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span style={{ color: 'var(--ash)' }}>{t.tipo_display} ({t.cantidad})</span>
                                        <span className="font-semibold" style={{ color: 'var(--jet)' }}>${Number(t.total_exonerado_usd).toFixed(2)}</span>
                                    </div>
                                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ash-light)' }}>
                                        <div className="h-full rounded-full"
                                            style={{
                                                width: `${(Number(t.total_exonerado_usd) / Number(reporte.total_exonerado_usd) * 100).toFixed(1)}%`,
                                                background: TIPO_COLORS[i % TIPO_COLORS.length],
                                            }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                    <Card>
                        <p className="text-sm font-medium mb-3" style={{ color: 'var(--jet)' }}>Por grado</p>
                        <div className="space-y-2.5">
                            {reporte.por_grado.map((g, i) => (
                                <div key={g.grado_seccion}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span style={{ color: 'var(--ash)' }}>{g.grado_seccion} ({g.cantidad})</span>
                                        <span className="font-semibold" style={{ color: 'var(--jet)' }}>${Number(g.total_exonerado_usd).toFixed(2)}</span>
                                    </div>
                                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ash-light)' }}>
                                        <div className="h-full rounded-full"
                                            style={{
                                                width: `${(Number(g.total_exonerado_usd) / Number(reporte.total_exonerado_usd) * 100).toFixed(1)}%`,
                                                background: TIPO_COLORS[i % TIPO_COLORS.length],
                                            }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>

                <Card className="!p-0 overflow-hidden">
                    <TablaScroll>
                        <table className="w-full text-left min-w-[760px]">
                            <thead>
                                <tr style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                                    {['Alumno', 'Grado', 'Tipo', 'Mes', 'Original', 'Con Beca', 'Exonerado'].map(h => (
                                        <th key={h} className="px-4 py-2.5 text-[11px] uppercase tracking-widest"
                                            style={{ color: 'var(--ash)', background: 'var(--bg)' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {reporte.detalle.map((d, i) => (
                                    <tr key={i} style={{ borderBottom: '0.5px solid var(--border)' }}>
                                        <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--jet)' }}>{d.alumno_nombre}</td>
                                        <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--ash)' }}>{d.grado_seccion}</td>
                                        <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--ash)' }}>{d.tipo_beca_display}</td>
                                        <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--ash)' }}>{d.mes} {d.anio}</td>
                                        <td className="px-4 py-2.5 text-xs line-through" style={{ color: 'var(--ash)' }}>${Number(d.monto_original_usd).toFixed(2)}</td>
                                        <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--jet)' }}>${Number(d.monto_usd).toFixed(2)}</td>
                                        <td className="px-4 py-2.5 text-sm font-semibold" style={{ color: 'var(--pb)' }}>${Number(d.exonerado_usd).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </TablaScroll>
                </Card>
            </div>
        </section>
    );
};

export default ReporteBecasTab;
