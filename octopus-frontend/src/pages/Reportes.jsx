import { useState, useEffect, useCallback, useRef } from 'react';
import { Wallet, ListChecks, Layers, TrendingUp, BarChart2, Clock, FileEdit } from 'lucide-react';
import { toast } from 'react-toastify';
import { getEstadoClasificacionPagos, getBancos } from '../api/cobranza.service';
import ClasificacionPagoModal from '../components/reportes/ClasificacionPagoModal';
import CierreCajaTab from '../components/reportes/CierreCajaTab';
import ConciliacionTab from '../components/reportes/ConciliacionTab';
import ClasificacionPagosTab from '../components/reportes/ClasificacionPagosTab';
import CorreccionPagosTab from '../components/reportes/CorreccionPagosTab';
import HistoricoMensualTab from '../components/reportes/HistoricoMensualTab';
import BusinessIntelligenceTab from '../components/reportes/BusinessIntelligenceTab';
import PuntualidadTab from '../components/reportes/PuntualidadTab';

const TABS = [
    { id: 'caja',          label: 'Cierre de Caja',        icon: Wallet,      group: 'diaria' },
    { id: 'conciliacion',  label: 'Conciliación',          icon: ListChecks,  group: 'diaria' },
    { id: 'clasificacion', label: 'Clasificación de Pagos', icon: Layers,      group: 'diaria' },
    { id: 'correccion',    label: 'Corrección de Pagos',    icon: FileEdit,    group: 'diaria' },
    { id: 'historico',     label: 'Histórico Mensual',      icon: TrendingUp, group: 'analisis' },
    { id: 'bi',            label: 'Business Intelligence',  icon: BarChart2,  group: 'analisis' },
    { id: 'puntualidad',   label: 'Puntualidad',            icon: Clock,      group: 'analisis' },
];

const TAB_GROUPS = [
    { id: 'diaria',   label: 'Operación diaria' },
    { id: 'analisis', label: 'Análisis' },
];

