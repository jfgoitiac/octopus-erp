import { Save, Loader2 } from 'lucide-react';
import { fmt } from '../../utils/formato';

const ResumenPago = ({
    nombreAlumno,
    cedula,
    alumnosSeleccionados,
    datosAlumnos,
    seleccion,
    cuotasProyectoInversion,
    selectedProyectos,
    montosParcialesProyectos,
    confirming,
    deudaVES,
    vueltoVES,
    vueltoUSD,
    pct,
    saldoVES,
    totalGenUSD,
    totalGenVES,
    loading,
    setConfirming,
    handleSubmit,
}) => {
    return (
        <div
            className="lg:col-span-2 space-y-4 self-start sticky"
            style={{ top: '66px', maxHeight: 'calc(100vh - 82px)', overflowY: 'auto' }}
        >
            <div className="rounded-xl p-4" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <p className="text-[11px] uppercase tracking-widest font-semibold mb-4 pb-2"
                    style={{ color: 'var(--ash)', borderBottom: '0.5px solid var(--border)' }}>
                    Resumen del pago
                </p>

                {/* Alumno */}
                <div className="flex items-center gap-3 mb-4 p-3 rounded-lg" style={{ background: '#fff', border: '0.5px solid var(--border)' }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
                        {(nombreAlumno[0] || '?').toUpperCase()}
                    </div>
                    <div>
                        <p className="text-xs font-semibold leading-tight" style={{ color: 'var(--jet)' }}>{nombreAlumno}</p>
                        <p className="text-[10px] font-mono" style={{ color: 'var(--ash)' }}>{cedula}</p>
                    </div>
                </div>

                {/* Mensualidades pendientes (por alumno) */}
                {alumnosSeleccionados.map(id => {
                    const datos = datosAlumnos[id];
                    const sel   = seleccion[id];
                    const mens  = sel?.selectedMens || [];
                    if (mens.length === 0) return null;
                    return (
                        <div key={`mens-${id}`} className="mb-3 space-y-1">
                            <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                Períodos{alumnosSeleccionados.length > 1 ? ` — ${datos?.nombre_completo || datos?.nombre}` : ''}
                            </p>
                            {mens.map(mid => {
                                const m  = (datos?.mensualidades_pendientes || []).find(x => x.id === mid);
                                if (!m) return null;
                                const ov = sel.montosParciales[`mens_${mid}`];
                                const monto   = ov !== undefined && ov !== '' ? parseFloat(ov) || 0 : parseFloat(m.monto_usd) || 0;
                                const parcial = ov !== undefined && ov !== '' && parseFloat(ov) < parseFloat(m.monto_usd) - 0.01;
                                return (
                                    <div key={mid} className="flex justify-between text-xs px-2 py-1 rounded-md"
                                        style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
                                        <span>{m.mes} {m.anio}{parcial ? <span className="ml-1 text-[9px] font-bold px-1 rounded" style={{ background: '#f97316', color: '#fff' }}>PARCIAL</span> : ''}</span>
                                        <span className="font-semibold">${fmt(monto)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}

                {/* Adelantos (por alumno) */}
                {alumnosSeleccionados.map(id => {
                    const datos = datosAlumnos[id];
                    const sel   = seleccion[id];
                    const futuras = sel?.selectedFuturas || [];
                    if (futuras.length === 0) return null;
                    return (
                        <div key={`fut-${id}`} className="mb-3 space-y-1">
                            <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: '#7c3aed' }}>
                                Adelantos{alumnosSeleccionados.length > 1 ? ` — ${datos?.nombre_completo || datos?.nombre}` : ''}
                            </p>
                            {futuras.map(mid => {
                                const m  = (datos?.mensualidades_futuras || []).find(x => x.id === mid);
                                if (!m) return null;
                                const ov = sel.montosParciales[`futura_${mid}`];
                                const monto   = ov !== undefined && ov !== '' ? parseFloat(ov) || 0 : parseFloat(m.monto_usd) || 0;
                                const parcial = ov !== undefined && ov !== '' && parseFloat(ov) < parseFloat(m.monto_usd) - 0.01;
                                return (
                                    <div key={mid} className="flex justify-between text-xs px-2 py-1 rounded-md"
                                        style={{ background: '#ede9fe', color: '#7c3aed' }}>
                                        <span>{m.mes} {m.anio}{parcial ? <span className="ml-1 text-[9px] font-bold px-1 rounded" style={{ background: '#f97316', color: '#fff' }}>PARCIAL</span> : ''}</span>
                                        <span className="font-semibold">${fmt(monto)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}

                {/* Inscripción (por alumno) */}
                {alumnosSeleccionados.map(id => {
                    const datos = datosAlumnos[id];
                    const sel   = seleccion[id];
                    const cuotas = sel?.selectedCuotas || [];
                    if (cuotas.length === 0) return null;
                    return (
                        <div key={`cuota-${id}`} className="mb-3 space-y-1">
                            <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: '#b45309' }}>
                                Inscripción{alumnosSeleccionados.length > 1 ? ` — ${datos?.nombre_completo || datos?.nombre}` : ''}
                            </p>
                            {cuotas.map(cid => {
                                const c  = (datos?.cuotas_inscripcion_pendientes || []).find(x => x.id === cid);
                                if (!c) return null;
                                const ov = sel.montosParciales[`cuota_${cid}`];
                                const monto   = ov !== undefined && ov !== '' ? parseFloat(ov) || 0 : parseFloat(c.monto_usd) || 0;
                                const parcial = ov !== undefined && ov !== '' && parseFloat(ov) < parseFloat(c.monto_usd) - 0.01;
                                return (
                                    <div key={cid} className="flex justify-between text-xs px-2 py-1 rounded-md"
                                        style={{ background: '#fef3c7', color: '#b45309' }}>
                                        <span>Período {c.periodo_escolar}{parcial ? <span className="ml-1 text-[9px] font-bold px-1 rounded" style={{ background: '#f97316', color: '#fff' }}>PARCIAL</span> : ''}</span>
                                        <span className="font-semibold">${fmt(monto)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}

                {/* Solvencia (por alumno) */}
                {alumnosSeleccionados.map(id => {
                    const datos = datosAlumnos[id];
                    const sel   = seleccion[id];
                    const solvs = sel?.selectedSolvencias || [];
                    if (solvs.length === 0) return null;
                    return (
                        <div key={`solv-${id}`} className="mb-3 space-y-1">
                            <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: '#b91c1c' }}>
                                Solvencia{alumnosSeleccionados.length > 1 ? ` — ${datos?.nombre_completo || datos?.nombre}` : ''}
                            </p>
                            {solvs.map(cid => {
                                const c  = (datos?.cuotas_solvencia_pendientes || []).find(x => x.id === cid);
                                if (!c) return null;
                                const ov = sel.montosParciales[`solv_${cid}`];
                                const monto   = ov !== undefined && ov !== '' ? parseFloat(ov) || 0 : parseFloat(c.monto_usd) || 0;
                                const parcial = ov !== undefined && ov !== '' && parseFloat(ov) < parseFloat(c.monto_usd) - 0.01;
                                return (
                                    <div key={cid} className="flex justify-between text-xs px-2 py-1 rounded-md"
                                        style={{ background: '#fee2e2', color: '#b91c1c' }}>
                                        <span>{c.concepto || `Período ${c.periodo_escolar}`}{parcial ? <span className="ml-1 text-[9px] font-bold px-1 rounded" style={{ background: '#f97316', color: '#fff' }}>PARCIAL</span> : ''}</span>
                                        <span className="font-semibold">${fmt(monto)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}

                {/* Proyecto de Inversión (representante) */}
                {(selectedProyectos || []).length > 0 && (
                    <div className="mb-3 space-y-1">
                        <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: '#b91c1c' }}>
                            Proyecto de Inversión
                        </p>
                        {selectedProyectos.map(cid => {
                            const c = (cuotasProyectoInversion || []).find(x => x.id === cid);
                            if (!c) return null;
                            const ov = montosParcialesProyectos?.[cid];
                            const monto   = ov !== undefined && ov !== '' ? parseFloat(ov) || 0 : parseFloat(c.monto_usd) || 0;
                            const parcial = ov !== undefined && ov !== '' && parseFloat(ov) < parseFloat(c.monto_usd) - 0.01;
                            return (
                                <div key={cid} className="flex justify-between text-xs px-2 py-1 rounded-md"
                                    style={{ background: '#fee2e2', color: '#b91c1c' }}>
                                    <span>Período {c.periodo_escolar}{parcial ? <span className="ml-1 text-[9px] font-bold px-1 rounded" style={{ background: '#f97316', color: '#fff' }}>PARCIAL</span> : ''}</span>
                                    <span className="font-semibold">${fmt(monto)}</span>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Totales */}
                <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-xs" style={{ color: 'var(--ash)' }}>
                        <span>Total USD</span>
                        <span className="font-semibold" style={{ color: 'var(--jet)' }}>${fmt(totalGenUSD)}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-lg" style={{ background: 'var(--pb-light)' }}>
                        <span className="text-sm font-medium" style={{ color: 'var(--pb)' }}>Total Bs.</span>
                        <span className="text-lg font-bold" style={{ color: 'var(--pb)' }}>Bs. {fmt(totalGenVES)}</span>
                    </div>
                </div>

                {/* Barra de progreso (si hay deuda) */}
                {deudaVES > 0 && (
                    <div className="mb-4">
                        <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--ash)' }}>
                            <span>{pct}% cubierto</span>
                            {saldoVES > 0 && <span className="font-medium" style={{ color: 'var(--red)' }}>Falta: Bs. {fmt(saldoVES)}</span>}
                            {saldoVES === 0 && vueltoVES === 0 && <span className="font-medium" style={{ color: '#16a34a' }}>✓ Completo</span>}
                        </div>
                        <div className="w-full rounded-full h-2 overflow-hidden" style={{ background: 'var(--border)' }}>
                            <div className="h-full transition-all duration-500 rounded-full"
                                style={{ width: `${pct}%`, background: pct >= 100 ? '#16a34a' : 'var(--pb)' }} />
                        </div>
                    </div>
                )}

                {/* Vuelto */}
                {vueltoVES > 0 && (
                    <div className="mb-4 p-3 rounded-lg" style={{ background: '#fefce8', border: '1px solid #fbbf24' }}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: '#92400e' }}>
                                    Vuelto a entregar
                                </p>
                                <p className="text-[10px] mt-0.5" style={{ color: '#b45309' }}>≈ ${fmt(vueltoUSD)}</p>
                            </div>
                            <span className="text-lg font-bold" style={{ color: '#b45309' }}>Bs. {fmt(vueltoVES)}</span>
                        </div>
                    </div>
                )}

                {/* Botón confirmar */}
                {confirming ? (
                    <div className="space-y-2">
                        <p className="text-xs text-center font-medium pt-1.5 px-3 rounded-t-lg"
                            style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24', borderBottom: 'none' }}>
                            ¿Confirmar el registro de este pago?
                        </p>
                        <p className="text-[10px] text-center pb-1.5 px-3 rounded-b-lg"
                            style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24', borderTop: 'none' }}>
                            Se generará e imprimirá el recibo automáticamente. Esta acción no se puede deshacer desde esta pantalla.
                        </p>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setConfirming(false)}
                                disabled={loading}
                                className="flex-1 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 transition-all"
                                style={{ border: '1px solid var(--border-md)', color: 'var(--ash)' }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={loading}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
                                style={{ background: 'var(--pb)' }}
                            >
                                {loading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                {loading ? 'Procesando…' : 'Sí, registrar'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setConfirming(true)}
                        disabled={alumnosSeleccionados.length === 0}
                        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
                        style={{ background: 'var(--pb)' }}
                    >
                        <Save size={16} />
                        Confirmar Pago
                    </button>
                )}

                <p className="text-[10px] text-center mt-2" style={{ color: 'var(--ash)' }}>
                    Se generará comprobante PDF automáticamente
                </p>
            </div>
        </div>
    );
};

export default ResumenPago;
