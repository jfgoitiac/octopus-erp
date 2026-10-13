import { useState } from 'react';
import { toast } from 'react-toastify';
import { Play, Loader2 } from 'lucide-react';
import DatePickerES from '../../DatePickerES';
import { SkeletonLista } from '../shared/SkeletonLista';
import { mensajeErrorInteligente } from '../../../hooks/useCargaInteligente';
import { getSimulacionMotor } from '../../../api/cobranza.service';
import { ESTADOS_SIM, MOTIVOS_OMISION, CANALES, etiqueta, fechaLarga, hoyISO } from './automatizacionesUtils';

const campo = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };

/** "Qué saldría ese día": evaluación en seco del motor (no crea ningún registro). */
export function SimuladorEnvios({ sedeId }) {
    const [fecha, setFecha] = useState(hoyISO());
    const [cargando, setCargando] = useState(false);
    const [res, setRes] = useState(null);

    const simular = async () => {
        setCargando(true);
        try {
            const r = await getSimulacionMotor(fecha, sedeId);
            setRes(r.data);
        } catch (err) {
            toast.error(mensajeErrorInteligente(err));
        } finally {
            setCargando(false);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="w-full sm:w-48">
                    <DatePickerES value={fecha} onChange={e => setFecha(e.target.value)} className="w-full px-3 py-2 rounded-lg" style={campo} />
                </div>
                <button type="button" onClick={simular} disabled={cargando || !fecha}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                    style={{ background: 'var(--pb)', color: '#fff' }}>
                    {cargando ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}Simular
                </button>
            </div>
            <p className="text-xs" style={{ color: 'var(--ash)' }}>
                Solo ve las deudas que existen hoy; las mensualidades futuras aún no generadas no aparecen. El horario no se evalúa.
            </p>

            {cargando && <SkeletonLista filas={3} alto="h-16" />}

            {!cargando && res && (
                <div className="space-y-3" data-testid="resultado-simulacion">
                    <p className="text-sm font-semibold capitalize" style={{ color: 'var(--jet)' }}>
                        {fechaLarga(res.fecha)}: {res.total} {res.total === 1 ? 'envío evaluado' : 'envíos evaluados'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(ESTADOS_SIM).map(([k, e]) => (
                            <span key={k} className="px-2 py-1 rounded-lg text-xs font-medium"
                                style={{ border: `1px solid ${e.color}`, color: e.color }}>
                                {e.label}: {res.por_estado?.[k] ?? 0}
                            </span>
                        ))}
                    </div>
                    {res.items?.length === 0 && (
                        <p className="text-sm" style={{ color: 'var(--ash)' }}>No saldría ningún mensaje ese día.</p>
                    )}
                    <ul className="space-y-2">
                        {res.items?.map((it, i) => {
                            const est = ESTADOS_SIM[it.estado] ?? { label: it.estado, color: 'var(--ash)' };
                            return (
                                <li key={`${it.representante?.id}-${it.regla?.id}-${i}`} className="rounded-xl p-3 text-sm space-y-1"
                                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                        <p className="font-semibold break-words" style={{ color: 'var(--jet)' }}>{it.representante?.nombre}</p>
                                        <span className="text-xs font-medium" style={{ color: est.color }}>{est.label}</span>
                                    </div>
                                    <p className="text-xs break-words" style={{ color: 'var(--ash)' }}>
                                        {it.regla?.nombre} · {etiqueta(CANALES, it.canal)} · ${it.saldo_total_usd}
                                        {it.variante ? ` · Variante ${it.variante}` : ''}{it.recordatorio_extra ? ' · Recordatorio extra (paga tarde)' : ''}
                                    </p>
                                    {it.estado === 'se_omitiria' && it.motivos_omision?.length > 0 && (
                                        <ul className="text-xs list-disc pl-4" style={{ color: 'var(--red)' }}>
                                            {it.motivos_omision.map(m => <li key={m}>{MOTIVOS_OMISION[m] ?? m}</li>)}
                                        </ul>
                                    )}
                                    {it.estado === 'solo_simulado' && (
                                        <p className="text-xs" style={{ color: 'var(--ash)' }}>Modo sombra o etapa apagada: se registra pero no se envía.</p>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}

export default SimuladorEnvios;
