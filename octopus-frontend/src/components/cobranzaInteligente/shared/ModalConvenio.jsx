import { useState } from 'react';
import { toast } from 'react-toastify';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { mensajeErrorInteligente } from '../../../hooks/useCargaInteligente';
import { crearConvenioInteligente } from '../../../api/cobranza.service';

const btn = 'w-full sm:w-auto px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50';
const estiloSec = { border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' };
const estiloPri = { background: 'var(--pb)', color: '#fff' };
const campo = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };

/* ── Modal de convenio de pago ── */
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
                <>
                    <button type="button" className={btn} style={estiloSec} onClick={onClose} disabled={guardando}>Cancelar</button>
                    <button type="button" className={`${btn} flex items-center justify-center gap-2`} style={estiloPri}
                        onClick={crear} disabled={guardando || cuotas.some(c => !c.fecha)}>
                        {guardando && <Loader2 size={16} className="animate-spin" />}Crear convenio
                    </button>
                </>
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
                            onChange={e => cambiar(i, 'fecha', e.target.value)} className="w-full px-3 py-2 rounded-lg" style={campo} />
                        <input type="number" min="0" step="0.01" aria-label={`Monto cuota ${i + 1}`} value={c.monto}
                            onChange={e => cambiar(i, 'monto', e.target.value)} className="w-full px-3 py-2 rounded-lg" style={campo} />
                        {cuotas.length > 1 && (
                            <button type="button" aria-label={`Quitar cuota ${i + 1}`} className="p-2 self-end sm:self-auto"
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

export default ModalConvenio;
