import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { isSameDay, parseISO } from 'date-fns';
import { ChevronLeft, Bot, UserCheck, Loader2, StickyNote, Phone, Mail, Info, Handshake } from 'lucide-react';
import InitialsAvatar from '../components/shared/InitialsAvatar';
import WhatsAppIcon from '../components/ui/WhatsAppIcon';
import AccionSugerida from '../components/cobranzaInteligente/AccionSugerida';
import { ItemChat, LienzoChat, SeparadorDia } from '../components/cobranzaInteligente/Chat';
import { useCargaInteligente, mensajeErrorInteligente } from '../hooks/useCargaInteligente';
import { useAccionesCaso } from '../hooks/useAccionesCaso';
import { getConversacionInteligente, accionConversacionInteligente } from '../api/cobranza.service';
import { fmt } from '../utils/format';

const iniciales = (nombre) => {
    const [n = '', ...resto] = nombre.split(' ');
    return { nombre: n, apellido: resto.at(-1) };
};

/* Un mensaje abre grupo (colita + autor) si cambia el autor, el día o lo precede algo que no es mensaje. */
const abreGrupo = (item, previo) =>
    !previo || previo.clase !== 'mensaje' || previo.autor !== item.autor
    || !isSameDay(parseISO(previo.fecha), parseISO(item.fecha));

function Encabezado({ d, tomando, onTomar, onDevolver }) {
    const humana = d.gestion_humana.activa;
    return (
        <header className="flex items-center gap-3 px-3 sm:px-4 py-2.5 text-white"
            style={{ background: 'linear-gradient(90deg, var(--pb-mid), var(--topbar-grad-to))' }}>
            <Link to="/cobranza/inteligente/gestion" className="p-1 -ml-1 rounded-full hover:bg-white/10" aria-label="Volver a la bandeja">
                <ChevronLeft size={22} />
            </Link>
            <div className="ring-2 ring-white/30 rounded-full"><InitialsAvatar {...iniciales(d.representante.nombre)} color="#0a6d77" /></div>
            <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm sm:text-base truncate">{d.representante.nombre}</p>
                <p className="flex items-center gap-1 text-xs truncate opacity-85">
                    {humana
                        ? <><UserCheck size={12} />Atendido por {d.gestion_humana.responsable ?? 'una persona'} · bot en pausa</>
                        : d.bot_pausado
                            ? <><Info size={12} />Seguimiento en pausa</>
                            : <><Bot size={12} />Bot activo · recordatorios automáticos</>}
                </p>
            </div>
            <button type="button" disabled={tomando || !d.ciclos_abiertos.length}
                onClick={humana ? onDevolver : onTomar}
                className="btn btn-sm shrink-0 !bg-white/15 hover:!bg-white/25 !text-white !border-white/30">
                {tomando ? <Loader2 size={14} className="animate-spin" /> : humana ? <Bot size={14} /> : <UserCheck size={14} />}
                <span className="hidden sm:inline">{humana ? 'Devolver al bot' : 'Tomar conversación'}</span>
                <span className="sm:hidden">{humana ? 'Devolver' : 'Tomar'}</span>
            </button>
        </header>
    );
}

