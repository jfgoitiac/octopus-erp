import { useState } from 'react';
import { toast } from 'react-toastify';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { mensajeErrorInteligente } from '../../hooks/useCargaInteligente';
import { accionCicloInteligente, crearConvenioInteligente } from '../../api/cobranza.service';

const ACCIONES = [
    { value: 'llamada', label: 'Llamada realizada', texto: true },
    { value: 'whatsapp_manual', label: 'WhatsApp manual enviado', texto: true },
    { value: 'nota', label: 'Nota', texto: true },
    { value: 'pausar', label: 'Pausar el seguimiento', motivo: true },
    { value: 'reclamo', label: 'Reclamo del representante (pausa)', texto: true },
    { value: 'cerrar', label: 'Descartar el caso', texto: true, fija: { motivo: 'descartada' } },
];

const Botones = ({ guardando, onCancelar, onConfirmar, deshabilitado, children }) => (
    <>
        <button type="button" className="btn btn-secondary w-full sm:w-auto" onClick={onCancelar} disabled={guardando}>Cancelar</button>
        <button type="button" className="btn btn-primary w-full sm:w-auto" onClick={onConfirmar} disabled={guardando || deshabilitado}>
            {guardando && <Loader2 size={16} className="animate-spin" />}{children}
        </button>
    </>
);

