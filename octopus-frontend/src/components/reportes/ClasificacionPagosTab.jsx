import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import {
    Loader2, Search, FileSpreadsheet, X, Layers, FilePlus2, CheckCircle2, Eye,
    ChevronDown, ChevronRight, Users, ChevronsDownUp, ChevronsUpDown, CheckSquare,
    CalendarRange,
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
import ClasificacionBatchModal from './ClasificacionBatchModal';
import {
    today, daysAgo, fmt, getErrorMessage, MONTH_NAMES,
    TIPO_CLASIFICACION_LABELS, ESTADO_CLASIF_STYLE, ESTADO_CLASIF_FILTROS, inputStyle, cardStyle,
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

// Orden de aparición de las filas por TIPO en el desglose mensual (después de
// los meses, antes de "Sin clasificar"). 'inscripcion'/'solvencia'/
// 'proyecto_inversion' cubren las categorías esperadas; 'otro' es un colchón
// para que ninguna línea se pierda del cuadre si el backend llega a devolver
// una categoría no prevista.
const ORDEN_CATEGORIA_TIPO_DESGLOSE = ['inscripcion', 'solvencia', 'proyecto_inversion', 'otro'];

/* Agrupa las filas planas de getDesgloseContable (una fila por concepto real
   cubierto de cada pago) en el "Desglose de dinero acreditado por mes": el
   dinero se agrupa por el mes/tipo que el operador clasificó, no por la
   fecha en que entró el pago (esa ya filtró qué pagos califican, en
   fetchClasificacion / getDesgloseContable). Reusado por el bloque en
   pantalla y por los exports Excel/PDF para no triplicar esta lógica. */
const buildDesgloseMensual = (filas, mesLabelDesglose, conceptoLabelDesglose) => {
    const gruposMes = new Map(); // clave: `${anio}-${mes}` -> { orden, label, usd, ves }
    const gruposTipo = new Map(); // clave: categoria_concepto -> { label, usd, ves }
    let sinClasificarUsd = 0;
    let sinClasificarVes = 0;

    filas.forEach(f => {
        const usd = parseFloat(f.monto_usd || 0);
        const ves = parseFloat(f.monto_ves || 0);
        if (f.origen === 'sin_clasificar') {
            sinClasificarUsd += usd;
            sinClasificarVes += ves;
            return;
        }
        if (f.categoria_concepto === 'mensualidad' && f.mes && f.anio) {
            const clave = `${f.anio}-${String(f.mes).padStart(2, '0')}`;
            if (!gruposMes.has(clave)) {
                gruposMes.set(clave, { orden: f.anio * 100 + f.mes, label: mesLabelDesglose(f), usd: 0, ves: 0 });
            }
            const g = gruposMes.get(clave);
            g.usd += usd;
            g.ves += ves;
            return;
        }
        // Inscripción, Solvencia, Proyecto de Inversión (y 'otro' como colchón):
        // se agrupan por la etiqueta que ya asignó el operador/desglose
        // automático (tipo_display / TIPO_CLASIFICACION_LABELS), sin inferir
        // un mes que no tienen.
        const clave = f.categoria_concepto || 'otro';
        if (!gruposTipo.has(clave)) {
            gruposTipo.set(clave, { label: conceptoLabelDesglose(f), usd: 0, ves: 0 });
        }
        const g = gruposTipo.get(clave);
        g.usd += usd;
        g.ves += ves;
    });

    const filasMes = [...gruposMes.values()]
        .sort((a, b) => a.orden - b.orden)
        .map(g => ({ label: g.label, monto_usd: g.usd, monto_ves: g.ves }));

    const filasTipo = ORDEN_CATEGORIA_TIPO_DESGLOSE
        .filter(cat => gruposTipo.has(cat))
        .map(cat => {
            const g = gruposTipo.get(cat);
            return { label: g.label, monto_usd: g.usd, monto_ves: g.ves };
        });

    const filasSinClasificar = (sinClasificarUsd !== 0 || sinClasificarVes !== 0)
        ? [{ label: 'Sin clasificar', monto_usd: sinClasificarUsd, monto_ves: sinClasificarVes }]
        : [];

    const filasDesglose = [...filasMes, ...filasTipo, ...filasSinClasificar];
    const totalUsd = filasDesglose.reduce((s, f) => s + f.monto_usd, 0);
    const totalVes = filasDesglose.reduce((s, f) => s + f.monto_ves, 0);

    return { filas: filasDesglose, totalUsd, totalVes };
};

/**
 * @param bancosDisponibles lista de bancos para el filtro (compartida con Conciliación)
 * @param onSeleccionarPago  abre el modal de clasificación; el estado del modal vive en
 *        el shell (Reportes.jsx) porque también se dispara desde la pestaña de Conciliación.
 * @param registerUpdateHandler  al montar, registra la función que debe correr cuando el
 *        modal notifica un cambio (crear/editar/borrar línea), para refrescar esta tabla
 *        sin depender de qué pestaña disparó la clasificación.
 * @param registerPagosListHandler  al montar, registra la lista de pagos de la página
 *        actual (con su estado_clasificacion), para que el modal pueda ofrecer
 *        "Siguiente pendiente" sin que el operador tenga que volver a la tabla a
 *        ubicar la próxima fila manualmente.
 */
const ClasificacionPagosTab = ({ bancosDisponibles, onSeleccionarPago, registerUpdateHandler, registerPagosListHandler }) => {
    const [clasifFechaInicio, setClasifFechaInicio] = useState(() => daysAgo(30));
    const [clasifFechaFin, setClasifFechaFin] = useState(today);
    const [clasifBusqueda, setClasifBusqueda] = useState('');
    const [clasifBusquedaDebounced, setClasifBusquedaDebounced] = useState('');
    const [clasifEstado, setClasifEstado] = useState('todos');
    // Filtros de concepto/banco: se aplican tanto a la tabla en pantalla
    // (EstadoClasificacionPagosView) como al Excel/PDF (DesgloseContableView),
    // para que lo que se ve sea lo que se va a imprimir.
    const [clasifConceptoExport, setClasifConceptoExport] = useState('todos');
    const [clasifBancoExport, setClasifBancoExport] = useState('todos');

    const [clasifPagos, setClasifPagos] = useState([]);
    const [clasifTotal, setClasifTotal] = useState(0);
    const [clasifTotalPendientes, setClasifTotalPendientes] = useState(0);
    const [clasifTotalPages, setClasifTotalPages] = useState(1);
    const [clasifPage, setClasifPage] = useState(1);
    const [loadingClasif, setLoadingClasif] = useState(true);
    const [exportandoClasifExcel, setExportandoClasifExcel] = useState(false);
    const [exportandoClasifPdf, setExportandoClasifPdf] = useState(false);

    // Filas planas de getDesgloseContable (sin paginar, una por concepto real
    // cubierto de cada pago) — se cargan una sola vez por cambio de filtros y
    // alimentan tanto el bloque "Desglose por mes" en pantalla como los
    // exports Excel/PDF, para no repetir esta llamada 3 veces (tabla +
    // export Excel + export PDF) como antes.
    const [desgloseFilas, setDesgloseFilas] = useState([]);
    const [loadingDesglose, setLoadingDesglose] = useState(true);
    const [errorDesglose, setErrorDesglose] = useState(null);

    // Selección múltiple para clasificar en lote (ver ClasificacionBatchModal):
    // solo guarda ids de pagos pendientes (no completo_manual) de la página actual.
    const [seleccionados, setSeleccionados] = useState(() => new Set());
    const [mostrarBatchModal, setMostrarBatchModal] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => {
            setClasifBusquedaDebounced(clasifBusqueda.trim());
            setClasifPage(1);
        }, 400);
        return () => clearTimeout(t);
    }, [clasifBusqueda]);

    useEffect(() => {
        setClasifPage(1);
    }, [clasifFechaInicio, clasifFechaFin, clasifEstado, clasifConceptoExport, clasifBancoExport]);

    const fetchClasificacion = useCallback(async (fi, ff, busqueda, estado, concepto, banco, page) => {
        setLoadingClasif(true);
        try {
            const res = await getEstadoClasificacionPagos({
                fecha_desde: fi,
                fecha_hasta: ff,
                buscar: busqueda || undefined,
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
            setClasifTotalPendientes(res.data?.total_pendientes || 0);
            setClasifTotalPages(res.data?.total_pages || 1);
        } catch (err) {
            toast.error(getErrorMessage(err, 'No se pudo cargar el estado de clasificación de pagos.'));
        } finally {
            setLoadingClasif(false);
        }
    }, []);

    useEffect(() => {
        fetchClasificacion(
            clasifFechaInicio, clasifFechaFin, clasifBusquedaDebounced, clasifEstado,
            clasifConceptoExport, clasifBancoExport, clasifPage,
        );
    }, [
        fetchClasificacion, clasifFechaInicio, clasifFechaFin, clasifBusquedaDebounced,
        clasifEstado, clasifConceptoExport, clasifBancoExport, clasifPage,
    ]);

    const fetchDesglose = useCallback(async (fi, ff, busqueda, estado, concepto, banco) => {
        setLoadingDesglose(true);
        setErrorDesglose(null);
        try {
            const res = await getDesgloseContable({
                fecha_desde: fi,
                fecha_hasta: ff,
                buscar: busqueda || undefined,
                concepto: concepto !== 'todos' ? concepto : undefined,
                banco: banco !== 'todos' ? banco : undefined,
                estado: estado !== 'todos' ? estado : undefined,
            });
            setDesgloseFilas(res.data?.results || []);
        } catch (err) {
            // El backend limita el rango a 92 días (~3 meses) — mismo mensaje que
            // ya usaban los exports para este caso.
            setErrorDesglose(getErrorMessage(err, 'No se pudo cargar el desglose por mes.'));
            setDesgloseFilas([]);
        } finally {
            setLoadingDesglose(false);
        }
    }, []);

    // No depende de clasifPage: getDesgloseContable no pagina, trae TODO el
    // rango filtrado de una vez (a diferencia de fetchClasificacion).
    useEffect(() => {
        fetchDesglose(
            clasifFechaInicio, clasifFechaFin, clasifBusquedaDebounced,
            clasifEstado, clasifConceptoExport, clasifBancoExport,
        );
    }, [
        fetchDesglose, clasifFechaInicio, clasifFechaFin, clasifBusquedaDebounced,
        clasifEstado, clasifConceptoExport, clasifBancoExport,
    ]);

    /* Actualiza el resumen (monto clasificado/pendiente/estado) de un pago en la
       tabla sin recargar toda la página, tras crear/editar/borrar una línea en el modal.
       El resumen es a nivel de OPERACIÓN: si el pago editado tiene "hermanos" (mismo
       operacion_uuid, ej. un pago repartido en dos alumnos o métodos), cada uno aparece
       como su propia fila pero todos comparten los mismos totales — hay que refrescarlos
       todos, no solo la fila donde se abrió el modal, o se queda una fila con el monto
       viejo mientras las demás ya muestran el nuevo. */
    const handlePagoActualizado = useCallback((pagoId, resumen) => {
        setClasifPagos(prev => prev.map(p => (
            p.id === pagoId || (resumen.operacion_uuid && p.operacion_uuid === resumen.operacion_uuid)
        ) ? {
            ...p,
            monto_clasificado_usd: resumen.monto_clasificado_usd,
            monto_pendiente_usd: resumen.monto_pendiente_usd,
            estado_clasificacion: resumen.estado_clasificacion,
        } : p));
        // El desglose por mes depende de las líneas de clasificación (mes/tipo
        // real asignado), no del resumen por pago que ya actualizamos arriba —
        // hay que recargarlo para que el bloque en pantalla y los exports
        // reflejen la línea recién creada/editada/borrada.
        fetchDesglose(
            clasifFechaInicio, clasifFechaFin, clasifBusquedaDebounced,
            clasifEstado, clasifConceptoExport, clasifBancoExport,
        );
    }, [
        fetchDesglose, clasifFechaInicio, clasifFechaFin, clasifBusquedaDebounced,
        clasifEstado, clasifConceptoExport, clasifBancoExport,
    ]);

    // Se registra en el shell mientras esta pestaña está montada, para que el
    // modal (renderizado a nivel de Reportes.jsx) pueda refrescar esta tabla
    // sin importar si la clasificación se disparó desde Conciliación o desde aquí.
    useEffect(() => {
        registerUpdateHandler?.(handlePagoActualizado);
        return () => registerUpdateHandler?.(null);
    }, [registerUpdateHandler, handlePagoActualizado]);

    // Se re-registra en cada cambio de clasifPagos (nueva página, filtro, o
    // clasificación aplicada) para que "Siguiente pendiente" en el modal
    // siempre vea el estado más reciente de la página actual.
    useEffect(() => {
        registerPagosListHandler?.(clasifPagos);
        return () => registerPagosListHandler?.(null);
    }, [registerPagosListHandler, clasifPagos]);

    // La selección de acción masiva se limpia cada vez que cambia el set de
    // pagos en pantalla (nueva página, filtro, o refresco tras clasificar) —
    // evita quedarse con ids seleccionados que ya no corresponden a lo visible.
    useEffect(() => {
        setSeleccionados(new Set());
    }, [clasifPagos]);

    const toggleSeleccion = (id) => setSeleccionados(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const pendientesIdsVisibles = useMemo(
        () => clasifPagos.filter(p => p.estado_clasificacion !== 'completo_manual').map(p => p.id),
        [clasifPagos],
    );
    const todosSeleccionados = pendientesIdsVisibles.length > 0
        && pendientesIdsVisibles.every(id => seleccionados.has(id));
    const toggleSeleccionarTodos = () => setSeleccionados(
        todosSeleccionados ? new Set() : new Set(pendientesIdsVisibles),
    );

    const pagosSeleccionados = useMemo(
        () => clasifPagos.filter(p => seleccionados.has(p.id)),
        [clasifPagos, seleccionados],
    );

    const handleBatchAplicado = () => {
        setMostrarBatchModal(false);
        setSeleccionados(new Set());
        // Refresca la página actual con los mismos filtros para reflejar los
        // nuevos estados (y el contador global de pendientes actualizado).
        fetchClasificacion(
            clasifFechaInicio, clasifFechaFin, clasifBusquedaDebounced, clasifEstado,
            clasifConceptoExport, clasifBancoExport, clasifPage,
        );
        fetchDesglose(
            clasifFechaInicio, clasifFechaFin, clasifBusquedaDebounced,
            clasifEstado, clasifConceptoExport, clasifBancoExport,
        );
    };

    /* Agrupa la página actual de pagos por representante (no por alumno/pago
       suelto) — un representante puede tener varios hijos, y ver cada pago
       como fila individual obligaba a "buscar" mentalmente cuáles eran del
       mismo representante. La clave usa el documento y cae al nombre solo si
       falta (no debería pasar en datos reales, pero evita perder filas). */
    const clavePorRepresentante = (p) => p.representante_documento || `sin-documento:${p.representante_nombre || 'desconocido'}`;

    const gruposPorRepresentante = useMemo(() => {
        const mapa = new Map();
        const orden = [];
        clasifPagos.forEach(p => {
            const clave = clavePorRepresentante(p);
            if (!mapa.has(clave)) {
                mapa.set(clave, {
                    clave,
                    representante_nombre: p.representante_nombre,
                    representante_documento: p.representante_documento,
                    pagos: [],
                });
                orden.push(clave);
            }
            mapa.get(clave).pagos.push(p);
        });
        return orden.map(clave => mapa.get(clave));
    }, [clasifPagos]);

    const [repsColapsados, setRepsColapsados] = useState(() => new Set());

    // Por defecto colapsa los representantes cuyos pagos YA están completamente
    // clasificados a mano (completo_manual, el único estado ya auditado — ver
    // ESTADO_CLASIF_STYLE): así el trabajo pendiente queda expandido y a la
    // vista, sin tener que abrir grupo por grupo para encontrarlo. El usuario
    // igual puede expandir/colapsar cualquier grupo manualmente después.
    useEffect(() => {
        setRepsColapsados(new Set(
            gruposPorRepresentante
                .filter(g => g.pagos.every(p => p.estado_clasificacion === 'completo_manual'))
                .map(g => g.clave),
        ));
    }, [gruposPorRepresentante]);

    const toggleRep = (clave) => setRepsColapsados(prev => {
        const next = new Set(prev);
        if (next.has(clave)) next.delete(clave); else next.add(clave);
        return next;
    });

    // Todos colapsados == todos los grupos de la página actual están en el set.
    const todosColapsados = gruposPorRepresentante.length > 0
        && gruposPorRepresentante.every(g => repsColapsados.has(g.clave));
    const toggleTodos = () => setRepsColapsados(
        todosColapsados ? new Set() : new Set(gruposPorRepresentante.map(g => g.clave)),
    );

    const mesLabelDesglose = (fila) => {
        if (fila.mes && fila.anio) {
            return `${fila.mes_display || MONTH_NAMES[fila.mes - 1]} ${fila.anio}`;
        }
        // Para inscripción/solvencia/proyecto de inversión no hay mes/año, pero
        // el backend manda el período (ej. "Período 2026-2027") en mes_display
        // para poder distinguir en el reporte 2 cuotas del mismo alumno y
        // concepto (ej. inscripción de 2 años escolares en un solo pago) que
        // antes se veían como filas idénticas ("duplicadas").
        return fila.mes_display || '';
    };

    const conceptoLabelDesglose = (fila) => {
        if (fila.origen === 'sin_clasificar') return fila.concepto_display || fila.concepto || 'Sin clasificar';
        return fila.tipo_display || TIPO_CLASIFICACION_LABELS[fila.tipo] || fila.concepto_display || fila.concepto || '—';
    };

    const desgloseMensual = useMemo(
        () => buildDesgloseMensual(desgloseFilas, mesLabelDesglose, conceptoLabelDesglose),
        [desgloseFilas],
    );

    const bancoExportLabel = (val) => {
        if (val === 'todos') return 'Todos los bancos';
        if (val === 'sin_banco') return 'Sin banco (Efectivo)';
        return bancosDisponibles.find(b => String(b.id) === String(val))?.nombre || val;
    };

    const limpiarFiltros = () => {
        setClasifBusqueda('');
        setClasifEstado('todos');
        setClasifConceptoExport('todos');
        setClasifBancoExport('todos');
        setClasifFechaInicio(daysAgo(30));
        setClasifFechaFin(today());
    };

    const handleExportClasifExcel = async () => {
        if (loadingDesglose) {
            toast.info('El desglose todavía está cargando, espera un momento e intenta de nuevo.');
            return;
        }
        setExportandoClasifExcel(true);
        try {
            // Reusa las filas ya cargadas por fetchDesglose (mismos filtros que
            // la pantalla) en vez de volver a pedirlas al backend en cada export.
            const filas = desgloseFilas;
            if (!filas.length) {
                toast.info('No hay movimientos que coincidan con los filtros seleccionados.');
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

            const { filas: filasMensual, totalUsd: totalMensualUsd, totalVes: totalMensualVes } = buildDesgloseMensual(filas, mesLabelDesglose, conceptoLabelDesglose);
            const rowsMensual = filasMensual.map(f => ({
                Concepto: f.label,
                'Monto USD': f.monto_usd,
                'Monto Bs': f.monto_ves,
            }));
            rowsMensual.push({ Concepto: 'TOTAL', 'Monto USD': totalMensualUsd, 'Monto Bs': totalMensualVes });
            const wsMensual = XLSX.utils.json_to_sheet(rowsMensual);
            XLSX.utils.book_append_sheet(wb, wsMensual, 'Desglose por Mes');

            const sufijoConcepto = clasifConceptoExport !== 'todos' ? `_${clasifConceptoExport}` : '';
            const sufijoBanco = clasifBancoExport !== 'todos' ? `_${bancoExportLabel(clasifBancoExport).replace(/\s+/g, '-')}` : '';
            const sufijoEstado = clasifEstado !== 'todos' ? `_${clasifEstado}` : '';
            XLSX.writeFile(wb, `desglose_contable${sufijoConcepto}${sufijoBanco}${sufijoEstado}_${clasifFechaInicio}_${clasifFechaFin}.xlsx`);
            toast.success('Archivo Excel descargado.');
        } catch (err) {
            // El backend limita el rango a 92 días (~3 meses) para no sobrecargar la consulta.
            toast.error(getErrorMessage(err, 'No se pudo generar el Excel del desglose contable.'));
        } finally {
            setExportandoClasifExcel(false);
        }
    };

    const handleExportClasifPdf = async () => {
        if (loadingDesglose) {
            toast.info('El desglose todavía está cargando, espera un momento e intenta de nuevo.');
            return;
        }
        setExportandoClasifPdf(true);
        try {
            // Reusa las filas ya cargadas por fetchDesglose (mismos filtros que
            // la pantalla) en vez de volver a pedirlas al backend en cada export.
            const filas = desgloseFilas;
            if (!filas.length) {
                toast.info('No hay movimientos que coincidan con los filtros seleccionados.');
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
                + (clasifBancoExport !== 'todos' ? `   ·   Banco: ${bancoExportLabel(clasifBancoExport)}` : '')
                + (clasifEstado !== 'todos' ? `   ·   Estado: ${ESTADO_CLASIF_FILTROS[clasifEstado]}` : ''),
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

            const { filas: filasMensual, totalUsd: totalMensualUsd, totalVes: totalMensualVes } = buildDesgloseMensual(filas, mesLabelDesglose, conceptoLabelDesglose);
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0);
            doc.text('Desglose de dinero acreditado por mes', 14, doc.lastAutoTable.finalY + 10);
            autoTable(doc, {
                head: [['Concepto', 'Monto USD', 'Monto Bs']],
                body: [
                    ...filasMensual.map(f => [f.label, `$${f.monto_usd.toFixed(2)}`, `Bs ${f.monto_ves.toFixed(2)}`]),
                    [
                        { content: 'TOTAL', styles: { fontStyle: 'bold', halign: 'right' } },
                        { content: `$${totalMensualUsd.toFixed(2)}`, styles: { fontStyle: 'bold' } },
                        { content: `Bs ${totalMensualVes.toFixed(2)}`, styles: { fontStyle: 'bold' } },
                    ],
                ],
                startY: doc.lastAutoTable.finalY + 14,
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [30, 64, 175], fontStyle: 'bold' },
                columnStyles: {
                    1: { halign: 'right' },
                    2: { halign: 'right' },
                },
            });

            const sufijoConceptoPdf = clasifConceptoExport !== 'todos' ? `_${clasifConceptoExport}` : '';
            const sufijoBancoPdf = clasifBancoExport !== 'todos' ? `_${bancoExportLabel(clasifBancoExport).replace(/\s+/g, '-')}` : '';
            const sufijoEstadoPdf = clasifEstado !== 'todos' ? `_${clasifEstado}` : '';
            doc.save(`desglose_contable${sufijoConceptoPdf}${sufijoBancoPdf}${sufijoEstadoPdf}_${clasifFechaInicio}_${clasifFechaFin}.pdf`);
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
                <div className="flex items-center gap-3">
                    {!loadingClasif && (
                        clasifTotalPendientes > 0 ? (
                            <span className="px-3 py-1.5 rounded-full text-xs font-bold uppercase whitespace-nowrap" style={{ background: '#fef9c3', color: '#ca8a04' }}>
                                {clasifTotalPendientes} pago{clasifTotalPendientes !== 1 ? 's' : ''} por revisar en el período
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase whitespace-nowrap" style={{ background: '#dcfce7', color: '#16a34a' }}>
                                <CheckCircle2 size={13} /> Todo auditado en el período
                            </span>
                        )
                    )}
                    {loadingClasif && <Loader2 size={18} className="animate-spin" style={{ color: 'var(--pb)' }} />}
                </div>
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
                        value={clasifBusqueda}
                        onChange={e => setClasifBusqueda(e.target.value)}
                        placeholder="Cédula o nombre del representante, o del alumno (opcional)…"
                        className="w-full pl-9 pr-8 py-2 rounded-lg text-sm outline-none"
                        style={inputStyle}
                    />
                    {clasifBusqueda && (
                        <button
                            onClick={() => setClasifBusqueda('')}
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
                    {Object.entries(ESTADO_CLASIF_FILTROS).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                    ))}
                </select>
            </div>

            {/* Concepto/Banco: filtran tanto la tabla como el Excel/PDF (mismos
                parámetros van a fetchClasificacion y a getDesgloseContable), para
                que lo que el operador ve sea siempre lo que se va a exportar. Por
                eso NO se llaman "a imprimir" — cambiarlos también cambia lo que
                aparece en pantalla ahora mismo. */}
            <div className="rounded-xl p-4 mb-4 flex flex-wrap items-end gap-3" style={cardStyle}>
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Concepto (filtra tabla y exportación)</label>
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
                    <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Banco (filtra tabla y exportación)</label>
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

            {!loadingClasif && gruposPorRepresentante.length > 0 && (
                <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                    {seleccionados.size > 0 ? (
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium" style={{ color: 'var(--jet)' }}>
                                {seleccionados.size} pago{seleccionados.size !== 1 ? 's' : ''} seleccionado{seleccionados.size !== 1 ? 's' : ''}
                            </span>
                            <button
                                onClick={() => setMostrarBatchModal(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                                style={{ background: 'var(--pb)' }}>
                                <CheckSquare size={13} /> Clasificar seleccionados
                            </button>
                            <button
                                onClick={() => setSeleccionados(new Set())}
                                className="text-xs font-medium px-2 py-1.5"
                                style={{ color: 'var(--ash)' }}>
                                Cancelar selección
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={toggleSeleccionarTodos}
                            disabled={pendientesIdsVisibles.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
                            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                            <CheckSquare size={13} /> Seleccionar pendientes de esta página
                        </button>
                    )}
                    <button
                        onClick={toggleTodos}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                        {todosColapsados ? <ChevronsUpDown size={13} /> : <ChevronsDownUp size={13} />}
                        {todosColapsados ? 'Expandir todos' : 'Colapsar todos'}
                    </button>
                </div>
            )}

            {/* Tabla — agrupada por representante (no por alumno/pago suelto), para no
                tener que "buscar" mentalmente cuáles filas pertenecen al mismo pagador. */}
            <div className="rounded-xl overflow-x-auto" style={{ border: '0.5px solid var(--border-md)' }}>
                <table className="w-full text-sm min-w-[900px]">
                    <thead>
                        <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                            <th className="px-4 py-3 w-8">
                                <input
                                    type="checkbox"
                                    checked={todosSeleccionados}
                                    onChange={toggleSeleccionarTodos}
                                    disabled={pendientesIdsVisibles.length === 0}
                                    aria-label="Seleccionar todos los pagos pendientes de esta página"
                                    className="cursor-pointer"
                                />
                            </th>
                            <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>Fecha</th>
                            <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>Alumno</th>
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
                            gruposPorRepresentante.map((grupo) => {
                                const colapsado = repsColapsados.has(grupo.clave);
                                const pendientesGrupo = grupo.pagos.filter(p => p.estado_clasificacion !== 'completo_manual');
                                const pendientes = pendientesGrupo.length;
                                const totalGrupoUsd = grupo.pagos.reduce((s, p) => s + parseFloat(p.monto_usd || 0), 0);
                                const grupoTodoSeleccionado = pendientes > 0 && pendientesGrupo.every(p => seleccionados.has(p.id));
                                return (
                                    <Fragment key={grupo.clave}>
                                        <tr
                                            onClick={() => toggleRep(grupo.clave)}
                                            className="cursor-pointer"
                                            style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                                            <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                                                {pendientes > 0 && (
                                                    <input
                                                        type="checkbox"
                                                        checked={grupoTodoSeleccionado}
                                                        onChange={() => setSeleccionados(prev => {
                                                            const next = new Set(prev);
                                                            const idsGrupo = pendientesGrupo.map(p => p.id);
                                                            if (grupoTodoSeleccionado) idsGrupo.forEach(id => next.delete(id));
                                                            else idsGrupo.forEach(id => next.add(id));
                                                            return next;
                                                        })}
                                                        aria-label={`Seleccionar pagos pendientes de ${grupo.representante_nombre || 'este representante'}`}
                                                        className="cursor-pointer"
                                                    />
                                                )}
                                            </td>
                                            <td colSpan={8} className="px-4 py-2.5">
                                                <div className="flex items-center gap-3 flex-wrap">
                                                    {colapsado ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                                                    <Users size={14} style={{ color: 'var(--pb)' }} />
                                                    <span className="font-semibold" style={{ color: 'var(--jet)' }}>
                                                        {grupo.representante_nombre || 'Representante sin nombre'}
                                                    </span>
                                                    <span className="text-xs font-mono" style={{ color: 'var(--ash)' }}>
                                                        {grupo.representante_documento || 'sin documento'}
                                                    </span>
                                                    <span className="text-xs" style={{ color: 'var(--ash)' }}>
                                                        {grupo.pagos.length} pago{grupo.pagos.length !== 1 ? 's' : ''} · ${fmt(totalGrupoUsd)}
                                                    </span>
                                                    {pendientes > 0 ? (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ background: '#fef9c3', color: '#ca8a04' }}>
                                                            {pendientes} por revisar
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ background: '#dcfce7', color: '#16a34a' }}>
                                                            <CheckCircle2 size={11} /> Auditado
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        {!colapsado && grupo.pagos.map((p, idx) => {
                                            const estStyle = ESTADO_CLASIF_STYLE[p.estado_clasificacion] || ESTADO_CLASIF_STYLE.sin_clasificar;
                                            const esMixto = p.concepto === 'mixto';
                                            // Solo 'completo_manual' cuenta como ya auditado: alguien lo revisó y
                                            // clasificó a mano. 'completo_automatico' NO se trata como resuelto —
                                            // el desglose automático explica el dinero, pero cada transacción igual
                                            // debe pasar por revisión humana, así que esas filas siguen activas
                                            // (azules) en vez de atenuarse como si no requirieran acción.
                                            const yaClasificado = p.estado_clasificacion === 'completo_manual';
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
                                                        borderLeft: yaClasificado ? '3px solid #16a34a' : '3px solid transparent',
                                                        opacity: yaClasificado ? 0.55 : 1,
                                                    }}>
                                                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                        {!yaClasificado && (
                                                            <input
                                                                type="checkbox"
                                                                checked={seleccionados.has(p.id)}
                                                                onChange={() => toggleSeleccion(p.id)}
                                                                aria-label={`Seleccionar pago de ${p.alumno || 'alumno'}`}
                                                                className="cursor-pointer"
                                                            />
                                                        )}
                                                    </td>
                                                    <td className="pl-8 pr-4 py-3" style={{ color: 'var(--jet)' }}>{fecha}</td>
                                                    <td className="px-4 py-3" style={{ color: 'var(--jet)' }}>{p.alumno || '—'}</td>
                                                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--ash)' }}>
                                        {p.referencia || '—'}
                                        {(p.metodo_pago_display || p.banco_receptor) && (
                                            <span className="block font-sans not-italic" style={{ color: 'var(--pb)', fontSize: '10px' }}>
                                                {p.metodo_pago_display}
                                                {p.banco_receptor ? ` · ${p.banco_receptor}` : ''}
                                            </span>
                                        )}
                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono font-semibold" style={{ color: '#16a34a' }}>${fmt(p.monto_usd)}</td>
                                                    <td className="px-4 py-3">
                                                        <span className="font-medium" style={{ color: esMixto && !yaClasificado ? 'var(--red)' : 'var(--jet)' }}>
                                                            {p.concepto_display || p.concepto || '—'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase whitespace-nowrap"
                                                            style={{ background: estStyle.bg, color: estStyle.color }}>
                                                            {yaClasificado && <CheckCircle2 size={11} />}
                                                            {estStyle.label}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: 'var(--ash)' }}>
                                                        ${fmt(p.monto_clasificado_usd)} / ${fmt(p.monto_pendiente_usd)}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onSeleccionarPago(p); }}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
                                                            style={yaClasificado
                                                                ? { background: '#fff', border: '0.5px solid var(--border-md)', color: 'var(--ash)' }
                                                                : { background: 'var(--pb)', color: '#fff' }}>
                                                            {yaClasificado ? <><Eye size={13} /> Ver</> : 'Clasificar'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </Fragment>
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

            {/* Desglose de dinero acreditado por mes: agrupa por el mes/tipo
                REAL de clasificación (no por la fecha en que entró el pago) —
                un pago de agosto clasificado como "febrero" suma en Febrero.
                Usa las mismas filas cargadas para los exports Excel/PDF. */}
            <div className="rounded-xl p-4 mt-4" style={cardStyle}>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                    <CalendarRange size={16} style={{ color: 'var(--pb)' }} />
                    Desglose de dinero acreditado por mes
                </h3>
                {loadingDesglose ? (
                    <div className="flex items-center gap-2 py-4">
                        <Loader2 size={16} className="animate-spin" style={{ color: 'var(--pb)' }} />
                        <span className="text-sm" style={{ color: 'var(--ash)' }}>Cargando desglose…</span>
                    </div>
                ) : errorDesglose ? (
                    <p className="text-sm py-2" style={{ color: 'var(--red)' }}>{errorDesglose}</p>
                ) : desgloseMensual.filas.length === 0 ? (
                    <p className="text-sm py-2" style={{ color: 'var(--ash)' }}>No hay movimientos que coincidan con los filtros seleccionados.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[420px]">
                            <thead>
                                <tr style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                                    <th className="text-left px-3 py-2 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>Concepto</th>
                                    <th className="text-right px-3 py-2 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>Monto USD</th>
                                    <th className="text-right px-3 py-2 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>Monto Bs</th>
                                </tr>
                            </thead>
                            <tbody>
                                {desgloseMensual.filas.map((f) => (
                                    <tr key={f.label} style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                                        <td className="px-3 py-2" style={{ color: f.label === 'Sin clasificar' ? 'var(--red)' : 'var(--jet)' }}>{f.label}</td>
                                        <td className="px-3 py-2 text-right font-mono" style={{ color: '#16a34a' }}>${fmt(f.monto_usd)}</td>
                                        <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--ash)' }}>Bs {fmt(f.monto_ves)}</td>
                                    </tr>
                                ))}
                                <tr>
                                    <td className="px-3 py-2 font-semibold" style={{ color: 'var(--jet)' }}>TOTAL</td>
                                    <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: '#16a34a' }}>${fmt(desgloseMensual.totalUsd)}</td>
                                    <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: 'var(--jet)' }}>Bs {fmt(desgloseMensual.totalVes)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {mostrarBatchModal && pagosSeleccionados.length > 0 && (
                <ClasificacionBatchModal
                    pagos={pagosSeleccionados}
                    onClose={() => setMostrarBatchModal(false)}
                    onAplicado={handleBatchAplicado}
                />
            )}
        </section>
    );
};

export default ClasificacionPagosTab;
