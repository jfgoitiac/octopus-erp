import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Download, DollarSign, Wallet, Hash, Loader2,
    Search, FileSpreadsheet, CalendarDays, TrendingUp,
    TrendingDown, BarChart2, Target, ArrowUpRight, ArrowDownRight,
    Clock, CheckCircle2, AlertTriangle, ChevronsRight, Printer,
    ListChecks, X, CheckSquare, Square,
    ChevronDown, ChevronUp, History, Lock, Save, ChevronLeft, ChevronRight,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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

const CURRENT_YEAR = new Date().getFullYear();

const Reportes = () => {
    /* ── Cierre del día ── */
    const [caja, setCaja] = useState({
        efectivo: 0, zelle: 0,
        transferencia: 0, transf_bancaria: 0, pago_movil: 0, punto_venta: 0, efectivo_bs: 0,
        total_usd: 0, total_ves: 0, conteo_pagos: 0,
    });
    const [loadingCierre, setLoadingCierre] = useState(false);
    const [fechaInicio, setFechaInicio] = useState(today);
    const [fechaFin, setFechaFin] = useState(today);

    const fetchCierre = useCallback(async (fi, ff) => {
        if (fi > ff) {
            toast.warning('La fecha de inicio no puede ser mayor a la fecha fin.');
            return;
        }
        setLoadingCierre(true);
        try {
            const res = await axiosInstance.get('cobranza/auditoria-diaria/', {
                params: { fecha_inicio: fi, fecha_fin: ff },
            });
            setCaja({
                efectivo:       res.data.efectivo_usd           || 0,
                zelle:          res.data.zelle_usd              || 0,
                transferencia:  res.data.transferencia_ves      || 0,
                transf_bancaria: res.data.transf_bancaria_ves   || 0,
                pago_movil:     res.data.pago_movil_ves         || 0,
                punto_venta:    res.data.punto_venta_ves        || 0,
                efectivo_bs:    res.data.efectivo_bolivares_ves || 0,
                total_usd:      res.data.total_usd              || 0,
                total_ves:      res.data.total_ves              || 0,
                conteo_pagos:   res.data.conteo_pagos           || 0,
            });
        } catch {
            toast.error('No se pudo cargar el resumen de caja.');
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
    const [printingDetalle, setPrintingDetalle] = useState(false);

    /* ── Resumen de Transacciones por Alumno (conciliación) ── */
    const [detallePagos, setDetallePagos] = useState([]); // pagos de los alumnos de la página actual
    const [loadingDetalle, setLoadingDetalle] = useState(false);
    const [detalleBusqueda, setDetalleBusqueda] = useState('');
    const [detalleBusquedaDebounced, setDetalleBusquedaDebounced] = useState('');
    const [detalleMetodo, setDetalleMetodo] = useState('todos');
    const [detalleEstatus, setDetalleEstatus] = useState('todos');
    const [detallePage, setDetallePage] = useState(1);
    const [detalleTotalAlumnos, setDetalleTotalAlumnos] = useState(0);
    const [detalleTotalPages, setDetalleTotalPages] = useState(1);
    const [detalleChecked, setDetalleChecked] = useState(() => new Set());
    const [finalizandoLote, setFinalizandoLote] = useState(false);
    const [alumnosExpandidos, setAlumnosExpandidos] = useState(() => new Set());
    const DETALLE_PAGE_SIZE = 15;

    /* Acumula { operacion_uuid -> { pagoIds, revisado } } a través de todas las
       páginas visitadas, para poder finalizar un lote con selecciones hechas en
       páginas distintas (el checklist no se pierde al paginar). */
    const [operacionesInfo, setOperacionesInfo] = useState(() => new Map());

    /* Historial de lotes ya finalizados */
    const [loteHistorial, setLoteHistorial] = useState([]);
    const [loadingLoteHistorial, setLoadingLoteHistorial] = useState(false);
    const [loteExpandidoId, setLoteExpandidoId] = useState(null);
    const [loteDetalle, setLoteDetalle] = useState(null);
    const [loadingLoteDetalle, setLoadingLoteDetalle] = useState(false);

    /* Debounce de la búsqueda: consulta al backend, no al arreglo ya cargado,
       para que alcance a todo el rango de fechas y no solo a la página visible. */
    useEffect(() => {
        const t = setTimeout(() => {
            setDetalleBusquedaDebounced(detalleBusqueda.trim());
            setDetallePage(1);
        }, 400);
        return () => clearTimeout(t);
    }, [detalleBusqueda]);

    /* Cambiar el rango de fechas, método o estatus reinicia la página a 1 */
    useEffect(() => { setDetallePage(1); }, [fechaInicio, fechaFin, detalleMetodo, detalleEstatus]);

    const fetchDetallePagos = useCallback(async (fi, ff, page, buscar, metodo, estatus) => {
        setLoadingDetalle(true);
        try {
            const res = await axiosInstance.get('cobranza/conciliacion/resumen/', {
                params: {
                    fecha_desde: fi,
                    fecha_hasta: ff,
                    page,
                    page_size: DETALLE_PAGE_SIZE,
                    buscar: buscar || undefined,
                    metodo_pago: metodo !== 'todos' ? metodo : undefined,
                    estatus: estatus !== 'todos' ? estatus : undefined,
                },
            });
            const pagos = (res.data?.results || []).flatMap(r => r.pagos);
            setDetallePagos(pagos);
            setDetalleTotalAlumnos(res.data?.total_alumnos || 0);
            setDetalleTotalPages(res.data?.total_pages || 1);

            setOperacionesInfo(prev => {
                const next = new Map(prev);
                pagos.forEach(p => {
                    const previa = next.get(p.operacion_uuid);
                    const pagoIds = new Set(previa?.pagoIds || []);
                    pagoIds.add(p.id);
                    next.set(p.operacion_uuid, {
                        pagoIds: Array.from(pagoIds),
                        revisado: Boolean(previa?.revisado || p.revisado),
                    });
                });
                return next;
            });
        } catch {
            toast.error('No se pudo cargar el resumen de conciliación.');
        } finally {
            setLoadingDetalle(false);
        }
    }, []);

    /* Carga automática: reacciona a fecha/página/búsqueda/filtros sin requerir
       que el operador haga clic en "Buscar". */
    useEffect(() => {
        fetchDetallePagos(fechaInicio, fechaFin, detallePage, detalleBusquedaDebounced, detalleMetodo, detalleEstatus);
    }, [fetchDetallePagos, fechaInicio, fechaFin, detallePage, detalleBusquedaDebounced, detalleMetodo, detalleEstatus]);

    const fetchLoteHistorial = useCallback(async () => {
        setLoadingLoteHistorial(true);
        try {
            const res = await axiosInstance.get('cobranza/conciliacion/lotes/');
            setLoteHistorial(res.data || []);
        } catch {
            toast.error('No se pudo cargar el historial de conciliación.');
        } finally {
            setLoadingLoteHistorial(false);
        }
    }, []);

    useEffect(() => { fetchLoteHistorial(); }, [fetchLoteHistorial]);

    const toggleLoteExpandido = async (loteId) => {
        if (loteExpandidoId === loteId) {
            setLoteExpandidoId(null);
            setLoteDetalle(null);
            return;
        }
        setLoteExpandidoId(loteId);
        setLoadingLoteDetalle(true);
        try {
            const res = await axiosInstance.get(`cobranza/conciliacion/lotes/${loteId}/`);
            setLoteDetalle(res.data);
        } catch {
            toast.error('No se pudo cargar el detalle del lote.');
        } finally {
            setLoadingLoteDetalle(false);
        }
    };

    /* ── Business Intelligence ── */
    const [biStats, setBiStats] = useState(null);
    const [biPagos, setBiPagos] = useState([]);
    const [biPagosAnt, setBiPagosAnt] = useState({ actual: [], anterior: [] });
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

    const METODO_LABELS = {
        transferencia:  'Transferencia Bancaria',
        pago_movil:     'Pago Móvil',
        punto_de_venta: 'Punto de Venta',
        zelle:          'Zelle',
        efectivo:       'Efectivo USD',
        efectivo_ves:   'Efectivo Bs.',
    };

    const ESTATUS_STYLE = {
        completado:  { label: 'Completado',  color: '#16a34a', bg: '#dcfce7' },
        en_revision: { label: 'En Revisión',  color: '#ca8a04', bg: '#fef9c3' },
        anulado:     { label: 'Anulado',      color: 'var(--red)', bg: 'var(--red-light)' },
    };

    /* Totales de la página actual (los filtros de método/estatus/búsqueda ya
       se aplicaron en el backend — cobranza/conciliacion/resumen/) */
    const detalleTotales = useMemo(() => detallePagos.reduce(
        (acc, p) => ({
            usd: acc.usd + parseFloat(p.monto_usd || 0),
            ves: acc.ves + parseFloat(p.monto_ves || 0),
        }),
        { usd: 0, ves: 0 },
    ), [detallePagos]);

    /* Agrupa por alumno → operación (mismo operacion_uuid = un solo comprobante físico,
       aunque combine varios métodos de pago). El checklist opera a nivel de operación.
       Solo cubre la página actual; el backend ya entrega los alumnos paginados. */
    const gruposPorAlumno = useMemo(() => {
        const alumnos = new Map();
        detallePagos.forEach(p => {
            const alumnoKey = p.alumno ?? `${p.nombre_alumno}_${p.apellido_alumno}`;
            if (!alumnos.has(alumnoKey)) {
                alumnos.set(alumnoKey, {
                    alumnoKey,
                    nombre: `${p.nombre_alumno || ''} ${p.apellido_alumno || ''}`.trim() || '—',
                    cedula: p.cedula_escolar || '—',
                    operaciones: new Map(),
                });
            }
            const alumno = alumnos.get(alumnoKey);
            if (!alumno.operaciones.has(p.operacion_uuid)) {
                alumno.operaciones.set(p.operacion_uuid, {
                    operacion_uuid: p.operacion_uuid,
                    fecha: p.fecha_pago,
                    pagos: [],
                    pagoIds: [],
                    totalUsd: 0,
                    totalVes: 0,
                    revisado: false,
                });
            }
            const op = alumno.operaciones.get(p.operacion_uuid);
            op.pagos.push(p);
            op.pagoIds.push(p.id);
            op.totalUsd += parseFloat(p.monto_usd || 0);
            op.totalVes += parseFloat(p.monto_ves || 0);
            if (p.revisado) op.revisado = true;
        });
        return Array.from(alumnos.values())
            .map(a => ({
                ...a,
                operaciones: Array.from(a.operaciones.values())
                    .sort((x, y) => new Date(x.fecha) - new Date(y.fecha)), // orden de llegada
            }));
    }, [detallePagos]);

    const totalOperacionesPagina = useMemo(
        () => gruposPorAlumno.reduce((s, a) => s + a.operaciones.length, 0),
        [gruposPorAlumno],
    );
    const totalOperacionesRevisadasPagina = useMemo(
        () => gruposPorAlumno.reduce(
            (s, a) => s + a.operaciones.filter(op => op.revisado || detalleChecked.has(op.operacion_uuid)).length,
            0,
        ),
        [gruposPorAlumno, detalleChecked],
    );

    /* Cuántas operaciones marcadas (en cualquier página visitada, no solo la actual)
       quedarían pendientes por enviar en el próximo "Finalizar Lote". */
    const totalMarcadasPendientes = useMemo(() => {
        let n = 0;
        detalleChecked.forEach(uuid => {
            const entry = operacionesInfo.get(uuid);
            if (entry && !entry.revisado) n += 1;
        });
        return n;
    }, [detalleChecked, operacionesInfo]);

    const toggleOperacionCheck = (op) => {
        if (op.revisado) return; // ya conciliada en un lote anterior, no se puede desmarcar
        setDetalleChecked(prev => {
            const next = new Set(prev);
            if (next.has(op.operacion_uuid)) next.delete(op.operacion_uuid);
            else next.add(op.operacion_uuid);
            return next;
        });
    };

    const toggleAlumnoExpandido = (alumnoKey) => {
        setAlumnosExpandidos(prev => {
            const next = new Set(prev);
            if (next.has(alumnoKey)) next.delete(alumnoKey);
            else next.add(alumnoKey);
            return next;
        });
    };

    const marcarPaginaCompleta = () => {
        setDetalleChecked(prev => {
            const next = new Set(prev);
            gruposPorAlumno.forEach(a => a.operaciones.forEach(op => {
                if (!op.revisado) next.add(op.operacion_uuid);
            }));
            return next;
        });
    };

    const handleFinalizarLote = async () => {
        const pagoIds = [];
        detalleChecked.forEach(uuid => {
            const entry = operacionesInfo.get(uuid);
            if (entry && !entry.revisado) pagoIds.push(...entry.pagoIds);
        });

        if (pagoIds.length === 0) {
            toast.warning('Marca al menos una transacción antes de finalizar el lote.');
            return;
        }

        setFinalizandoLote(true);
        try {
            await axiosInstance.post('cobranza/conciliacion/lotes/', {
                fecha_inicio: fechaInicio,
                fecha_fin: fechaFin,
                pago_ids: pagoIds,
            });
            toast.success('Lote de conciliación guardado correctamente.');
            setDetalleChecked(new Set());
            await Promise.all([
                fetchDetallePagos(fechaInicio, fechaFin, detallePage, detalleBusquedaDebounced, detalleMetodo, detalleEstatus),
                fetchLoteHistorial(),
            ]);
        } catch {
            toast.error('No se pudo guardar el lote de conciliación.');
        } finally {
            setFinalizandoLote(false);
        }
    };

    const handlePrintDetalle = async () => {
        setPrintingDetalle(true);
        try {
            const res = await axiosInstance.get('cobranza/pagos/lista/', {
                params: { fecha_desde: fechaInicio, fecha_hasta: fechaFin, page_size: 5000 },
            });
            const pagos = res.data?.results || res.data || [];

            if (!pagos.length) {
                toast.info('No hay transacciones en el período seleccionado.');
                return;
            }

            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

            const labelMetodo = (p) =>
                p.metodo_pago_display || METODO_LABELS[p.metodo_pago] || p.metodo_pago || '—';

            // Encabezado
            doc.setFontSize(15);
            doc.setFont('helvetica', 'bold');
            doc.text('Resumen de Transacciones Detalladas', 14, 18);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100);
            doc.text(`Período: ${fechaInicio}  —  ${fechaFin}`, 14, 25);
            doc.text(
                `Generado: ${new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })}`,
                14, 30,
            );
            doc.setTextColor(0);

            // Tabla de transacciones
            autoTable(doc, {
                head: [['#', 'Fecha', 'Método de Pago', 'Monto (Bs.)', 'N° Comprobante']],
                body: pagos.map((p, i) => {
                    const fecha = p.fecha
                        ? new Date(p.fecha + 'T12:00:00').toLocaleDateString('es-VE', {
                              day: '2-digit', month: '2-digit', year: 'numeric',
                          })
                        : '—';
                    const montoBs = parseFloat(p.monto_ves || p.monto_bs || 0).toFixed(2);
                    const ref = p.referencia || '—';
                    return [i + 1, fecha, labelMetodo(p), `Bs. ${montoBs}`, ref];
                }),
                startY: 36,
                styles: { fontSize: 7.5, cellPadding: 2 },
                headStyles: { fillColor: [30, 64, 175], fontStyle: 'bold', fontSize: 8 },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 9 },
                    1: { cellWidth: 22 },
                    2: { cellWidth: 48 },
                    3: { halign: 'right', cellWidth: 30 },
                    4: { cellWidth: 'auto' },
                },
            });

            // Distribución por método
            const byMethod = {};
            pagos.forEach(p => {
                const key = labelMetodo(p);
                if (!byMethod[key]) byMethod[key] = { count: 0, total: 0 };
                byMethod[key].count += 1;
                byMethod[key].total += parseFloat(p.monto_ves || p.monto_bs || 0);
            });

            const grandTotal = Object.values(byMethod).reduce((s, v) => s + v.total, 0);
            const distY = doc.lastAutoTable.finalY + 12;

            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('Distribución por Método de Pago', 14, distY);

            autoTable(doc, {
                head: [['Método de Pago', 'Cantidad', 'Total (Bs.)', '% del Total']],
                body: [
                    ...Object.entries(byMethod)
                        .sort((a, b) => b[1].total - a[1].total)
                        .map(([method, d]) => [
                            method,
                            d.count,
                            `Bs. ${d.total.toFixed(2)}`,
                            grandTotal > 0 ? `${((d.total / grandTotal) * 100).toFixed(1)}%` : '0%',
                        ]),
                    ['TOTAL', pagos.length, `Bs. ${grandTotal.toFixed(2)}`, '100%'],
                ],
                startY: distY + 5,
                styles: { fontSize: 8.5, cellPadding: 2.5 },
                headStyles: { fillColor: [30, 64, 175], fontStyle: 'bold' },
                columnStyles: {
                    1: { halign: 'center' },
                    2: { halign: 'right' },
                    3: { halign: 'center' },
                },
                didParseCell: (data) => {
                    if (data.row.index === Object.keys(byMethod).length) {
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.fillColor = [230, 236, 255];
                    }
                },
            });

            doc.save(`transacciones_${fechaInicio}_${fechaFin}.pdf`);
            toast.success('Reporte PDF generado correctamente.');
        } catch {
            toast.error('No se pudo generar el reporte de transacciones.');
        } finally {
            setPrintingDetalle(false);
        }
    };

    /* ── Business Intelligence ── */
    const fetchBI = useCallback(async (anio) => {
        setLoadingBI(true);
        try {
            const hoy = new Date();
            const mesActual = String(hoy.getMonth() + 1).padStart(2, '0');
            const anioActual = hoy.getFullYear();
            const ultimoDia = new Date(anioActual, hoy.getMonth() + 1, 0).getDate();

            const fechaDesde = `${anioActual}-${mesActual}-01`;
            const fechaHasta = `${anioActual}-${mesActual}-${String(ultimoDia).padStart(2, '0')}`;

            const anioEscolarActualDesde = `${anio}-09-01`;
            const anioEscolarActualHasta = `${anio + 1}-07-31`;
            const anioEscolarAntDesde    = `${anio - 1}-09-01`;
            const anioEscolarAntHasta    = `${anio}-07-31`;

            const [resStats, resPagos, resAnioAct, resAnioAnt] = await Promise.all([
                axiosInstance.get('cobranza/stats/'),
                axiosInstance.get('cobranza/pagos/lista/', {
                    params: { fecha_desde: fechaDesde, fecha_hasta: fechaHasta, page_size: 1000 },
                }),
                axiosInstance.get('cobranza/pagos/lista/', {
                    params: { fecha_desde: anioEscolarActualDesde, fecha_hasta: anioEscolarActualHasta, page_size: 2000 },
                }),
                axiosInstance.get('cobranza/pagos/lista/', {
                    params: { fecha_desde: anioEscolarAntDesde, fecha_hasta: anioEscolarAntHasta, page_size: 2000 },
                }),
            ]);

            setBiStats(resStats.data);
            setBiPagos(resPagos.data?.results || resPagos.data || []);
            setBiPagosAnt({
                actual:   resAnioAct.data?.results || resAnioAct.data || [],
                anterior: resAnioAnt.data?.results || resAnioAnt.data || [],
            });
        } catch {
            toast.warning('No se pudieron cargar los datos de Business Intelligence.');
        } finally {
            setLoadingBI(false);
        }
    }, []);

    useEffect(() => { fetchBI(biAnioFiltro); }, [fetchBI, biAnioFiltro]);

    /* ── Totales del mes ── */
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

    /* ── Puntualidad de mensualidades ── */
    const [puntualidad, setPuntualidad] = useState({ total: 0, atrasado: 0, a_tiempo: 0, adelantado: 0 });
    const [loadingPuntualidad, setLoadingPuntualidad] = useState(false);
    const [puntGranularidad, setPuntGranularidad] = useState('anio');
    const [puntAnio, setPuntAnio] = useState(() => new Date().getFullYear());
    const [puntMes, setPuntMes] = useState(() => new Date().getMonth() + 1);
    const [puntFecha, setPuntFecha] = useState(today);

    const fetchPuntualidad = useCallback(async (granularidad, anio, mes, fecha) => {
        setLoadingPuntualidad(true);
        try {
            const params = { granularidad };
            if (granularidad === 'dia')       params.fecha = fecha;
            else if (granularidad === 'mes')  { params.anio = anio; params.mes = mes; }
            else                              params.anio = anio;
            const res = await axiosInstance.get('cobranza/mensualidades/puntualidad/', { params });
            setPuntualidad(res.data);
        } catch {
            toast.warning('No se pudo cargar el reporte de puntualidad.');
        } finally {
            setLoadingPuntualidad(false);
        }
    }, []);

    useEffect(() => {
        fetchPuntualidad(puntGranularidad, puntAnio, puntMes, puntFecha);
    }, [fetchPuntualidad, puntGranularidad, puntAnio, puntMes, puntFecha]);

    const inputStyle = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
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
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 min-h-[44px]"
                        style={{ background: 'var(--pb)' }}
                    >
                        {loadingCierre ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                        Buscar
                    </button>
                </div>

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
                        {/* USD */}
                        <p className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: 'var(--pb)' }}>Divisas (USD)</p>
                        <div className="space-y-2 mb-4">
                            {[
                                { label: 'Efectivo Divisas', value: `$${fmt(caja.efectivo)}` },
                                { label: 'Zelle',            value: `$${fmt(caja.zelle)}` },
                            ].map(({ label, value }) => (
                                <div key={label} className="flex justify-between items-center">
                                    <span className="text-xs" style={{ color: 'var(--ash)' }}>{label}</span>
                                    <span className="text-xs font-bold font-mono" style={{ color: 'var(--jet)' }}>{value}</span>
                                </div>
                            ))}
                        </div>
                        {/* VES */}
                        <p className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: 'var(--pb)' }}>Bolívares (VES)</p>
                        <div className="space-y-2">
                            {[
                                { label: 'Transferencia Bancaria', value: `Bs. ${fmt(caja.transf_bancaria)}` },
                                { label: 'Pago Móvil',            value: `Bs. ${fmt(caja.pago_movil)}` },
                                { label: 'Punto de Venta',        value: `Bs. ${fmt(caja.punto_venta)}` },
                                { label: 'Efectivo Bolívares',    value: `Bs. ${fmt(caja.efectivo_bs)}` },
                            ].map(({ label, value }) => (
                                <div key={label} className="flex justify-between items-center">
                                    <span className="text-xs" style={{ color: 'var(--ash)' }}>{label}</span>
                                    <span className="text-xs font-bold font-mono" style={{ color: 'var(--jet)' }}>{value}</span>
                                </div>
                            ))}
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
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50 min-h-[44px]"
                        style={{ background: 'var(--jet)' }}
                    >
                        {exportingExcel ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                        Exportar Excel
                    </button>
                    <button
                        onClick={handleExportCSV}
                        disabled={loadingCierre}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 min-h-[44px]"
                        style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                    >
                        <Download size={16} />
                        Exportar CSV
                    </button>
                    <button
                        onClick={handlePrintDetalle}
                        disabled={loadingCierre || printingDetalle}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 min-h-[44px]"
                        style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
                    >
                        {printingDetalle
                            ? <Loader2 size={16} className="animate-spin" />
                            : <Printer size={16} />}
                        Imprimir Transacciones
                    </button>
                </div>
            </section>

            {/* ── SECCIÓN 1.5: Resumen de Transacciones Detalladas (Conciliación) ── */}
            <section>
                <div className="mb-5 flex items-start justify-between flex-wrap gap-4">
                    <div>
                        <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                            <ListChecks size={20} style={{ color: 'var(--pb)' }} />
                            Resumen de Transacciones Detalladas
                        </h2>
                        <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
                            Agrupado por alumno, en orden de llegada. Marca cada transacción al cotejarla con el comprobante físico del período {fechaInicio} — {fechaFin}
                            {detalleTotalAlumnos > 0 ? ` · ${detalleTotalAlumnos} alumno${detalleTotalAlumnos === 1 ? '' : 's'} en total` : ''}.
                        </p>
                    </div>
                    {loadingDetalle && <Loader2 size={18} className="animate-spin" style={{ color: 'var(--pb)' }} />}
                </div>

                {/* Filtros de conciliación */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                    <div className="relative flex-1 min-w-[220px]">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                        <input
                            type="text"
                            value={detalleBusqueda}
                            onChange={e => setDetalleBusqueda(e.target.value)}
                            placeholder="Buscar por referencia, alumno o cédula escolar…"
                            className="w-full pl-9 pr-8 py-2 rounded-lg text-sm outline-none"
                            style={inputStyle}
                        />
                        {detalleBusqueda && (
                            <button
                                onClick={() => setDetalleBusqueda('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                                style={{ color: 'var(--ash)' }}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    <select
                        value={detalleMetodo}
                        onChange={e => setDetalleMetodo(e.target.value)}
                        className="px-3 py-2 rounded-lg text-sm outline-none"
                        style={inputStyle}>
                        <option value="todos">Todos los métodos</option>
                        {Object.entries(METODO_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                        ))}
                    </select>
                    <select
                        value={detalleEstatus}
                        onChange={e => setDetalleEstatus(e.target.value)}
                        className="px-3 py-2 rounded-lg text-sm outline-none"
                        style={inputStyle}>
                        <option value="todos">Todos los estatus</option>
                        {Object.entries(ESTATUS_STYLE).map(([val, s]) => (
                            <option key={val} value={val}>{s.label}</option>
                        ))}
                    </select>
                </div>

                {/* Barra de progreso de conciliación (página actual) + acciones */}
                <div className="rounded-xl p-4 mb-4 flex flex-wrap items-center justify-between gap-3" style={cardStyle}>
                    <div className="flex-1 min-w-[220px]">
                        <div className="flex justify-between items-center mb-1.5">
                            <span className="text-xs font-medium" style={{ color: 'var(--jet)' }}>
                                Progreso de esta página
                            </span>
                            <span className="text-xs font-bold font-mono" style={{ color: 'var(--pb)' }}>
                                {totalOperacionesRevisadasPagina}/{totalOperacionesPagina}
                            </span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--ash-light)' }}>
                            <div className="h-full rounded-full transition-all duration-500"
                                style={{
                                    width: totalOperacionesPagina > 0 ? `${(totalOperacionesRevisadasPagina / totalOperacionesPagina) * 100}%` : '0%',
                                    background: totalOperacionesRevisadasPagina === totalOperacionesPagina && totalOperacionesPagina > 0 ? '#16a34a' : 'var(--pb)',
                                }} />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={marcarPaginaCompleta}
                            disabled={totalOperacionesPagina === 0}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-40"
                            style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
                            <CheckSquare size={14} />
                            Marcar página
                        </button>
                        <button
                            onClick={handleFinalizarLote}
                            disabled={finalizandoLote || totalMarcadasPendientes === 0}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-40"
                            style={{ background: 'var(--pb)' }}>
                            {finalizandoLote ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            Finalizar Lote {totalMarcadasPendientes > 0 ? `(${totalMarcadasPendientes})` : ''}
                        </button>
                    </div>
                </div>

                {/* Resumen agrupado por alumno */}
                {loadingDetalle ? (
                    <div className="flex justify-center py-10">
                        <Loader2 size={20} className="animate-spin" style={{ color: 'var(--pb)' }} />
                    </div>
                ) : gruposPorAlumno.length === 0 ? (
                    <div className="flex flex-col items-center py-10 rounded-xl" style={cardStyle}>
                        <ListChecks size={30} className="mb-2 opacity-20" style={{ color: 'var(--pb)' }} />
                        <p className="text-sm" style={{ color: 'var(--ash)' }}>
                            No hay transacciones que coincidan con el filtro.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {gruposPorAlumno.map(alumno => {
                            const expandido = alumnosExpandidos.has(alumno.alumnoKey);
                            const revisadasAlumno = alumno.operaciones.filter(op => op.revisado || detalleChecked.has(op.operacion_uuid)).length;
                            const totalAlumnoUsd = alumno.operaciones.reduce((s, op) => s + op.totalUsd, 0);
                            const totalAlumnoVes = alumno.operaciones.reduce((s, op) => s + op.totalVes, 0);
                            const completo = revisadasAlumno === alumno.operaciones.length;
                            return (
                                <div key={alumno.alumnoKey} className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
                                    <button
                                        onClick={() => toggleAlumnoExpandido(alumno.alumnoKey)}
                                        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                                        style={{ background: 'var(--porcelain)' }}>
                                        <div className="flex items-center gap-3 min-w-0">
                                            {expandido ? <ChevronUp size={16} style={{ color: 'var(--ash)' }} /> : <ChevronDown size={16} style={{ color: 'var(--ash)' }} />}
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate" style={{ color: 'var(--jet)' }}>{alumno.nombre}</p>
                                                <p className="text-[11px] font-mono" style={{ color: 'var(--ash)' }}>Cédula: {alumno.cedula}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <span className="text-xs font-mono font-semibold" style={{ color: '#16a34a' }}>${totalAlumnoUsd.toFixed(2)}</span>
                                            <span className="text-xs font-mono hidden sm:inline" style={{ color: 'var(--ash)' }}>Bs. {totalAlumnoVes.toFixed(2)}</span>
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase whitespace-nowrap"
                                                style={{ background: completo ? '#dcfce7' : 'var(--pb-light)', color: completo ? '#16a34a' : 'var(--pb)' }}>
                                                {revisadasAlumno}/{alumno.operaciones.length}
                                            </span>
                                        </div>
                                    </button>

                                    {expandido && (
                                        <div className="divide-y" style={{ borderTop: '0.5px solid var(--border-md)' }}>
                                            {alumno.operaciones.map(op => {
                                                const checked = op.revisado || detalleChecked.has(op.operacion_uuid);
                                                const fecha = op.fecha
                                                    ? new Date(op.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                                    : '—';
                                                return (
                                                    <div key={op.operacion_uuid} className="p-3 flex flex-col sm:flex-row sm:items-center gap-3"
                                                        style={{ background: checked ? '#f0fdf4' : '#fff' }}>
                                                        <button
                                                            onClick={() => toggleOperacionCheck(op)}
                                                            disabled={op.revisado}
                                                            className="flex items-center gap-2 shrink-0 disabled:cursor-not-allowed"
                                                            title={op.revisado ? 'Ya incluida en un lote de conciliación anterior' : 'Marcar como conciliada'}>
                                                            {op.revisado ? (
                                                                <Lock size={16} style={{ color: '#16a34a' }} />
                                                            ) : checked ? (
                                                                <CheckSquare size={16} style={{ color: 'var(--pb)' }} />
                                                            ) : (
                                                                <Square size={16} style={{ color: 'var(--ash)' }} />
                                                            )}
                                                        </button>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                                                <span className="whitespace-nowrap" style={{ color: 'var(--ash)' }}>{fecha}</span>
                                                                {op.pagos.map(p => (
                                                                    <span key={p.id} className="px-2 py-0.5 rounded-full whitespace-nowrap"
                                                                        style={{ background: 'var(--porcelain)', color: 'var(--jet)' }}>
                                                                        {p.metodo_pago_display || METODO_LABELS[p.metodo_pago] || p.metodo_pago}: ${fmt(p.monto_usd)}
                                                                        {p.referencia ? ` · Ref. ${p.referencia}` : ''}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                            <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>
                                                                {op.pagos[0]?.concepto_display || op.pagos[0]?.concepto} · Cajero: {op.pagos[0]?.cajero || '—'} · Banco: {op.pagos[0]?.banco_nombre || '—'}
                                                            </p>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <p className="text-sm font-bold font-mono" style={{ color: '#16a34a' }}>${op.totalUsd.toFixed(2)}</p>
                                                            <p className="text-[11px] font-mono" style={{ color: 'var(--ash)' }}>Bs. {op.totalVes.toFixed(2)}</p>
                                                        </div>
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

                {gruposPorAlumno.length > 0 && (
                    <div className="mt-3 flex justify-end gap-6 text-xs" style={{ color: 'var(--ash)' }}>
                        <span>Total de esta página: <strong style={{ color: '#16a34a' }}>${detalleTotales.usd.toFixed(2)}</strong></span>
                        <span>Bs. <strong style={{ color: 'var(--jet)' }}>{detalleTotales.ves.toFixed(2)}</strong></span>
                    </div>
                )}

                {/* Paginación por alumno */}
                {detalleTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                        <span className="text-xs" style={{ color: 'var(--ash)' }}>
                            Página {detallePage} de {detalleTotalPages} · {detalleTotalAlumnos} alumnos en total
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setDetallePage(p => Math.max(1, p - 1))}
                                disabled={detallePage === 1 || loadingDetalle}
                                className="p-2 rounded-lg disabled:opacity-40"
                                style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
                                <ChevronLeft size={16} />
                            </button>
                            <button
                                onClick={() => setDetallePage(p => Math.min(detalleTotalPages, p + 1))}
                                disabled={detallePage === detalleTotalPages || loadingDetalle}
                                className="p-2 rounded-lg disabled:opacity-40"
                                style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Historial de lotes de conciliación */}
                <div className="mt-8">
                    <div className="mb-3 flex items-center gap-2">
                        <History size={16} style={{ color: 'var(--pb)' }} />
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Historial de Lotes Conciliados</h3>
                        {loadingLoteHistorial && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--pb)' }} />}
                    </div>

                    {!loadingLoteHistorial && loteHistorial.length === 0 ? (
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>Aún no se ha finalizado ningún lote de conciliación.</p>
                    ) : (
                        <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
                            {loteHistorial.map(lote => (
                                <div key={lote.id} style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                                    <button
                                        onClick={() => toggleLoteExpandido(lote.id)}
                                        className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-left"
                                        style={{ background: '#fff' }}>
                                        <div className="flex items-center gap-2 min-w-0">
                                            {loteExpandidoId === lote.id ? <ChevronUp size={14} style={{ color: 'var(--ash)' }} /> : <ChevronDown size={14} style={{ color: 'var(--ash)' }} />}
                                            <span className="text-xs font-medium" style={{ color: 'var(--jet)' }}>
                                                {lote.fecha_inicio} — {lote.fecha_fin}
                                            </span>
                                            <span className="text-[11px]" style={{ color: 'var(--ash)' }}>
                                                por {lote.usuario_nombre || '—'} · {new Date(lote.fecha_creacion).toLocaleString('es-VE')}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <span className="text-[11px] font-mono" style={{ color: 'var(--ash)' }}>{lote.total_transacciones} transacciones</span>
                                            <span className="text-xs font-mono font-semibold" style={{ color: '#16a34a' }}>${fmt(lote.total_usd)}</span>
                                        </div>
                                    </button>
                                    {loteExpandidoId === lote.id && (
                                        <div className="px-4 pb-3" style={{ background: 'var(--porcelain)' }}>
                                            {loadingLoteDetalle ? (
                                                <div className="flex justify-center py-4">
                                                    <Loader2 size={16} className="animate-spin" style={{ color: 'var(--pb)' }} />
                                                </div>
                                            ) : (
                                                <div className="space-y-1.5 pt-2">
                                                    {(loteDetalle?.pagos || []).map(p => (
                                                        <div key={p.id} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg" style={{ background: '#fff' }}>
                                                            <span style={{ color: 'var(--jet)' }}>
                                                                {`${p.nombre_alumno || ''} ${p.apellido_alumno || ''}`.trim()} · {p.metodo_pago_display || p.metodo_pago}
                                                                {p.referencia ? ` · Ref. ${p.referencia}` : ''}
                                                            </span>
                                                            <span className="font-mono font-semibold" style={{ color: '#16a34a' }}>${fmt(p.monto_usd)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
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
                                || 0;
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
                                                    <div key={d.alumno_id || d.alumno || i} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--bg)', border: '0.5px solid var(--border)' }}>
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
                                {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(y => (
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
                        ) : (biStats?.grados || []).filter(g => g.total_alumnos > 0).length === 0 ? (
                            <div className="flex flex-col items-center py-10" style={{ color: 'var(--ash)' }}>
                                <TrendingDown size={30} className="mb-2 opacity-20" />
                                <p className="text-sm">Sin alumnos activos registrados por grado.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {(biStats?.grados || [])
                                    .filter(g => g.total_alumnos > 0)
                                    .sort((a, b) => (b.morosos / b.total_alumnos) - (a.morosos / a.total_alumnos))
                                    .map((g, idx) => {
                                        const pct = Math.min(100, (g.morosos / g.total_alumnos) * 100);
                                        const color = pct > 20 ? 'var(--red)' : pct > 10 ? '#ca8a04' : '#16a34a';
                                        const bg    = pct > 20 ? 'var(--red-light)' : pct > 10 ? '#fef9c3' : '#dcfce7';
                                        return (
                                            <div key={g.grado || g.nombre || idx} className="p-3 rounded-xl" style={{ border: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{g.grado}</span>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xs" style={{ color: 'var(--ash)' }}>{g.morosos}/{g.total_alumnos} morosos</span>
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ background: bg, color }}>
                                                            {pct.toFixed(1)}%
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--ash-light)' }}>
                                                    <div className="h-full rounded-full transition-all duration-500"
                                                        style={{ width: `${pct}%`, background: color }} />
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

                            const diff = (a, b) => b === 0 ? null : ((a - b) / b) * 100;

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
                                                <tr key={row.label} style={{
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

            {/* ── SECCIÓN 4: Puntualidad de Mensualidades ── */}
            <section>
                <div className="mb-5 flex items-start justify-between flex-wrap gap-4">
                    <div>
                        <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                            <Clock size={20} style={{ color: 'var(--pb)' }} />
                            Puntualidad de Mensualidades
                        </h2>
                        <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
                            Clasificación de pagos: atrasados, a tiempo y adelantados.
                        </p>
                    </div>

                    {/* Controles de filtro */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Selector de granularidad */}
                        <div className="flex rounded-lg overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
                            {[
                                { val: 'dia',  label: 'Día' },
                                { val: 'mes',  label: 'Mes' },
                                { val: 'anio', label: 'Año' },
                            ].map(({ val, label }) => (
                                <button
                                    key={val}
                                    onClick={() => setPuntGranularidad(val)}
                                    className="px-3 py-1.5 text-xs font-medium transition-all"
                                    style={{
                                        background: puntGranularidad === val ? 'var(--pb)' : '#fff',
                                        color:      puntGranularidad === val ? '#fff'       : 'var(--ash)',
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        {/* Picker condicional */}
                        {puntGranularidad === 'dia' && (
                            <DatePickerES
                                value={puntFecha}
                                onChange={e => setPuntFecha(e.target.value)}
                                className="px-2.5 py-1.5 rounded-lg text-xs outline-none"
                                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                            />
                        )}

                        {puntGranularidad === 'mes' && (
                            <>
                                <select
                                    value={puntMes}
                                    onChange={e => setPuntMes(parseInt(e.target.value))}
                                    className="px-2.5 py-1.5 rounded-lg text-xs outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                                    {MONTH_NAMES.map((m, i) => (
                                        <option key={i} value={i + 1}>{m}</option>
                                    ))}
                                </select>
                                <select
                                    value={puntAnio}
                                    onChange={e => setPuntAnio(parseInt(e.target.value))}
                                    className="px-2.5 py-1.5 rounded-lg text-xs outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                                    {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(y => (
                                        <option key={y} value={y}>{y}</option>
                                    ))}
                                </select>
                            </>
                        )}

                        {puntGranularidad === 'anio' && (
                            <select
                                value={puntAnio}
                                onChange={e => setPuntAnio(parseInt(e.target.value))}
                                className="px-2.5 py-1.5 rounded-lg text-xs outline-none"
                                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                                {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        )}

                        {loadingPuntualidad && <Loader2 size={15} className="animate-spin" style={{ color: 'var(--pb)' }} />}
                    </div>
                </div>

                {loadingPuntualidad ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="animate-spin" size={24} style={{ color: 'var(--pb)' }} />
                    </div>
                ) : (() => {
                    const { total, atrasado, a_tiempo, adelantado } = puntualidad;
                    const pct = (v) => total > 0 ? ((v / total) * 100).toFixed(1) : '0.0';

                    const periodoLabel = puntGranularidad === 'dia'
                        ? `el ${new Date(puntFecha + 'T12:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })}`
                        : puntGranularidad === 'mes'
                        ? `${MONTH_NAMES[puntMes - 1]} ${puntAnio}`
                        : String(puntAnio);

                    const cards = [
                        {
                            label:    'Atrasados',
                            desc:     'Pagaron después del mes que corresponde',
                            value:    atrasado,
                            icon:     <AlertTriangle size={20} />,
                            color:    'var(--red)',
                            bg:       'var(--red-light)',
                            barColor: '#ef4444',
                        },
                        {
                            label:    'A tiempo',
                            desc:     'Pagaron durante el mismo mes',
                            value:    a_tiempo,
                            icon:     <CheckCircle2 size={20} />,
                            color:    '#16a34a',
                            bg:       '#dcfce7',
                            barColor: '#16a34a',
                        },
                        {
                            label:    'Adelantados',
                            desc:     'Pagaron antes del mes que corresponde',
                            value:    adelantado,
                            icon:     <ChevronsRight size={20} />,
                            color:    'var(--pb)',
                            bg:       'var(--pb-light)',
                            barColor: 'var(--pb)',
                        },
                    ];

                    return (
                        <div className="space-y-5">
                            {/* Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {cards.map((c) => (
                                    <div key={c.label} className="rounded-xl p-5" style={cardStyle}>
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="p-2 rounded-lg" style={{ background: c.bg, color: c.color }}>
                                                {c.icon}
                                            </div>
                                            <div>
                                                <p className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>{c.label}</p>
                                                <p className="text-[10px]" style={{ color: 'var(--ash)' }}>{c.desc}</p>
                                            </div>
                                        </div>
                                        <p className="text-3xl font-bold font-mono" style={{ color: c.color }}>
                                            {c.value.toLocaleString()}
                                        </p>
                                        <div className="mt-3">
                                            <div className="flex justify-between mb-1">
                                                <span className="text-[10px]" style={{ color: 'var(--ash)' }}>del total</span>
                                                <span className="text-[10px] font-bold font-mono" style={{ color: c.color }}>{pct(c.value)}%</span>
                                            </div>
                                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ash-light)' }}>
                                                <div className="h-full rounded-full transition-all duration-700"
                                                    style={{ width: `${pct(c.value)}%`, background: c.barColor }} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Barra proporcional apilada */}
                            {total > 0 && (
                                <div className="rounded-xl p-5" style={cardStyle}>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                            Distribución total — {total.toLocaleString()} mensualidades en {periodoLabel}
                                        </span>
                                    </div>
                                    <div className="h-5 rounded-full overflow-hidden flex" style={{ background: 'var(--ash-light)' }}>
                                        {atrasado > 0 && (
                                            <div title={`Atrasadas: ${atrasado}`}
                                                className="h-full transition-all duration-700"
                                                style={{ width: `${pct(atrasado)}%`, background: '#ef4444' }} />
                                        )}
                                        {a_tiempo > 0 && (
                                            <div title={`A tiempo: ${a_tiempo}`}
                                                className="h-full transition-all duration-700"
                                                style={{ width: `${pct(a_tiempo)}%`, background: '#16a34a' }} />
                                        )}
                                        {adelantado > 0 && (
                                            <div title={`Adelantadas: ${adelantado}`}
                                                className="h-full transition-all duration-700"
                                                style={{ width: `${pct(adelantado)}%`, background: 'var(--pb)' }} />
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-4 mt-3">
                                        {[
                                            { label: 'Atrasadas',   color: '#ef4444',    val: atrasado },
                                            { label: 'A tiempo',    color: '#16a34a',    val: a_tiempo },
                                            { label: 'Adelantadas', color: 'var(--pb)',  val: adelantado },
                                        ].map(l => (
                                            <div key={l.label} className="flex items-center gap-1.5">
                                                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: l.color }} />
                                                <span className="text-xs" style={{ color: 'var(--ash)' }}>
                                                    {l.label}: <strong style={{ color: 'var(--jet)' }}>{l.val.toLocaleString()}</strong>
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {total === 0 && (
                                <div className="flex flex-col items-center py-10 rounded-xl" style={cardStyle}>
                                    <Clock size={32} className="mb-2 opacity-20" style={{ color: 'var(--pb)' }} />
                                    <p className="text-sm" style={{ color: 'var(--ash)' }}>
                                        Sin mensualidades pagadas registradas para {periodoLabel}.
                                    </p>
                                </div>
                            )}
                        </div>
                    );
                })()}
            </section>

        </div>
    );
};

export default Reportes;
