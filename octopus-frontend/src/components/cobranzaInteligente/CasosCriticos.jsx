import { Link } from 'react-router-dom';
import { Flame, MessagesSquare, ArrowRight, UserCheck, PartyPopper } from 'lucide-react';
import InitialsAvatar from '../shared/InitialsAvatar';
import AccionSugerida from './AccionSugerida';
import { useCargaInteligente } from '../../hooks/useCargaInteligente';
import { useAccionesCaso } from '../../hooks/useAccionesCaso';
import { getBandejaInteligente } from '../../api/cobranza.service';
import { fmt } from '../../utils/format';

const MAXIMO = 5;

const nivel = (puntaje) => {
    if (puntaje >= 60) return { color: 'var(--red)', fondo: 'var(--red-light)', avatar: '#9e2b25' };
    if (puntaje >= 35) return { color: 'var(--orange)', fondo: 'var(--orange-light)', avatar: '#c2410c' };
    return { color: 'var(--amber-ink)', fondo: 'var(--yellow-light)', avatar: '#d97706' };
};

/** Los casos de mayor prioridad de la bandeja, con su acción sugerida a un clic. */
export default function CasosCriticos() {
    const { data, loading, apagada, recargar } = useCargaInteligente(getBandejaInteligente);
    const { ejecutar, modales } = useAccionesCaso(recargar);
    if (apagada) return null;
    const casos = data?.results.slice(0, MAXIMO) ?? [];

    return (
        <section className="rounded-[var(--radius-card)] p-4 sm:p-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <div className="flex items-center justify-between gap-2 mb-4">
                <h2 className="flex items-center gap-2 text-sm sm:text-base font-semibold whitespace-nowrap" style={{ color: 'var(--jet)' }}>
                    <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                        <Flame size={16} />
                    </span>
                    Casos críticos
                    {data && <span className="hidden sm:inline text-xs font-normal" style={{ color: 'var(--ash)' }}>· {data.count} por atender</span>}
                </h2>
                <Link to="/cobranza/inteligente/gestion" className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap hover:underline"
                    style={{ color: 'var(--pb-mid)' }}>
                    Ver bandeja<ArrowRight size={14} />
                </Link>
            </div>

            {loading && (
                <div className="space-y-3" aria-hidden="true">
                    {[1, 2, 3].map(i => <div key={i} className="skeleton h-16 !rounded-xl" />)}
                </div>
            )}
            {data && !casos.length && (
                <p className="flex flex-col items-center gap-2 py-8 text-sm" style={{ color: 'var(--ash)' }}>
                    <PartyPopper size={26} />Nada requiere atención hoy.
                </p>
            )}

            <ul className="divide-y divide-[var(--border)]">
                {casos.map(f => {
                    const n = nivel(f.puntaje);
                    const [nombre = '', ...resto] = f.representante.nombre.split(' ');
                    return (
                        <li key={f.representante.id} className="py-3 first:pt-0 last:pb-0 flex flex-col gap-3 lg:flex-row lg:items-center">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                                <InitialsAvatar nombre={nombre} apellido={resto.at(-1)} color={n.avatar} />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--jet)' }}>{f.representante.nombre}</p>
                                        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
                                            style={{ background: n.fondo, color: n.color }} title="Puntaje de prioridad">
                                            {f.puntaje} pts
                                        </span>
                                        {f.gestion_humana && (
                                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                                                style={{ background: 'var(--violet-light)', color: 'var(--violet)' }}>
                                                <UserCheck size={11} />{f.responsable ?? 'En gestión'}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                                        ${fmt(f.saldo_total_usd, 2)} · {f.dias_mora_max} días de mora · {f.ciclos.length} deuda(s)
                                    </p>
                                    <p className="text-xs mt-1 truncate" style={{ color: 'var(--jet-mid)' }}>
                                        {f.razones.slice(0, 2).map(r => r.texto).join(' · ')}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2 lg:shrink-0">
                                <div className="flex-1 lg:flex-none">
                                    <AccionSugerida compacto accion={f.accion_sugerida}
                                        onClick={() => ejecutar(f, f.accion_sugerida.codigo)} />
                                </div>
                                <Link to={`/cobranza/inteligente/representantes/${f.representante.id}`}
                                    className="btn btn-secondary btn-sm !px-2.5" title="Ver conversación"
                                    aria-label={`Conversación con ${f.representante.nombre}`}>
                                    <MessagesSquare size={16} />
                                </Link>
                            </div>
                        </li>
                    );
                })}
            </ul>
            {modales}
        </section>
    );
}
