import { useState } from 'react';
import { toast } from 'react-toastify';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { useCargaInteligente, mensajeErrorInteligente } from '../hooks/useCargaInteligente';
import { getDashboardInteligente, guardarLineaBaseInteligente } from '../api/cobranza.service';

const ETAPAS = {
    preventiva: 'Preventiva', temprana: 'Temprana', prioritaria: 'Prioritaria', critica: 'Crítica', pausada: 'Pausada',
};
const ENVIOS = { enviado: 'Enviados', simulado: 'Simulados', fallido: 'Fallidos', pendiente: 'Pendientes' };

const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
const pp = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v} pp`);

const Metrica = ({ etiqueta, valor, nota }) => (
    <div className="rounded-xl p-3 sm:p-4" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <p className="text-xs" style={{ color: 'var(--ash)' }}>{etiqueta}</p>
        <p className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--jet)' }}>{valor}</p>
        {nota && <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>{nota}</p>}
    </div>
);

const Skeleton = () => (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-pulse" aria-hidden="true">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-20 rounded-xl" style={{ background: 'var(--ash-light)' }} />)}
    </div>
);

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
                            className="mt-1 w-full px-3 py-2 rounded-lg"
                            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }} />
                    </label>
                ))}
            </div>
            <button type="button" onClick={guardar} disabled={guardando || valores.cobrado_al_vencimiento_pct === ''}
                className="w-full sm:w-auto mt-3 px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--pb)' }}>
                Guardar línea base
            </button>
        </Card>
    );
}

const CobranzaInteligenteDashboard = () => {
    const { data: d, loading, apagada, recargar, sedeId } = useCargaInteligente(getDashboardInteligente);

    return (
        <div className="w-full max-w-5xl mx-auto space-y-4 sm:space-y-6 pb-20">
            <PageHeader titulo="Resultados de Cobranza Inteligente" descripcion="Efectividad, cartera y recuperación atribuida a la gestión." />
            {loading && <Skeleton />}
            {apagada && (
                <p className="text-sm text-center py-8" style={{ color: 'var(--ash)' }}>
                    Cobranza Inteligente está apagada en esta sede.
                </p>
            )}
            {d && (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <Metrica etiqueta="Cobrado del mes" valor={pct(d.cartera_mes.cobrado_pct)}
                            nota={`$${d.cartera_mes.cobrado_usd} de $${d.cartera_mes.facturado_usd}`} />
                        <Metrica etiqueta="Cobrado al vencimiento" valor={pct(d.efectividad.cobrado_al_vencimiento_pct)}
                            nota={d.comparacion_linea_base ? `vs. base: ${pp(d.comparacion_linea_base.delta_cobrado_al_vencimiento_pp)}` : 'Sin línea base'} />
                        <Metrica etiqueta="Mora a 15 días" valor={pct(d.efectividad.mora_15_pct)}
                            nota={d.comparacion_linea_base ? `vs. base: ${pp(d.comparacion_linea_base.delta_mora_15_pp)}` : undefined} />
                        <Metrica etiqueta="Pagos por conciliar" valor={d.pagos_por_conciliar} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                        <Card titulo="Cartera por etapa">
                            <ul className="space-y-1.5 text-sm">
                                {Object.entries(d.distribucion_por_etapa).map(([k, v]) => (
                                    <li key={k} className="flex justify-between gap-2">
                                        <span>{ETAPAS[k] || k}</span>
                                        <span style={{ color: 'var(--ash)' }}>{v.casos} casos · ${v.saldo_usd}</span>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                        <Card titulo="Envíos de los últimos 7 días">
                            <ul className="space-y-1.5 text-sm">
                                {Object.entries(d.envios_7_dias).length === 0 && <li style={{ color: 'var(--ash)' }}>Sin envíos.</li>}
                                {Object.entries(d.envios_7_dias).map(([k, n]) => (
                                    <li key={k} className="flex justify-between"><span>{ENVIOS[k] || k}</span><span>{n}</span></li>
                                ))}
                            </ul>
                        </Card>
                    </div>

                    <Card titulo="Recuperado este mes" subtitulo={d.recuperado.regla}>
                        <p className="text-sm" style={{ color: 'var(--jet)' }}>
                            Total recuperado: <strong>${d.recuperado.total_recuperado_usd}</strong> ·
                            atribuido a la gestión: <strong>${d.recuperado.atribuido_usd}</strong>
                            {' '}({d.recuperado.casos_atribuidos} de {d.recuperado.casos_totales} casos)
                        </p>
                    </Card>

                    <Card titulo="Cola de trabajo">
                        <p className="text-sm" style={{ color: 'var(--jet)' }}>
                            {d.bandeja.casos_abiertos} casos abiertos · antigüedad máxima {d.bandeja.antiguedad_max_dias} días ·
                            {' '}{d.bandeja.casos_mas_de_15_dias} con más de 15 días
                        </p>
                    </Card>

                    {!d.comparacion_linea_base && <LineaBase sedeId={sedeId} onGuardada={recargar} />}
                </>
            )}
        </div>
    );
};

export default CobranzaInteligenteDashboard;
