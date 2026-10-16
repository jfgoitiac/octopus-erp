import { useMemo, useState } from 'react';
import { format, parseISO, isBefore, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import {
    Sparkles, ChevronLeft, MessagesSquare, UserCheck, Inbox, Wallet, Clock, Search, PartyPopper, PowerOff,
    ReceiptText, Handshake, ClipboardPen, CheckCircle2, AlertCircle, Circle, FileImage, BadgeDollarSign, CalendarClock,
} from 'lucide-react';
import WhatsAppIcon from '../components/ui/WhatsAppIcon';
import InitialsAvatar from '../components/shared/InitialsAvatar';
import AccionSugerida from '../components/cobranzaInteligente/AccionSugerida';
import { nivel, etapaDe, ETAPAS_CICLO } from '../components/cobranzaInteligente/prioridad';
import { useAccionesCaso } from '../hooks/useAccionesCaso';
import { PageHeader } from '../components/ui/PageHeader';
import { useCargaInteligente, mensajeErrorInteligente } from '../hooks/useCargaInteligente';
import {
    getBandejaInteligente, getPagosRevisionInteligente, getConveniosInteligente,
    pagarCuotaConvenio, cancelarConvenioInteligente,
} from '../api/cobranza.service';
import { fmt } from '../utils/format';

const cargarConvenios = (_sedeId, signal) => getConveniosInteligente(signal);
const fecha = (iso) => format(parseISO(iso), "d 'de' MMM yyyy", { locale: es });
const suma = (filas, campo) => filas.reduce((s, f) => s + Number(f[campo] || 0), 0);
const pctDe = (parte, total) => (total ? Math.round((parte / total) * 100) : 0);
const partes = (nombreCompleto) => {
    const [nombre = '', ...resto] = nombreCompleto.split(' ');
    return { nombre, apellido: resto.at(-1) };
};

const panel = { background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' };
const RUTA_CONVERSACION = (id) => `/cobranza/inteligente/representantes/${id}`;

const ESTADO_CONVENIO = {
    vigente: { label: 'Vigente', color: 'var(--pb-mid)', fondo: 'var(--pb-light)' },
    cumplido: { label: 'Cumplido', color: 'var(--green)', fondo: 'var(--green-light)' },
    incumplido: { label: 'Incumplido', color: 'var(--red)', fondo: 'var(--red-light)' },
    cancelado: { label: 'Cancelado', color: 'var(--ash)', fondo: 'var(--ash-light)' },
};

/* Intensidad de cada razón dentro de la barra de prioridad: la que más pesa va primero y más sólida. */
const INTENSIDAD = [100, 72, 50, 34, 22];
const tono = (color, i) => `color-mix(in srgb, ${color} ${INTENSIDAD[Math.min(i, INTENSIDAD.length - 1)]}%, transparent)`;

/* ── Piezas compartidas ── */
const Etiqueta = ({ color, fondo, icono: Icono, children, title }) => (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
        style={{ background: fondo, color }} title={title}>
        {Icono && <Icono size={11} />}{children}
    </span>
);

function Resumen({ icono: Icono, color, fondo, titulo, valor, detalle }) {
    return (
        <div className="rounded-[var(--radius-card)] p-3 sm:p-4 flex items-center gap-3 min-w-0" style={panel}>
            <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: fondo, color }}>
                <Icono size={18} />
            </span>
            <div className="min-w-0">
                <p className="text-[11px] sm:text-xs font-medium truncate" style={{ color: 'var(--ash)' }}>{titulo}</p>
                <p className="text-lg sm:text-xl font-bold tabular-nums tracking-tight truncate" style={{ color: 'var(--jet)' }}>{valor}</p>
                {detalle && <p className="text-[11px] truncate" style={{ color: 'var(--ash)' }}>{detalle}</p>}
            </div>
        </div>
    );
}

const Bloque = ({ className }) => <div className={`skeleton ${className}`} aria-hidden="true" />;

const Skeleton = ({ tiles = 4 }) => (
    <div className="space-y-3 sm:space-y-4" aria-hidden="true">
        <div className={`grid gap-3 ${tiles === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'}`}>
            {Array.from({ length: tiles }, (_, i) => <Bloque key={i} className="h-20 !rounded-[var(--radius-card)]" />)}
        </div>
        {[1, 2, 3].map(i => <Bloque key={i} className="h-40 !rounded-[var(--radius-card)]" />)}
    </div>
);

