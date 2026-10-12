import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Clock, FileText, Loader2, MessageSquareText, Paperclip, Send, X } from 'lucide-react';
import { getRespuestasRapidasConversacion } from '../../../api/cobranza.service';
import {
    MAX_ARCHIVO_BYTES, TIPOS_ARCHIVO, formatoRestante, mensajeError, segundosRestantes,
} from './conversacionesUtils';

const REFRESCO_RELOJ_MS = 30_000;

/** Reloj que se actualiza cada 30 s para la cuenta regresiva de la ventana de 24 h. */
function useAhora() {
    const [ahora, setAhora] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setAhora(Date.now()), REFRESCO_RELOJ_MS);
        return () => clearInterval(id);
    }, []);
    return ahora;
}

const estiloCampo = { border: '1px solid var(--border-md)', background: 'var(--surface)', color: 'var(--jet)' };
const btnIcono = 'w-11 h-11 shrink-0 rounded-xl flex items-center justify-center disabled:opacity-50';

/**
 * Compositor fijo al pie del hilo.
 *  - Dentro de la ventana de 24 h: texto libre, adjunto (JPG/PNG/WEBP/PDF, máx. 10 MB) y respuestas rápidas.
 *  - Fuera de la ventana: cambia a "Enviar plantilla" y muestra la ventana cerrada (Meta solo admite plantillas).
 *  - Modo "Nota interna": la familia no la ve; no depende de la ventana.
 * `onEnviar({ cuerpo, archivo })` y `onNota(cuerpo)` devuelven true si salieron.
 */
