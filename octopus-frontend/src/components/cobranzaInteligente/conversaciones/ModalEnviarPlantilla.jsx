import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2, Send } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { getPlantillasConversacion } from '../../../api/cobranza.service';
import { armarCuerpo, mensajeError } from './conversacionesUtils';

const campo = 'w-full rounded-xl px-3 py-2 text-sm min-h-11';
const estiloCampo = { border: '1px solid var(--border-md)', background: 'var(--surface)', color: 'var(--jet)' };

/**
 * Envía una plantilla aprobada de Meta (permitido dentro y fuera de la ventana de 24 h).
 * `onEnviar({ plantilla_id, parametros, cuerpo })` devuelve true si salió.
 */
export function ModalEnviarPlantilla({ open, onClose, onEnviar, fueraDeVentana = false }) {
    const [plantillas, setPlantillas] = useState(null);
    const [elegidaId, setElegidaId] = useState('');
    const [valores, setValores] = useState([]);
    const [enviando, setEnviando] = useState(false);

    useEffect(() => {
        if (!open) return undefined;
        const controller = new AbortController();
        getPlantillasConversacion(controller.signal)
            .then(res => {
                const lista = res.data?.results || [];
                setPlantillas(lista);
                setElegidaId(lista[0] ? String(lista[0].id) : '');
                setValores(Array((lista[0]?.orden_parametros || []).length).fill(''));
            })
            .catch(err => {
                if (err?.code === 'ERR_CANCELED') return;
                setPlantillas([]);
                toast.error(mensajeError(err, 'No se pudieron cargar las plantillas.'));
            });
        return () => controller.abort();
    }, [open]);

    const elegida = useMemo(() => (plantillas || []).find(p => String(p.id) === elegidaId) || null, [plantillas, elegidaId]);
    const parametros = elegida?.orden_parametros || [];
    const completo = !!elegida && parametros.every((_, i) => (valores[i] || '').trim());

    const elegir = (id) => {
        setElegidaId(id);
        const p = (plantillas || []).find(x => String(x.id) === id);
        setValores(Array((p?.orden_parametros || []).length).fill(''));
    };

    const enviar = async () => {
        if (!elegida || !completo || enviando) return;
        setEnviando(true);
        const ok = await onEnviar({
            plantilla_id: elegida.id,
            parametros: valores.map(v => v.trim()),
            cuerpo: armarCuerpo(elegida, valores.map(v => v.trim())),
        });
        setEnviando(false);
        if (ok) onClose();
    };

    const footer = (
        <>
            <button type="button" onClick={onClose}
                className="w-full sm:w-auto min-h-11 px-4 py-2 rounded-xl text-sm font-medium"
                style={{ border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' }}>
                Cancelar
            </button>
            <button type="button" onClick={enviar} disabled={!completo || enviando}
                className="w-full sm:w-auto min-h-11 px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'var(--pb)', color: '#fff' }}>
                {enviando ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
                Enviar plantilla
            </button>
        </>
    );

    return (
        <Modal open={open} onClose={onClose} titulo="Enviar plantilla" size="md" footer={footer}>
            <div className="space-y-4">
                {fueraDeVentana && (
                    <p className="text-xs rounded-xl px-3 py-2" style={{ background: 'var(--yellow-light)', color: 'var(--jet)' }}>
                        Pasaron más de 24 h desde el último mensaje de la familia: solo se pueden enviar plantillas aprobadas por Meta.
                    </p>
                )}
                {plantillas === null && (
                    <div className="space-y-2 animate-pulse" aria-hidden="true">
                        <div className="h-11 rounded-xl" style={{ background: 'var(--ash-light)' }} />
                        <div className="h-24 rounded-xl" style={{ background: 'var(--ash-light)' }} />
                    </div>
                )}
                {plantillas && plantillas.length === 0 && (
                    <p className="text-sm text-center py-6" style={{ color: 'var(--ash)' }}>
                        No hay plantillas aprobadas disponibles. Pide al administrador que registre una en Automatizaciones.
                    </p>
                )}
                {plantillas && plantillas.length > 0 && (
                    <>
                        <div className="space-y-1">
                            <label htmlFor="plantilla-elegida" className="text-xs font-medium" style={{ color: 'var(--jet-mid)' }}>Plantilla</label>
                            <select id="plantilla-elegida" value={elegidaId} onChange={e => elegir(e.target.value)} className={campo} style={estiloCampo}>
                                {plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                        {parametros.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {parametros.map((nombre, i) => (
                                    <div key={`${nombre}-${i}`} className="space-y-1">
                                        <label htmlFor={`plantilla-param-${i}`} className="text-xs font-medium" style={{ color: 'var(--jet-mid)' }}>
                                            {`{{${i + 1}}} · ${nombre}`}
                                        </label>
                                        <input id={`plantilla-param-${i}`} type="text" value={valores[i] || ''}
                                            onChange={e => setValores(v => v.map((x, j) => (j === i ? e.target.value : x)))}
                                            className={campo} style={estiloCampo} />
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="space-y-1">
                            <p className="text-xs font-medium" style={{ color: 'var(--jet-mid)' }}>Vista previa</p>
                            <p className="text-sm whitespace-pre-wrap break-words rounded-xl px-3 py-2"
                                style={{ background: 'var(--pb-light)', color: 'var(--jet)' }}>
                                {armarCuerpo(elegida, valores)}
                            </p>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}

export default ModalEnviarPlantilla;
