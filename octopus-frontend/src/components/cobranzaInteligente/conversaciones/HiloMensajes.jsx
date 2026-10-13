import { Fragment, useEffect, useRef } from 'react';
import { isSameDay } from 'date-fns';
import { ArrowLeft, Info, MessageCircle } from 'lucide-react';
import { BurbujaMensaje } from './BurbujaMensaje';
import { BannerTakeover } from './BannerTakeover';
import { Compositor } from './Compositor';
import { aFecha, etiquetaDia, nombreConversacion } from './conversacionesUtils';

const DISTANCIA_PEGADO_PX = 120;

function HiloSkeleton() {
    return (
        <div className="flex-1 p-4 space-y-3 animate-pulse" aria-hidden="true">
            {[['w-2/3', 'justify-start'], ['w-1/2', 'justify-end'], ['w-3/4', 'justify-start'], ['w-2/5', 'justify-end']].map(([ancho, lado], i) => (
                <div key={i} className={`flex ${lado}`}>
                    <div className={`h-12 ${ancho} rounded-2xl`} style={{ background: 'var(--ash-light)' }} />
                </div>
            ))}
        </div>
    );
}

/**
 * Panel del hilo: encabezado (con botón atrás en móvil), banner de takeover, mensajes con
 * separadores de día y compositor fijo abajo. `hilo` es lo que devuelve useHiloConversacion.
 */
export function HiloMensajes({ hilo, onVolver, onAbrirFicha, onAbrirPlantilla, onConvertir, onDescartar }) {
    const { conversacion, mensajes, loading, error } = hilo;
    const contenedor = useRef(null);
    const pegado = useRef(true);
    const ultimaConv = useRef(null);
    const idConversacion = conversacion?.id;

    // Al cambiar de conversación se baja al final; con mensajes nuevos, solo si ya estaba abajo.
    useEffect(() => {
        if (ultimaConv.current !== idConversacion) {
            ultimaConv.current = idConversacion;
            pegado.current = true;
        }
        const el = contenedor.current;
        if (el && pegado.current) el.scrollTop = el.scrollHeight;
    }, [mensajes, idConversacion, loading]);

    const alScrollear = (e) => {
        const el = e.currentTarget;
        pegado.current = el.scrollHeight - el.scrollTop - el.clientHeight < DISTANCIA_PEGADO_PX;
    };

    if (error) {
        return (
            <div className="flex-1 flex flex-col">
                {onVolver && (
                    <button type="button" onClick={onVolver} className="lg:hidden m-2 w-fit min-h-11 px-3 flex items-center gap-2 text-sm" style={{ color: 'var(--jet)' }}>
                        <ArrowLeft size={18} aria-hidden="true" /> Conversaciones
                    </button>
                )}
                <p className="flex-1 flex items-center justify-center text-sm text-center p-6" style={{ color: 'var(--ash)' }}>
                    {error === 'no_encontrada' ? 'La conversación no existe o no tienes acceso a ella.' : 'No se pudo cargar la conversación.'}
                </p>
            </div>
        );
    }

    const nombre = nombreConversacion(conversacion);

    return (
        <>
            <header className="shrink-0 flex items-center gap-1 px-2 sm:px-4 py-2" style={{ borderBottom: '0.5px solid var(--border)' }}>
                <button type="button" onClick={onVolver} aria-label="Volver a la lista"
                    className="lg:hidden w-11 h-11 shrink-0 flex items-center justify-center rounded-xl" style={{ color: 'var(--jet)' }}>
                    <ArrowLeft size={20} aria-hidden="true" />
                </button>
                <div className="min-w-0 flex-1 px-1">
                    <h2 className="text-sm sm:text-base font-semibold truncate" style={{ color: 'var(--jet)' }}>{loading ? 'Cargando…' : nombre}</h2>
                    {conversacion && (
                        <p className="text-xs truncate" style={{ color: 'var(--ash)' }}>
                            {conversacion.telefono}{conversacion.representante ? '' : ' · Sin vincular'}
                            {conversacion.esperando === 'comprobante' ? ' · Esperando comprobante…' : ''}
                            {conversacion.esperando === 'fecha_acuerdo' ? ' · Esperando fecha de acuerdo…' : ''}
                        </p>
                    )}
                </div>
                <button type="button" onClick={onAbrirFicha} aria-label="Datos del contacto" disabled={!conversacion}
                    className="xl:hidden w-11 h-11 shrink-0 flex items-center justify-center rounded-xl disabled:opacity-50" style={{ color: 'var(--jet)' }}>
                    <Info size={20} aria-hidden="true" />
                </button>
            </header>

            {loading || !conversacion ? <HiloSkeleton /> : (
                <>
                    <BannerTakeover conversacion={conversacion} onTomar={hilo.tomar} onDevolver={hilo.devolver} ocupado={hilo.ocupado} />
                    <div ref={contenedor} onScroll={alScrollear} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 sm:px-4 space-y-2"
                        role="log" aria-label="Mensajes" aria-live="polite">
                        {hilo.hayMas && (
                            <p className="text-center text-xs" style={{ color: 'var(--ash)' }}>Se muestran los últimos mensajes.</p>
                        )}
                        {mensajes.length === 0 && (
                            <div className="flex flex-col items-center gap-2 py-10 text-center" style={{ color: 'var(--ash)' }}>
                                <MessageCircle size={28} aria-hidden="true" />
                                <p className="text-sm">Aún no hay mensajes en esta conversación.</p>
                            </div>
                        )}
                        {mensajes.map((m, i) => {
                            const dia = aFecha(m.creado_en);
                            const previo = aFecha(mensajes[i - 1]?.creado_en);
                            const nuevoDia = dia && (!previo || !isSameDay(dia, previo));
                            return (
                                <Fragment key={m.id}>
                                    {nuevoDia && (
                                        <p className="text-center text-[11px] font-medium uppercase tracking-wide py-1" style={{ color: 'var(--ash)' }}>
                                            {etiquetaDia(m.creado_en)}
                                        </p>
                                    )}
                                    <BurbujaMensaje mensaje={m} onConvertir={onConvertir} onDescartar={onDescartar} />
                                </Fragment>
                            );
                        })}
                    </div>
                    <Compositor key={conversacion.id} conversacion={conversacion} onEnviar={hilo.enviar} onNota={hilo.enviarNota} onAbrirPlantilla={onAbrirPlantilla} />
                </>
            )}
        </>
    );
}

export default HiloMensajes;