export function Compositor({ conversacion, onEnviar, onNota, onAbrirPlantilla }) {
    const ahora = useAhora();
    const [modo, setModo] = useState('mensaje');
    const [texto, setTexto] = useState('');
    const [archivo, setArchivo] = useState(null);
    const [enviando, setEnviando] = useState(false);
    const [rapidas, setRapidas] = useState(null);
    const [verRapidas, setVerRapidas] = useState(false);
    const inputArchivo = useRef(null);

    const restante = segundosRestantes(conversacion, ahora);
    const ventanaAbierta = restante > 0;
    const esNota = modo === 'nota';
    const soloPlantilla = !ventanaAbierta && !esNota;
    const idConversacion = conversacion?.id;

    const abrirRapidas = async () => {
        const abrir = !verRapidas;
        setVerRapidas(abrir);
        if (!abrir || rapidas) return;
        try {
            const res = await getRespuestasRapidasConversacion(idConversacion);
            setRapidas(res.data?.results || []);
        } catch (err) {
            setVerRapidas(false);
            toast.error(mensajeError(err, 'No se pudieron cargar las respuestas rápidas.'));
        }
    };

    const insertarRapida = (r) => {
        const contenido = r.cuerpo_renderizado ?? r.cuerpo;
        setTexto(t => (t ? `${t}\n${contenido}` : contenido));
        setVerRapidas(false);
    };

    const elegirArchivo = (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        if (!TIPOS_ARCHIVO.split(',').includes(f.type)) {
            toast.error('Formato no admitido. Usa JPG, PNG, WEBP o PDF.');
            return;
        }
        if (f.size > MAX_ARCHIVO_BYTES) {
            toast.error('El archivo supera los 10 MB.');
            return;
        }
        setArchivo(f);
    };

    const puedeEnviar = !enviando && (esNota ? !!texto.trim() : (!!texto.trim() || !!archivo));

    const enviar = async () => {
        if (!puedeEnviar) return;
        const cuerpo = texto.trim();
        const adjunto = archivo;
        setEnviando(true);
        setTexto('');
        setArchivo(null);
        const ok = esNota ? await onNota(cuerpo) : await onEnviar({ cuerpo, archivo: adjunto });
        setEnviando(false);
        if (!ok) {
            setTexto(cuerpo);
            setArchivo(adjunto);
        }
    };

    const alTeclear = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            enviar();
        }
    };

    const pestana = (valor, etiqueta) => (
        <button type="button" role="tab" aria-selected={modo === valor} onClick={() => setModo(valor)}
            className="min-h-11 px-3 text-sm font-medium rounded-t-xl"
            style={modo === valor
                ? { color: 'var(--pb-mid)', borderBottom: '2px solid var(--pb)' }
                : { color: 'var(--ash)', borderBottom: '2px solid transparent' }}>
            {etiqueta}
        </button>
    );

    return (
        <div className="shrink-0 px-3 pb-3 pt-1 sm:px-4 space-y-2" style={{ borderTop: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
            <div className="flex items-center justify-between gap-2">
                <div role="tablist" aria-label="Tipo de mensaje" className="flex">
                    {pestana('mensaje', ventanaAbierta ? 'Responder' : 'Plantilla')}
                    {pestana('nota', 'Nota interna')}
                </div>
                {!esNota && (
                    <p className="flex items-center gap-1 text-xs text-right" style={{ color: ventanaAbierta ? 'var(--jet-mid)' : 'var(--red)' }}>
                        <Clock size={13} className="shrink-0" aria-hidden="true" />
                        {ventanaAbierta ? `Ventana de 24 h: quedan ${formatoRestante(restante)}` : 'Ventana de 24 h cerrada'}
                    </p>
                )}
            </div>

            {soloPlantilla ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl px-3 py-3"
                    style={{ background: 'var(--yellow-light)' }}>
                    <p className="text-sm" style={{ color: 'var(--jet)' }}>
                        Pasaron más de 24 h desde el último mensaje de la familia. Solo puedes enviar una plantilla aprobada.
                    </p>
                    <button type="button" onClick={onAbrirPlantilla}
                        className="w-full sm:w-auto min-h-11 px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 shrink-0"
                        style={{ background: 'var(--pb)', color: '#fff' }}>
                        <Send size={16} aria-hidden="true" /> Enviar plantilla
                    </button>
                </div>
            ) : (
                <>
                    {archivo && (
                        <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--ash-light)', color: 'var(--jet)' }}>
                            <FileText size={16} className="shrink-0" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate">{archivo.name}</span>
                            <button type="button" onClick={() => setArchivo(null)} aria-label="Quitar adjunto" className="w-8 h-8 flex items-center justify-center rounded-full">
                                <X size={16} aria-hidden="true" />
                            </button>
                        </div>
                    )}
                    {verRapidas && (
                        <div className="max-h-48 overflow-y-auto rounded-xl" style={{ border: '1px solid var(--border-md)', background: 'var(--surface)' }}>
                            {rapidas === null && <p className="p-3 text-xs" style={{ color: 'var(--ash)' }}>Cargando…</p>}
                            {rapidas?.length === 0 && <p className="p-3 text-xs" style={{ color: 'var(--ash)' }}>No hay respuestas rápidas. Créalas en Automatizaciones.</p>}
                            <ul>
                                {(rapidas || []).map(r => (
                                    <li key={r.id}>
                                        <button type="button" onClick={() => insertarRapida(r)}
                                            className="w-full min-h-11 text-left px-3 py-2" style={{ borderBottom: '0.5px solid var(--border)' }}>
                                            <span className="block text-sm font-medium" style={{ color: 'var(--jet)' }}>{r.titulo}</span>
                                            <span className="block text-xs truncate" style={{ color: 'var(--ash)' }}>{r.cuerpo_renderizado ?? r.cuerpo}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <div className="flex items-end gap-2">
                        {!esNota && (
                            <>
                                <button type="button" onClick={() => inputArchivo.current?.click()} aria-label="Adjuntar archivo"
                                    className={btnIcono} style={{ border: '1px solid var(--border-md)', color: 'var(--jet)' }}>
                                    <Paperclip size={18} aria-hidden="true" />
                                </button>
                                <input ref={inputArchivo} type="file" accept={TIPOS_ARCHIVO} onChange={elegirArchivo} className="hidden" data-testid="input-archivo" />
                                <button type="button" onClick={abrirRapidas} aria-label="Respuestas rápidas" aria-expanded={verRapidas}
                                    className={btnIcono} style={{ border: '1px solid var(--border-md)', color: 'var(--jet)' }}>
                                    <MessageSquareText size={18} aria-hidden="true" />
                                </button>
                            </>
                        )}
                        <textarea value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={alTeclear} rows={2}
                            aria-label={esNota ? 'Nota interna' : 'Mensaje'}
                            placeholder={esNota ? 'Nota interna (la familia no la ve)' : 'Escribe un mensaje…'}
                            className="min-w-0 flex-1 resize-none rounded-xl px-3 py-2 text-sm max-h-32"
                            style={esNota ? { ...estiloCampo, background: 'var(--yellow-light)' } : estiloCampo} />
                        <button type="button" onClick={enviar} disabled={!puedeEnviar} aria-label={esNota ? 'Guardar nota' : 'Enviar mensaje'}
                            className={btnIcono} style={{ background: 'var(--pb)', color: '#fff' }}>
                            {enviando ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
                        </button>
                    </div>
                    {!esNota && conversacion?.estado === 'automatico' && (
                        <p className="text-[11px]" style={{ color: 'var(--ash)' }}>Al enviar, tomas la conversación y el sistema deja de escribirle a esta familia.</p>
                    )}
                </>
            )}
        </div>
    );
}

export default Compositor;