function Compositor({ d, tomando, onTomar, ejecutar, fila }) {
    if (!d.ciclos_abiertos.length) {
        return <p className="px-4 py-3 text-xs text-center" style={{ color: 'var(--ash)' }}>Este representante no tiene deudas abiertas.</p>;
    }
    if (!d.gestion_humana.activa) {
        return (
            <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-2 text-xs sm:text-sm" style={{ color: 'var(--jet-mid)' }}>
                    <Bot size={16} style={{ color: 'var(--pb)' }} />El bot está llevando esta conversación.
                </p>
                <button type="button" className="btn btn-primary w-full sm:w-auto" onClick={onTomar} disabled={tomando}>
                    <UserCheck size={16} />Tomar conversación
                </button>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-2 px-2 sm:px-3 py-2">
            <button type="button" onClick={() => ejecutar(fila, 'nota')}
                className="flex-1 min-w-0 flex items-center gap-2 rounded-full px-4 py-2.5 text-left text-sm"
                style={{ background: '#fff', color: 'var(--ash)', border: '1px solid var(--border)' }}>
                <StickyNote size={16} className="shrink-0" /><span className="truncate">Escribe una nota interna…</span>
            </button>
            <button type="button" onClick={() => ejecutar(fila, 'llamar')} aria-label="Registrar llamada" title="Registrar llamada"
                className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center"
                style={{ background: '#fff', color: 'var(--jet-mid)', border: '1px solid var(--border)' }}>
                <Phone size={18} />
            </button>
            <button type="button" onClick={() => ejecutar(fila, 'whatsapp')} disabled={!d.representante.telefono}
                aria-label="Enviar WhatsApp" title="Enviar WhatsApp"
                className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-white disabled:opacity-50"
                style={{ background: '#00a884', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }}>
                <WhatsAppIcon size={20} className="[&_path]:fill-white" />
            </button>
        </div>
    );
}

function Ficha({ d, ejecutar, fila }) {
    return (
        <aside className="space-y-3">
            <section className="rounded-[var(--radius-card)] p-4 text-center"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                <div className="flex justify-center"><InitialsAvatar {...iniciales(d.representante.nombre)} color="#0c828d" size={12} /></div>
                <p className="mt-2 font-semibold" style={{ color: 'var(--jet)' }}>{d.representante.nombre}</p>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>CI {d.representante.cedula}</p>
                <div className="mt-3 space-y-1 text-xs text-left" style={{ color: 'var(--jet-mid)' }}>
                    {d.representante.telefono && <p className="flex items-center gap-2"><Phone size={13} />{d.representante.telefono}</p>}
                    {d.representante.correo && <p className="flex items-center gap-2 break-all"><Mail size={13} />{d.representante.correo}</p>}
                </div>
                <div className="mt-3 rounded-xl py-2" style={{ background: Number(d.saldo_total_usd) > 0 ? 'var(--red-light)' : 'var(--green-light)' }}>
                    <p className="text-[11px]" style={{ color: 'var(--ash)' }}>Saldo pendiente</p>
                    <p className="text-xl font-bold tabular-nums" style={{ color: Number(d.saldo_total_usd) > 0 ? 'var(--red)' : 'var(--green)' }}>
                        ${fmt(d.saldo_total_usd, 2)}
                    </p>
                </div>
            </section>

            {d.accion_sugerida && (
                <section className="rounded-[var(--radius-card)] p-4 space-y-3"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                    <AccionSugerida apilado accion={d.accion_sugerida} onClick={() => ejecutar(fila, d.accion_sugerida.codigo)} />
                    <ul className="flex flex-wrap gap-1.5" aria-label="Por qué es prioridad">
                        {d.razones.map(r => (
                            <li key={r.texto} className="text-xs rounded-full px-2 py-0.5" style={{ background: 'var(--yellow-light)', color: 'var(--jet)' }}>
                                {r.texto}
                            </li>
                        ))}
                    </ul>
                    <button type="button" className="btn btn-secondary btn-sm w-full" onClick={() => ejecutar(fila, 'convenio')}>
                        <Handshake size={14} />Crear convenio
                    </button>
                </section>
            )}

            {d.deudas_abiertas.length > 0 && (
                <section className="rounded-[var(--radius-card)] p-4"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ash)' }}>Deudas abiertas</p>
                    <ul className="space-y-1 text-sm" style={{ color: 'var(--jet-mid)' }}>
                        {d.deudas_abiertas.map(t => <li key={t}>{t}</li>)}
                    </ul>
                </section>
            )}
        </aside>
    );
}

const ChatSkeleton = () => (
    <div className="space-y-3 p-4" aria-hidden="true">
        {[60, 45, 70, 50].map((w, i) => (
            <div key={i} className={`flex ${i % 3 === 1 ? 'justify-center' : 'justify-end'}`}>
                <div className="skeleton h-12 !rounded-lg" style={{ width: `${w}%` }} />
            </div>
        ))}
    </div>
);

