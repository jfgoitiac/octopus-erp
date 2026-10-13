import { useContext, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
    Wallet, CheckCircle2, AlertCircle, Users, Plus, Sparkles, MessageCircle, Mail, Clock, AlertTriangle,
    ArrowRight, TrendingUp, TrendingDown, Inbox, HandCoins, Target,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { DonutEstadoPagos, BarrasPendientes } from '../components/cobranzaInteligente/Graficos';
import TablaEstudiantes from '../components/cobranzaInteligente/TablaEstudiantes';
import { AuthContext } from '../context/AuthContext';
import { ROLES } from '../constants/roles';
import { useCargaInteligente, mensajeErrorInteligente } from '../hooks/useCargaInteligente';
import { useResumenPorConcepto } from '../hooks/useResumenPorConcepto';
import { useEstadoPorConcepto } from '../hooks/useEstadoPorConcepto';
import { getDashboardInteligente, guardarLineaBaseInteligente } from '../api/cobranza.service';
import { fmt } from '../utils/format';

/* El dashboard de Cobranza Inteligente solo lo sirve el backend a estos roles. */
const ROLES_RESULTADOS = [ROLES.DIRECTOR, ROLES.ADMINISTRADOR, ROLES.SISTEMAS];
const sinResultados = () => Promise.resolve({ data: null });
const RESUMEN_VACIO = { total_filas: 0, pagados: 0, parciales: 0, pendientes: 0, monto_cobrado_usd: 0, monto_pendiente_usd: 0 };

const ETAPAS = [
    { clave: 'preventiva', label: 'Preventiva', color: 'var(--teal)' },
    { clave: 'temprana', label: 'Temprana', color: 'var(--yellow)' },
    { clave: 'prioritaria', label: 'Prioritaria', color: 'var(--orange)' },
    { clave: 'critica', label: 'Crítica', color: 'var(--red)' },
    { clave: 'pausada', label: 'Pausada', color: 'var(--ash)' },
];

const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
const pctDe = (parte, total) => (total ? Math.round((parte / total) * 100) : 0);
const panel = { background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' };

/* Mes del año escolar a mostrar por defecto: el actual, o el último ya transcurrido. */
const mesPorDefecto = (lineas) => {
    const hoy = new Date();
    const clave = hoy.getFullYear() * 12 + hoy.getMonth() + 1;
    const pasadas = lineas.filter(l => l.anio * 12 + l.mes <= clave);
    return (pasadas.at(-1) ?? lineas[0])?.etiqueta ?? '';
};

function Kpi({ icono: Icono, color, fondo, titulo, valor, detalle, progreso }) {
    return (
        <div className="rounded-[var(--radius-card)] p-3 sm:p-5 flex flex-col gap-3" style={panel}>
            <div className="flex items-start justify-between gap-2">
                <p className="text-xs sm:text-sm font-medium" style={{ color: 'var(--ash)' }}>{titulo}</p>
                <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: fondo, color }}>
                    <Icono size={18} />
                </span>
            </div>
            <p className="text-lg sm:text-2xl font-bold tabular-nums tracking-tight truncate" style={{ color: 'var(--jet)' }}>{valor}</p>
            {progreso !== undefined && (
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ash-light)' }}>
                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${progreso}%`, background: color }} />
                </div>
            )}
            <p className="text-[11px] sm:text-xs" style={{ color: 'var(--ash)' }}>{detalle}</p>
        </div>
    );
}

function Panel({ titulo, accion, children, className = '' }) {
    return (
        <section className={`rounded-[var(--radius-card)] p-4 sm:p-5 ${className}`} style={panel}>
            <div className="flex items-center justify-between gap-2 mb-4">
                <h2 className="text-sm sm:text-base font-semibold" style={{ color: 'var(--jet)' }}>{titulo}</h2>
                {accion}
            </div>
            {children}
        </section>
    );
}

const LinkVer = ({ to, children = 'Ver todos' }) => (
    <Link to={to} className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap hover:underline" style={{ color: 'var(--pb-mid)' }}>
        {children}<ArrowRight size={14} />
    </Link>
);

function Recordatorios({ envios }) {
    const filas = [
        { icono: MessageCircle, label: 'Mensajes enviados', valor: envios.enviado ?? 0, color: 'var(--green)', fondo: 'var(--green-light)' },
        { icono: Mail, label: 'Simulados (modo sombra)', valor: envios.simulado ?? 0, color: 'var(--violet)', fondo: 'var(--violet-light)' },
        { icono: Clock, label: 'Programados', valor: envios.pendiente ?? 0, color: 'var(--pb-mid)', fondo: 'var(--pb-light)' },
        { icono: AlertTriangle, label: 'Fallidos', valor: envios.fallido ?? 0, color: 'var(--red)', fondo: 'var(--red-light)' },
    ];
    return (
        <ul className="space-y-3">
            {filas.map(({ icono: Icono, ...f }) => (
                <li key={f.label} className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: f.fondo, color: f.color }}>
                        <Icono size={16} />
                    </span>
                    <span className="flex-1 min-w-0 text-sm truncate" style={{ color: 'var(--jet-mid)' }}>{f.label}</span>
                    <span className="text-base font-semibold tabular-nums" style={{ color: 'var(--jet)' }}>{f.valor}</span>
                </li>
            ))}
            <li className="text-[11px] pt-1" style={{ color: 'var(--ash)' }}>Últimos 7 días</li>
        </ul>
    );
}

function Delta({ valor, mejoraSiBaja = false }) {
    if (valor === null || valor === undefined) return <span>Sin línea base</span>;
    const mejora = mejoraSiBaja ? valor < 0 : valor > 0;
    const Icono = valor >= 0 ? TrendingUp : TrendingDown;
    return (
        <span className="inline-flex items-center gap-1 font-medium" style={{ color: mejora ? 'var(--green)' : 'var(--red)' }}>
            <Icono size={13} />{valor > 0 ? '+' : ''}{valor} pp vs. base
        </span>
    );
}

function Indicador({ icono: Icono, titulo, valor, detalle, pie }) {
    return (
        <div className="rounded-xl p-3 sm:p-4 flex flex-col gap-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--ash)' }}>
                <Icono size={14} style={{ color: 'var(--pb)' }} />{titulo}
            </p>
            <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--jet)' }}>{valor}</p>
            <div className="text-xs" style={{ color: 'var(--ash)' }}>{detalle}</div>
            {pie && <div className="mt-auto pt-1">{pie}</div>}
        </div>
    );
}

function CarteraPorEtapa({ distribucion }) {
    const total = ETAPAS.reduce((s, e) => s + (distribucion[e.clave]?.casos ?? 0), 0);
    return (
        <div className="rounded-xl p-3 sm:p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-medium mb-3" style={{ color: 'var(--ash)' }}>Cartera por etapa · {total} casos abiertos</p>
            <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5" style={{ background: 'var(--ash-light)' }}>
                {ETAPAS.map(e => {
                    const casos = distribucion[e.clave]?.casos ?? 0;
                    return casos ? <div key={e.clave} title={`${e.label}: ${casos}`} style={{ width: `${pctDe(casos, total)}%`, background: e.color }} /> : null;
                })}
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mt-3">
                {ETAPAS.map(e => (
                    <li key={e.clave} className="flex items-center gap-2 text-xs">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.color }} />
                        <span style={{ color: 'var(--jet-mid)' }}>{e.label}</span>
                        <span className="ml-auto lg:ml-0 tabular-nums" style={{ color: 'var(--ash)' }}>
                            {distribucion[e.clave]?.casos ?? 0} · ${fmt(distribucion[e.clave]?.saldo_usd, 0)}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function GestionInteligente({ d }) {
    const comp = d.comparacion_linea_base;
    return (
        <section className="rounded-[var(--radius-card)] p-4 sm:p-5 space-y-3"
            style={{ ...panel, background: 'linear-gradient(135deg, var(--pb-light), var(--surface) 55%)' }}>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="flex items-center gap-2 text-sm sm:text-base font-semibold" style={{ color: 'var(--jet)' }}>
                    <Sparkles size={18} style={{ color: 'var(--pb)' }} />Gestión inteligente
                </h2>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>Efectividad de los últimos {d.efectividad.base_meses} meses</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                <Indicador icono={Target} titulo="Cobrado al vencimiento" valor={pct(d.efectividad.cobrado_al_vencimiento_pct)}
                    detalle={<Delta valor={comp?.delta_cobrado_al_vencimiento_pp} />} />
                <Indicador icono={AlertCircle} titulo="Mora a 15 días" valor={pct(d.efectividad.mora_15_pct)}
                    detalle={<Delta valor={comp?.delta_mora_15_pp} mejoraSiBaja />} />
                <Indicador icono={HandCoins} titulo="Recuperado por la gestión" valor={`$${fmt(d.recuperado.atribuido_usd, 0)}`}
                    detalle={`${d.recuperado.casos_atribuidos} de ${d.recuperado.casos_totales} casos · total $${fmt(d.recuperado.total_recuperado_usd, 0)}`} />
                <Indicador icono={Inbox} titulo="Casos por atender" valor={d.bandeja.casos_abiertos}
                    detalle={`${d.bandeja.casos_mas_de_15_dias} con más de 15 días · ${d.pagos_por_conciliar} pagos por conciliar`}
                    pie={<LinkVer to="/cobranza/inteligente/gestion">Abrir bandeja</LinkVer>} />
            </div>
            <CarteraPorEtapa distribucion={d.distribucion_por_etapa} />
        </section>
    );
}

function LineaBase({ sedeId, onGuardada }) {
    const [valores, setValores] = useState({ cobrado_al_vencimiento_pct: '', mora_7_pct: '', mora_15_pct: '', mora_30_pct: '' });
    const [guardando, setGuardando] = useState(false);
    const guardar = async () => {
        setGuardando(true);
        try {
            await guardarLineaBaseInteligente(sedeId, valores);
            toast.success('Línea base guardada');
            onGuardada();
        } catch (err) {
            toast.error(mensajeErrorInteligente(err));
        } finally {
            setGuardando(false);
        }
    };
    return (
        <Card titulo="Línea base" subtitulo="Mide los últimos 3 meses antes de encender el módulo y cárgala una vez para comparar.">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {[['cobrado_al_vencimiento_pct', '% cobrado al vencimiento'], ['mora_7_pct', '% en mora a 7 días'],
                    ['mora_15_pct', '% en mora a 15 días'], ['mora_30_pct', '% en mora a 30 días']].map(([k, label]) => (
                    <label key={k} className="text-xs" style={{ color: 'var(--ash)' }}>
                        {label}
                        <input type="number" min="0" max="100" step="0.01" value={valores[k]}
                            onChange={e => setValores(v => ({ ...v, [k]: e.target.value }))}
                            className="input mt-1 w-full" />
                    </label>
                ))}
            </div>
            <button type="button" onClick={guardar} disabled={guardando || valores.cobrado_al_vencimiento_pct === ''}
                className="btn btn-primary w-full sm:w-auto mt-3">
                Guardar línea base
            </button>
        </Card>
    );
}

const Bloque = ({ className }) => <div className={`skeleton ${className}`} aria-hidden="true" />;

const CobranzaInteligenteDashboard = () => {
    const navigate = useNavigate();
    const { user } = useContext(AuthContext);
    const veResultados = ROLES_RESULTADOS.includes((user?.rol || '').toLowerCase().trim());
    const inteligente = useCargaInteligente(veResultados ? getDashboardInteligente : sinResultados);
    const { sedeId } = inteligente;
    const d = inteligente.data;

    const { lineas, totales, loading, error } = useResumenPorConcepto({ concepto: 'mensualidad', sede: sedeId });
    const cargandoMeses = loading || (!totales && !error);
    const [mesElegido, setMesElegido] = useState('');
    const etiquetaMes = mesElegido || mesPorDefecto(lineas);
    const mes = lineas.find(l => l.etiqueta === etiquetaMes);

    const [filtros, setFiltros] = useState({ buscar: '', grado: '', estado: 'todos' });
    const periodo = { concepto: 'mensualidad', mes: mes?.mes, anio: mes?.anio, sede: sedeId, enabled: Boolean(mes) };
    const { resumen } = useEstadoPorConcepto(periodo);
    const r = resumen ?? RESUMEN_VACIO;
    const listado = useEstadoPorConcepto({ ...periodo, estado: filtros.estado, gradoSeccion: filtros.grado, buscar: filtros.buscar });

    const barras = useMemo(() => {
        const i = lineas.findIndex(l => l.etiqueta === etiquetaMes);
        return lineas.slice(Math.max(0, i - 5), i + 1);
    }, [lineas, etiquetaMes]);

    const cobrado = Number(r.monto_cobrado_usd);
    const pendiente = Number(r.monto_pendiente_usd);
    const facturado = cobrado + pendiente;
    const cargandoKpis = cargandoMeses || (Boolean(mes) && !resumen);

    return (
        <div className="w-full max-w-7xl mx-auto space-y-4 sm:space-y-5 pb-20">
            {/* Encabezado propio: las tres acciones solo caben junto al título desde xl. */}
            <header className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                    <h1 className="text-xl sm:text-2xl font-semibold tracking-tight" style={{ color: 'var(--jet)' }}>Cobranza</h1>
                    <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
                        Estado de las mensualidades y resultados de la gestión inteligente.
                    </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select value={etiquetaMes} onChange={e => setMesElegido(e.target.value)} aria-label="Mes"
                        className="input w-full sm:w-44" disabled={!lineas.length}>
                        {lineas.map(l => <option key={l.etiqueta} value={l.etiqueta}>{l.etiqueta}</option>)}
                    </select>
                    <button type="button" className="btn btn-secondary w-full sm:w-auto whitespace-nowrap" onClick={() => navigate('/cobranza/inteligente/gestion')}>
                        <Sparkles size={16} />Bandeja de gestión
                    </button>
                    <button type="button" className="btn btn-primary w-full sm:w-auto whitespace-nowrap" style={{ boxShadow: 'var(--glow-pb)' }}
                        onClick={() => navigate('/cobranza')}>
                        <Plus size={16} />Registrar pago
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {cargandoKpis ? [1, 2, 3, 4].map(i => <Bloque key={i} className="h-32 sm:h-40 !rounded-[var(--radius-card)]" />) : (
                    <>
                        <Kpi icono={Wallet} color="var(--pb-mid)" fondo="var(--pb-light)" titulo="Total por cobrar"
                            valor={`$${fmt(facturado, 2)}`} detalle={`Mensualidades de ${etiquetaMes}`} />
                        <Kpi icono={CheckCircle2} color="var(--green)" fondo="var(--green-light)" titulo="Pagado"
                            valor={`$${fmt(cobrado, 2)}`} progreso={pctDe(cobrado, facturado)}
                            detalle={`${pctDe(cobrado, facturado)}% del total`} />
                        <Kpi icono={AlertCircle} color="var(--red)" fondo="var(--red-light)" titulo="Pendiente"
                            valor={`$${fmt(pendiente, 2)}`} progreso={pctDe(pendiente, facturado)}
                            detalle={`${pctDe(pendiente, facturado)}% del total`} />
                        <Kpi icono={Users} color="var(--violet)" fondo="var(--violet-light)" titulo="Total estudiantes"
                            valor={r.total_filas} detalle={`${r.pendientes + r.parciales} con saldo pendiente`} />
                    </>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                <Panel titulo="Estado de pagos">
                    {cargandoKpis ? <Bloque className="h-40" /> : <DonutEstadoPagos resumen={r} />}
                </Panel>
                <Panel titulo="Mensualidades pendientes">
                    {cargandoMeses ? <Bloque className="h-48" /> : <BarrasPendientes lineas={barras} seleccionada={etiquetaMes} />}
                </Panel>
                {veResultados && (
                    <Panel titulo="Recordatorios" className="md:col-span-2 lg:col-span-1"
                        accion={<LinkVer to="/cobranza/historial-whatsapp" />}>
                        {inteligente.loading && <Bloque className="h-40" />}
                        {d && <Recordatorios envios={d.envios_7_dias} />}
                        {inteligente.apagada && (
                            <p className="text-sm py-6 text-center" style={{ color: 'var(--ash)' }}>
                                Los recordatorios automáticos están apagados en esta sede.{' '}
                                <Link to="/configuracion/cobranza-inteligente" className="font-medium underline" style={{ color: 'var(--pb-mid)' }}>
                                    Configurar
                                </Link>
                            </p>
                        )}
                    </Panel>
                )}
            </div>

            {veResultados && inteligente.loading && <Bloque className="h-56 !rounded-[var(--radius-card)]" />}
            {d && <GestionInteligente d={d} />}

            <TablaEstudiantes filtros={filtros} setFiltros={setFiltros} listado={listado} />

            {d && !d.comparacion_linea_base && <LineaBase sedeId={sedeId} onGuardada={inteligente.recargar} />}
        </div>
    );
};

export default CobranzaInteligenteDashboard;
