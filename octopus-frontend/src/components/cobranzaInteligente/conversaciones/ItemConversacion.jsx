import { AlertCircle, UserCheck } from 'lucide-react';
import { horaCorta, iniciales, nombreConversacion, textoUltimoMensaje } from './conversacionesUtils';

/** Fila de la bandeja: avatar, nombre, último mensaje, hora y marcas (no leídos, sin vincular, pide persona). */
export function ItemConversacion({ conversacion: c, activa, onSeleccionar }) {
    const nombre = nombreConversacion(c);
    const noLeidos = c.no_leidos || 0;
    return (
        <button type="button" onClick={() => onSeleccionar(c.id)} aria-current={activa ? 'true' : undefined}
            className="w-full min-h-16 flex items-center gap-3 px-3 py-2.5 text-left"
            style={{
                background: activa ? 'var(--pb-light)' : 'transparent',
                borderBottom: '0.5px solid var(--border)',
                borderLeft: `3px solid ${activa ? 'var(--pb)' : 'transparent'}`,
            }}>
            <span aria-hidden="true" className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold"
                style={{ background: c.representante ? 'var(--pb)' : 'var(--ash)', color: '#fff' }}>
                {iniciales(nombre)}
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                    <span className={`text-sm truncate ${noLeidos ? 'font-bold' : 'font-medium'}`} style={{ color: 'var(--jet)' }}>{nombre}</span>
                    <time className="text-[11px] shrink-0" dateTime={c.ultimo_mensaje?.creado_en || c.actualizado_en}
                        style={{ color: noLeidos ? 'var(--pb-mid)' : 'var(--ash)' }}>
                        {horaCorta(c.ultimo_mensaje?.creado_en || c.actualizado_en)}
                    </time>
                </span>
                <span className="flex items-center justify-between gap-2">
                    <span className="text-xs truncate" style={{ color: 'var(--jet-mid)' }}>{textoUltimoMensaje(c)}</span>
                    {noLeidos > 0 && (
                        <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center"
                            style={{ background: 'var(--pb)', color: '#fff' }} aria-label={`${noLeidos} sin leer`}>
                            {noLeidos}
                        </span>
                    )}
                </span>
                {(!c.representante || c.requiere_humano || c.estado === 'humano') && (
                    <span className="mt-1 flex flex-wrap gap-1">
                        {!c.representante && (
                            <span className="text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ background: 'var(--ash-light)', color: 'var(--jet-mid)' }}>
                                Sin vincular
                            </span>
                        )}
                        {c.requiere_humano && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                                <AlertCircle size={10} aria-hidden="true" /> Pide una persona
                            </span>
                        )}
                        {c.estado === 'humano' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ background: 'var(--teal-light)', color: 'var(--teal)' }}>
                                <UserCheck size={10} aria-hidden="true" /> {c.tomada_por?.nombre || 'Atendida'}
                            </span>
                        )}
                    </span>
                )}
            </span>
        </button>
    );
}

export default ItemConversacion;