/* ── Acción sobre los ciclos de un representante ── */
export function ModalAccion({ fila, onClose, onHecho, accionInicial = 'llamada' }) {
    const [accion, setAccion] = useState(accionInicial);
    const [texto, setTexto] = useState('');
    const [guardando, setGuardando] = useState(false);
    const def = ACCIONES.find(a => a.value === accion);

    const enviar = async () => {
        setGuardando(true);
        try {
            for (const cicloId of fila.ciclos) {
                await accionCicloInteligente(cicloId, {
                    accion,
                    ...(def.motivo ? { motivo: texto } : { texto }),
                    ...(def.fija || {}),
                });
            }
            toast.success('Acción registrada');
            onHecho();
        } catch (err) {
            toast.error(mensajeErrorInteligente(err));
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Modal
            open
            onClose={() => !guardando && onClose()}
            titulo={`Acción · ${fila.representante.nombre}`}
            footer={<Botones guardando={guardando} onCancelar={onClose} onConfirmar={enviar}>Registrar</Botones>}
        >
            <div className="space-y-3 text-sm">
                <div>
                    <label htmlFor="accion-tipo" className="block text-xs mb-1" style={{ color: 'var(--ash)' }}>Acción</label>
                    <select id="accion-tipo" value={accion} onChange={e => setAccion(e.target.value)} className="input w-full">
                        {ACCIONES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="accion-texto" className="block text-xs mb-1" style={{ color: 'var(--ash)' }}>
                        {def.motivo ? 'Motivo (obligatorio)' : 'Detalle'}
                    </label>
                    <textarea id="accion-texto" rows={3} maxLength={500} value={texto}
                        onChange={e => setTexto(e.target.value)} className="input w-full" />
                </div>
            </div>
        </Modal>
    );
}

/* ── Convenio de pago ── */
export function ModalConvenio({ fila, onClose, onHecho }) {
    const saldoConvenio = fila.saldo_principal_usd ?? fila.saldo_total_usd;
    const [cuotas, setCuotas] = useState([{ fecha: '', monto: saldoConvenio }]);
    const [condiciones, setCondiciones] = useState({
        exonera_recargos_durante_vigencia: false,
        aplicar_recargo_incumplimiento: false,
        modo_recargo: 'monto_fijo_usd',
        valor_recargo: '',
        frecuencia_recargo: 'unico',
        intervalo_cantidad: 1,
        intervalo_unidad: 'mes',
        maximo_aplicaciones: '',
        tope_recargo_usd: '',
    });
    const [guardando, setGuardando] = useState(false);
    const suma = cuotas.reduce((s, c) => s + (parseFloat(c.monto) || 0), 0);
    const cambiar = (i, k, v) => setCuotas(cs => cs.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
    const cambiarCondicion = (k, v) => setCondiciones(c => ({ ...c, [k]: v }));
    const valorRecargo = parseFloat(condiciones.valor_recargo) || 0;
    const ejemploRecargo = condiciones.modo_recargo === 'porcentaje'
        ? suma * valorRecargo / 100
        : valorRecargo;

    const crear = async () => {
        setGuardando(true);
        try {
            await crearConvenioInteligente({
                representante_id: fila.representante.id, ciclo_ids: fila.ciclos, cuotas,
                ...condiciones,
                maximo_aplicaciones: condiciones.maximo_aplicaciones || null,
                tope_recargo_usd: condiciones.tope_recargo_usd || null,
            });
            toast.success('Convenio creado');
            onHecho();
        } catch (err) {
            toast.error(mensajeErrorInteligente(err));
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Modal
            open size="lg"
            onClose={() => !guardando && onClose()}
            titulo={`Convenio · ${fila.representante.nombre}`}
            footer={
                <Botones guardando={guardando} onCancelar={onClose} onConfirmar={crear}
                    deshabilitado={cuotas.some(c => !c.fecha)
                        || Math.abs(suma - parseFloat(saldoConvenio)) > 0.01
                        || (condiciones.aplicar_recargo_incumplimiento && valorRecargo <= 0)}>
                    Crear convenio
                </Botones>
            }
        >
            <div className="space-y-3 text-sm">
                <p style={{ color: 'var(--ash)' }}>
                    Principal a cubrir: <strong>${saldoConvenio}</strong>. Mientras el convenio esté vigente,
                    se pausa el seguimiento; si una cuota se incumple, el caso vuelve a la bandeja.
                </p>
                {cuotas.map((c, i) => (
                    <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input type="date" aria-label={`Fecha cuota ${i + 1}`} value={c.fecha}
                            onChange={e => cambiar(i, 'fecha', e.target.value)} className="input w-full" />
                        <input type="number" min="0" step="0.01" aria-label={`Monto cuota ${i + 1}`} value={c.monto}
                            onChange={e => cambiar(i, 'monto', e.target.value)} className="input w-full" />
                        {cuotas.length > 1 && (
                            <button type="button" aria-label={`Quitar cuota ${i + 1}`} className="btn btn-ghost self-end sm:self-auto"
                                onClick={() => setCuotas(cs => cs.filter((_, j) => j !== i))}>
                                <Trash2 size={16} />
                            </button>
                        )}
                    </div>
                ))}
                <button type="button" className="flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--pb)' }}
                    onClick={() => setCuotas(cs => [...cs, { fecha: '', monto: '' }])}>
                    <Plus size={16} />Agregar cuota
                </button>
                <p style={{ color: Math.abs(suma - parseFloat(saldoConvenio)) > 0.01 ? 'var(--red)' : 'var(--green)' }}>
                    Suma de cuotas: ${suma.toFixed(2)}
                </p>

                <section className="rounded-xl p-3 sm:p-4 space-y-3" style={{ border: '1px solid var(--border)', background: 'var(--bg)' }}>
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" className="mt-1" checked={condiciones.exonera_recargos_durante_vigencia}
                            onChange={e => cambiarCondicion('exonera_recargos_durante_vigencia', e.target.checked)} />
                        <span>
                            <strong className="block text-sm" style={{ color: 'var(--jet)' }}>Exonerar recargos normales mientras esté vigente</strong>
                            <span className="text-xs" style={{ color: 'var(--ash)' }}>Solo afecta las mensualidades incluidas; no elimina recargos cobrados.</span>
                        </span>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" className="mt-1" checked={condiciones.aplicar_recargo_incumplimiento}
                            onChange={e => cambiarCondicion('aplicar_recargo_incumplimiento', e.target.checked)} />
                        <span>
                            <strong className="block text-sm" style={{ color: 'var(--jet)' }}>Aplicar recargo si se incumple</strong>
                            <span className="text-xs" style={{ color: 'var(--ash)' }}>La configuración queda congelada al crear el convenio.</span>
                        </span>
                    </label>

                    {condiciones.aplicar_recargo_incumplimiento && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            <label className="text-xs" style={{ color: 'var(--ash)' }}>Modo
                                <select className="input w-full mt-1" value={condiciones.modo_recargo}
                                    onChange={e => cambiarCondicion('modo_recargo', e.target.value)}>
                                    <option value="monto_fijo_usd">Monto fijo (USD)</option>
                                    <option value="porcentaje">Porcentaje</option>
                                </select>
                            </label>
                            <label className="text-xs" style={{ color: 'var(--ash)' }}>
                                {condiciones.modo_recargo === 'porcentaje' ? 'Valor (%)' : 'Valor (USD)'}
                                <input className="input w-full mt-1" type="number" min="0.01" step="0.01"
                                    value={condiciones.valor_recargo}
                                    onChange={e => cambiarCondicion('valor_recargo', e.target.value)} />
                            </label>
                            <label className="text-xs" style={{ color: 'var(--ash)' }}>Frecuencia
                                <select className="input w-full mt-1" value={condiciones.frecuencia_recargo}
                                    onChange={e => cambiarCondicion('frecuencia_recargo', e.target.value)}>
                                    <option value="unico">Un solo cargo</option>
                                    <option value="recurrente">Recurrente</option>
                                </select>
                            </label>
                            {condiciones.frecuencia_recargo === 'recurrente' && (
                                <>
                                    <div className="grid grid-cols-2 gap-2">
                                        <label className="text-xs" style={{ color: 'var(--ash)' }}>Cada
                                            <input className="input w-full mt-1" type="number" min="1" value={condiciones.intervalo_cantidad}
                                                onChange={e => cambiarCondicion('intervalo_cantidad', e.target.value)} />
                                        </label>
                                        <label className="text-xs" style={{ color: 'var(--ash)' }}>Unidad
                                            <select className="input w-full mt-1" value={condiciones.intervalo_unidad}
                                                onChange={e => cambiarCondicion('intervalo_unidad', e.target.value)}>
                                                <option value="dia">Día(s)</option><option value="semana">Semana(s)</option><option value="mes">Mes(es)</option>
                                            </select>
                                        </label>
                                    </div>
                                    <label className="text-xs" style={{ color: 'var(--ash)' }}>Máximo de aplicaciones (opcional)
                                        <input className="input w-full mt-1" type="number" min="1" value={condiciones.maximo_aplicaciones}
                                            onChange={e => cambiarCondicion('maximo_aplicaciones', e.target.value)} />
                                    </label>
                                    <label className="text-xs" style={{ color: 'var(--ash)' }}>Tope total USD (opcional)
                                        <input className="input w-full mt-1" type="number" min="0.01" step="0.01" value={condiciones.tope_recargo_usd}
                                            onChange={e => cambiarCondicion('tope_recargo_usd', e.target.value)} />
                                    </label>
                                </>
                            )}
                            <div className="sm:col-span-2 rounded-lg p-3 text-xs space-y-1" style={{ background: 'var(--red-light)', color: 'var(--jet)' }}>
                                <p><strong>Previsualización:</strong> primer cargo al incumplir: ${ejemploRecargo.toFixed(2)}.</p>
                                {condiciones.frecuencia_recargo === 'recurrente' && <p>Se repetirá cada {condiciones.intervalo_cantidad} {condiciones.intervalo_unidad}(s), sujeto a los límites indicados.</p>}
                                {condiciones.modo_recargo === 'porcentaje' && <p>Se calcula sobre el saldo principal pendiente de cada fecha. Los recargos previos no forman parte de la base; no hay interés compuesto.</p>}
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </Modal>
    );
}