const Reportes = () => {
    const [activeTab, setActiveTab] = useState('caja');

    /* ── Bancos: usado por los filtros "Banco" de Conciliación y Clasificación
       de Pagos — se carga una sola vez aquí para no duplicar la llamada. ── */
    const [bancosDisponibles, setBancosDisponibles] = useState([]);
    useEffect(() => {
        getBancos()
            .then(res => setBancosDisponibles(res.data || []))
            .catch(() => toast.error('No se pudo cargar la lista de bancos.'));
    }, []);

    /* ── Modal de Clasificación de Pagos: vive aquí (no dentro de un tab)
       porque se puede disparar tanto desde Conciliación como desde la propia
       pestaña de Clasificación. ── */
    const [pagoSeleccionado, setPagoSeleccionado] = useState(null);
    const [clasificandoPagoId, setClasificandoPagoId] = useState(null);

    // Disponible también para operaciones ya conciliadas (revisado=true): la
    // clasificación manual es independiente del checklist de conciliación,
    // un pago puede quedar marcado como revisado sin haberse desglosado nunca.
    const handleClasificarPago = async (p) => {
        setClasificandoPagoId(p.id);
        try {
            const res = await getEstadoClasificacionPagos({ id: p.id, page_size: 1 });
            const encontrado = res.data?.results?.[0];
            setPagoSeleccionado(encontrado || {
                id: p.id,
                monto_usd: p.monto_usd,
                concepto: p.concepto,
                concepto_display: p.concepto_display,
                alumno: `${p.nombre_alumno || ''} ${p.apellido_alumno || ''}`.trim() || null,
                referencia: p.referencia,
                fecha_pago: p.fecha_pago,
                monto_clasificado_usd: '0.00',
                monto_pendiente_usd: p.monto_usd,
                estado_clasificacion: 'sin_clasificar',
                clasificaciones: [],
            });
        } catch {
            toast.error('No se pudo cargar la clasificación de este pago.');
        } finally {
            setClasificandoPagoId(null);
        }
    };

    // La pestaña de Clasificación de Pagos se registra aquí mientras está
    // montada, para que el modal pueda refrescar su tabla sin importar si la
    // clasificación se disparó desde Conciliación o desde la propia pestaña.
    const clasifUpdateHandlerRef = useRef(null);
    const registerClasifUpdateHandler = useCallback((fn) => {
        clasifUpdateHandlerRef.current = fn;
    }, []);
    const handlePagoActualizado = useCallback((pagoId, resumen) => {
        clasifUpdateHandlerRef.current?.(pagoId, resumen);
        setPagoSeleccionado(prev => (prev && prev.id === pagoId ? { ...prev, ...resumen } : prev));
    }, []);

    // Lista de pagos de la página actual de Clasificación de Pagos (solo
    // disponible mientras esa pestaña está montada), para poder calcular
    // "Siguiente pendiente" desde el modal sin volver a la tabla. Se guarda en
    // un ref (la usa un handler async, no el render) más un booleano en
    // estado aparte — leer `ref.current` directamente durante el render no
    // dispara re-render cuando cambia, así que el botón podría quedar
    // desactualizado.
    const clasifPagosListRef = useRef(null);
    const [puedeAvanzarPendiente, setPuedeAvanzarPendiente] = useState(false);
    const registerClasifPagosList = useCallback((lista) => {
        clasifPagosListRef.current = lista;
        setPuedeAvanzarPendiente(!!lista?.length);
    }, []);

    // Nota: la lista es solo la página actual (paginación de 20 en 20 en el
    // backend) — al agotar los pendientes de la página, avisa que no hay más
    // en vez de saltar automáticamente a la siguiente página.
    const handleSiguientePendiente = useCallback((pagoActualId) => {
        const lista = clasifPagosListRef.current || [];
        const pendientes = lista.filter(p => p.estado_clasificacion !== 'completo_manual');
        if (pendientes.length === 0) {
            toast.info('No quedan más pagos por revisar en esta página.');
            setPagoSeleccionado(null);
            return;
        }
        const idx = pendientes.findIndex(p => p.id === pagoActualId);
        const siguiente = idx === -1 ? pendientes[0] : pendientes[(idx + 1) % pendientes.length];
        if (siguiente.id === pagoActualId) {
            toast.info('No quedan más pagos por revisar en esta página.');
            setPagoSeleccionado(null);
            return;
        }
        setPagoSeleccionado(siguiente);
    }, []);

    return (
        <div className="animate-fadeIn p-4 md:p-0">
            {/* Cabecera */}
            <div className="mb-6">
                <h2 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>Reportes</h2>
                <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
                    Cierre de caja, conciliación bancaria, clasificación contable y análisis de cobranza.
                </p>
            </div>

            {/* Navegación de tabs */}
            <div className="flex items-end gap-4 mb-6 p-2 rounded-xl w-fit overflow-x-auto max-w-full"
                style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                {TAB_GROUPS.map(({ id: groupId, label: groupLabel }, idx) => (
                    <div key={groupId}
                        className={`flex flex-col gap-1 ${idx > 0 ? 'pl-4 border-l' : ''}`}
                        style={idx > 0 ? { borderColor: 'var(--border-md)' } : undefined}>
                        <span className="text-[10px] uppercase tracking-wide px-1" style={{ color: 'var(--ash)' }}>
                            {groupLabel}
                        </span>
                        <div className="flex gap-1">
                            {TABS.filter(t => t.group === groupId).map(({ id, label, icon: Icon }) => {
                                const active = activeTab === id;
                                return (
                                    <button key={id} onClick={() => setActiveTab(id)}
                                        aria-current={active ? 'page' : undefined}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all min-h-[40px] whitespace-nowrap"
                                        style={active
                                            ? { background: 'var(--pb)', color: '#fff' }
                                            : { color: 'var(--ash)' }}>
                                        <Icon size={13} /> {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Contenido del tab activo */}
            {activeTab === 'caja'          && <CierreCajaTab />}
            {activeTab === 'conciliacion'  && (
                <ConciliacionTab
                    bancosDisponibles={bancosDisponibles}
                    onClasificarPago={handleClasificarPago}
                    clasificandoPagoId={clasificandoPagoId}
                />
            )}
            {activeTab === 'clasificacion' && (
                <ClasificacionPagosTab
                    bancosDisponibles={bancosDisponibles}
                    onSeleccionarPago={setPagoSeleccionado}
                    registerUpdateHandler={registerClasifUpdateHandler}
                    registerPagosListHandler={registerClasifPagosList}
                />
            )}
            {activeTab === 'correccion'    && (
                <CorreccionPagosTab bancosDisponibles={bancosDisponibles} />
            )}
            {activeTab === 'historico'     && <HistoricoMensualTab />}
            {activeTab === 'bi'            && <BusinessIntelligenceTab />}
            {activeTab === 'puntualidad'   && <PuntualidadTab />}

            {pagoSeleccionado && (
                <ClasificacionPagoModal
                    key={pagoSeleccionado.id}
                    pago={pagoSeleccionado}
                    onClose={() => setPagoSeleccionado(null)}
                    onPagoActualizado={handlePagoActualizado}
                    onSiguientePendiente={puedeAvanzarPendiente ? handleSiguientePendiente : null}
                />
            )}
        </div>
    );
};

export default Reportes;
