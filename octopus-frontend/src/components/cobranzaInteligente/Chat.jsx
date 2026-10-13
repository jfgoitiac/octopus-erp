import { useEffect, useState } from 'react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    Bot, User, Mail, Check, CheckCheck, AlertCircle, Phone, StickyNote, FilePlus, TrendingUp, UserCheck,
    PauseCircle, PlayCircle, CircleCheck, XCircle, Handshake, BellOff, FlaskConical, Info, FileText,
} from 'lucide-react';
import WhatsAppIcon from '../ui/WhatsAppIcon';
import { descargarAdjuntoWhatsApp } from '../../api/notificaciones.service';

/* Paleta del chat (tonos de WhatsApp, propios de esta vista). */
const CHAT = {
    fondo: '#efeae2',
    saliente: '#d9fdd3',
    entrante: '#ffffff',
    nota: '#fff6d6',
    tinta: '#111b21',
    tenue: '#667781',
    visto: '#53bdeb',
};

const ETAPAS = { preventiva: 'Preventiva', vencida: 'Vencida', seguimiento: 'Seguimiento', temprana: 'Temprana',
    prioritaria: 'Prioritaria', critica: 'Crítica' };
const OMISIONES = { deuda_saldada: 'la deuda ya estaba saldada', saldo_insuficiente: 'saldo menor al mínimo',
    pago_en_revision: 'hay un pago en revisión', limite_semanal: 'límite de mensajes de la semana',
    baja_voluntaria: 'el representante pidió no recibir avisos', sin_contacto: 'no hay teléfono ni correo' };
const NOTAS = {
    llamada_registrada: { icono: Phone, titulo: 'Llamada registrada' },
    nota: { icono: StickyNote, titulo: 'Nota interna' },
    whatsapp_manual: { icono: WhatsAppIcon, titulo: 'WhatsApp manual' },
};

const hora = (iso) => format(parseISO(iso), 'HH:mm');

export function SeparadorDia({ fecha }) {
    const d = parseISO(fecha);
    const texto = isToday(d) ? 'Hoy' : isYesterday(d) ? 'Ayer' : format(d, "d 'de' MMMM yyyy", { locale: es });
    return (
        <div className="flex justify-center my-3">
            <span className="rounded-lg px-3 py-1 text-[11px] sm:text-xs font-medium uppercase tracking-wide"
                style={{ background: '#ffffff', color: CHAT.tenue, boxShadow: '0 1px 0.5px rgba(11,20,26,.13)' }}>
                {texto}
            </span>
        </div>
    );
}

function Cola({ color, lado }) {
    return (
        <svg viewBox="0 0 8 13" width="8" height="13" aria-hidden="true"
            className={`absolute top-0 ${lado === 'derecha' ? '-right-2' : '-left-2 -scale-x-100'}`}>
            <path d="M0 0h8L0 13z" fill={color} />
        </svg>
    );
}

function Entrega({ estado }) {
    if (estado === 'fallido') return <AlertCircle size={14} style={{ color: 'var(--red)' }} aria-label="No entregado" />;
    if (estado === 'pendiente') return <Check size={14} style={{ color: CHAT.tenue }} aria-label="Pendiente" />;
    return <CheckCheck size={15} style={{ color: CHAT.visto }} aria-label="Enviado" />;
}

/** Archivo que mandó el representante: se baja con la sesión (no hay URL pública). */
function Adjunto({ adjunto }) {
    const [url, setUrl] = useState(null);
    const [error, setError] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        let creada = null;
        descargarAdjuntoWhatsApp(adjunto.id, controller.signal)
            .then(res => { creada = URL.createObjectURL(res.data); setUrl(creada); })
            .catch(err => { if (err?.code !== 'ERR_CANCELED') setError(true); });
        return () => { controller.abort(); if (creada) URL.revokeObjectURL(creada); };
    }, [adjunto.id]);

    if (error) return <p className="text-xs italic" style={{ color: CHAT.tenue }}>No se pudo cargar el archivo.</p>;
    if (!url) return <div className="skeleton w-56 max-w-full h-32 !rounded-md mb-1" aria-label="Cargando archivo" />;
    const [familia] = adjunto.tipo.split('/');
    if (familia === 'image') {
        return (
            <a href={url} target="_blank" rel="noopener noreferrer" className="block mb-1">
                <img src={url} alt="Imagen enviada por el representante" className="rounded-md max-h-72 w-auto max-w-full" />
            </a>
        );
    }
    if (familia === 'audio') return <audio controls src={url} className="mb-1 w-60 max-w-full" />;
    if (familia === 'video') return <video controls src={url} className="mb-1 rounded-md max-h-72 max-w-full" />;
    return (
        <a href={url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 mb-1 rounded-md px-3 py-2 text-sm font-medium" style={{ background: '#f0f2f5' }}>
            <FileText size={18} style={{ color: 'var(--red)' }} />Abrir documento
        </a>
    );
}

