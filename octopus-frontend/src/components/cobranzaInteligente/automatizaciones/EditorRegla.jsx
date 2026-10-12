import { useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2 } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { mensajeErrorInteligente } from '../../../hooks/useCargaInteligente';
import { crearReglaCobranza, actualizarReglaCobranza } from '../../../api/cobranza.service';
import { VistaPreviaMensaje } from './VistaPreviaMensaje';
import { ETAPAS, CANALES, DESTINATARIOS, PLANTILLAS, mensajeDeRegla } from './automatizacionesUtils';

const btn = 'w-full sm:w-auto px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50';
const campo = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const inputCls = 'w-full px-3 py-2 rounded-lg';

const Campo = ({ id, label, children }) => (
    <div className="space-y-1">
        <label htmlFor={id} className="text-xs font-semibold" style={{ color: 'var(--ash)' }}>{label}</label>
        {children}
    </div>
);

/** Editor de una regla (crear o editar) dentro de un Modal. */
export function EditorRegla({ regla, sedeId, onClose, onGuardada }) {
    const nueva = !regla?.id;
    const [f, setF] = useState({
        nombre: regla?.nombre ?? '', dia_relativo: regla?.dia_relativo ?? 0,
        etapa: regla?.etapa ?? 'temprana', canal: regla?.canal ?? 'whatsapp',
        plantilla: regla?.plantilla ?? PLANTILLAS[0], destinatario: regla?.destinatario ?? 'representante',
        saldo_minimo: regla?.saldo_minimo ?? '0.01', activa: regla?.activa ?? true,
        // Solo si el backend lo expone en la respuesta de la regla.
        ...(regla && 'plantilla_meta' in regla ? { plantilla_meta: regla.plantilla_meta ?? '' } : {}),
    });
    const [guardando, setGuardando] = useState(false);
    const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
    const tienePlantillaMeta = 'plantilla_meta' in f;

    const guardar = async () => {
        setGuardando(true);
        const datos = { ...f, dia_relativo: Number(f.dia_relativo) };
        try {
            const res = nueva ? await crearReglaCobranza(datos, sedeId) : await actualizarReglaCobranza(regla.id, datos);
            toast.success(nueva ? 'Regla creada' : 'Regla actualizada');
            onGuardada(res?.data);
        } catch (err) {
            toast.error(mensajeErrorInteligente(err));
        } finally {
            setGuardando(false);
        }
    };

    const invalida = !f.nombre.trim() || f.dia_relativo === '' || Number.isNaN(Number(f.dia_relativo));

    return (
        <Modal open size="lg" onClose={() => !guardando && onClose()} titulo={nueva ? 'Nueva regla' : `Editar regla · ${regla.nombre}`}
            footer={
                <>
                    <button type="button" className={btn} style={{ border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' }}
                        onClick={onClose} disabled={guardando}>Cancelar</button>
                    <button type="button" className={`${btn} flex items-center justify-center gap-2`} style={{ background: 'var(--pb)', color: '#fff' }}
                        onClick={guardar} disabled={guardando || invalida}>
                        {guardando && <Loader2 size={16} className="animate-spin" />}Guardar
                    </button>
                </>
            }>
            <div className="space-y-3 text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Campo id="rg-nombre" label="Nombre">
                        <input id="rg-nombre" className={inputCls} style={campo} value={f.nombre} onChange={e => set('nombre', e.target.value)} />
                    </Campo>
                    <Campo id="rg-dia" label="Día relativo al vencimiento (−5 … +30)">
                        <input id="rg-dia" type="number" className={inputCls} style={campo} value={f.dia_relativo} onChange={e => set('dia_relativo', e.target.value)} />
                    </Campo>
                    <Campo id="rg-etapa" label="Etapa">
                        <select id="rg-etapa" className={inputCls} style={campo} value={f.etapa} onChange={e => set('etapa', e.target.value)}>
                            {ETAPAS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </Campo>
                    <Campo id="rg-canal" label="Canal">
                        <select id="rg-canal" className={inputCls} style={campo} value={f.canal} onChange={e => set('canal', e.target.value)}>
                            {CANALES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </Campo>
                    <Campo id="rg-plantilla" label="Plantilla de texto">
                        <select id="rg-plantilla" className={inputCls} style={campo} value={f.plantilla} onChange={e => set('plantilla', e.target.value)}>
                            {PLANTILLAS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </Campo>
                    <Campo id="rg-dest" label="Destinatario">
                        <select id="rg-dest" className={inputCls} style={campo} value={f.destinatario} onChange={e => set('destinatario', e.target.value)}>
                            {DESTINATARIOS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </Campo>
                    <Campo id="rg-saldo" label="Saldo mínimo (USD)">
                        <input id="rg-saldo" type="number" min="0" step="0.01" className={inputCls} style={campo} value={f.saldo_minimo} onChange={e => set('saldo_minimo', e.target.value)} />
                    </Campo>
                    {tienePlantillaMeta && (
                        <Campo id="rg-meta" label="Plantilla de Meta (opcional)">
                            <input id="rg-meta" className={inputCls} style={campo} value={f.plantilla_meta} onChange={e => set('plantilla_meta', e.target.value)} />
                        </Campo>
                    )}
                </div>
                <label className="flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                    <input type="checkbox" checked={f.activa} onChange={e => set('activa', e.target.checked)} />Regla activa
                </label>
                <VistaPreviaMensaje texto={mensajeDeRegla(f)} />
            </div>
        </Modal>
    );
}

export default EditorRegla;
