import { useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2 } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { mensajeErrorInteligente } from '../../../hooks/useCargaInteligente';
import { crearReglaCobranza, actualizarReglaCobranza, copiarReglasGlobales } from '../../../api/cobranza.service';
import { VistaPreviaMensaje } from './VistaPreviaMensaje';
import {
    ETAPAS, CANALES, DESTINATARIOS, PLANTILLAS, mensajeDeRegla, normalizarReglas, aplicaAB, aplicaExtra, validarRegla, datosRegla,
} from './automatizacionesUtils';

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
// Respaldo si el backend no envía `limites` en GET reglas/ (la fuente es DIA_MIN/DIA_MAX del backend).
const LIMITES_DEFECTO = { dia_min: -30, dia_max: 90 };

export function EditorRegla({ regla, sedeId, limites = LIMITES_DEFECTO, onClose, onGuardada }) {
    const nueva = !regla?.id;
    const [f, setF] = useState({
        nombre: regla?.nombre ?? '', dia_relativo: regla?.dia_relativo ?? 0,
        etapa: regla?.etapa ?? 'temprana', canal: regla?.canal ?? 'whatsapp',
        plantilla: regla?.plantilla ?? PLANTILLAS[0], destinatario: regla?.destinatario ?? 'representante',
        saldo_minimo: regla?.saldo_minimo ?? '0.01', activa: regla?.activa ?? true,
        plantilla_meta: regla?.plantilla_meta ?? '', plantilla_meta_b: regla?.plantilla_meta_b ?? '',
        recordatorio_extra_paga_tarde: regla?.recordatorio_extra_paga_tarde ?? false,
    });
    const [guardando, setGuardando] = useState(false);
    const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
    const heredada = !nueva && !!regla.heredada && !!sedeId;
    const error = validarRegla(f);

    /**
     * Una regla heredada de las globales no se puede editar en la sede: el PATCH solo opera sobre
     * reglas de la sede. Se copian primero las globales (endpoint idempotente) y se edita con PATCH
     * la copia que ocupa el día original; el día sí se puede cambiar.
     */
    const guardarHeredada = async (datos) => {
        const { data } = await copiarReglasGlobales(sedeId);
        const copia = normalizarReglas(data).find(r => !r.heredada && r.dia_relativo === regla.dia_relativo);
        if (!copia) throw new Error('copia no encontrada');
        return actualizarReglaCobranza(copia.id, datos);
    };

    const guardar = async () => {
        setGuardando(true);
        const datos = datosRegla(f);
        try {
            let res;
            if (nueva) res = await crearReglaCobranza(datos, sedeId);
            else if (heredada) res = await guardarHeredada(datos);
            else res = await actualizarReglaCobranza(regla.id, datos);
            toast.success(nueva ? 'Regla creada' : 'Regla actualizada');
            onGuardada(res?.data);
        } catch (err) {
            toast.error(mensajeErrorInteligente(err));
        } finally {
            setGuardando(false);
        }
    };

    const invalida = !!error || f.dia_relativo === '' || Number.isNaN(Number(f.dia_relativo));

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
                    <Campo id="rg-dia" label={`Día relativo al vencimiento (${limites.dia_min} … +${limites.dia_max})`}>
                        <input id="rg-dia" type="number" min={limites.dia_min} max={limites.dia_max} className={inputCls} style={campo} value={f.dia_relativo} onChange={e => set('dia_relativo', e.target.value)} />
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
                    <Campo id="rg-meta" label="Plantilla de Meta A (opcional)">
                        <input id="rg-meta" className={inputCls} style={campo} value={f.plantilla_meta} onChange={e => set('plantilla_meta', e.target.value)} />
                    </Campo>
                    <Campo id="rg-meta-b" label="Plantilla de Meta B (opcional, A/B)">
                        <input id="rg-meta-b" className={inputCls} style={campo} value={f.plantilla_meta_b} onChange={e => set('plantilla_meta_b', e.target.value)} />
                    </Campo>
                </div>
                {heredada && (
                    <p className="text-xs" role="note" style={{ color: 'var(--ash)' }}>
                        Esta regla viene de las reglas globales. Al guardar, la sede recibe una copia de todas las globales y se edita la copia.
                    </p>
                )}
                {f.plantilla_meta_b.trim() && (
                    <p className="text-xs" role="note" style={{ color: 'var(--ash)' }}>
                        {aplicaAB(f)
                            ? 'Comparación A/B activa: cada representante recibe siempre la misma variante. Cambiar las plantillas con la prueba en curso mezcla los resultados.'
                            : 'La comparación A/B solo se activa en avisos por WhatsApp (o WhatsApp y email) al representante.'}
                    </p>
                )}
                {error && f.nombre.trim() && <p className="text-xs" role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
                <label className="flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                    <input type="checkbox" checked={f.activa} onChange={e => set('activa', e.target.checked)} />Regla activa
                </label>
                {aplicaExtra(f) && (
                    <label className="flex items-start gap-2" style={{ color: 'var(--jet)' }}>
                        <input type="checkbox" className="mt-1" checked={f.recordatorio_extra_paga_tarde}
                            onChange={e => set('recordatorio_extra_paga_tarde', e.target.checked)} />
                        <span>
                            Recordatorio extra a quienes pagan tarde
                            <span className="block text-xs" style={{ color: 'var(--ash)' }}>
                                Además de su día, esta regla se envía 3 días antes del vencimiento a los representantes con perfil «Paga tarde pero paga». Solo una regla por sede.
                            </span>
                        </span>
                    </label>
                )}
                <VistaPreviaMensaje texto={mensajeDeRegla(f)} />
            </div>
        </Modal>
    );
}

export default EditorRegla;