/** Mensaje enviado al representante (bot o personal). `primero` dibuja la colita del grupo. */
function Burbuja({ item, primero }) {
    const entrante = item.autor === 'representante';
    const fondo = entrante ? CHAT.entrante : CHAT.saliente;
    const Autor = item.autor === 'bot' ? Bot : User;
    const autor = { bot: 'Bot de cobranza', personal: 'Equipo de cobranza', representante: 'Representante' }[item.autor];
    return (
        <div className={`flex ${entrante ? 'justify-start' : 'justify-end'} ${primero ? 'mt-2' : 'mt-0.5'}`}>
            <div className={`relative max-w-[85%] sm:max-w-[70%] rounded-lg px-2.5 pt-1.5 pb-1 ${primero ? (entrante ? 'rounded-tl-none' : 'rounded-tr-none') : ''}`}
                style={{ background: fondo, color: CHAT.tinta, boxShadow: '0 1px 0.5px rgba(11,20,26,.13)' }}>
                {primero && <Cola color={fondo} lado={entrante ? 'izquierda' : 'derecha'} />}
                {primero && (
                    <p className="flex items-center gap-1 text-[11px] font-semibold mb-0.5"
                        style={{ color: item.autor === 'bot' ? 'var(--pb-mid)' : 'var(--violet)' }}>
                        <Autor size={12} />{autor}
                        <span className="font-normal" style={{ color: CHAT.tenue }}>
                            · {item.canal === 'email' ? 'Correo' : 'WhatsApp'}
                        </span>
                    </p>
                )}
                {item.asunto && item.canal === 'email' && (
                    <p className="flex items-center gap-1 text-sm font-semibold"><Mail size={13} />{item.asunto}</p>
                )}
                {item.adjunto && <Adjunto adjunto={item.adjunto} />}
                <p className="text-sm whitespace-pre-wrap break-words leading-snug">
                    {item.texto || (!item.adjunto && <em style={{ color: CHAT.tenue }}>(sin texto)</em>)}
                    {/* Reserva el espacio de la hora para que no se monte sobre el texto. */}
                    <span className="inline-block w-16" aria-hidden="true" />
                </p>
                <span className="absolute right-2 bottom-1 flex items-center gap-1 text-[11px]" style={{ color: CHAT.tenue }}>
                    {hora(item.fecha)}{!entrante && <Entrega estado={item.estado} />}
                </span>
            </div>
        </div>
    );
}

/** Llamada, nota o WhatsApp manual: actividad interna del equipo, no la ve el representante. */
function NotaInterna({ item }) {
    const { icono: Icono, titulo } = NOTAS[item.tipo];
    return (
        <div className="flex justify-end mt-2">
            <div className="max-w-[85%] sm:max-w-[70%] rounded-lg px-2.5 py-1.5 border border-dashed"
                style={{ background: CHAT.nota, borderColor: '#e9c46a', color: CHAT.tinta }}>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--amber-ink)' }}>
                    <Icono size={12} />{titulo}{item.usuario ? ` · ${item.usuario}` : ''}
                    <span className="font-normal" style={{ color: CHAT.tenue }}>· solo visible para el equipo</span>
                </p>
                {item.texto && <p className="text-sm whitespace-pre-wrap break-words mt-0.5">{item.texto}</p>}
                <p className="text-right text-[11px]" style={{ color: CHAT.tenue }}>{hora(item.fecha)}</p>
            </div>
        </div>
    );
}

