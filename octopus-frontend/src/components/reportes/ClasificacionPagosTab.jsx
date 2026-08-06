import { useState, useEffect, useCallback } from 'react';
import {
    Loader2, Search, FileSpreadsheet, X, Layers, FilePlus2,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import DatePickerES from '../DatePickerES';
import Pagination from '../shared/Pagination';
import { toast } from 'react-toastify';
import {
    getEstadoClasificacionPagos,
    getDesgloseContable,
} from '../../api/cobranza.service';
import { TableRowSkeleton } from '../shared/Skeleton';
import {
    today, daysAgo, fmt, getErrorMessage, MONTH_NAMES,
    TIPO_CLASIFICACION_LABELS, ESTADO_CLASIF_STYLE, inputStyle, cardStyle,
} from '../../constants/reportes';
import BancoSelect from './BancoSelect';

const CLASIF_PAGE_SIZE = 20;

const ORIGEN_LABELS_DESGLOSE = {
    automatico: 'Automático',
    manual: 'Manual',
    sin_clasificar: 'SIN CLASIFICAR',
};

const CONCEPTO_EXPORT_LABELS = {
    todos: 'Todos los conceptos',
    mensualidad: 'Mensualidad',
    inscripcion: 'Inscripción',
    solvencia: 'Solvencia',
    proyecto_inversion: 'Proyecto de Inversión',
    otro: 'Otro',
};

/**
 * @param bancosDisponibles lista de bancos para el filtro (compartida con Conciliación)
 * @param onSeleccionarPago  abre el modal de clasificación; el estado del modal vive en
 *        el shell (Reportes.jsx) porque también se dispara desde la pestaña de Conciliación.
 * @param registerUpdateHandler  al montar, registra la función que debe correr cuando el
 *        modal notifica un cambio (crear/editar/borrar línea), para refrescar esta tabla
 *        sin depender de qué pestaña disparó la clasificación.
 */
const ClasificacionPagosTab = ({ bancosDisponibles, onSeleccionarPago, registerUpdateHandler }) => {
    const [clasifFechaInicio, setClasifFechaInicio] = useState(() => daysAgo(30));
    const [clasifFechaFin, setClasifFechaFin] = useState(today);
    const [clasifRepDocumento, setClasifRepDocumento] = useState('');
    const [clasifRepDocumentoDebounced, setClasifRepDocumentoDebounced] = useState('');
    const [clasifEstado, setClasifEstado] = useState('todos');
    // Filtros de concepto/banco: se aplican tanto a la tabla en pantalla
    // (EstadoClasificacionPagosView) como al Excel/PDF (DesgloseContableView),
    // para que lo que se ve sea lo que se va a imprimir.
    const [clasifConceptoExport, setClasifConceptoExport] = useState('todos');
    const [clasifBancoExport, setClasifBancoExport] = useState('todos');

    const [clasifPagos, setClasifPagos] = useState([]);
    const [clasifTotal, setClasifTotal] = useState(0);
    const [clasifTotalPages, setClasifTotalPages] = useState(1);
    const [clasifPage, setClasifPage] = useState(1);
    const [loadingClasif, setLoadingClasif] = useState(true);
    const [exportandoClasifExcel, setExportandoClasifExcel] = useState(false);
    const [exportandoClasifPdf, setExportandoClasifPdf] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => {
            setClasifRepDocumentoDebounced(clasifRepDocumento.trim());
            setClasifPage(1);
        }, 400);
        return () => clearTimeout(t);
    }, [clasifRepDocumento]);

    useEffect(() => {
        setClasifPage(1);
    }, [clasifFechaInicio, clasifFechaFin, clasifEstado, clasifConceptoExport, clasifBancoExport]);

    const fetchClasificacion = useCallback(async (fi, ff, repDoc, estado, concepto, banco, page) => {
        setLoadingClasif(true);
        try {
            const res = await getEstadoClasificacionPagos({
                fecha_desde: fi,
                fecha_hasta: ff,
                representante_documento: repDoc || undefined,
                estado,
                concepto: concepto !== 'todos' ? concepto : undefined,
                banco: banco !== 'todos' ? banco : undefined,
                page,
                page_size: CLASIF_PAGE_SIZE,
            });
            // Paginación propia de este endpoint: {total, page, page_size, total_pages, results}
            // (no el {count, next, previous} genérico de DRF que usan otros endpoints).
            setClasifPagos(res.data?.results || []);
            setClasifTotal(res.data?.total || 0);
            setClasifTotalPages(res.data?.total_pages || 1);
        } catch (err) {
            toast.error(getErrorMessage(err, 'No se pudo cargar el estado de clasificación de pagos.'));
        } finally {
            setLoadingClasif(false);
        }
    }, []);

    useEffect(() => {
        fetchClasificacion(
            clasifFechaInicio, clasifFechaFin, clasifRepDocumentoDebounced, clasifEstado,
            clasifConceptoExport, clasifBancoExport, clasifPage,
        );
    }, [
        fetchClasificacion, clasifFechaInicio, clasifFechaFin, clasifRepDocumentoDebounced,
        clasifEstado, clasifConceptoExport, clasifBancoExport, clasifPage,
    ]);

    /* Actualiza el resumen (monto clasificado/pendiente/estado) de un pago en la
       tabla sin recargar toda la página, tras crear/editar/borrar una línea en el modal. */
    const handlePagoActualizado = useCallback((pagoId, resumen) => {
        setClasifPagos(prev => prev.map(p => (p.id === pagoId ? {
            ...p,
            monto_clasificado_usd: resumen.monto_clasificado_usd,
            monto_pendiente_usd: resumen.monto_pendiente_usd,
            estado_clasificacion: resumen.estado_clasificacion,
        } : p)));
    }, []);

    // Se registra en el shell mientras esta pestaña está montada, para que el
    // modal (renderizado a nivel de Reportes.jsx) pueda refrescar esta tabla
    // sin importar si la clasificación se disparó desde Conciliación o desde aquí.
    useEffect(() => {
        registerUpdateHandler?.(handlePagoActualizado);
        return () => registerUpdateHandler?.(null);
    }, [registerUpdateHandler, handlePagoActualizado]);

    const mesLabelDesglose = (fila) => {
        if (fila.mes && fila.anio) {
            return `${fila.mes_display || MONTH_NAMES[fila.mes - 1]} ${fila.anio}`;
        }
        return '';
    };

    const conceptoLabelDesglose = (fila) => {
        if (fila.origen === 'sin_clasificar') return fila.concepto_display || fila.concepto || 'Sin clasificar';
        return fila.tipo_display || TIPO_CLASIFICACION_LABELS[fila.tipo] || fila.concepto_display || fila.concepto || '—';
    };

    const bancoExportLabel = (val) => {
        if (val === 'todos') return 'Todos los bancos';
        if (val === 'sin_banco') return 'Sin banco (Efectivo)';
        return bancosDisponibles.find(b => String(b.id) === String(val))?.nombre || val;
    };

    const limpiarFiltros = () => {
        setClasifRepDocumento('');
        setClasifEstado('todos');
        setClasifConceptoExport('todos');
        setClasifBancoExport('todos');
        setClasifFechaInicio(daysAgo(30));
        setClasifFechaFin(today());
    };

    const handleExportClasifExcel = async () => {
        setExportandoClasifExcel(true);
        try {
            const res = await getDesgloseContable({
                fecha_desde: clasifFechaInicio,
                fecha_hasta: clasifFechaFin,
                representante_documento: clasifRepDocumentoDebounced || undefined,
                concepto: clasifConceptoExport !== 'todos' ? clasifConceptoExport : undefined,
                banco: clasifBancoExport !== 'todos' ? clasifBancoExport : undefined,
            });
            const filas = res.data?.results || [];
            if (!filas.length) {
                toast.info('No hay movimientos en el período seleccionado.');
                return;
            }
            const rows = filas.map(f => ({
                Fecha: f.fecha_pago ? new Date(f.fecha_pago).toLocaleDateString('es-VE') : '—',
                Factura: f.factura_id || '—',
                Alumno: f.alumno_nombre || '—',
                Representante: f.representante_nombre || '—',
                Documento: f.representante_documento || '—',
                Mes: mesLabelDesglose(f),
                Concepto: conceptoLabelDesglose(f),
                'Monto USD': parseFloat(f.monto_usd || 0),
                'Monto Bs': parseFloat(f.monto_ves || 0),
                'Método de Pago': f.metodo_pago_display || '—',
                Banco: f.banco_receptor || '—',
                Referencia: f.referencia || '—',
                Estado: ORIGEN_LABELS_DESGLOSE[f.origen] || f.origen || '—',
            }));
            const totalUsd = filas.reduce((acc, f) => acc + parseFloat(f.monto_usd || 0), 0);
            const totalVes = filas.reduce((acc, f) => acc + parseFloat(f.monto_ves || 0), 0);
            rows.push({
                Fecha: '', Factura: '', Alumno: '', Representante: '', Documento: '', Mes: '',
                Concepto: 'TOTAL',
                'Monto USD': totalUsd,
                'Monto Bs': totalVes,
                'Método de Pago': '', Banco: '', Referencia: '', Estado: '',
            });
            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Desglose Contable');
            const sufijoConcepto = clasifConceptoExport !== 'todos' ? `_${clasifConceptoExport}` : '';
            const sufijoBanco = clasifBancoExport !== 'todos' ? `_${bancoExportLabel(clasifBancoExport).replace(/\s+/g, '-')}` : '';
            XLSX.writeFile(wb, `desglose_contable${sufijoConcepto}${sufijoBanco}_${clasifFechaInicio}_${clasifFechaFin}.xlsx`);
            toast.success('Archivo Excel descargado.');
        } catch (err) {
            // El backend limita el rango a 92 días (~3 meses) para no sobrecargar la consulta.
            toast.error(getErrorMessage(err, 'No se pudo generar el Excel del desglose contable.'));
        } finally {
            setExportandoClasifExcel(false);
        }
    };

    const handleExportClasifPdf = async () => {
        setExportandoClasifPdf(true);
        try {
            const res = await getDesgloseContable({
                fecha_desde: clasifFechaInicio,
                fecha_hasta: clasifFechaFin,
                representante_documento: clasifRepDocumentoDebounced || undefined,
                concepto: clasifConceptoExport !== 'todos' ? clasifConceptoExport : undefined,
                banco: clasifBancoExport !== 'todos' ? clasifBancoExport : undefined,
            });
            const filas = res.data?.results || [];
            if (!filas.length) {
                toast.info('No hay movimientos en el período seleccionado.');
                return;
            }

            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            doc.setFontSize(15);
            doc.setFont('helvetica', 'bold');
            doc.text('Desglose Contable de Pagos', 14, 18);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100);
            doc.text(
                `Período: ${clasifFechaInicio}  —  ${clasifFechaFin}`
                + (clasifConceptoExport !== 'todos' ? `   ·   Concepto: ${CONCEPTO_EXPORT_LABELS[clasifConceptoExport]}` : '')
                + (clasifBancoExport !== 'todos' ? `   ·   Banco: ${bancoExportLabel(clasifBancoExport)}` : ''),
                14, 25,
            );
            doc.setTextColor(0);

            const totalUsd = filas.reduce((acc, f) => acc + parseFloat(f.monto_usd || 0), 0);
            const totalVes = filas.reduce((acc, f) => acc + parseFloat(f.monto_ves || 0), 0);

            autoTable(doc, {
                head: [['Fecha', 'Factura', 'Alumno', 'Representante', 'Documento', 'Mes', 'Concepto', 'Monto USD', 'Monto Bs', 'Método', 'Banco', 'Referencia', 'Estado']],
                body: [
                    ...filas.map(f => [
                        f.fecha_pago ? new Date(f.fecha_pago).toLocaleDateString('es-VE') : '—',
                        f.factura_id || '—',
                        f.alumno_nombre || '—',
                        f.representante_nombre || '—',
                        f.representante_documento || '—',
                        mesLabelDesglose(f) || '—',
                        conceptoLabelDesglose(f),
                        `$${parseFloat(f.monto_usd || 0).toFixed(2)}`,
                        `Bs ${parseFloat(f.monto_ves || 0).toFixed(2)}`,
                        f.metodo_pago_display || '—',
                        f.banco_receptor || '—',
                        f.referencia || '—',
                        ORIGEN_LABELS_DESGLOSE[f.origen] || f.origen || '—',
                    ]),
                    [
                        { content: 'TOTAL', colSpan: 7, styles: { fontStyle: 'bold', halign: 'right' } },
                        { content: `$${totalUsd.toFixed(2)}`, styles: { fontStyle: 'bold' } },
                        { content: `Bs ${totalVes.toFixed(2)}`, styles: { fontStyle: 'bold' } },
                        '', '', '', '',
                    ],
                ],
                startY: 32,
                styles: { fontSize: 7, cellPadding: 1.5 },
                headStyles: { fillColor: [30, 64, 175], fontStyle: 'bold' },
                columnStyles: {
                    7: { halign: 'right' },
                    8: { halign: 'right' },
                },
                didParseCell: (data) => {
                    if (data.section === 'body' && data.row.index < filas.length && filas[data.row.index]?.origen === 'sin_clasificar') {
                        data.cell.styles.fillColor = [254, 226, 226];
                    }
                },
            });

            const sufijoConceptoPdf = clasifConceptoExport !== 'todos' ? `_${clasifConceptoExport}` : '';
            const sufijoBancoPdf = clasifBancoExport !== 'todos' ? `_${bancoExportLabel(clasifBancoExport).replace(/\s+/g, '-')}` : '';
            doc.save(`desglose_contable${sufijoConceptoPdf}${sufijoBancoPdf}_${clasifFechaInicio}_${clasifFechaFin}.pdf`);
            toast.success('Reporte PDF generado correctamente.');
        } catch (err) {
            toast.error(getErrorMessage(err, 'No se pudo generar el PDF del desglose contable.'));
        } finally {
            setExportandoClasifPdf(false);
        }
    };

    return (
        <section>
            <div className="mb-5 flex items-start justify-between flex-wrap gap-4">
                <div>
                    <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                        <Layers size={20} style={{ color: 'var(--pb)' }} />
                        Clasificación de Pagos
                    </h2>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
                        Desglosa los pagos mixtos en conceptos concretos (inscripción, proyecto de inversión, meses atrasados) para el reporte contable · período {clasifFechaInicio} — {clasifFechaFin}.
                    </p>
                </div>
                {loadingClasif && <Loader2 size={18} className="animate-spin" style={{ color: 'var(--pb)' }} />}
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-end gap-3 mb-4">
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Desde</label>
                    <DatePickerES
                        value={clasifFechaInicio}
                        onChange={e => setClasifFechaInicio(e.target.value)}
                        className="px-3 py-2 rounded-lg text-sm outline-none"
                        style={inputStyle}
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Hasta</label>
                    <DatePickerES
                        value={clasifFechaFin}
                        onChange={e => setClasifFechaFin(e.target.value)}
                        className="px-3 py-2 rounded-lg text-sm outline-none"
                        style={inputStyle}
                    />
                </div>
                <div className="relative flex-1 min-w-[220px]">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                    <input
                        type="text"
                        value={clasifRepDocumento}
                        onChange={e => setClasifRepDocumento(e.target.value)}
                        placeholder="Cédula del representante (opcional)…"
                        className="w-full pl-9 pr-8 py-2 rounded-lg text-sm outline-none"
                        style={inputStyle}
                    />
                    {clasifRepDocumento && (
                        <button
                            onClick={() => setClasifRepDocumento('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2"
                            style={{ color: 'var(--ash)' }}>
                            <X size={14} />
                        </button>
                    )}
                </div>
                <select
                    value={clasifEstado}
                    onChange={e => setClasifEstado(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm outline-none"
                    style={inputStyle}>
                    <option value="todos">Todos los estados</option>
                    {Object.entries(ESTADO_CLASIF_STYLE).map(([val, s]) => (
                        <option key={val} value={val}>{s.label}</option>
                    ))}
                </select>
            </div>

            {/* Exportación — agrupada aparte de los filtros de búsqueda para no
                mezclar "qué estoy viendo" con "qué voy a imprimir". */}
            <div className="rounded-xl p-4 mb-4 flex flex-wrap items-end gap-3" style={cardStyle}>
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Concepto a imprimir</label>
                    <select
                        value={clasifConceptoExport}
                        onChange={e => setClasifConceptoExport(e.target.value)}
                        className="px-3 py-2 rounded-lg text-sm outline-none"
                        style={{ ...inputStyle, background: '#fff' }}>
                        {Object.entries(CONCEPTO_EXPORT_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Banco a imprimir</label>
                    <BancoSelect
                        value={clasifBancoExport}
                        onChange={e => setClasifBancoExport(e.target.value)}
                        bancosDisponibles={bancosDisponibles}
                        className="px-3 py-2 rounded-lg text-sm outline-none"
                        style={{ ...inputStyle, background: '#fff' }}
                    />
                </div>
                <button
                    onClick={handleExportClasifExcel}
                    disabled={exportandoClasifExcel}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50 min-h-[44px]"
                    style={{ background: 'var(--jet)' }}>
                    {exportandoClasifExcel ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                    Exportar Excel (desglose contable)
                </button>
                <button
                    onClick={handleExportClasifPdf}
                    disabled={exportandoClasifPdf}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 min-h-[44px]"
                    style={{ background: '#fff', border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
                    {exportandoClasifPdf ? <Loader2 size={16} className="animate-spin" /> : <FilePlus2 size={16} />}
                    Exportar PDF (desglose contable)
                </button>
            </div>

            {/* Tabla */}
            <div className="rounded-xl overflow-x-auto" style={{ border: '0.5px solid var(--border-md)' }}>
                <table className="w-full text-sm min-w-[900px]">
                    <thead>
                        <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                            <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>Fecha</th>
                            <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>Alumno</th>
                            <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>Representante</th>
                            <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>Referencia</th>
                            <th className="text-right px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>Monto</th>
                            <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>Concepto</th>
                            <th className="text-center px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>Estado</th>
                            <th className="text-right px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>Clasif. / Pend.</th>
                            <th className="text-center px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loadingClasif ? (
                            <TableRowSkeleton cols={9} rows={6} />
                        ) : clasifPagos.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="text-center py-10">
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
                            clasifPagos.map((p, idx) => {
                                const estStyle = ESTADO_CLASIF_STYLE[p.estado_clasificacion] || ESTADO_CLASIF_STYLE.sin_clasificar;
                                const esMixto = p.concepto === 'mixto';
                                const fecha = p.fecha_pago
                                    ? new Date(p.fecha_pago).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                    : '—';
                                return (
                                    <tr
                                        key={p.id}
                                        onClick={() => onSeleccionarPago(p)}
                                        className="cursor-pointer"
                                        style={{
                                            background: idx % 2 === 0 ? '#fff' : 'var(--porcelain)',
                                            borderBottom: '0.5px solid var(--border-md)',
                                        }}>
                                        <td className="px-4 py-3" style={{ color: 'var(--jet)' }}>{fecha}</td>
                                        <td className="px-4 py-3" style={{ color: 'var(--jet)' }}>{p.alumno || '—'}</td>
                                        <td className="px-4 py-3">
                                            <p style={{ color: 'var(--jet)' }}>{p.representante_nombre || '—'}</p>
                                            <p className="text-[11px] font-mono" style={{ color: 'var(--ash)' }}>{p.representante_documento || '—'}</p>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--ash)' }}>{p.referencia || '—'}</td>
                                        <td className="px-4 py-3 text-right font-mono font-semibold" style={{ color: '#16a34a' }}>${fmt(p.monto_usd)}</td>
                                        <td className="px-4 py-3">
                                            <span className="font-medium" style={{ color: esMixto ? 'var(--red)' : 'var(--jet)' }}>
                                                {p.concepto_display || p.concepto || '—'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase whitespace-nowrap"
                                                style={{ background: estStyle.bg, color: estStyle.color }}>
                                                {estStyle.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: 'var(--ash)' }}>
                                            ${fmt(p.monto_clasificado_usd)} / ${fmt(p.monto_pendiente_usd)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onSeleccionarPago(p); }}
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white whitespace-nowrap"
                                                style={{ background: 'var(--pb)' }}>
                                                Clasificar
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
                <Pagination
                    page={clasifPage}
                    totalPages={clasifTotalPages}
                    onPageChange={setClasifPage}
                    total={clasifTotal}
                    pageSize={CLASIF_PAGE_SIZE}
                />
            </div>
        </section>
    );
};

export default ClasificacionPagosTab;
