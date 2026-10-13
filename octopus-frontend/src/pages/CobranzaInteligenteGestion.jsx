import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import { Sparkles, ChevronLeft, MessagesSquare, UserCheck } from 'lucide-react';
import WhatsAppIcon from '../components/ui/WhatsAppIcon';
import AccionSugerida from '../components/cobranzaInteligente/AccionSugerida';
import { useAccionesCaso } from '../hooks/useAccionesCaso';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { TablaScroll } from '../components/ui/TablaScroll';
import { useCargaInteligente, mensajeErrorInteligente } from '../hooks/useCargaInteligente';
import {
    getBandejaInteligente, getPagosRevisionInteligente, getConveniosInteligente,
    pagarCuotaConvenio, cancelarConvenioInteligente,
} from '../api/cobranza.service';

const cargarConvenios = (_sedeId, signal) => getConveniosInteligente(signal);
const fecha = (iso) => format(parseISO(iso), "d 'de' MMM yyyy", { locale: es });

const ESTADO_CONVENIO = { vigente: 'Vigente', cumplido: 'Cumplido', incumplido: 'Incumplido', cancelado: 'Cancelado' };

const btn = 'w-full sm:w-auto px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50';
const estiloSec = { border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' };
const estiloPri = { background: 'var(--pb)', color: '#fff' };

const Skeleton = () => (
    <div className="space-y-3 animate-pulse" aria-hidden="true">
        {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl" style={{ background: 'var(--ash-light)' }} />)}
    </div>
);

const Vacio = ({ children }) => (
    <p className="text-sm text-center py-8" style={{ color: 'var(--ash)' }}>{children}</p>
);

/* ── Pestañas ── */
function Bandeja() {
    const { data, loading, apagada, recargar } = useCargaInteligente(getBandejaInteligente);
    const { ejecutar, modales } = useAccionesCaso(recargar);

    if (loading) return <Skeleton />;
    if (apagada) return <Vacio>Cobranza Inteligente está apagada en esta sede.</Vacio>;
    if (!data?.results.length) return <Vacio>Nada requiere atención hoy.</Vacio>;

    return (
        <>
            <ul className="space-y-3">
                {data.results.map(f => (
                    <li key={f.representante.id}>
                        <Card>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                    <h3 className="text-sm sm:text-base font-semibold truncate" style={{ color: 'var(--jet)' }}>
                                        {f.representante.nombre}
                                    </h3>
                                    <p className="text-xs sm:text-sm" style={{ color: 'var(--ash)' }}>
                                        {f.ciclos.length} deuda(s) · ${f.saldo_total_usd} · {f.dias_mora_max} días de mora
                                        {f.responsable ? ` · ${f.responsable}` : ''}
                                    </p>
                                    {f.gestion_humana && (
                                        <p className="inline-flex items-center gap-1 mt-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                                            style={{ background: 'var(--violet-light)', color: 'var(--violet)' }}>
                                            <UserCheck size={12} />En manos de {f.responsable ?? 'una persona'} · bot en pausa
                                        </p>
                                    )}
                                    <ul className="flex flex-wrap gap-1.5 mt-2" aria-label="Por qué aparece">
                                        {f.razones.map(r => (
                                            <li key={r.texto} className="text-xs rounded-full px-2 py-0.5"
                                                style={{ background: 'var(--yellow-light)', color: 'var(--jet)' }}>
                                                {r.texto} (+{r.puntos})
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <span className="text-lg font-bold shrink-0" style={{ color: 'var(--red)' }}
                                    title="Puntaje de prioridad">{f.puntaje} pts</span>
                            </div>
                            {f.accion_sugerida && (
                                <div className="mt-3">
                                    <AccionSugerida accion={f.accion_sugerida} onClick={() => ejecutar(f, f.accion_sugerida.codigo)} />
                                </div>
                            )}
                            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap mt-3">
                                <Link to={`/cobranza/inteligente/representantes/${f.representante.id}`} className="btn btn-secondary w-full sm:w-auto">
                                    <MessagesSquare size={16} />Conversación
                                </Link>
                                <button type="button" className="btn btn-secondary w-full sm:w-auto" disabled={!f.representante.telefono}
                                    onClick={() => ejecutar(f, 'whatsapp')}>
                                    <WhatsAppIcon size={16} />WhatsApp
                                </button>
                                <button type="button" className="btn btn-secondary w-full sm:w-auto"
                                    onClick={() => ejecutar(f, 'llamada')}>Registrar acción</button>
                                <button type="button" className="btn btn-secondary w-full sm:w-auto"
                                    onClick={() => ejecutar(f, 'convenio')}>Crear convenio</button>
                            </div>
                        </Card>
                    </li>
                ))}
            </ul>
            {modales}
        </>
    );
}

function PagosRevision() {
    const { data, loading, apagada } = useCargaInteligente(getPagosRevisionInteligente);
    if (loading) return <Skeleton />;
    if (apagada) return <Vacio>Cobranza Inteligente está apagada en esta sede.</Vacio>;
    if (!data?.results.length) return <Vacio>No hay pagos esperando revisión.</Vacio>;
    return (
        <TablaScroll>
            <table className="w-full min-w-[560px] text-sm">
                <thead>
                    <tr className="text-left" style={{ color: 'var(--ash)' }}>
                        <th className="py-2 pr-3">Representante</th><th className="pr-3">Alumno</th>
                        <th className="pr-3">Monto</th><th className="pr-3">Tipo</th><th>Espera</th>
                    </tr>
                </thead>
                <tbody>
                    {data.results.map(p => (
                        <tr key={`${p.tipo}-${p.id}`} style={{ borderTop: '1px solid var(--border)' }}>
                            <td className="py-2 pr-3">{p.representante.nombre}</td>
                            <td className="pr-3">{p.alumno}</td>
                            <td className="pr-3">${p.monto_usd}</td>
                            <td className="pr-3">{p.tipo === 'pago' ? 'Pago' : 'Comprobante'}</td>
                            <td style={{ color: p.dias_espera > 3 ? 'var(--red)' : undefined }}>{p.dias_espera} días</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </TablaScroll>
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
    if (apagada) return <Vacio>Cobranza Inteligente está apagada.</Vacio>;
    if (!data?.results.length) return <Vacio>Aún no hay convenios.</Vacio>;
    return (
        <ul className="space-y-3">
            {data.results.map(c => (
                <li key={c.id}>
                    <Card titulo={`Convenio #${c.id} · ${ESTADO_CONVENIO[c.estado]}`}
                        accion={c.estado === 'vigente' && (
                            <button type="button" className={btn} style={estiloSec}
                                onClick={() => ejecutar(() => cancelarConvenioInteligente(c.id), 'Convenio cancelado')}>
                                Cancelar convenio
                            </button>
                        )}>
                        <ul className="space-y-2 text-sm">
                            {c.cuotas.map(q => (
                                <li key={q.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <span>Cuota {q.numero} · {fecha(q.fecha)} · ${q.monto_usd}{q.pagada ? ' · Pagada' : ''}</span>
                                    {!q.pagada && c.estado === 'vigente' && (
                                        <button type="button" className={btn} style={estiloPri}
                                            onClick={() => ejecutar(() => pagarCuotaConvenio(q.id), 'Cuota registrada')}>
                                            Marcar pagada
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </Card>
                </li>
            ))}
        </ul>
    );
}

const PESTANAS = [
    { id: 'bandeja', label: 'Atención hoy', Vista: Bandeja },
    { id: 'pagos', label: 'Pagos en revisión', Vista: PagosRevision },
    { id: 'convenios', label: 'Convenios', Vista: Convenios },
];

const CobranzaInteligenteGestion = () => {
    const [activa, setActiva] = useState('bandeja');
    const { Vista } = PESTANAS.find(p => p.id === activa);
    return (
        <div className="w-full max-w-4xl mx-auto space-y-4 sm:space-y-6 pb-20">
            <PageHeader titulo="Gestión de cobranza" descripcion="Casos que requieren atención hoy, con la razón de cada prioridad."
                acciones={<Link to="/cobranza/inteligente" className="btn btn-secondary w-full sm:w-auto"><ChevronLeft size={16} />Volver al dashboard</Link>} />
            <div role="tablist" className="flex gap-2 overflow-x-auto">
                {PESTANAS.map(p => (
                    <button key={p.id} type="button" role="tab" aria-selected={activa === p.id}
                        onClick={() => setActiva(p.id)}
                        className="shrink-0 px-3 py-2 rounded-lg text-sm font-medium min-h-11"
                        style={activa === p.id ? estiloPri : estiloSec}>
                        {p.id === 'bandeja' && <Sparkles size={14} className="inline mr-1" />}{p.label}
                    </button>
                ))}
            </div>
            <Vista />
        </div>
    );
};

export default CobranzaInteligenteGestion;
