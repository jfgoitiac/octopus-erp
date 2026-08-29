import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Loader2, Search, ListChecks, X, CheckSquare, Square,
    ChevronDown, ChevronUp, History, Lock, Save, ChevronLeft, ChevronRight,
    Copy, Layers,
} from 'lucide-react';
import DatePickerES from '../DatePickerES';
import axiosInstance from '../../api/apiClient';
import { toast } from 'react-toastify';
import { TableRowSkeleton } from '../shared/Skeleton';
import {
    today, daysAgo, fmt, getErrorMessage, claveConciliacion,
    METODO_LABELS, ESTATUS_STYLE, inputStyle,
} from '../../constants/reportes';
import BancoSelect from './BancoSelect';
import { Card } from '../ui/Card';

const DETALLE_PAGE_SIZE = 15;

const ConciliacionTab = ({ bancosDisponibles, onClasificarPago, clasificandoPagoId }) => {
    /* Rango de fechas propio: por defecto trae los últimos 30 días, para que
       las transacciones viejas sin conciliar aparezcan solas sin que el
       operador tenga que ir a cambiar fechas. */
    const [detalleFechaInicio, setDetalleFechaInicio] = useState(() => daysAgo(30));
    const [detalleFechaFin, setDetalleFechaFin] = useState(today);
    const [detallePagos, setDetallePagos] = useState([]); // pagos de los alumnos de la página actual
    const [loadingDetalle, setLoadingDetalle] = useState(true);
    const [detalleBusqueda, setDetalleBusqueda] = useState('');
    const [detalleBusquedaDebounced, setDetalleBusquedaDebounced] = useState('');
    const [detalleMetodo, setDetalleMetodo] = useState('todos');
    const [detalleEstatus, setDetalleEstatus] = useState('todos');
    const [detalleBanco, setDetalleBanco] = useState('todos');
    const [detallePage, setDetallePage] = useState(1);
    const [detalleTotalRepresentantes, setDetalleTotalRepresentantes] = useState(0);
    const [detalleTotalPages, setDetalleTotalPages] = useState(1);
    const [detalleChecked, setDetalleChecked] = useState(() => new Set());
    const [finalizandoLote, setFinalizandoLote] = useState(false);
    const [representantesExpandidos, setRepresentantesExpandidos] = useState(() => new Set());
    /* Todos los representados (hijos) de cada representante de la página actual,
       tal como los trae el backend — no solo los que tienen pagos en el rango
       filtrado, para que el desglose muestre siempre a todos los hijos. */
    const [representadosPorRepresentante, setRepresentadosPorRepresentante] = useState({});

    /* Acumula { operacion_uuid -> { pagoIds, revisado } } a través de todas las
       páginas visitadas, para poder finalizar un lote con selecciones hechas en
       páginas distintas (el checklist no se pierde al paginar). */
    const [operacionesInfo, setOperacionesInfo] = useState(() => new Map());

    /* Historial de lotes ya finalizados */
    const [loteHistorial, setLoteHistorial] = useState([]);
    const [loadingLoteHistorial, setLoadingLoteHistorial] = useState(true);
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

    /* Cambiar el rango de fechas, método, estatus o banco reinicia la página a 1 */
    useEffect(() => { setDetallePage(1); }, [detalleFechaInicio, detalleFechaFin, detalleMetodo, detalleEstatus, detalleBanco]);

    const fetchDetallePagos = useCallback(async (fi, ff, page, buscar, metodo, estatus, banco) => {
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
                    banco: banco !== 'todos' ? banco : undefined,
                },
            });
            const resultados = res.data?.results || [];
            const pagos = resultados.flatMap(r => r.pagos);
            setDetallePagos(pagos);
            setDetalleTotalRepresentantes(res.data?.total_representantes || 0);
            setDetalleTotalPages(res.data?.total_pages || 1);

            const representados = {};
            resultados.forEach(r => {
                representados[r.representante_id] = (r.alumnos || [])
                    .map(a => `${a.nombre || ''} ${a.apellido || ''}`.trim())
                    .filter(Boolean);
            });
            setRepresentadosPorRepresentante(representados);

            setOperacionesInfo(prev => {
                const next = new Map(prev);
                pagos.forEach(p => {
                    const clave = claveConciliacion(p);
                    const previa = next.get(clave);
                    const pagoIds = new Set(previa?.pagoIds || []);
                    pagoIds.add(p.id);
                    next.set(clave, {
                        pagoIds: Array.from(pagoIds),
                        revisado: Boolean(previa?.revisado || p.revisado),
                    });
                });
                return next;
            });
        } catch (err) {
            toast.error(getErrorMessage(err, 'No se pudo cargar el resumen de conciliación.'));
        } finally {
            setLoadingDetalle(false);
        }
    }, []);

    /* Carga automática: reacciona a fecha/página/búsqueda/filtros sin requerir
       que el operador haga clic en "Buscar". */
    useEffect(() => {
        fetchDetallePagos(detalleFechaInicio, detalleFechaFin, detallePage, detalleBusquedaDebounced, detalleMetodo, detalleEstatus, detalleBanco);
    }, [fetchDetallePagos, detalleFechaInicio, detalleFechaFin, detallePage, detalleBusquedaDebounced, detalleMetodo, detalleEstatus, detalleBanco]);

    const fetchLoteHistorial = useCallback(async () => {
        setLoadingLoteHistorial(true);
        try {
            const res = await axiosInstance.get('cobranza/conciliacion/lotes/');
            setLoteHistorial(res.data || []);
        } catch (err) {
            toast.error(getErrorMessage(err, 'No se pudo cargar el historial de conciliación.'));
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
        } catch (err) {
            toast.error(getErrorMessage(err, 'No se pudo cargar el detalle del lote.'));
        } finally {
            setLoadingLoteDetalle(false);
        }
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

    /* Agrupa por representante → operación (mismo operacion_uuid = un solo comprobante
       físico, aunque combine varios métodos de pago o cubra a varios hermanos del mismo
       representante — ver validación en PagoCreateSerializer). El checklist opera a nivel
       de operación, pero SUBDIVIDIDO por método de pago + banco: cada uno corresponde a
       un extracto bancario distinto (Transferencia-Banesco, Punto de Venta-Tesoro, etc.),
       así que deben poder marcarse como conciliados por separado aunque compartan
       operacion_uuid — de lo contrario, conciliar un banco obliga a marcar como revisados
       los demás bancos de la misma operación sin haberlos comparado contra su propio
       extracto. Solo cubre la página actual; el backend ya entrega los representantes
       paginados. */
    const gruposPorRepresentante = useMemo(() => {
        const representantes = new Map();
        detallePagos.forEach(p => {
            const representanteKey = p.representante_id ?? `${p.representante_nombre}`;
            if (!representantes.has(representanteKey)) {
                representantes.set(representanteKey, {
                    representanteKey,
                    nombre: p.representante_nombre || '—',
                    cedula: p.representante_documento || '—',
                    representados: new Map(),
                    operaciones: new Map(),
                });
            }
            const representante = representantes.get(representanteKey);

            const alumnoKey = p.alumno ?? `${p.nombre_alumno}_${p.apellido_alumno}`;
            if (!representante.representados.has(alumnoKey)) {
                representante.representados.set(alumnoKey, `${p.nombre_alumno || ''} ${p.apellido_alumno || ''}`.trim() || '—');
            }

            const clave = claveConciliacion(p);
            if (!representante.operaciones.has(clave)) {
                representante.operaciones.set(clave, {
                    clave,
                    operacion_uuid: p.operacion_uuid,
                    fecha: p.fecha_pago,
                    pagos: [],
                    pagoIds: [],
                    totalUsd: 0,
                    totalVes: 0,
                    revisado: false,
                    multiAlumno: false,
                });
            }
            const op = representante.operaciones.get(clave);
            op.pagos.push(p);
            op.pagoIds.push(p.id);
            op.totalUsd += parseFloat(p.monto_usd || 0);
            op.totalVes += parseFloat(p.monto_ves || 0);
            if (p.revisado) op.revisado = true;
            if (op.pagos.some(prev => prev.alumno !== p.alumno)) op.multiAlumno = true;
        });
        return Array.from(representantes.values())
            .map(r => ({
                ...r,
                // Preferimos el listado completo de representados que trae el backend
                // (todos los hijos del representante, no solo los que pagaron en el
                // rango filtrado); si no está disponible, caemos al derivado localmente.
                representados: representadosPorRepresentante[r.representanteKey]?.length
                    ? representadosPorRepresentante[r.representanteKey]
                    : Array.from(r.representados.values()),
                operaciones: Array.from(r.operaciones.values())
                    .sort((x, y) => new Date(x.fecha) - new Date(y.fecha)), // orden de llegada
            }));
    }, [detallePagos, representadosPorRepresentante]);

    const totalOperacionesPagina = useMemo(
        () => gruposPorRepresentante.reduce((s, r) => s + r.operaciones.length, 0),
        [gruposPorRepresentante],
    );
    const totalOperacionesRevisadasPagina = useMemo(
        () => gruposPorRepresentante.reduce(
            (s, r) => s + r.operaciones.filter(op => op.revisado || detalleChecked.has(op.clave)).length,
            0,
        ),
        [gruposPorRepresentante, detalleChecked],
    );

    /* Cuántas operaciones marcadas (en cualquier página visitada, no solo la actual)
       quedarían pendientes por enviar en el próximo "Finalizar Lote". */
    const totalMarcadasPendientes = useMemo(() => {
        let n = 0;
        detalleChecked.forEach(clave => {
            const entry = operacionesInfo.get(clave);
            if (entry && !entry.revisado) n += 1;
        });
        return n;
    }, [detalleChecked, operacionesInfo]);

    const toggleOperacionCheck = (op) => {
        if (op.revisado) return; // ya conciliada en un lote anterior, no se puede desmarcar
        setDetalleChecked(prev => {
            const next = new Set(prev);
            if (next.has(op.clave)) next.delete(op.clave);
            else next.add(op.clave);
            return next;
        });
    };

    const copiarReferencia = (referencia) => {
        navigator.clipboard.writeText(referencia)
            .then(() => toast.success('Referencia copiada.'))
            .catch(() => toast.error('No se pudo copiar la referencia.'));
    };

    const toggleRepresentanteExpandido = (representanteKey) => {
        setRepresentantesExpandidos(prev => {
            const next = new Set(prev);
            if (next.has(representanteKey)) next.delete(representanteKey);
            else next.add(representanteKey);
            return next;
        });
    };

    const marcarPaginaCompleta = () => {
        setDetalleChecked(prev => {
            const next = new Set(prev);
            gruposPorRepresentante.forEach(r => r.operaciones.forEach(op => {
                if (!op.revisado) next.add(op.clave);
            }));
            return next;
        });
    };

    const limpiarFiltros = () => {
        setDetalleBusqueda('');
        setDetalleMetodo('todos');
        setDetalleEstatus('todos');
        setDetalleBanco('todos');
        setDetalleFechaInicio(daysAgo(30));
        setDetalleFechaFin(today());
    };

    const handleFinalizarLote = async () => {
        const pagoIds = [];
        detalleChecked.forEach(clave => {
            const entry = operacionesInfo.get(clave);
            if (entry && !entry.revisado) pagoIds.push(...entry.pagoIds);
        });

        if (pagoIds.length === 0) {
            toast.warning('Marca al menos una transacción antes de finalizar el lote.');
            return;
        }

        setFinalizandoLote(true);
        try {
            await axiosInstance.post('cobranza/conciliacion/lotes/', {
                fecha_inicio: detalleFechaInicio,
                fecha_fin: detalleFechaFin,
                pago_ids: pagoIds,
            });
            toast.success('Lote de conciliación guardado correctamente.');
            setDetalleChecked(new Set());
            await Promise.all([
                fetchDetallePagos(detalleFechaInicio, detalleFechaFin, detallePage, detalleBusquedaDebounced, detalleMetodo, detalleEstatus, detalleBanco),
                fetchLoteHistorial(),
            ]);
        } catch (err) {
            toast.error(getErrorMessage(err, 'No se pudo guardar el lote de conciliación.'));
        } finally {
            setFinalizandoLote(false);
        }
    };

    return (
        <section>
            <div className="mb-5 flex items-start justify-between flex-wrap gap-4">
                <div>
                    <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                        <ListChecks size={20} style={{ color: 'var(--pb)' }} />
                        Conciliación de Transacciones
                    </h2>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
                        Agrupado por representante, en orden de llegada. Marca cada transacción al cotejarla con el comprobante físico del período {detalleFechaInicio} — {detalleFechaFin}
                        {detalleTotalRepresentantes > 0 ? ` · ${detalleTotalRepresentantes} representante${detalleTotalRepresentantes === 1 ? '' : 's'} en total` : ''}.
                    </p>
                </div>
                {loadingDetalle && <Loader2 size={18} className="animate-spin" style={{ color: 'var(--pb)' }} />}
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-end gap-3 mb-4">
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Desde</label>
                    <DatePickerES
                        value={detalleFechaInicio}
                        onChange={e => setDetalleFechaInicio(e.target.value)}
                        className="px-3 py-2 rounded-lg text-sm outline-none"
                        style={inputStyle}
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Hasta</label>
                    <DatePickerES
                        value={detalleFechaFin}
                        onChange={e => setDetalleFechaFin(e.target.value)}
                        className="px-3 py-2 rounded-lg text-sm outline-none"
                        style={inputStyle}
                    />
                </div>
                <div className="relative flex-1 w-full min-w-[220px]">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                    <input
                        type="text"
                        value={detalleBusqueda}
                        onChange={e => setDetalleBusqueda(e.target.value)}
                        placeholder="Buscar por referencia, alumno, representante o cédula…"
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
                <BancoSelect
                    value={detalleBanco}
                    onChange={e => setDetalleBanco(e.target.value)}
                    bancosDisponibles={bancosDisponibles}
                    className="px-3 py-2 rounded-lg text-sm outline-none"
                    style={inputStyle}
                />
            </div>

            {/* Barra de progreso de conciliación (página actual) + acciones */}
            <Card className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex-1 w-full min-w-[220px]">
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
            </Card>

            {/* Resumen agrupado por representante */}
            {loadingDetalle ? (
                <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
                    <table className="w-full text-sm"><tbody><TableRowSkeleton cols={1} rows={4} /></tbody></table>
                </div>
            ) : gruposPorRepresentante.length === 0 ? (
                <Card className="flex flex-col items-center py-10 gap-3">
                    <ListChecks size={30} className="opacity-20" style={{ color: 'var(--pb)' }} />
                    <p className="text-sm" style={{ color: 'var(--ash)' }}>
                        No hay transacciones que coincidan con el filtro.
                    </p>
                    <button
                        onClick={limpiarFiltros}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--pb)' }}>
                        Limpiar filtros y ver últimos 30 días
                    </button>
                </Card>
            ) : (
                <div className="space-y-3">
                    {gruposPorRepresentante.map(representante => {
                        const expandido = representantesExpandidos.has(representante.representanteKey);
                        const revisadasRepresentante = representante.operaciones.filter(op => op.revisado || detalleChecked.has(op.clave)).length;
                        const totalRepresentanteUsd = representante.operaciones.reduce((s, op) => s + op.totalUsd, 0);
                        const totalRepresentanteVes = representante.operaciones.reduce((s, op) => s + op.totalVes, 0);
                        const completo = revisadasRepresentante === representante.operaciones.length;
                        return (
                            <div key={representante.representanteKey} className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
                                <button
                                    onClick={() => toggleRepresentanteExpandido(representante.representanteKey)}
                                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                                    style={{ background: 'var(--porcelain)' }}>
                                    <div className="flex items-center gap-3 min-w-0">
                                        {expandido ? <ChevronUp size={16} style={{ color: 'var(--ash)' }} /> : <ChevronDown size={16} style={{ color: 'var(--ash)' }} />}
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium truncate" style={{ color: 'var(--jet)' }}>{representante.nombre}</p>
                                            <p className="text-[11px] font-mono" style={{ color: 'var(--ash)' }}>Cédula: {representante.cedula}</p>
                                            <p className="text-[11px] truncate" style={{ color: 'var(--ash)' }}>
                                                Representados: {representante.representados.join(', ')}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className="text-xs font-mono font-semibold" style={{ color: '#16a34a' }}>${totalRepresentanteUsd.toFixed(2)}</span>
                                        <span className="text-xs font-mono hidden sm:inline" style={{ color: 'var(--ash)' }}>Bs. {totalRepresentanteVes.toFixed(2)}</span>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase whitespace-nowrap"
                                            style={{ background: completo ? '#dcfce7' : 'var(--pb-light)', color: completo ? '#16a34a' : 'var(--pb)' }}>
                                            {revisadasRepresentante}/{representante.operaciones.length}
                                        </span>
                                    </div>
                                </button>

                                {expandido && (
                                    <div className="divide-y" style={{ borderTop: '0.5px solid var(--border-md)' }}>
                                        {representante.operaciones.map(op => {
                                            const checked = op.revisado || detalleChecked.has(op.clave);
                                            const fecha = op.fecha
                                                ? new Date(op.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                                : '—';
                                            return (
                                                <div key={op.clave} className="p-3 flex flex-col sm:flex-row sm:items-center gap-3"
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
                                                                <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full whitespace-nowrap"
                                                                    style={{ background: p.concepto === 'mixto' ? '#fef2f2' : 'var(--porcelain)', color: 'var(--jet)' }}>
                                                                    {op.multiAlumno ? `${p.nombre_alumno || ''} ${p.apellido_alumno || ''}`.trim() + ' · ' : ''}
                                                                    {p.metodo_pago_display || METODO_LABELS[p.metodo_pago] || p.metodo_pago}: ${fmt(p.monto_usd)}
                                                                    {p.referencia ? (
                                                                        <>
                                                                            {` · Ref. ${p.referencia}`}
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => copiarReferencia(p.referencia)}
                                                                                title="Copiar referencia"
                                                                                className="flex items-center"
                                                                                style={{ color: 'var(--pb)' }}>
                                                                                <Copy size={11} />
                                                                            </button>
                                                                        </>
                                                                    ) : ''}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => onClasificarPago(p)}
                                                                        disabled={clasificandoPagoId === p.id}
                                                                        title="Clasificar este pago en conceptos concretos (funciona incluso si ya está conciliado)"
                                                                        className="flex items-center gap-0.5 pl-1 ml-0.5 disabled:opacity-50"
                                                                        style={{ color: 'var(--pb)', borderLeft: '0.5px solid var(--border-md)' }}>
                                                                        {clasificandoPagoId === p.id
                                                                            ? <Loader2 size={11} className="animate-spin" />
                                                                            : <Layers size={11} />}
                                                                        Clasificar
                                                                    </button>
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

            {gruposPorRepresentante.length > 0 && (
                <div className="mt-3 flex justify-end gap-6 text-xs" style={{ color: 'var(--ash)' }}>
                    <span>Total de esta página: <strong style={{ color: '#16a34a' }}>${detalleTotales.usd.toFixed(2)}</strong></span>
                    <span>Bs. <strong style={{ color: 'var(--jet)' }}>{detalleTotales.ves.toFixed(2)}</strong></span>
                </div>
            )}

            {/* Paginación por representante */}
            {detalleTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                    <span className="text-xs" style={{ color: 'var(--ash)' }}>
                        Página {detallePage} de {detalleTotalPages} · {detalleTotalRepresentantes} representantes en total
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
                                                        <span className="inline-flex items-center gap-1" style={{ color: 'var(--jet)' }}>
                                                            {`${p.nombre_alumno || ''} ${p.apellido_alumno || ''}`.trim()} · {p.metodo_pago_display || p.metodo_pago}
                                                            {p.referencia ? (
                                                                <>
                                                                    {` · Ref. ${p.referencia}`}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => copiarReferencia(p.referencia)}
                                                                        title="Copiar referencia"
                                                                        className="flex items-center"
                                                                        style={{ color: 'var(--pb)' }}>
                                                                        <Copy size={11} />
                                                                    </button>
                                                                </>
                                                            ) : ''}
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
    );
};

export default ConciliacionTab;
