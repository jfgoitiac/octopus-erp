import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '../../ui/Card';
import { TablaScroll } from '../../ui/TablaScroll';
import { SkeletonLista } from '../shared/SkeletonLista';
import { PerfilPagadorBadge } from '../shared/PerfilPagadorBadge';
import { useSede } from '../../../context/useSede';
import { mensajeErrorInteligente } from '../../../hooks/useCargaInteligente';
import { getProyeccionCaja } from '../../../api/cobranza.service';
import { hoyISO } from '../automatizaciones/automatizacionesUtils';
import { usd, probabilidadPct, rangoSemana, diaCorto, fechaCorta, moverSemana } from './reportesUtils';

const Metrica = ({ etiqueta, valor }) => (
    <div className="rounded-xl p-3 min-w-0" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <p className="text-xs" style={{ color: 'var(--ash)' }}>{etiqueta}</p>
        <p className="text-lg sm:text-xl font-bold truncate" style={{ color: 'var(--jet)' }}>{valor}</p>
    </div>
);

const navBtn = 'flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-medium';
const estiloSec = { border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' };

/** Proyección de caja de la semana: cuotas de promesas y convenios ponderadas por perfil de pagador. */
export function ProyeccionCaja() {
    const { sedeActiva } = useSede();
    const sedeId = sedeActiva?.id ?? null;
    const [fecha, setFecha] = useState(hoyISO());
    const [estado, setEstado] = useState({ key: null, data: null });
    const key = `${sedeId}:${fecha}`;

    useEffect(() => {
        const c = new AbortController();
        getProyeccionCaja(fecha, sedeId, c.signal)
            .then(r => setEstado({ key, data: r.data }))
            .catch(err => {
                if (err?.code === 'ERR_CANCELED') return;
                setEstado({ key, data: null });
                // 409: el módulo apagado ya se avisa arriba en la pantalla de Reportes.
                if (err?.response?.status !== 409) toast.error(mensajeErrorInteligente(err));
            });
        return () => c.abort();
    }, [fecha, sedeId, key]);

    const loading = estado.key !== key;
    const d = loading ? null : estado.data;
    const maxDia = d ? Math.max(0.01, ...d.por_dia.map(x => parseFloat(x.comprometido_usd) || 0)) : 1;

    return (
        <Card titulo="Proyección de caja de la semana"
            subtitulo="Cuotas de promesas y convenios vigentes, ponderadas por la probabilidad de cumplimiento del perfil de pagador.">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 mb-3">
                <button type="button" className={navBtn} style={estiloSec} onClick={() => setFecha(moverSemana(fecha, -1))}
                    aria-label="Semana anterior"><ChevronLeft size={16} aria-hidden="true" />Anterior</button>
                <p className="text-sm font-semibold text-center sm:flex-1" style={{ color: 'var(--jet)' }} data-testid="rango-semana">
                    {d ? rangoSemana(d.semana) : '…'}
                </p>
                <button type="button" className={navBtn} style={estiloSec} onClick={() => setFecha(moverSemana(fecha, 1))}
                    aria-label="Semana siguiente">Siguiente<ChevronRight size={16} aria-hidden="true" /></button>
            </div>

            {loading && <SkeletonLista filas={3} alto="h-16" />}
            {!loading && !d && <p className="text-sm" style={{ color: 'var(--ash)' }}>No se pudo cargar la proyección.</p>}
            {d && (
                <div className="space-y-4" data-testid="proyeccion-caja">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                        <Metrica etiqueta="Casos con cuota esta semana" valor={d.casos} />
                        <Metrica etiqueta="Comprometido" valor={usd(d.comprometido_usd)} />
                        <Metrica etiqueta="Esperado (ponderado)" valor={usd(d.esperado_usd)} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                        <section>
                            <h4 className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--ash)' }}>Por perfil de pagador</h4>
                            <ul className="space-y-1.5 text-sm">
                                {Object.entries(d.por_perfil || {}).map(([codigo, p]) => (
                                    <li key={codigo} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                                        <span className="flex items-center gap-2">
                                            <PerfilPagadorBadge perfil={{ codigo, etiqueta: p.etiqueta }} />
                                            <span className="text-xs" style={{ color: 'var(--ash)' }}>
                                                {probabilidadPct(p.probabilidad?.valor)} ·{' '}
                                                {p.probabilidad?.fuente === 'historica' ? `histórica (${p.probabilidad.muestra} cuotas)` : 'por defecto'}
                                            </span>
                                        </span>
                                        <span style={{ color: 'var(--jet)' }}>{p.casos} · {usd(p.comprometido_usd)} → <strong>{usd(p.esperado_usd)}</strong></span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                        <section>
                            <h4 className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--ash)' }}>Por día</h4>
                            <ul className="space-y-1.5 text-sm">
                                {d.por_dia.map(x => (
                                    <li key={x.fecha} className="flex items-center gap-2">
                                        <span className="w-14 shrink-0 text-xs capitalize" style={{ color: 'var(--ash)' }}>{diaCorto(x.fecha)}</span>
                                        <span className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--ash-light)' }} aria-hidden="true">
                                            <span className="block h-full rounded-full"
                                                style={{ width: `${Math.round(((parseFloat(x.comprometido_usd) || 0) / maxDia) * 100)}%`, background: 'var(--pb)' }} />
                                        </span>
                                        <span className="shrink-0 text-xs text-right" style={{ color: 'var(--jet)' }}>{usd(x.esperado_usd)}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    </div>

                    <section>
                        <h4 className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--ash)' }}>Detalle de cuotas</h4>
                        {d.detalle.length === 0 ? (
                            <p className="text-sm" style={{ color: 'var(--ash)' }}>No hay cuotas de promesas ni convenios para esta semana.</p>
                        ) : (
                            <TablaScroll>
                                <table className="w-full min-w-[40rem] text-sm" aria-label="Detalle de la proyección de caja">
                                    <thead style={{ color: 'var(--ash)' }}>
                                        <tr>
                                            <th scope="col" className="text-left text-xs font-medium py-1 pr-3">Representante</th>
                                            <th scope="col" className="text-left text-xs font-medium py-1 pr-3">Fuente</th>
                                            <th scope="col" className="text-left text-xs font-medium py-1 pr-3">Fecha</th>
                                            <th scope="col" className="text-left text-xs font-medium py-1 pr-3">Perfil</th>
                                            <th scope="col" className="text-right text-xs font-medium py-1 pr-3">Monto</th>
                                            <th scope="col" className="text-right text-xs font-medium py-1">Esperado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {d.detalle.map(x => (
                                            <tr key={x.cuota} style={{ borderTop: '0.5px solid var(--border)' }}>
                                                <td className="py-1.5 pr-3">{x.representante?.nombre}</td>
                                                <td className="py-1.5 pr-3">{x.tipo === 'promesa' ? 'Promesa' : `Convenio · cuota ${x.numero}`}</td>
                                                <td className="py-1.5 pr-3 whitespace-nowrap">{fechaCorta(x.fecha)}</td>
                                                <td className="py-1.5 pr-3"><PerfilPagadorBadge perfil={x.perfil_pagador} /></td>
                                                <td className="py-1.5 pr-3 text-right">{usd(x.monto_usd)}</td>
                                                <td className="py-1.5 text-right font-semibold">{usd(x.esperado_usd)} <span className="text-xs font-normal" style={{ color: 'var(--ash)' }}>({probabilidadPct(x.probabilidad)})</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </TablaScroll>
                        )}
                    </section>
                    {d.regla && <p className="text-xs" style={{ color: 'var(--ash)' }}>{d.regla}</p>}
                </div>
            )}
        </Card>
    );
}

export default ProyeccionCaja;
