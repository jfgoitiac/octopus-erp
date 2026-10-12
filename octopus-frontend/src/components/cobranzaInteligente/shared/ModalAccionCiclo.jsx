import { useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2 } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { mensajeErrorInteligente } from '../../../hooks/useCargaInteligente';
import { accionCicloInteligente } from '../../../api/cobranza.service';

const ACCIONES = [
    { value: 'llamada', label: 'Llamada realizada', texto: true },
    { value: 'whatsapp_manual', label: 'WhatsApp manual enviado', texto: true },
    { value: 'nota', label: 'Nota', texto: true },
    { value: 'pausar', label: 'Pausar el seguimiento', motivo: true },
    { value: 'reanudar', label: 'Reanudar el seguimiento' },
    { value: 'reclamo', label: 'Reclamo del representante (pausa)', texto: true },
    { value: 'cerrar', label: 'Descartar el caso', texto: true, fija: { motivo: 'descartada' } },
];

const btn = 'w-full sm:w-auto px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50';
const estiloSec = { border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' };
const estiloPri = { background: 'var(--pb)', color: '#fff' };
const campo = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };

/* ── Modal de acción sobre los ciclos de un representante ── */
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
            footer={
                <>
                    <button type="button" className={btn} style={estiloSec} onClick={onClose} disabled={guardando}>Cancelar</button>
                    <button type="button" className={`${btn} flex items-center justify-center gap-2`} style={estiloPri}
                        onClick={enviar} disabled={guardando}>
                        {guardando && <Loader2 size={16} className="animate-spin" />}Registrar
                    </button>
                </>
            }
        >
            <div className="space-y-3 text-sm">
                <div>
                    <label htmlFor="accion-tipo" className="block text-xs mb-1" style={{ color: 'var(--ash)' }}>Acción</label>
                    <select id="accion-tipo" value={accion} onChange={e => setAccion(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg" style={campo}>
                        {ACCIONES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="accion-texto" className="block text-xs mb-1" style={{ color: 'var(--ash)' }}>
                        {def.motivo ? 'Motivo (obligatorio)' : 'Detalle'}
                    </label>
                    <textarea id="accion-texto" rows={3} maxLength={500} value={texto}
                        onChange={e => setTexto(e.target.value)} className="w-full px-3 py-2 rounded-lg" style={campo} />
                </div>
            </div>
        </Modal>
    );
}

export default ModalAccion;
