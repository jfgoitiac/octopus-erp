import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    FileBarChart, Loader2, Search, ChevronDown, ChevronUp,
    FileSpreadsheet, Printer, GraduationCap, BookOpen, Building2,
    AlertCircle, MoreHorizontal, X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import axiosInstance from '../../api/apiClient';
import { toast } from 'react-toastify';

/* Los 4 conceptos estructurados que el backend puede atribuir con monto
   exacto (vía las relaciones M2M Pago↔Mensualidad/CuotaInscripcion/
   CuotaSolvencia/CuotaProyectoInversion). Todo lo que un pago cubra fuera
   de estas 4 cuotas (materiales, multas, pagos libres) cae en "otros". */
const CONCEPTOS_PRINCIPALES = ['inscripcion', 'mensualidad', 'proyecto_inversion', 'solvencia'];

const CONCEPTO_META = {
    inscripcion:         { label: 'Inscripción',                  color: '#2563eb', bg: '#dbeafe', icon: GraduationCap },
    mensualidad:         { label: 'Mensualidad',                  color: '#16a34a', bg: '#dcfce7', icon: BookOpen },
    proyecto_inversion:  { label: 'Proyecto de Inversión',        color: '#7c3aed', bg: '#ede9fe', icon: Building2 },
    solvencia:           { label: 'Solvencia (meses atrasados)',  color: '#ca8a04', bg: '#fef9c3', icon: AlertCircle },
    otros:               { label: 'Otros',                        color: '#64748b', bg: '#f1f5f9', icon: MoreHorizontal },
};

const fmt = (val) => parseFloat(val || 0).toFixed(2);

const mesLabel = (mesKey) => {
    const label = format(parseISO(`${mesKey}-01`), 'MMMM yyyy', { locale: es });
    return label.charAt(0).toUpperCase() + label.slice(1);
};

const fechaLabel = (fechaISO) => {
    if (!fechaISO) return '—';
    try {
        return format(parseISO(fechaISO), "dd 'de' MMMM yyyy, HH:mm", { locale: es });
    } catch {
        return fechaISO;
    }
};

const PAGE_SIZE_API = 100; // tope real del backend (PagosListView clampa page_size a 100)

