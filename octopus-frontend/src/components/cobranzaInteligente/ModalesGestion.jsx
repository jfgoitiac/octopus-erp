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
    const [cuotas, setCuotas] = useState([{ fecha: '', monto: fila.saldo_total_usd }]);
    const [guardando, setGuardando] = useState(false);
    const suma = cuotas.reduce((s, c) => s + (parseFloat(c.monto) || 0), 0);
    const cambiar = (i, k, v) => setCuotas(cs => cs.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

    const crear = async () => {
        setGuardando(true);
        try {
            await crearConvenioInteligente({
                representante_id: fila.representante.id, ciclo_ids: fila.ciclos, cuotas,
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
                    deshabilitado={cuotas.some(c => !c.fecha)}>Crear convenio</Botones>
            }
        >
            <div className="space-y-3 text-sm">
                <p style={{ color: 'var(--ash)' }}>
                    Saldo a cubrir: <strong>${fila.saldo_total_usd}</strong>. Mientras el convenio esté vigente,
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
                <p style={{ color: Math.abs(suma - parseFloat(fila.saldo_total_usd)) > 0.01 ? 'var(--red)' : 'var(--green)' }}>
                    Suma de cuotas: ${suma.toFixed(2)}
                </p>
            </div>
        </Modal>
    );
}