function Vacio({ icono: Icono = PartyPopper, titulo, children }) {
    return (
        <div className="rounded-[var(--radius-card)] px-4 py-10 sm:py-14 flex flex-col items-center text-center gap-3" style={panel}>
            <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
                <Icono size={26} />
            </span>
            <p className="text-sm sm:text-base font-semibold" style={{ color: 'var(--jet)' }}>{titulo}</p>
            {children && <div className="text-xs sm:text-sm max-w-sm" style={{ color: 'var(--ash)' }}>{children}</div>}
        </div>
    );
}

const Apagada = () => (
    <Vacio icono={PowerOff} titulo="Cobranza Inteligente está apagada en esta sede.">
        Enciéndela para que la bandeja priorice los casos por ti.{' '}
        <Link to="/configuracion/cobranza-inteligente" className="font-medium underline underline-offset-2" style={{ color: 'var(--pb-mid)' }}>
            Configurar
        </Link>
    </Vacio>
);

/* ── Atención hoy ── */
function BarraRazones({ razones, puntaje, color }) {
    const ordenadas = [...razones].sort((a, b) => b.puntos - a.puntos);
    return (
        <div>
            <div className="flex h-2 rounded-full overflow-hidden gap-0.5" style={{ background: 'var(--ash-light)' }} aria-hidden="true">
                {ordenadas.map((r, i) => (
                    <div key={r.texto} style={{ width: `${pctDe(r.puntos, puntaje)}%`, background: tono(color, i) }} title={r.texto} />
                ))}
            </div>
            <ul className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2" aria-label="Por qué aparece">
                {ordenadas.map((r, i) => (
                    <li key={r.texto} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--jet-mid)' }}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tono(color, i) }} />
                        <span>{r.texto} (+{r.puntos})</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function Dato({ icono: Icono, children, color = 'var(--jet-mid)' }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm tabular-nums whitespace-nowrap" style={{ color }}>
            <Icono size={14} style={{ color: 'var(--ash)' }} />{children}
        </span>
    );
}

function TarjetaCaso({ f, ejecutar }) {
    const n = nivel(f.puntaje);
    const etapa = etapaDe(f.estados);
    const { nombre, apellido } = partes(f.representante.nombre);
    return (
        <article className="h-full rounded-[var(--radius-card)] p-4 sm:p-5 flex flex-col gap-4 transition-shadow duration-200 hover:shadow-[var(--shadow-md)]"
            style={panel}>
            <header className="flex items-start gap-3">
                <InitialsAvatar nombre={nombre} apellido={apellido} color={n.avatar} size={10} />
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm sm:text-base font-semibold truncate" style={{ color: 'var(--jet)' }}>
                        {f.representante.nombre}
                    </h3>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {etapa && (
                            <Etiqueta color={etapa.color} fondo={etapa.fondo}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: etapa.color }} />{etapa.label}
                            </Etiqueta>
                        )}
                        {f.gestion_humana && (
                            <Etiqueta icono={UserCheck} color="var(--violet)" fondo="var(--violet-light)" title="El bot está en pausa para este caso">
                                En manos de {f.responsable ?? 'una persona'} · bot en pausa
                            </Etiqueta>
                        )}
                    </div>
                </div>
                <div className="shrink-0 rounded-xl px-2.5 py-1.5 text-center" style={{ background: n.fondo }}>
                    <span className="block text-base sm:text-lg font-bold leading-tight tabular-nums" style={{ color: n.color }}
                        title="Puntaje de prioridad">{f.puntaje} pts</span>
                    <span className="block text-[10px] font-medium" style={{ color: n.color }}>Prioridad {n.label.toLowerCase()}</span>
                </div>
            </header>

            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                <Dato icono={Wallet} color="var(--jet)"><strong className="font-semibold">${fmt(f.saldo_total_usd, 2)}</strong></Dato>
                <Dato icono={Clock} color={f.dias_mora_max > 15 ? 'var(--red)' : 'var(--jet-mid)'}>{f.dias_mora_max} días de mora</Dato>
                <Dato icono={ReceiptText}>{f.ciclos.length} {f.ciclos.length === 1 ? 'deuda' : 'deudas'}</Dato>
                {f.responsable && !f.gestion_humana && <Dato icono={UserCheck}>{f.responsable}</Dato>}
            </div>

            <BarraRazones razones={f.razones} puntaje={f.puntaje} color={n.color} />

            <div className="mt-auto space-y-2.5">
                {f.accion_sugerida && (
                    <AccionSugerida accion={f.accion_sugerida} onClick={() => ejecutar(f, f.accion_sugerida.codigo)} />
                )}
                {/* Cuatro acciones cortas: caben de a dos en 360px. */}
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <Link to={RUTA_CONVERSACION(f.representante.id)} className="btn btn-secondary btn-sm">
                        <MessagesSquare size={15} />Conversación
                    </Link>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={!f.representante.telefono}
                        title={f.representante.telefono ? undefined : 'Sin teléfono registrado'}
                        onClick={() => ejecutar(f, 'whatsapp')}>
                        <WhatsAppIcon size={15} />WhatsApp
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => ejecutar(f, 'llamada')}>
                        <ClipboardPen size={15} />Registrar acción
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => ejecutar(f, 'convenio')}>
                        <Handshake size={15} />Crear convenio
                    </button>
                </div>
            </div>
        </article>
    );
}

