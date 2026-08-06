import { useState, useEffect, useMemo, useRef } from 'react';
import {
    Loader2, Save, Layers, Pencil, Trash2, PlusCircle, X, AlertTriangle, ArrowRight,
} from 'lucide-react';
import ConfirmDeleteModal from '../ConfirmDeleteModal';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { toast } from 'react-toastify';
import {
    crearClasificacionPago,
    actualizarClasificacionLinea,
    eliminarClasificacionLinea,
} from '../../api/cobranza.service';
import { fmt, MONTH_NAMES, CURRENT_YEAR, TIPO_CLASIFICACION_LABELS, ESTADO_CLASIF_STYLE, getErrorMessage } from '../../constants/reportes';

/**
 * Modal/drawer para desglosar un pago (especialmente los marcados como "mixto")
 * en líneas de clasificación concretas: Inscripción, Proyecto de Inversión,
 * Mes Atrasado (con mes+año) o Proyecto de Inversión Atrasado.
 */
const ClasificacionPagoModal = ({ pago, onClose, onPagoActualizado, onSiguientePendiente }) => {
    const containerRef = useRef(null);
    useFocusTrap(containerRef);

    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const [lineas, setLineas] = useState(pago.clasificaciones || []);
    const [montoClasificado, setMontoClasificado] = useState(pago.monto_clasificado_usd || 0);
    const [montoPendiente, setMontoPendiente] = useState(pago.monto_pendiente_usd ?? pago.monto_usd);
    const [estadoClasificacion, setEstadoClasificacion] = useState(pago.estado_clasificacion);

    const [tipo, setTipo] = useState('inscripcion');
    const [mes, setMes] = useState(new Date().getMonth() + 1);
    const [anio, setAnio] = useState(CURRENT_YEAR);
    const [monto, setMonto] = useState('');
    const [nota, setNota] = useState('');
    const [guardando, setGuardando] = useState(false);

    const [lineaEditando, setLineaEditando] = useState(null); // id de la línea en edición inline
    const [editForm, setEditForm] = useState(null);
    const [guardandoEdicion, setGuardandoEdicion] = useState(false);
    const [lineaAEliminar, setLineaAEliminar] = useState(null);
    const [eliminando, setEliminando] = useState(false);

    const aplicarResumen = (resumen) => {
        if (!resumen) return;
        setMontoClasificado(resumen.monto_clasificado_usd);
        setMontoPendiente(resumen.monto_pendiente_usd);
        setEstadoClasificacion(resumen.estado_clasificacion);
        onPagoActualizado(pago.id, resumen);
    };

    const totalLineasPropuesto = useMemo(
        () => lineas.reduce((s, l) => s + parseFloat(l.monto_usd || 0), 0),
        [lineas],
    );
    // Los montos de la barra de progreso son a nivel de OPERACIÓN (puede ser
    // mayor que pago.monto_usd si el pago es uno de varios "hermanos" con el
    // mismo método/monto repartido — ver _resumen_clasificacion_pago). Para
    // la mayoría de los pagos (sin hermanos) monto_operacion_usd === monto_usd.
    const montoOperacion = parseFloat(pago.monto_operacion_usd ?? pago.monto_usd ?? 0);
    // El tope de las líneas NUEVAS que se están agregando en este modal sigue
    // siendo el monto propio de este pago: cada línea manual queda enlazada a
    // ESTE pago (FK), no a la operación completa.
    const excedeMonto = totalLineasPropuesto > parseFloat(pago.monto_usd || 0) + 0.005;
    // Pendiente negativo = se clasificó de más a nivel de OPERACIÓN (puede pasar
    // aunque las líneas de ESTE pago no excedan su propio monto, por los
    // "hermanos" — ver nota de montoOperacion arriba). Es un estado de error,
    // no un simple "completo": la barra y el texto deben dejarlo claro en vez
    // de mostrar un número negativo sin contexto.
    const sobreClasificado = montoPendiente < -0.005;
    const pctReal = montoOperacion > 0 ? (montoClasificado / montoOperacion) * 100 : 0;
    const pct = Math.min(100, pctReal);

    const resetForm = () => {
        setTipo('inscripcion');
        setMes(new Date().getMonth() + 1);
        setAnio(CURRENT_YEAR);
        setMonto('');
        setNota('');
    };

    const handleAgregarLinea = async () => {
        const montoNum = parseFloat(monto);
        if (!montoNum || montoNum <= 0) {
            toast.warning('Ingresa un monto válido para la línea.');
            return;
        }
        setGuardando(true);
        try {
            const payload = { tipo, monto_usd: montoNum, nota: nota || undefined };
            if (tipo === 'mes_atrasado') {
                payload.mes = mes;
                payload.anio = anio;
            }
            const res = await crearClasificacionPago(pago.id, payload);
            // El backend responde { clasificacion, resumen }, no la línea aplanada.
            setLineas(prev => [...prev, res.data.clasificacion]);
            aplicarResumen(res.data.resumen);
            resetForm();
            toast.success('Línea de clasificación agregada.');
        } catch (err) {
            toast.error(getErrorMessage(err, 'No se pudo guardar la línea de clasificación.'));
        } finally {
            setGuardando(false);
        }
    };

    const iniciarEdicion = (linea) => {
        setLineaEditando(linea.id);
        setEditForm({
            tipo: linea.tipo,
            mes: linea.mes || new Date().getMonth() + 1,
            anio: linea.anio || CURRENT_YEAR,
            monto_usd: linea.monto_usd,
            nota: linea.nota || '',
        });
    };

    const cancelarEdicion = () => {
        setLineaEditando(null);
        setEditForm(null);
    };

    const guardarEdicion = async (lineaId) => {
        const montoNum = parseFloat(editForm.monto_usd);
        if (!montoNum || montoNum <= 0) {
            toast.warning('Ingresa un monto válido para la línea.');
            return;
        }
        setGuardandoEdicion(true);
        try {
            const payload = { tipo: editForm.tipo, monto_usd: montoNum, nota: editForm.nota || undefined };
            if (editForm.tipo === 'mes_atrasado') {
                payload.mes = editForm.mes;
                payload.anio = editForm.anio;
            }
            const res = await actualizarClasificacionLinea(lineaId, payload);
            // El backend responde { clasificacion, resumen }.
            setLineas(prev => prev.map(l => (l.id === lineaId ? res.data.clasificacion : l)));
            aplicarResumen(res.data.resumen);
            cancelarEdicion();
            toast.success('Línea de clasificación actualizada.');
        } catch (err) {
            toast.error(getErrorMessage(err, 'No se pudo actualizar la línea de clasificación.'));
        } finally {
            setGuardandoEdicion(false);
        }
    };

    const confirmarEliminarLinea = async () => {
        if (!lineaAEliminar) return;
        setEliminando(true);
        try {
            const res = await eliminarClasificacionLinea(lineaAEliminar.id);
            // El DELETE solo responde { resumen } (no hay clasificación que devolver).
            setLineas(prev => prev.filter(l => l.id !== lineaAEliminar.id));
            aplicarResumen(res.data.resumen);
            toast.success('Línea de clasificación eliminada.');
        } catch {
            toast.error('No se pudo eliminar la línea de clasificación.');
        } finally {
            setEliminando(false);
            setLineaAEliminar(null);
        }
    };

    const estStyle = ESTADO_CLASIF_STYLE[estadoClasificacion] || ESTADO_CLASIF_STYLE.sin_clasificar;

    return (
        <div className="fixed inset-0 flex items-center justify-center z-[100] p-4"
            style={{ background: 'rgba(43,48,58,0.55)' }}>
            <div
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="clasificacion-modal-title"
                className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl animate-fadeInUp"
                style={{ background: '#fff' }}>
                {/* Encabezado */}
                <div className="px-6 py-4 flex items-start justify-between gap-3" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                    <div>
                        <h3 id="clasificacion-modal-title" className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                            <Layers size={18} style={{ color: 'var(--pb)' }} />
                            Clasificar Pago
                        </h3>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                            {pago.alumno || '—'} · {pago.representante_nombre} · Ref. {pago.referencia || '—'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {onSiguientePendiente && (
                            <button
                                onClick={() => onSiguientePendiente(pago.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
                                style={{ background: 'var(--pb)', color: '#fff' }}>
                                Siguiente pendiente <ArrowRight size={13} />
                            </button>
                        )}
                        <button onClick={onClose} aria-label="Cerrar" style={{ color: 'var(--ash)' }}>
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {/* Progreso */}
                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                Clasificado: ${fmt(montoClasificado)} de ${fmt(montoOperacion)}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ background: estStyle.bg, color: estStyle.color }}>
                                {estStyle.label}
                            </span>
                        </div>
                        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--ash-light)' }}>
                            <div className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, background: sobreClasificado ? 'var(--red)' : (estadoClasificacion?.startsWith('completo') ? '#16a34a' : 'var(--pb)') }} />
                        </div>
                        {sobreClasificado ? (
                            <p className="text-xs mt-1 flex items-center gap-1.5" style={{ color: 'var(--red)' }}>
                                <AlertTriangle size={13} />
                                Excede el monto por <strong>${fmt(Math.abs(montoPendiente))}</strong> — revisa las líneas antes de continuar.
                            </p>
                        ) : (
                            <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>
                                Pendiente por clasificar: <strong>${fmt(montoPendiente)}</strong>
                            </p>
                        )}
                        {excedeMonto && (
                            <p className="text-xs mt-1.5 flex items-center gap-1.5" style={{ color: 'var(--red)' }}>
                                <AlertTriangle size={13} />
                                La suma de las líneas excede el monto total del pago. Revisa antes de continuar.
                            </p>
                        )}
                    </div>

                    {/* Líneas existentes */}
                    <div>
                        <p className="text-[11px] uppercase tracking-widest font-medium mb-2" style={{ color: 'var(--pb)' }}>
                            Líneas de clasificación
                        </p>
                        {lineas.length === 0 ? (
                            <p className="text-sm py-4 text-center rounded-lg" style={{ background: 'var(--porcelain)', color: 'var(--ash)' }}>
                                Este pago aún no tiene líneas de clasificación.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {lineas.map(l => (
                                    <div key={l.id} className="p-3 rounded-lg" style={{ border: '0.5px solid var(--border-md)' }}>
                                        {lineaEditando === l.id ? (
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap gap-2">
                                                    <select
                                                        value={editForm.tipo}
                                                        onChange={e => setEditForm(f => ({ ...f, tipo: e.target.value }))}
                                                        className="px-2.5 py-1.5 rounded-lg text-xs outline-none"
                                                        style={{ border: '0.5px solid var(--border-md)' }}>
                                                        {Object.entries(TIPO_CLASIFICACION_LABELS).map(([val, label]) => (
                                                            <option key={val} value={val}>{label}</option>
                                                        ))}
                                                    </select>
                                                    {editForm.tipo === 'mes_atrasado' && (
                                                        <>
                                                            <select
                                                                value={editForm.mes}
                                                                onChange={e => setEditForm(f => ({ ...f, mes: parseInt(e.target.value) }))}
                                                                className="px-2.5 py-1.5 rounded-lg text-xs outline-none"
                                                                style={{ border: '0.5px solid var(--border-md)' }}>
                                                                {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                                                            </select>
                                                            <input
                                                                type="number"
                                                                value={editForm.anio}
                                                                onChange={e => setEditForm(f => ({ ...f, anio: parseInt(e.target.value) }))}
                                                                className="w-20 px-2.5 py-1.5 rounded-lg text-xs outline-none"
                                                                style={{ border: '0.5px solid var(--border-md)' }} />
                                                        </>
                                                    )}
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={editForm.monto_usd}
                                                        onChange={e => setEditForm(f => ({ ...f, monto_usd: e.target.value }))}
                                                        placeholder="Monto USD"
                                                        className="w-28 px-2.5 py-1.5 rounded-lg text-xs outline-none"
                                                        style={{ border: '0.5px solid var(--border-md)' }} />
                                                </div>
                                                <input
                                                    type="text"
                                                    value={editForm.nota}
                                                    onChange={e => setEditForm(f => ({ ...f, nota: e.target.value }))}
                                                    placeholder="Nota (opcional)"
                                                    className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none"
                                                    style={{ border: '0.5px solid var(--border-md)' }} />
                                                <div className="flex gap-2 justify-end">
                                                    <button onClick={cancelarEdicion} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                                        Cancelar
                                                    </button>
                                                    <button
                                                        onClick={() => guardarEdicion(l.id)}
                                                        disabled={guardandoEdicion}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                                                        style={{ background: 'var(--pb)' }}>
                                                        {guardandoEdicion ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                                        Guardar
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                                        {l.tipo_display || TIPO_CLASIFICACION_LABELS[l.tipo] || l.tipo}
                                                        {l.tipo === 'mes_atrasado' && (
                                                            <span style={{ color: 'var(--ash)' }}> — {l.mes_display || MONTH_NAMES[(l.mes || 1) - 1]} {l.anio}</span>
                                                        )}
                                                    </p>
                                                    {l.nota && <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>{l.nota}</p>}
                                                </div>
                                                <div className="flex items-center gap-3 shrink-0">
                                                    <span className="text-sm font-bold font-mono" style={{ color: '#16a34a' }}>${fmt(l.monto_usd)}</span>
                                                    <button onClick={() => iniciarEdicion(l)} title="Editar línea" style={{ color: 'var(--pb)' }}>
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button onClick={() => setLineaAEliminar(l)} title="Eliminar línea" style={{ color: 'var(--red)' }}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Formulario nueva línea */}
                    <div className="p-4 rounded-xl" style={{ background: 'var(--porcelain)' }}>
                        <p className="text-[11px] uppercase tracking-widest font-medium mb-3" style={{ color: 'var(--pb)' }}>
                            Agregar línea
                        </p>
                        <div className="flex flex-wrap gap-2 mb-2">
                            <select
                                value={tipo}
                                onChange={e => setTipo(e.target.value)}
                                className="px-3 py-2 rounded-lg text-sm outline-none"
                                style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
                                {Object.entries(TIPO_CLASIFICACION_LABELS).map(([val, label]) => (
                                    <option key={val} value={val}>{label}</option>
                                ))}
                            </select>
                            {tipo === 'mes_atrasado' && (
                                <>
                                    <select
                                        value={mes}
                                        onChange={e => setMes(parseInt(e.target.value))}
                                        className="px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
                                        {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                                    </select>
                                    <input
                                        type="number"
                                        value={anio}
                                        onChange={e => setAnio(parseInt(e.target.value))}
                                        className="w-24 px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff' }} />
                                </>
                            )}
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={monto}
                                onChange={e => setMonto(e.target.value)}
                                placeholder="Monto USD"
                                className="w-32 px-3 py-2 rounded-lg text-sm outline-none"
                                style={{ border: '0.5px solid var(--border-md)', background: '#fff' }} />
                        </div>
                        <input
                            type="text"
                            value={nota}
                            onChange={e => setNota(e.target.value)}
                            placeholder="Nota (opcional)"
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-3"
                            style={{ border: '0.5px solid var(--border-md)', background: '#fff' }} />
                        <button
                            onClick={handleAgregarLinea}
                            disabled={guardando}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                            style={{ background: 'var(--pb)' }}>
                            {guardando ? <Loader2 size={15} className="animate-spin" /> : <PlusCircle size={15} />}
                            Agregar línea
                        </button>
                    </div>
                </div>
            </div>

            {lineaAEliminar && (
                <ConfirmDeleteModal
                    titulo="Eliminar línea de clasificación"
                    nombre={`${lineaAEliminar.tipo_display || TIPO_CLASIFICACION_LABELS[lineaAEliminar.tipo]} · $${fmt(lineaAEliminar.monto_usd)}`}
                    onConfirm={confirmarEliminarLinea}
                    onCancel={() => !eliminando && setLineaAEliminar(null)}
                />
            )}
        </div>
    );
};

export default ClasificacionPagoModal;