const CobranzaInteligenteConversacion = () => {
    const { id } = useParams();
    const cargador = useCallback((_sedeId, signal) => getConversacionInteligente(id, signal), [id]);
    const { data: d, loading, apagada, recargar } = useCargaInteligente(cargador);
    const { ejecutar, modales } = useAccionesCaso(recargar);
    const [tomando, setTomando] = useState(false);
    const scroll = useRef(null);

    useEffect(() => {
        if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    }, [d]);

    const cambiar = async (accion, ok) => {
        setTomando(true);
        try {
            await accionConversacionInteligente(id, accion);
            toast.success(ok);
            recargar();
        } catch (err) {
            toast.error(mensajeErrorInteligente(err));
        } finally {
            setTomando(false);
        }
    };
    const onTomar = () => cambiar('tomar', 'Tomaste la conversación: el bot queda en pausa.');
    const onDevolver = () => cambiar('devolver', 'La conversación volvió al bot.');

    if (apagada) {
        return <p className="text-sm text-center py-10" style={{ color: 'var(--ash)' }}>Cobranza Inteligente está apagada en esta sede.</p>;
    }
    if (!loading && !d) {
        return (
            <div className="text-sm text-center py-10 space-y-3" style={{ color: 'var(--ash)' }}>
                <p>No encontramos una conversación de cobranza para este representante.</p>
                <Link to="/cobranza/inteligente/gestion" className="btn btn-secondary">Volver a la bandeja</Link>
            </div>
        );
    }
    const fila = d && { representante: d.representante, ciclos: d.ciclos_abiertos, saldo_total_usd: d.saldo_total_usd };
    const linea = d?.linea_de_tiempo ?? [];

    return (
        <div className="w-full max-w-6xl mx-auto pb-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4">
            <section className="flex flex-col h-[78dvh] lg:h-[calc(100dvh-8.5rem)] min-h-[440px] rounded-[var(--radius-card)] overflow-hidden"
                style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', background: 'var(--surface)' }}>
                {d ? <Encabezado d={d} tomando={tomando} onTomar={onTomar} onDevolver={onDevolver} />
                    : <div className="h-[60px]" style={{ background: 'var(--pb-mid)' }} />}

                <LienzoChat ref={scroll}>
                    {loading && <ChatSkeleton />}
                    {d && !linea.length && (
                        <p className="text-center text-xs py-10" style={{ color: 'var(--ash)' }}>Todavía no hay mensajes con este representante.</p>
                    )}
                    {linea.map((item, i) => {
                        const previo = linea[i - 1];
                        const nuevoDia = !previo || !isSameDay(parseISO(previo.fecha), parseISO(item.fecha));
                        return (
                            <div key={item.id}>
                                {nuevoDia && <SeparadorDia fecha={item.fecha} />}
                                <ItemChat item={item} primero={abreGrupo(item, previo)} />
                            </div>
                        );
                    })}
                    {d && (
                        <p className="flex items-center justify-center gap-1.5 text-[11px] text-center mt-4 mb-1 px-6" style={{ color: '#667781' }}>
                            <Info size={12} className="shrink-0" />
                            Las respuestas del representante aparecerán aquí cuando se conecte WhatsApp entrante.
                        </p>
                    )}
                </LienzoChat>

                <footer style={{ background: '#f0f2f5', borderTop: '1px solid var(--border)' }}>
                    {d && <Compositor d={d} tomando={tomando} onTomar={onTomar} ejecutar={ejecutar} fila={fila} />}
                </footer>
            </section>

            {d ? <Ficha d={d} ejecutar={ejecutar} fila={fila} /> : <div className="skeleton h-72 !rounded-[var(--radius-card)] hidden lg:block" />}
            {modales}
        </div>
    );
};

export default CobranzaInteligenteConversacion;