const ReporteContable = () => {
    const [anio, setAnio] = useState(() => new Date().getFullYear());
    const [pagos, setPagos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [busqueda, setBusqueda] = useState('');
    const [mesesExpandidos, setMesesExpandidos] = useState(() => new Set());
    const [conceptosExpandidos, setConceptosExpandidos] = useState(() => new Set());
    const [exportando, setExportando] = useState(false);
    const [imprimiendo, setImprimiendo] = useState(false);

    const fetchTodosPagos = useCallback(async (anioConsulta) => {
        setLoading(true);
        try {
            const params = {
                fecha_desde: `${anioConsulta}-01-01`,
                fecha_hasta: `${anioConsulta}-12-31`,
                estatus: 'completado', // reporte contable: solo pagos efectivos, sin anulados
                page_size: PAGE_SIZE_API,
            };
            const primera = await axiosInstance.get('cobranza/pagos/lista/', { params: { ...params, page: 1 } });
            let resultados = primera.data?.results || [];
            const totalPages = primera.data?.total_pages || 1;

            if (totalPages > 1) {
                const resto = await Promise.all(
                    Array.from({ length: totalPages - 1 }, (_, i) =>
                        axiosInstance.get('cobranza/pagos/lista/', { params: { ...params, page: i + 2 } }),
                    ),
                );
                resto.forEach(r => { resultados = resultados.concat(r.data?.results || []); });
            }
            setPagos(resultados);
        } catch {
            toast.error('No se pudo cargar el reporte contable.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchTodosPagos(anio); }, [fetchTodosPagos, anio]);

    const pagosFiltrados = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        if (!q) return pagos;
        return pagos.filter(p =>
            `${p.nombre_alumno || ''} ${p.apellido_alumno || ''}`.toLowerCase().includes(q)
            || (p.cedula_escolar || '').toLowerCase().includes(q)
            || (p.representante_nombre || '').toLowerCase().includes(q)
            || (p.representante_documento || '').toLowerCase().includes(q),
        );
    }, [pagos, busqueda]);

    /* Agrupa las filas crudas (una por método de pago) en operaciones
       (operacion_uuid = un solo cobro, aunque combine varios métodos) y
       calcula, para cada operación, cuánto fue realmente a cada concepto
       estructurado usando los montos que el backend ya suma desde las
       cuotas reales vinculadas (monto_mensualidad, monto_inscripcion,
       monto_solvencia, monto_proyecto_inversion). Esos 4 campos vienen
       IGUALES en todas las filas de una misma operación (el M2M se setea
       una vez por operación, no por fila/método) — por eso se toman de una
       sola fila representativa y NUNCA se suman entre filas de la misma
       operación, o se duplicaría el monto en pagos con 2+ métodos. */
    const operaciones = useMemo(() => {
        const map = new Map();
        pagosFiltrados.forEach(p => {
            if (!map.has(p.operacion_uuid)) {
                map.set(p.operacion_uuid, {
                    operacion_uuid: p.operacion_uuid,
                    filas: [],
                    totalUsd: 0,
                    fecha: p.fecha_pago,
                    nombre: `${p.nombre_alumno || ''} ${p.apellido_alumno || ''}`.trim() || '—',
                    cedula: p.cedula_escolar || '—',
                    representante: p.representante_nombre || '—',
                    metodos: [],
                });
            }
            const op = map.get(p.operacion_uuid);
            op.filas.push(p);
            op.totalUsd += parseFloat(p.monto_usd || 0);
            if (p.fecha_pago && (!op.fecha || p.fecha_pago < op.fecha)) op.fecha = p.fecha_pago;
            const partes = [p.metodo_pago_display || p.metodo_pago];
            if (p.banco_nombre) partes.push(p.banco_nombre);
            if (p.referencia) partes.push(`Ref. ${p.referencia}`);
            op.metodos.push(partes.filter(Boolean).join(' · '));
        });

        return Array.from(map.values()).map(op => {
            const rep = op.filas[0];
            const estructurado = {
                mensualidad:        parseFloat(rep.monto_mensualidad || 0),
                inscripcion:        parseFloat(rep.monto_inscripcion || 0),
                solvencia:          parseFloat(rep.monto_solvencia || 0),
                proyecto_inversion: parseFloat(rep.monto_proyecto_inversion || 0),
            };
            const sumaEstructurada = Object.values(estructurado).reduce((s, v) => s + v, 0);
            // Lo no vinculado a ninguna cuota estructurada (materiales, multas,
            // pagos libres) es la diferencia real, nunca una estimación.
            const otros = Math.max(0, op.totalUsd - sumaEstructurada);
            return {
                ...op,
                estructurado,
                otros,
                metodoDesc: op.metodos.join(' + '),
            };
        });
    }, [pagosFiltrados]);

    const totalesPorConcepto = useMemo(() => {
        const acc = { inscripcion: 0, mensualidad: 0, proyecto_inversion: 0, solvencia: 0, otros: 0 };
        operaciones.forEach(op => {
            CONCEPTOS_PRINCIPALES.forEach(k => { acc[k] += op.estructurado[k]; });
            acc.otros += op.otros;
        });
        return acc;
    }, [operaciones]);

    const totalGeneral = useMemo(
        () => Object.values(totalesPorConcepto).reduce((s, v) => s + v, 0),
        [totalesPorConcepto],
    );

    /* Mes → Concepto → aportes. Una misma operación puede aparecer varias
       veces (una vez por cada concepto al que efectivamente contribuyó),
       cada vez con su monto real — así una operación de $90 (mensualidad
       $50 + inscripción $40) aparece con $50 bajo Mensualidad y $40 bajo
       Inscripción, nunca $90 duplicados en ambos. */
    const dataPorMes = useMemo(() => {
        const meses = new Map();
        operaciones.forEach(op => {
            const mesKey = (op.fecha || '').slice(0, 7);
            if (!mesKey) return;
            if (!meses.has(mesKey)) meses.set(mesKey, { mesKey, conceptos: new Map(), totalUsd: 0 });
            const mes = meses.get(mesKey);
            mes.totalUsd += op.totalUsd;

            const aportes = [
                ...CONCEPTOS_PRINCIPALES.map(k => ({ key: k, monto: op.estructurado[k] })),
                { key: 'otros', monto: op.otros },
            ];
            aportes.forEach(({ key, monto }) => {
                if (monto <= 0.004) return;
                if (!mes.conceptos.has(key)) mes.conceptos.set(key, { key, aportes: [], totalUsd: 0 });
                const c = mes.conceptos.get(key);
                c.aportes.push({
                    operacion_uuid: op.operacion_uuid,
                    monto,
                    fecha: op.fecha,
                    nombre: op.nombre,
                    cedula: op.cedula,
                    representante: op.representante,
                    metodoDesc: op.metodoDesc,
                });
                c.totalUsd += monto;
            });
        });
        return Array.from(meses.values())
            .map(m => ({ ...m, conceptos: Array.from(m.conceptos.values()).sort((a, b) => a.key.localeCompare(b.key)) }))
            .sort((a, b) => b.mesKey.localeCompare(a.mesKey)); // mes más reciente primero
    }, [operaciones]);

    /* Lista plana de aportes (mes/concepto/operación), usada para las
       exportaciones — un renglón por cada monto real atribuido a un
       concepto, no un renglón por fila cruda de Pago (que mezclaría
       "mixto" con el desglose real). */
    const aportesPlano = useMemo(() => {
        const rows = [];
        dataPorMes.forEach(m => {
            m.conceptos.forEach(c => {
                c.aportes.forEach(a => rows.push({ ...a, key: c.key, mesKey: m.mesKey }));
            });
        });
        return rows.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    }, [dataPorMes]);

    const toggleMes = (mesKey) => {
        setMesesExpandidos(prev => {
            const next = new Set(prev);
            next.has(mesKey) ? next.delete(mesKey) : next.add(mesKey);
            return next;
        });
    };

    const toggleConcepto = (mesKey, key) => {
        const id = `${mesKey}__${key}`;
        setConceptosExpandidos(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleExportExcel = () => {
        setExportando(true);
        try {
            if (aportesPlano.length === 0) {
                toast.info('No hay pagos para exportar en este período.');
                return;
            }
            // Hoja 1: resumen Mes x Concepto (pivot)
            const resumenHeader = ['Mes', ...CONCEPTOS_PRINCIPALES.map(k => CONCEPTO_META[k].label), 'Otros', 'Total del Mes'];
            const resumenFilas = dataPorMes
                .slice()
                .sort((a, b) => a.mesKey.localeCompare(b.mesKey))
                .map(m => {
                    const porKey = Object.fromEntries(m.conceptos.map(c => [c.key, c.totalUsd]));
                    return [
                        mesLabel(m.mesKey),
                        ...CONCEPTOS_PRINCIPALES.map(k => Number(fmt(porKey[k] || 0))),
                        Number(fmt(porKey.otros || 0)),
                        Number(fmt(m.totalUsd)),
                    ];
                });
            const totalRow = [
                'TOTAL',
                ...CONCEPTOS_PRINCIPALES.map(k => Number(fmt(totalesPorConcepto[k]))),
                Number(fmt(totalesPorConcepto.otros)),
                Number(fmt(totalGeneral)),
            ];
            const wsResumen = XLSX.utils.aoa_to_sheet([resumenHeader, ...resumenFilas, totalRow]);

            // Hoja 2: detalle de aportes — un renglón por cada monto real
            // atribuido a un concepto (una operación mixta genera varios
            // renglones, uno por concepto al que contribuyó).
            const detalleHeader = [
                'Mes', 'Fecha de Pago', 'Concepto', 'Alumno', 'Cédula Escolar',
                'Representante', 'Método de Pago', 'Monto USD',
            ];
            const detalleFilas = aportesPlano.map(a => [
                a.mesKey,
                fechaLabel(a.fecha),
                CONCEPTO_META[a.key].label,
                a.nombre,
                a.cedula,
                a.representante,
                a.metodoDesc,
                Number(fmt(a.monto)),
            ]);
            const wsDetalle = XLSX.utils.aoa_to_sheet([detalleHeader, ...detalleFilas]);

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen Mes x Concepto');
            XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle de Pagos');
            XLSX.writeFile(wb, `reporte_contable_${anio}.xlsx`);
            toast.success('Reporte contable exportado a Excel.');
        } catch {
            toast.error('No se pudo generar el archivo Excel.');
        } finally {
            setExportando(false);
        }
    };

    const handleExportPDF = () => {
        setImprimiendo(true);
        try {
            if (aportesPlano.length === 0) {
                toast.info('No hay pagos para exportar en este período.');
                return;
            }
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

            doc.setFontSize(15);
            doc.setFont('helvetica', 'bold');
            doc.text('Reporte Contable por Concepto y Mes', 14, 18);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100);
            doc.text(`Año: ${anio}`, 14, 25);
            doc.text(`Generado: ${format(new Date(), "dd 'de' MMMM yyyy", { locale: es })}`, 14, 30);
            doc.setTextColor(0);

            autoTable(doc, {
                head: [['Mes', ...CONCEPTOS_PRINCIPALES.map(k => CONCEPTO_META[k].label), 'Otros', 'Total']],
                body: dataPorMes
                    .slice()
                    .sort((a, b) => a.mesKey.localeCompare(b.mesKey))
                    .map(m => {
                        const porKey = Object.fromEntries(m.conceptos.map(c => [c.key, c.totalUsd]));
                        return [
                            mesLabel(m.mesKey),
                            ...CONCEPTOS_PRINCIPALES.map(k => `$${fmt(porKey[k] || 0)}`),
                            `$${fmt(porKey.otros || 0)}`,
                            `$${fmt(m.totalUsd)}`,
                        ];
                    }),
                foot: [[
                    'TOTAL',
                    ...CONCEPTOS_PRINCIPALES.map(k => `$${fmt(totalesPorConcepto[k])}`),
                    `$${fmt(totalesPorConcepto.otros)}`,
                    `$${fmt(totalGeneral)}`,
                ]],
                startY: 36,
                styles: { fontSize: 7.5, cellPadding: 2 },
                headStyles: { fillColor: [30, 64, 175], fontStyle: 'bold', fontSize: 8 },
                footStyles: { fillColor: [230, 236, 255], fontStyle: 'bold', textColor: [0, 0, 0] },
                alternateRowStyles: { fillColor: [248, 250, 252] },
            });

            const detalleY = doc.lastAutoTable.finalY + 12;
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('Detalle de Pagos', 14, detalleY);

            autoTable(doc, {
                head: [['Fecha', 'Concepto', 'Alumno', 'Representante', 'Método de Pago', 'Monto (USD)']],
                body: aportesPlano.map(a => [
                    a.fecha ? format(parseISO(a.fecha), 'dd/MM/yyyy') : '—',
                    CONCEPTO_META[a.key].label,
                    a.nombre,
                    a.representante,
                    a.metodoDesc,
                    `$${fmt(a.monto)}`,
                ]),
                startY: detalleY + 5,
                styles: { fontSize: 7, cellPadding: 1.8 },
                headStyles: { fillColor: [30, 64, 175], fontStyle: 'bold', fontSize: 7.5 },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                columnStyles: { 5: { halign: 'right' } },
            });

            doc.save(`reporte_contable_${anio}.pdf`);
            toast.success('Reporte contable generado en PDF.');
        } catch {
            toast.error('No se pudo generar el PDF.');
        } finally {
            setImprimiendo(false);
        }
    };

    const inputStyle = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
    const cardStyle = { border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' };

    return (
        <section>
            <div className="mb-5 flex items-start justify-between flex-wrap gap-4">
                <div>
                    <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                        <FileBarChart size={20} style={{ color: 'var(--pb)' }} />
                        Reporte Contable por Concepto y Mes
                    </h2>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
                        Pagos completados desglosados por mes y concepto, con datos del alumno y del método de pago.
                        Los cobros que combinan varias cuotas en un solo pago se dividen usando el monto real de cada cuota.
                    </p>
                </div>
                {loading && <Loader2 size={18} className="animate-spin" style={{ color: 'var(--pb)' }} />}
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-end gap-3 mb-6">
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Año</label>
                    <select
                        value={anio}
                        onChange={e => setAnio(parseInt(e.target.value, 10))}
                        className="px-3 py-2 rounded-lg text-sm outline-none"
                        style={inputStyle}>
                        {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>
                <div className="relative flex-1 min-w-[240px]">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                    <input
                        type="text"
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar por alumno, cédula o representante…"
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
                <button
                    onClick={handleExportExcel}
                    disabled={loading || exportando}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 min-h-[44px]"
                    style={{ background: 'var(--jet)' }}>
                    {exportando ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                    Exportar Excel
                </button>
                <button
                    onClick={handleExportPDF}
                    disabled={loading || imprimiendo}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 min-h-[44px]"
                    style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
                    {imprimiendo ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                    Exportar PDF
                </button>
            </div>

            {/* Cards resumen por concepto */}
            <div className={`grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                {[...CONCEPTOS_PRINCIPALES, 'otros'].map(key => {
                    const meta = CONCEPTO_META[key];
                    const Icon = meta.icon;
                    return (
                        <div key={key} className="rounded-xl p-4" style={cardStyle}>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-1.5 rounded-lg" style={{ background: meta.bg, color: meta.color }}>
                                    <Icon size={16} />
                                </div>
                                <span className="text-[10px] uppercase tracking-widest font-medium leading-tight" style={{ color: 'var(--ash)' }}>
                                    {meta.label}
                                </span>
                            </div>
                            <p className="text-xl font-bold font-mono" style={{ color: meta.color }}>
                                ${fmt(totalesPorConcepto[key])}
                            </p>
                        </div>
                    );
                })}
            </div>

            {/* Acordeón Mes → Concepto → Detalle */}
            {loading ? (
                <div className="flex justify-center py-10">
                    <Loader2 size={20} className="animate-spin" style={{ color: 'var(--pb)' }} />
                </div>
            ) : dataPorMes.length === 0 ? (
                <div className="flex flex-col items-center py-10 rounded-xl" style={cardStyle}>
                    <FileBarChart size={30} className="mb-2 opacity-20" style={{ color: 'var(--pb)' }} />
                    <p className="text-sm" style={{ color: 'var(--ash)' }}>
                        No hay pagos completados que coincidan con el filtro para {anio}.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {dataPorMes.map(mes => {
                        const expandido = mesesExpandidos.has(mes.mesKey);
                        return (
                            <div key={mes.mesKey} className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
                                <button
                                    onClick={() => toggleMes(mes.mesKey)}
                                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                                    style={{ background: 'var(--porcelain)' }}>
                                    <div className="flex items-center gap-3 min-w-0">
                                        {expandido ? <ChevronUp size={16} style={{ color: 'var(--ash)' }} /> : <ChevronDown size={16} style={{ color: 'var(--ash)' }} />}
                                        <p className="text-sm font-medium capitalize" style={{ color: 'var(--jet)' }}>{mesLabel(mes.mesKey)}</p>
                                    </div>
                                    <span className="text-sm font-mono font-semibold shrink-0" style={{ color: '#16a34a' }}>${fmt(mes.totalUsd)}</span>
                                </button>

                                {expandido && (
                                    <div className="divide-y" style={{ borderTop: '0.5px solid var(--border-md)' }}>
                                        {mes.conceptos.map(c => {
                                            const meta = CONCEPTO_META[c.key];
                                            const id = `${mes.mesKey}__${c.key}`;
                                            const cExpandido = conceptosExpandidos.has(id);
                                            return (
                                                <div key={c.key}>
                                                    <button
                                                        onClick={() => toggleConcepto(mes.mesKey, c.key)}
                                                        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left"
                                                        style={{ background: '#fff' }}>
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            {cExpandido ? <ChevronUp size={14} style={{ color: 'var(--ash)' }} /> : <ChevronDown size={14} style={{ color: 'var(--ash)' }} />}
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase whitespace-nowrap"
                                                                style={{ background: meta.bg, color: meta.color }}>
                                                                {meta.label}
                                                            </span>
                                                            <span className="text-[11px]" style={{ color: 'var(--ash)' }}>
                                                                {c.aportes.length} aporte{c.aportes.length === 1 ? '' : 's'}
                                                            </span>
                                                        </div>
                                                        <span className="text-xs font-mono font-semibold shrink-0" style={{ color: 'var(--jet)' }}>
                                                            ${fmt(c.totalUsd)}
                                                        </span>
                                                    </button>

                                                    {cExpandido && (
                                                        <div className="divide-y" style={{ background: 'var(--porcelain)' }}>
                                                            {c.aportes
                                                                .slice()
                                                                .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
                                                                .map((a, idx) => (
                                                                    <div key={`${a.operacion_uuid}_${c.key}_${idx}`} className="px-4 py-2.5 pl-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                                                                        <div className="min-w-0">
                                                                            <p className="text-xs font-medium truncate" style={{ color: 'var(--jet)' }}>
                                                                                {a.nombre}
                                                                                {a.cedula ? <span className="font-mono" style={{ color: 'var(--ash)' }}> · {a.cedula}</span> : ''}
                                                                            </p>
                                                                            <p className="text-[11px]" style={{ color: 'var(--ash)' }}>
                                                                                {fechaLabel(a.fecha)} · {a.metodoDesc}
                                                                            </p>
                                                                        </div>
                                                                        <span className="text-xs font-mono font-semibold shrink-0" style={{ color: '#16a34a' }}>
                                                                            ${fmt(a.monto)}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {dataPorMes.length > 0 && (
                <div className="mt-3 flex justify-end text-xs" style={{ color: 'var(--ash)' }}>
                    Total del período: <strong className="ml-1 font-mono" style={{ color: '#16a34a' }}>${fmt(totalGeneral)}</strong>
                </div>
            )}
        </section>
    );
};

export default ReporteContable;
