import { User, Loader2, CheckCircle2, DollarSign, ArrowRight } from 'lucide-react';
import DecimalInput from '../../components/DecimalInput';
import { fmt } from '../../utils/formato';

const CobranzaStep1 = ({
    cedula,
    buscarAlumno,
    loadingBusqueda,
    representanteNombre,
    alumnosRep,
    alumnoId,
    selAlumno,
    cuotasInscripcion,
    selectedCuotas,
    toggleCuota,
    mensualidades,
    selectedMens,
    toggleMens,
    setMontoParcial,
    montosParciales,
    mensualidadesFuturas,
    selectedFuturas,
    toggleFutura,
    tasa,
    totalGenVES,
    totalGenUSD,
    setStep,
    haySeleccion,
}) => {
    return (
        <div className={`max-w-2xl mx-auto anim-fade-up ${!representanteNombre ? 'py-16' : 'py-4'}`}>
            {/* Search box */}
            <div className="rounded-xl p-5 mb-5" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <label className="block text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--ash)' }}>
                    Cédula del representante
                </label>
                <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} size={15} />
                    <input
                        type="tel"
                        inputMode="numeric"
                        className="w-full pl-9 pr-8 py-2 rounded-lg outline-none transition-colors"
                        style={{
                            border: loadingBusqueda ? '1.5px solid var(--pb)' : '0.5px solid var(--border-md)',
                            background: '#fff', color: 'var(--jet)', fontSize: '16px',
                        }}
                        placeholder="Ej: 12345678"
                        value={cedula}
                        onChange={e => buscarAlumno(e.target.value)}
                        autoFocus
                        aria-label="Cédula del representante"
                    />
                    {loadingBusqueda && (
                        <Loader2 className="animate-spin absolute right-3 top-1/2 -translate-y-1/2" size={14} style={{ color: 'var(--ash)' }} />
                    )}
                </div>
            </div>

            {representanteNombre && (
                <div className="space-y-4 anim-fade-up">
                    {/* Representante */}
                    <div className="rounded-xl p-4" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                        <p className="text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--ash)' }}>Representante</p>
                        <p className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>{representanteNombre}</p>
                    </div>

                    {/* Alumnos */}
                    <div className="rounded-xl p-4" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                        <p className="text-[11px] uppercase tracking-widest mb-3" style={{ color: 'var(--ash)' }}>Seleccionar alumno</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {alumnosRep.map(alu => (
                                <button
                                    key={alu.id}
                                    type="button"
                                    onClick={() => selAlumno(alu)}
                                    className="text-left p-3 rounded-lg transition-all"
                                    style={{
                                        border: alu.id === alumnoId ? '1.5px solid var(--pb)' : '0.5px solid var(--border-md)',
                                        background: alu.id === alumnoId ? 'var(--pb-light)' : '#fff',
                                    }}
                                    aria-pressed={alu.id === alumnoId}
                                >
                                    <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{alu.nombre}</p>
                                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--ash)' }}>{alu.grado} · {alu.estatus}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Cuotas de inscripción pendientes */}
                    {alumnoId && cuotasInscripcion.length > 0 && (
                        <div className="rounded-xl p-4" style={{ border: '1.5px solid #f59e0b44', background: '#fffbeb' }}>
                            <p className="text-[11px] uppercase tracking-widest mb-3 font-bold" style={{ color: '#b45309' }}>
                                Cuota de Inscripción pendiente
                            </p>
                            <div className="space-y-2">
                                {cuotasInscripcion.map(c => (
                                    <label
                                        key={c.id}
                                        className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all"
                                        style={{
                                            border: selectedCuotas.includes(c.id) ? '1.5px solid #f59e0b' : '0.5px solid #fde68a',
                                            background: selectedCuotas.includes(c.id) ? '#fef3c7' : '#fff',
                                        }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedCuotas.includes(c.id)}
                                                onChange={() => toggleCuota(c.id)}
                                                style={{ accentColor: '#f59e0b', width: 15, height: 15 }}
                                                aria-label={`Cuota de inscripción ${c.periodo_escolar}`}
                                            />
                                            <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                                Inscripción {c.periodo_escolar}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>${c.monto_usd}</span>
                                            <p className="text-[10px]" style={{ color: 'var(--ash)' }}>Bs. {fmt(parseFloat(c.monto_usd) * tasa)}</p>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Mensualidades */}
                    {alumnoId && (
                        <div className="rounded-xl p-4" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                            <p className="text-[11px] uppercase tracking-widest mb-3" style={{ color: 'var(--ash)' }}>
                                Mensualidades pendientes
                            </p>
                            {mensualidades.length === 0 ? (
                                <div className="flex items-center gap-2 text-sm py-3" style={{ color: 'var(--ash)' }}>
                                    <CheckCircle2 size={15} style={{ color: '#16a34a' }} />
                                    Sin mensualidades en mora
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {mensualidades.map(m => {
                                        const isSel   = selectedMens.includes(m.id);
                                        const ov      = montosParciales[m.id];
                                        const parcial = isSel && ov !== undefined && ov !== '' && parseFloat(ov) < parseFloat(m.monto_usd) - 0.01;
                                        return (
                                            <div key={m.id}>
                                                <label
                                                    className="flex items-center justify-between p-3 cursor-pointer transition-all"
                                                    style={{
                                                        border: isSel ? '1.5px solid var(--pb)' : '0.5px solid var(--border)',
                                                        background: isSel ? 'var(--pb-light)' : 'var(--bg)',
                                                        borderRadius: isSel ? '0.5rem 0.5rem 0 0' : '0.5rem',
                                                    }}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSel}
                                                            onChange={() => toggleMens(m.id)}
                                                            style={{ accentColor: 'var(--pb)', width: 15, height: 15 }}
                                                            aria-label={`Mensualidad ${m.mes} ${m.anio}`}
                                                        />
                                                        <div>
                                                            <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{m.mes} {m.anio}</span>
                                                            {parcial && <span className="text-[10px] font-bold ml-1.5 px-1.5 py-0.5 rounded" style={{ background: '#f97316', color: '#fff' }}>PARCIAL</span>}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>${m.monto_usd}</span>
                                                        <p className="text-[10px]" style={{ color: 'var(--ash)' }}>Bs. {fmt(parseFloat(m.monto_usd) * tasa)}</p>
                                                    </div>
                                                </label>
                                                {isSel && (
                                                    <div className="flex items-center gap-2 px-3 py-2 rounded-b-lg"
                                                        style={{ background: 'var(--pb-light)', borderLeft: '1.5px solid var(--pb)', borderRight: '1.5px solid var(--pb)', borderBottom: '1.5px solid var(--pb)' }}>
                                                        <span className="text-[10px] font-medium flex-1" style={{ color: 'var(--pb)' }}>Monto a abonar (USD):</span>
                                                        <div className="relative">
                                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: 'var(--ash)' }}>$</span>
                                                            <DecimalInput
                                                                className="pl-6 pr-2 py-1 rounded-md text-sm font-semibold outline-none w-28"
                                                                style={{ border: '1px solid var(--pb)', background: '#fff', color: 'var(--jet)' }}
                                                                value={ov !== undefined ? ov : m.monto_usd}
                                                                onChange={v => setMontoParcial(m.id, v)}
                                                                max={parseFloat(m.monto_usd)}
                                                                aria-label={`Monto a abonar para mensualidad ${m.mes} ${m.anio}`}
                                                            />
                                                        </div>
                                                        {parcial && (
                                                            <button type="button"
                                                                onClick={() => setMontoParcial(m.id, m.monto_usd)}
                                                                className="text-[10px] px-2 py-1 rounded-md"
                                                                style={{ background: 'var(--pb)', color: '#fff' }}>
                                                                Completo
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Mensualidades futuras (adelantos) */}
                            {mensualidadesFuturas.length > 0 && (
                                <div className="mt-4 pt-4" style={{ borderTop: '0.5px solid var(--border)' }}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#7c3aed', color: '#fff' }}>ADELANTO</span>
                                        <p className="text-[11px] uppercase tracking-widest" style={{ color: '#7c3aed' }}>Mensualidades futuras</p>
                                    </div>
                                    <p className="text-[10px] mb-2 px-2 py-1.5 rounded-md flex items-center gap-1" style={{ background: '#ede9fe', color: '#7c3aed' }}>
                                        <DollarSign size={10} /> Solo disponible pagando con Efectivo USD o Zelle
                                    </p>
                                    <div className="space-y-2">
                                        {mensualidadesFuturas.map(m => {
                                            const isSel   = selectedFuturas.includes(m.id);
                                            const ov      = montosParciales[m.id];
                                            const parcial = isSel && ov !== undefined && ov !== '' && parseFloat(ov) < parseFloat(m.monto_usd) - 0.01;
                                            return (
                                                <div key={m.id}>
                                                    <label
                                                        className="flex items-center justify-between p-3 cursor-pointer transition-all"
                                                        style={{
                                                            border: isSel ? '1.5px solid #7c3aed' : '0.5px solid #d8b4fe',
                                                            background: isSel ? '#ede9fe' : '#faf5ff',
                                                            borderRadius: isSel ? '0.5rem 0.5rem 0 0' : '0.5rem',
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <input
                                                                type="checkbox"
                                                                checked={isSel}
                                                                onChange={() => toggleFutura(m.id)}
                                                                style={{ accentColor: '#7c3aed', width: 15, height: 15 }}
                                                                aria-label={`Adelanto ${m.mes} ${m.anio}`}
                                                            />
                                                            <div>
                                                                <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{m.mes} {m.anio}</span>
                                                                {parcial && <span className="text-[10px] font-bold ml-1.5 px-1.5 py-0.5 rounded" style={{ background: '#f97316', color: '#fff' }}>PARCIAL</span>}
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>${m.monto_usd}</span>
                                                            <p className="text-[10px]" style={{ color: 'var(--ash)' }}>Bs. {fmt(parseFloat(m.monto_usd) * tasa)}</p>
                                                        </div>
                                                    </label>
                                                    {isSel && (
                                                        <div className="flex items-center gap-2 px-3 py-2 rounded-b-lg"
                                                            style={{ background: '#ede9fe', borderLeft: '1.5px solid #7c3aed', borderRight: '1.5px solid #7c3aed', borderBottom: '1.5px solid #7c3aed' }}>
                                                            <span className="text-[10px] font-medium flex-1" style={{ color: '#7c3aed' }}>Monto a abonar (USD):</span>
                                                            <div className="relative">
                                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: 'var(--ash)' }}>$</span>
                                                                <DecimalInput
                                                                    className="pl-6 pr-2 py-1 rounded-md text-sm font-semibold outline-none w-28"
                                                                    style={{ border: '1px solid #7c3aed', background: '#fff', color: 'var(--jet)' }}
                                                                    value={ov !== undefined ? ov : m.monto_usd}
                                                                    onChange={v => setMontoParcial(m.id, v)}
                                                                    max={parseFloat(m.monto_usd)}
                                                                    aria-label={`Monto adelanto para ${m.mes} ${m.anio}`}
                                                                />
                                                            </div>
                                                            {parcial && (
                                                                <button type="button"
                                                                    onClick={() => setMontoParcial(m.id, m.monto_usd)}
                                                                    className="text-[10px] px-2 py-1 rounded-md"
                                                                    style={{ background: '#7c3aed', color: '#fff' }}>
                                                                    Completo
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-between mt-4 pt-4" style={{ borderTop: '0.5px solid var(--border)' }}>
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Total seleccionado</p>
                                    <p className="text-lg font-bold" style={{ color: 'var(--jet)' }}>Bs. {fmt(totalGenVES)}</p>
                                    <p className="text-xs" style={{ color: 'var(--ash)' }}>${fmt(totalGenUSD)}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setStep(2)}
                                    disabled={!alumnoId || (
                                        (mensualidades.length > 0 || cuotasInscripcion.length > 0) &&
                                        !haySeleccion
                                    )}
                                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 min-h-[44px]"
                                    style={{ background: 'var(--pb)' }}
                                    aria-label="Ir a registrar pago"
                                >
                                    Registrar pago <ArrowRight size={15} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CobranzaStep1;
