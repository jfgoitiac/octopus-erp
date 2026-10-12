import { AlertCircle, Bot, Check, CheckCheck, Clock, StickyNote } from 'lucide-react';
import { AdjuntoMensaje } from './AdjuntoMensaje';
import { ESTADOS_ENTREGA, horaMensaje } from './conversacionesUtils';

/** Ícono y color del estado de entrega de un saliente (✓ enviado, ✓✓ entregado, ✓✓ azul leído, ! fallido). */
function EstadoEntrega({ estado, pendiente, errores }) {
    if (pendiente) {
        return <Clock size={13} aria-label="Enviando" role="img" style={{ color: 'var(--ash)' }} />;
    }
    const etiqueta = ESTADOS_ENTREGA[estado];
    if (!etiqueta) return null;
    if (estado === 'fallido') {
        const detalle = errores?.[0]?.title ? `: ${errores[0].title}` : '';
        return (
            <span className="inline-flex items-center gap-1" style={{ color: 'var(--red)' }}>
                <AlertCircle size={13} aria-hidden="true" />
                <span>{etiqueta}{detalle}</span>
            </span>
        );
    }
    const Icono = estado === 'enviado' ? Check : CheckCheck;
    return <Icono size={14} role="img" aria-label={etiqueta} style={{ color: estado === 'leido' ? 'var(--pb)' : 'var(--ash)' }} />;
}

const ETIQUETA_ORIGEN = { motor: 'Recordatorio automático', bot: 'Respuesta automática', manual_wame: 'Cobro manual', manual_api: 'Cobro manual' };

/** Una burbuja del hilo: entrante, saliente, nota interna o aviso del sistema. */
export function BurbujaMensaje({ mensaje }) {
    const { direccion, tipo, cuerpo, payload = {}, adjunto, enviado_por: autor } = mensaje;

    if (tipo === 'sistema') {
        return (
            <div className="flex justify-center py-1">
                <p className="max-w-[90%] text-center text-xs rounded-full px-3 py-1" style={{ background: 'var(--ash-light)', color: 'var(--jet-mid)' }}>
                    {cuerpo}
                </p>
            </div>
        );
    }

    const nota = direccion === 'nota';
    const saliente = direccion === 'saliente';
    const estilo = nota
        ? { background: 'var(--yellow-light)', border: '1px dashed var(--yellow)', color: 'var(--jet)' }
        : saliente
            ? { background: 'var(--pb-light)', border: '0.5px solid var(--border)', color: 'var(--jet)' }
            : { background: 'var(--surface)', border: '0.5px solid var(--border-md)', color: 'var(--jet)' };
    const origen = saliente ? ETIQUETA_ORIGEN[payload.origen] : null;
    const quien = nota ? (autor?.nombre || 'Nota interna') : saliente ? (origen ? null : autor?.nombre) : null;
    const textoCuerpo = tipo === 'boton' || tipo === 'lista'
        ? (payload.titulo || cuerpo)
        : cuerpo;

    return (
        <div className={`flex ${saliente || nota ? 'justify-end' : 'justify-start'}`}>
            <article
                aria-label={nota ? 'Nota interna' : saliente ? 'Mensaje enviado' : 'Mensaje recibido'}
                className={`min-w-0 max-w-[88%] sm:max-w-[75%] rounded-2xl px-3 py-2 space-y-1.5 ${saliente || nota ? 'rounded-br-md' : 'rounded-bl-md'}`}
                style={estilo}
            >
                {nota && (
                    <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--amber-ink)' }}>
                        <StickyNote size={12} aria-hidden="true" /> Nota interna · solo el equipo
                    </p>
                )}
                {origen && (
                    <p className="flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--jet-mid)' }}>
                        <Bot size={12} aria-hidden="true" /> {origen}
                    </p>
                )}
                {quien && !nota && <p className="text-[11px] font-medium" style={{ color: 'var(--jet-mid)' }}>{quien}</p>}
                {nota && quien && quien !== 'Nota interna' && <p className="text-[11px]" style={{ color: 'var(--jet-mid)' }}>{quien}</p>}
                {tipo === 'plantilla' && (
                    <p className="text-[11px] font-medium" style={{ color: 'var(--jet-mid)' }}>Plantilla{payload.plantilla ? `: ${payload.plantilla}` : ''}</p>
                )}
                {adjunto && <AdjuntoMensaje mensajeId={mensaje.id} adjunto={adjunto} pendiente={!!mensaje.pendiente} />}
                {payload.media_error && !adjunto && (
                    <p className="text-xs italic" style={{ color: 'var(--red)' }}>No se pudo descargar el adjunto recibido.</p>
                )}
                {(tipo === 'boton' || tipo === 'lista') && (
                    <p className="text-[11px]" style={{ color: 'var(--jet-mid)' }}>Respondió con una opción</p>
                )}
                {textoCuerpo && <p className="text-sm whitespace-pre-wrap break-words">{textoCuerpo}</p>}
                <div className="flex items-center justify-end gap-1.5 text-[11px]" style={{ color: 'var(--ash)' }}>
                    <time dateTime={mensaje.creado_en}>{horaMensaje(mensaje.creado_en)}</time>
                    {saliente && <EstadoEntrega estado={mensaje.estado_entrega} pendiente={mensaje.pendiente} errores={payload.errores} />}
                </div>
            </article>
        </div>
    );
}

export default BurbujaMensaje;