function FiltroEtapas({ filas, activa, onCambiar }) {
    const conteo = ETAPAS_CICLO.map(e => ({ ...e, casos: filas.filter(f => etapaDe(f.estados)?.clave === e.clave).length }))
        .filter(e => e.casos);
    const total = filas.length;
    const chip = (sel) => ({
        background: sel ? 'var(--jet)' : 'var(--surface)',
        color: sel ? '#fff' : 'var(--jet-mid)',
        border: `1px solid ${sel ? 'var(--jet)' : 'var(--border-md)'}`,
    });
    const clases = 'shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 min-h-9 text-xs font-medium transition-colors';
    return (
        <div className="rounded-[var(--radius-card)] p-3 sm:p-4 space-y-3" style={panel}>
            <p className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Casos por etapa</p>
            <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5" style={{ background: 'var(--ash-light)' }} aria-hidden="true">
                {conteo.map(e => <div key={e.clave} title={`${e.label}: ${e.casos}`} style={{ width: `${pctDe(e.casos, total)}%`, background: e.color }} />)}
            </div>
            <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-0.5" role="group" aria-label="Filtrar por etapa">
                <button type="button" aria-pressed={!activa} onClick={() => onCambiar('')} className={clases} style={chip(!activa)}>
                    Todos <span className="tabular-nums opacity-70">{total}</span>
                </button>
                {conteo.map(e => (
                    <button key={e.clave} type="button" aria-pressed={activa === e.clave}
                        onClick={() => onCambiar(activa === e.clave ? '' : e.clave)} className={clases} style={chip(activa === e.clave)}>
                        <span className="w-2 h-2 rounded-full" style={{ background: e.color }} />
                        {e.label} <span className="tabular-nums opacity-70">{e.casos}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function Bandeja() {
    const { data, loading, apagada, recargar } = useCargaInteligente(getBandejaInteligente);
    const { ejecutar, modales } = useAccionesCaso(recargar);
    const [etapa, setEtapa] = useState('');
    const [buscar, setBuscar] = useState('');
    const filas = useMemo(() => data?.results ?? [], [data]);

    const visibles = useMemo(() => {
        const q = buscar.trim().toLowerCase();
        return filas.filter(f => (!etapa || etapaDe(f.estados)?.clave === etapa)
            && (!q || f.representante.nombre.toLowerCase().includes(q) || f.representante.cedula?.toLowerCase().includes(q)));
    }, [filas, etapa, buscar]);

    if (loading) return <Skeleton />;
    if (apagada) return <Apagada />;
    if (!filas.length) {
        return <Vacio titulo="Nada requiere atención hoy.">Cuando un representante entre en mora o responda un mensaje, aparecerá aquí.</Vacio>;
    }

    const moraMax = Math.max(...filas.map(f => f.dias_mora_max));
    const deudas = filas.reduce((s, f) => s + f.ciclos.length, 0);

    return (
        <div className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Resumen icono={Inbox} color="var(--pb-mid)" fondo="var(--pb-light)" titulo="Por atender"
                    valor={filas.length} detalle={`${filas.filter(f => f.puntaje >= 60).length} de prioridad alta`} />
                <Resumen icono={Wallet} color="var(--red)" fondo="var(--red-light)" titulo="Saldo en riesgo"
                    valor={`$${fmt(suma(filas, 'saldo_total_usd'), 0)}`} detalle={`${deudas} ${deudas === 1 ? 'deuda abierta' : 'deudas abiertas'}`} />
                <Resumen icono={Clock} color="var(--orange)" fondo="var(--orange-light)" titulo="Mora más larga"
                    valor={`${moraMax} días`} detalle={`${filas.filter(f => f.dias_mora_max > 15).length} con más de 15 días`} />
                <Resumen icono={UserCheck} color="var(--violet)" fondo="var(--violet-light)" titulo="Con una persona"
                    valor={filas.filter(f => f.gestion_humana).length} detalle="Bot en pausa" />
            </div>

            <FiltroEtapas filas={filas} activa={etapa} onCambiar={setEtapa} />

            <label className="relative block">
                <span className="sr-only">Buscar representante</span>
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--ash)' }} />
                <input type="search" value={buscar} onChange={e => setBuscar(e.target.value)}
                    placeholder="Buscar por nombre o cédula" className="input w-full !pl-9" />
            </label>

            {visibles.length ? (
                <ul className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4">
                    {visibles.map(f => <li key={f.representante.id}><TarjetaCaso f={f} ejecutar={ejecutar} /></li>)}
                </ul>
            ) : (
                <Vacio icono={Search} titulo="Ningún caso coincide con el filtro.">
                    <button type="button" className="font-medium underline underline-offset-2" style={{ color: 'var(--pb-mid)' }}
                        onClick={() => { setEtapa(''); setBuscar(''); }}>
                        Ver todos los casos
                    </button>
                </Vacio>
            )}
            {modales}
        </div>
    );
}

/* ── Pagos en revisión ── */
function PagosRevision() {
    const { data, loading, apagada } = useCargaInteligente(getPagosRevisionInteligente);
    if (loading) return <Skeleton tiles={3} />;
    if (apagada) return <Apagada />;
    const filas = data?.results ?? [];
    if (!filas.length) return <Vacio icono={CheckCircle2} titulo="No hay pagos esperando revisión.">Todo lo reportado ya fue conciliado.</Vacio>;

    const demorados = filas.filter(p => p.dias_espera > 3).length;
    return (
        <div className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Resumen icono={ReceiptText} color="var(--pb-mid)" fondo="var(--pb-light)" titulo="Por revisar" valor={filas.length}
                    detalle={`${filas.filter(p => p.tipo === 'comprobante').length} comprobantes del portal`} />
                <Resumen icono={BadgeDollarSign} color="var(--green)" fondo="var(--green-light)" titulo="Monto en revisión"
                    valor={`$${fmt(suma(filas, 'monto_usd'), 2)}`} />
                <Resumen icono={Clock} color={demorados ? 'var(--red)' : 'var(--ash)'} fondo={demorados ? 'var(--red-light)' : 'var(--ash-light)'}
                    titulo="Esperan más de 3 días" valor={demorados} />
            </div>
            <ul className="rounded-[var(--radius-card)] divide-y divide-[var(--border)] overflow-hidden" style={panel}>
                {filas.map(p => {
                    const { nombre, apellido } = partes(p.representante.nombre);
                    const demorado = p.dias_espera > 3;
                    return (
                        <li key={`${p.tipo}-${p.id}`} className="p-3 sm:px-5 sm:py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <InitialsAvatar nombre={nombre} apellido={apellido} color="#5b6472" />
                                <div className="min-w-0">
                                    <Link to={RUTA_CONVERSACION(p.representante.id)} className="block text-sm font-semibold truncate hover:underline"
                                        style={{ color: 'var(--jet)' }}>{p.representante.nombre}</Link>
                                    <p className="text-xs truncate" style={{ color: 'var(--ash)' }}>Alumno: {p.alumno}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap pl-11 sm:pl-0 sm:justify-end">
                                {p.tipo === 'pago'
                                    ? <Etiqueta icono={ReceiptText} color="var(--pb-mid)" fondo="var(--pb-light)">Pago</Etiqueta>
                                    : <Etiqueta icono={FileImage} color="var(--teal)" fondo="var(--green-light)">Comprobante</Etiqueta>}
                                <Etiqueta icono={Clock} color={demorado ? 'var(--red)' : 'var(--jet-mid)'} fondo={demorado ? 'var(--red-light)' : 'var(--ash-light)'}>
                                    {p.dias_espera} {p.dias_espera === 1 ? 'día' : 'días'}
                                </Etiqueta>
                                <span className="ml-auto sm:ml-0 sm:w-24 text-right text-sm font-bold tabular-nums" style={{ color: 'var(--jet)' }}>
                                    ${fmt(p.monto_usd, 2)}
                                </span>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/* ── Convenios ── */
function TarjetaConvenio({ c, ejecutar }) {
    const estado = ESTADO_CONVENIO[c.estado] ?? ESTADO_CONVENIO.cancelado;
    const pagadas = c.cuotas.filter(q => q.pagada);
    const total = suma(c.cuotas, 'monto_usd');
    const cobrado = suma(pagadas, 'monto_usd');
    const hoy = startOfDay(new Date());
    const vigente = c.estado === 'vigente';
    return (
        <article className="h-full rounded-[var(--radius-card)] p-4 sm:p-5 flex flex-col gap-4" style={panel}>
            <header className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: estado.fondo, color: estado.color }}>
                    <Handshake size={18} />
                </span>
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm sm:text-base font-semibold" style={{ color: 'var(--jet)' }}>Convenio #{c.id}</h3>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>
                        {c.creado_en ? `Creado el ${fecha(c.creado_en)}` : `${c.cuotas.length} cuotas`}
                    </p>
                </div>
                <Etiqueta color={estado.color} fondo={estado.fondo}>{estado.label}</Etiqueta>
            </header>

            <div>
                <div className="flex items-baseline justify-between gap-2 text-xs mb-1.5">
                    <span style={{ color: 'var(--jet-mid)' }}>{pagadas.length} de {c.cuotas.length} cuotas pagadas</span>
                    <span className="tabular-nums" style={{ color: 'var(--ash)' }}>
                        <strong className="font-semibold" style={{ color: 'var(--jet)' }}>${fmt(cobrado, 2)}</strong> de ${fmt(total, 2)}
                    </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--ash-light)' }}>
                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pctDe(cobrado, total)}%`, background: estado.color }} />
                </div>
            </div>

            <ol className="space-y-2">
                {c.cuotas.map(q => {
                    const vencida = !q.pagada && isBefore(parseISO(q.fecha), hoy);
                    const Icono = q.pagada ? CheckCircle2 : vencida ? AlertCircle : Circle;
                    const color = q.pagada ? 'var(--green)' : vencida ? 'var(--red)' : 'var(--ash)';
                    return (
                        <li key={q.id} className="flex flex-col gap-2 rounded-xl px-3 py-2.5 sm:flex-row sm:items-center"
                            style={{ background: vencida ? 'var(--red-light)' : 'var(--ash-light)' }}>
                            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                <Icono size={18} className="shrink-0" style={{ color }} />
                                <div className="min-w-0">
                                    <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                        Cuota {q.numero} · <span className="tabular-nums">${fmt(q.monto_usd, 2)}</span>
                                    </p>
                                    <p className="text-xs" style={{ color: vencida ? 'var(--red)' : 'var(--ash)' }}>
                                        {q.pagada ? 'Pagada' : vencida ? 'Vencida' : 'Vence'} · {fecha(q.fecha)}
                                    </p>
                                </div>
                            </div>
                            {!q.pagada && vigente && (
                                <button type="button" className="btn btn-primary btn-sm w-full sm:w-auto"
                                    onClick={() => ejecutar(() => pagarCuotaConvenio(q.id), 'Cuota registrada')}>
                                    <CheckCircle2 size={15} />Marcar pagada
                                </button>
                            )}
                        </li>
                    );
                })}
            </ol>

            <div className="mt-auto flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {c.representante && (
                    <Link to={RUTA_CONVERSACION(c.representante)} className="btn btn-secondary btn-sm w-full sm:w-auto">
                        <MessagesSquare size={15} />Conversación
                    </Link>
                )}
                {vigente && (
                    <button type="button" className="btn btn-secondary btn-sm w-full sm:w-auto"
                        onClick={() => ejecutar(() => cancelarConvenioInteligente(c.id), 'Convenio cancelado')}>
                        Cancelar convenio
                    </button>
                )}
            </div>
        </article>
    );
}

function Convenios() {
    const { data, loading, apagada, recargar } = useCargaInteligente(cargarConvenios);
    const ejecutar = async (llamada, ok) => {
        try {
            await llamada();
            toast.success(ok);
            recargar();
        } catch (err) {
            toast.error(mensajeErrorInteligente(err));
        }
    };
    if (loading) return <Skeleton />;
    if (apagada) return <Apagada />;
    const convenios = data?.results ?? [];
    if (!convenios.length) {
        return <Vacio icono={Handshake} titulo="Aún no hay convenios.">Créalos desde un caso de “Atención hoy” para repartir una deuda en cuotas.</Vacio>;
    }

    const cuenta = (estado) => convenios.filter(c => c.estado === estado).length;
    const porCobrar = convenios.filter(c => c.estado === 'vigente')
        .reduce((s, c) => s + suma(c.cuotas.filter(q => !q.pagada), 'monto_usd'), 0);
    return (
        <div className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Resumen icono={Handshake} color="var(--pb-mid)" fondo="var(--pb-light)" titulo="Vigentes" valor={cuenta('vigente')} />
                <Resumen icono={CheckCircle2} color="var(--green)" fondo="var(--green-light)" titulo="Cumplidos" valor={cuenta('cumplido')} />
                <Resumen icono={AlertCircle} color="var(--red)" fondo="var(--red-light)" titulo="Incumplidos" valor={cuenta('incumplido')} />
                <Resumen icono={CalendarClock} color="var(--orange)" fondo="var(--orange-light)" titulo="Por cobrar en cuotas"
                    valor={`$${fmt(porCobrar, 0)}`} />
            </div>
            <ul className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4">
                {convenios.map(c => <li key={c.id}><TarjetaConvenio c={c} ejecutar={ejecutar} /></li>)}
            </ul>
        </div>
    );
}

const PESTANAS = [
    { id: 'bandeja', label: 'Atención hoy', icono: Sparkles, Vista: Bandeja },
    { id: 'pagos', label: 'Pagos en revisión', icono: ReceiptText, Vista: PagosRevision },
    { id: 'convenios', label: 'Convenios', icono: Handshake, Vista: Convenios },
];

const CobranzaInteligenteGestion = () => {
    const [activa, setActiva] = useState('bandeja');
    const { Vista } = PESTANAS.find(p => p.id === activa);
    return (
        <div className="w-full max-w-6xl mx-auto space-y-4 sm:space-y-5 pb-20">
            <PageHeader titulo="Bandeja de gestión" descripcion="Los casos que requieren atención hoy, ordenados por prioridad y con la razón de cada una."
                acciones={<Link to="/cobranza/inteligente" className="btn btn-secondary w-full sm:w-auto"><ChevronLeft size={16} />Volver al dashboard</Link>} />
            <div role="tablist" aria-label="Secciones de la bandeja"
                className="flex gap-1 p-1 rounded-[var(--radius-card)] overflow-x-auto" style={{ background: 'var(--ash-light)' }}>
                {PESTANAS.map(({ id, label, icono: Icono }) => {
                    const sel = activa === id;
                    return (
                        <button key={id} type="button" role="tab" aria-selected={sel} onClick={() => setActiva(id)}
                            className="flex-1 shrink-0 inline-flex items-center justify-center gap-1.5 px-3 rounded-[10px] text-sm font-medium min-h-11 whitespace-nowrap transition-[background,box-shadow,color] duration-200"
                            style={sel
                                ? { background: 'var(--surface)', color: 'var(--pb)', boxShadow: 'var(--shadow-sm)' }
                                : { background: 'transparent', color: 'var(--jet-mid)' }}>
                            <Icono size={15} />{label}
                        </button>
                    );
                })}
            </div>
            <Vista />
        </div>
    );
};

export default CobranzaInteligenteGestion;
