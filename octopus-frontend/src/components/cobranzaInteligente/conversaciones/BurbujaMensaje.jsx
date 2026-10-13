import { AlertCircle, Bot, Check, CheckCheck, Clock, StickyNote } from 'lucide-react';
import { AdjuntoMensaje } from './AdjuntoMensaje';
import { ESTADOS_ADJUNTO, ESTADOS_ENTREGA, filasLista, horaMensaje, textoResuelto } from './conversacionesUtils';

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

const ETIQUETA_BOTON = { YA_PAGUE: 'Ya pagué', NECESITO_ACUERDO: 'Necesito un acuerdo', HABLAR: 'Hablar con alguien' };

/** Estado del comprobante recibido; mientras está pendiente ofrece asignarlo a una mensualidad o descartarlo. */
function EstadoAdjunto({ mensaje, onConvertir, onDescartar }) {
    const estado = ESTADOS_ADJUNTO[mensaje.estado_adjunto];
    if (!estado) return null;
    const { payload = {} } = mensaje;
    const resuelto = textoResuelto(payload.resuelto_en);
    const detalle = mensaje.estado_adjunto === 'descartado' && payload.motivo_descarte
        ? `Motivo: ${payload.motivo_descarte}`
        : mensaje.estado_adjunto === 'convertido' && payload.comprobantes?.length
            ? `${payload.comprobantes.length} comprobante${payload.comprobantes.length === 1 ? '' : 's'} en revisión`
            : '';
    return (
        <div className="rounded-xl p-2 space-y-2" style={{ background: estado.fondo }}>
            <p className="text-xs font-semibold" style={{ color: estado.color }}>{estado.etiqueta}</p>
            {detalle && <p className="text-xs break-words" style={{ color: 'var(--jet)' }}>{detalle}</p>}
            {resuelto && <p className="text-[11px]" style={{ color: 'var(--jet-mid)' }}>Resuelto el {resuelto}</p>}
            {mensaje.estado_adjunto === 'pendiente' && (onConvertir || onDescartar) && (
                <div className="flex flex-col gap-2 sm:flex-row">
                    {onConvertir && (
                        <button type="button" onClick={() => onConvertir(mensaje)}
                            className="w-full sm:w-auto min-h-11 px-3 py-2 rounded-xl text-sm font-medium"
                            style={{ background: 'var(--pb)', color: '#fff' }}>
                            Asignar a mensualidad
                        </button>
                    )}
                    {onDescartar && (
                        <button type="button" onClick={() => onDescartar(mensaje)}
                            className="w-full sm:w-auto min-h-11 px-3 py-2 rounded-xl text-sm font-medium"
                            style={{ border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' }}>
                            Descartar
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

const ETIQUETA_ORIGEN = { motor: 'Recordatorio automático', bot: 'Respuesta automática', manual_wame: 'Cobro manual', manual_api: 'Cobro manual' };

/** Una burbuja del hilo: entrante, saliente, nota interna o aviso del sistema. */
export function BurbujaMensaje({ mensaje, onConvertir, onDescartar }) {
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
                {adjunto && !saliente && !nota && (
                    <EstadoAdjunto mensaje={mensaje} onConvertir={onConvertir} onDescartar={onDescartar} />
                )}
                {(tipo === 'boton' || tipo === 'lista') && !saliente && (
                    <p className="text-[11px]" style={{ color: 'var(--jet-mid)' }}>Respondió con una opción</p>
                )}
                {textoCuerpo && <p className="text-sm whitespace-pre-wrap break-words">{textoCuerpo}</p>}
                {tipo === 'lista' && saliente && filasLista(payload).length > 0 && (
                    <ul className="space-y-1" aria-label="Opciones ofrecidas">
                        {filasLista(payload).map(f => (
                            <li key={f.id || f.title} className="rounded-lg px-2 py-1 text-xs" style={{ background: 'var(--surface)', border: '0.5px solid var(--border)' }}>
                                <span className="font-medium">{f.title}</span>
                                {f.description && <span className="block" style={{ color: 'var(--jet-mid)' }}>{f.description}</span>}
                            </li>
                        ))}
                    </ul>
                )}
                {tipo === 'plantilla' && saliente && Array.isArray(payload.botones) && payload.botones.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5" aria-label="Botones de la plantilla">
                        {payload.botones.map(b => (
                            <li key={b} className="rounded-full px-2.5 py-1 text-xs" style={{ background: 'var(--surface)', border: '0.5px solid var(--border-md)' }}>
                                {ETIQUETA_BOTON[b] || b}
                            </li>
                        ))}
                    </ul>
                )}
                <div className="flex items-center justify-end gap-1.5 text-[11px]" style={{ color: 'var(--ash)' }}>
                    <time dateTime={mensaje.creado_en}>{horaMensaje(mensaje.creado_en)}</time>
                    {saliente && <EstadoEntrega estado={mensaje.estado_entrega} pendiente={mensaje.pendiente} errores={payload.errores} />}
                </div>
            </article>
        </div>
    );
}

export default BurbujaMensaje;