function describir(item) {
    const quien = item.usuario ?? 'Alguien';
    const deudas = item.deudas?.length ? ` · ${item.deudas.join(', ')}` : '';
    const d = item.detalle ?? {};
    switch (item.tipo) {
    case 'ciclo_creado': return { icono: FilePlus, texto: `Nueva deuda${deudas}` };
    case 'cambio_etapa': return { icono: TrendingUp, texto: `Pasó a etapa ${ETAPAS[d.a] ?? d.a}${deudas}` };
    case 'ciclo_pausado':
        if (item.texto === 'gestion_humana') return { icono: UserCheck, texto: `${quien} tomó la conversación · el bot queda en pausa`, tono: 'violeta' };
        if (item.texto === 'convenio') return { icono: PauseCircle, texto: 'Seguimiento en pausa por convenio' };
        return { icono: PauseCircle, texto: `Seguimiento pausado: ${item.texto}` };
    case 'ciclo_reanudado':
        if (d.motivo_pausa === 'gestion_humana') return { icono: Bot, texto: `${quien} devolvió la conversación al bot`, tono: 'violeta' };
        return { icono: PlayCircle, texto: 'Seguimiento reanudado' };
    case 'ciclo_cerrado':
        if (item.texto === 'pagada') return { icono: CircleCheck, texto: `Deuda pagada${deudas}`, tono: 'verde' };
        return { icono: XCircle, texto: `Caso cerrado (${item.texto})${deudas}` };
    case 'convenio_creado': return { icono: Handshake, texto: `Convenio de pago creado${item.usuario ? ` por ${quien}` : ''}`, tono: 'verde' };
    case 'cuota_convenio_pagada': return { icono: CircleCheck, texto: 'Cuota de convenio pagada', tono: 'verde' };
    case 'convenio_incumplido': return { icono: AlertCircle, texto: 'Convenio incumplido', tono: 'rojo' };
    case 'mensaje_fallido': return { icono: AlertCircle, texto: 'No se pudo entregar el recordatorio', tono: 'rojo' };
    case 'mensaje_omitido': return { icono: BellOff, texto: `Recordatorio omitido: ${OMISIONES[item.texto] ?? item.texto}` };
    case 'mensaje_simulado': return { icono: FlaskConical, texto: `Recordatorio simulado (modo sombra): ${item.texto}` };
    default: return { icono: Info, texto: item.tipo.replaceAll('_', ' ') };
    }
}

const TONOS = {
    verde: { background: '#d1f4cc', color: '#0b5e32' },
    rojo: { background: '#fde2e1', color: '#9e2b25' },
    violeta: { background: '#ede9fe', color: '#5b21b6' },
};

/** Aviso del sistema centrado, como los mensajes de cifrado de WhatsApp. */
function AvisoSistema({ item }) {
    const { icono: Icono, texto, tono } = describir(item);
    return (
        <div className="flex justify-center my-2 px-4">
            <p className="inline-flex items-start gap-1.5 rounded-lg px-3 py-1.5 text-xs text-center max-w-md"
                style={{ background: '#fff5c4', color: '#54656f', boxShadow: '0 1px 0.5px rgba(11,20,26,.13)', ...TONOS[tono] }}>
                <Icono size={13} className="shrink-0 mt-0.5" />
                <span>{texto} <span className="opacity-70">· {hora(item.fecha)}</span></span>
            </p>
        </div>
    );
}

/** Elige cómo dibujar un elemento de la línea de tiempo. */
export function ItemChat({ item, primero }) {
    if (item.clase === 'mensaje') return <Burbuja item={item} primero={primero} />;
    if (NOTAS[item.tipo]) return <NotaInterna item={item} />;
    return <AvisoSistema item={item} />;
}

/** Área scrollable con el fondo de chat (patrón de puntos sobre beige). */
export function LienzoChat({ ref, children }) {
    return (
        <div ref={ref} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 py-3"
            style={{
                background: CHAT.fondo,
                backgroundImage: 'radial-gradient(rgba(17,27,33,.06) 1px, transparent 1px)',
                backgroundSize: '14px 14px',
            }}>
            {children}
        </div>
    );
}
