import { User, Loader2, CheckCircle2, DollarSign, ArrowRight } from 'lucide-react';
import DecimalInput from '../../components/DecimalInput';
import { fmt } from '../../utils/formato';

const BloqueDeudaAlumno = ({
    alu,
    datos,
    sel,
    toggleCuota,
    toggleSolvencia,
    toggleMens,
    setMontoParcial,
    toggleFutura,
    tasa,
}) => {
    const mensualidades           = datos.mensualidades_pendientes || [];
    const mensualidadesFuturas    = datos.mensualidades_futuras || [];
    const cuotasInscripcion       = datos.cuotas_inscripcion_pendientes || [];
    const cuotasSolvencia         = datos.cuotas_solvencia_pendientes || [];
    const selectedMens            = sel?.selectedMens || [];
    const selectedCuotas          = sel?.selectedCuotas || [];
    const selectedSolvencias      = sel?.selectedSolvencias || [];
    const selectedFuturas         = sel?.selectedFuturas || [];
    const montosParciales         = sel?.montosParciales || {};

    return (
        <div className="rounded-xl p-4 space-y-4" style={{ border: '1px solid var(--pb)', background: 'var(--porcelain)' }}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--pb)' }}>
                {datos.nombre_completo || datos.nombre}
            </p>

            {/* Cuotas de inscripción pendientes */}
            {cuotasInscripcion.length > 0 && (
                <div className="rounded-xl p-3" style={{ border: '1.5px solid #f59e0b44', background: '#fffbeb' }}>
                    <p className="text-[11px] uppercase tracking-widest mb-2 font-bold" style={{ color: '#b45309' }}>
                        Cuota de Inscripción pendiente
                    </p>
                    <div className="space-y-2">
                        {cuotasInscripcion.map(c => {
                            const isSel   = selectedCuotas.includes(c.id);
                            const ov      = montosParciales[`cuota_${c.id}`];
                            const parcial = isSel && ov !== undefined && ov !== '' && parseFloat(ov) < parseFloat(c.monto_usd) - 0.01;
                            return (
                                <div key={c.id}>
                                    <label
                                        className="flex items-center justify-between p-3 cursor-pointer transition-all"
                                        style={{
                                            border: isSel ? '1.5px solid #f59e0b' : '0.5px solid #fde68a',
                                            background: isSel ? '#fef3c7' : '#fff',
                                            borderRadius: isSel ? '0.5rem 0.5rem 0 0' : '0.5rem',
                                        }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={isSel}
                                                onChange={() => toggleCuota(alu.id, c.id)}
                                                style={{ accentColor: '#f59e0b', width: 15, height: 15 }}
                                                aria-label={`Cuota de inscripción ${c.periodo_escolar}`}
                                            />
                                            <div>
                                                <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                                    Inscripción {c.periodo_escolar}
                                                </span>
                                                {parcial && <span className="text-[10px] font-bold ml-1.5 px-1.5 py-0.5 rounded" style={{ background: '#f97316', color: '#fff' }}>PARCIAL</span>}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>${c.monto_usd}</span>
                                            <p className="text-[10px]" style={{ color: 'var(--ash)' }}>Bs. {fmt(parseFloat(c.monto_usd) * tasa)}</p>
                                        </div>
                                    </label>
                                    {isSel && (
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-b-lg"
                                            style={{ background: '#fef3c7', borderLeft: '1.5px solid #f59e0b', borderRight: '1.5px solid #f59e0b', borderBottom: '1.5px solid #f59e0b' }}>
                                            <span className="text-[10px] font-medium flex-1" style={{ color: '#b45309' }}>Monto a abonar (USD):</span>
                                            <div className="relative">
                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: 'var(--ash)' }}>$</span>
                                                <DecimalInput
                                                    className="pl-6 pr-2 py-1 rounded-md text-sm font-semibold outline-none w-28"
                                                    style={{ border: '1px solid #f59e0b', background: '#fff', color: 'var(--jet)' }}
                                                    value={ov !== undefined ? ov : c.monto_usd}
                                                    onChange={v => setMontoParcial(alu.id, 'cuota', c.id, v)}
                                                    max={parseFloat(c.monto_usd)}
                                                    aria-label={`Monto a abonar para inscripción ${c.periodo_escolar}`}
                                                />
                                            </div>
                                            {parcial && (
                                                <button type="button"
                                                    onClick={() => setMontoParcial(alu.id, 'cuota', c.id, c.monto_usd)}
                                                    className="text-[10px] px-2 py-1 rounded-md"
                                                    style={{ background: '#f59e0b', color: '#fff' }}>
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

            {/* Solvencia pendiente */}
            {cuotasSolvencia.length > 0 && (
                <div className="rounded-xl p-3" style={{ border: '1.5px solid #dc262644', background: '#fef2f2' }}>
                    <p className="text-[11px] uppercase tracking-widest mb-2 font-bold" style={{ color: '#b91c1c' }}>
                        Solvencia pendiente
                    </p>
                    <div className="space-y-2">
                        {cuotasSolvencia.map(c => {
                            const isSel   = selectedSolvencias.includes(c.id);
                            const ov      = montosParciales[`solv_${c.id}`];
                            const parcial = isSel && ov !== undefined && ov !== '' && parseFloat(ov) < parseFloat(c.monto_usd) - 0.01;
                            return (
                                <div key={c.id}>
                                    <label
                                        className="flex items-center justify-between p-3 cursor-pointer transition-all"
                                        style={{
                                            border: isSel ? '1.5px solid #dc2626' : '0.5px solid #fecaca',
                                            background: isSel ? '#fee2e2' : '#fff',
                                            borderRadius: isSel ? '0.5rem 0.5rem 0 0' : '0.5rem',
                                        }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={isSel}
                                                onChange={() => toggleSolvencia(alu.id, c.id)}
                                                style={{ accentColor: '#dc2626', width: 15, height: 15 }}
                                                aria-label={`Solvencia ${c.concepto || c.periodo_escolar}`}
                                            />
                                            <div>
                                                <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                                    {c.concepto || `Solvencia ${c.periodo_escolar}`}
                                                </span>
                                                {parcial && <span className="text-[10px] font-bold ml-1.5 px-1.5 py-0.5 rounded" style={{ background: '#f97316', color: '#fff' }}>PARCIAL</span>}
                                                {c.concepto && (
                                                    <p className="text-[10px]" style={{ color: 'var(--ash)' }}>
                                                        Solvencia {c.periodo_escolar}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>${c.monto_usd}</span>
                                            <p className="text-[10px]" style={{ color: 'var(--ash)' }}>Bs. {fmt(parseFloat(c.monto_usd) * tasa)}</p>
                                        </div>
                                    </label>
                                    {isSel && (
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-b-lg"
                                            style={{ background: '#fee2e2', borderLeft: '1.5px solid #dc2626', borderRight: '1.5px solid #dc2626', borderBottom: '1.5px solid #dc2626' }}>
                                            <span className="text-[10px] font-medium flex-1" style={{ color: '#b91c1c' }}>Monto a abonar (USD):</span>
                                            <div className="relative">
                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: 'var(--ash)' }}>$</span>
                                                <DecimalInput
                                                    className="pl-6 pr-2 py-1 rounded-md text-sm font-semibold outline-none w-28"
                                                    style={{ border: '1px solid #dc2626', background: '#fff', color: 'var(--jet)' }}
                                                    value={ov !== undefined ? ov : c.monto_usd}
                                                    onChange={v => setMontoParcial(alu.id, 'solv', c.id, v)}
                                                    max={parseFloat(c.monto_usd)}
                                                    aria-label={`Monto a abonar para solvencia ${c.concepto || c.periodo_escolar}`}
                                                />
                                            </div>
                                            {parcial && (
                                                <button type="button"
                                                    onClick={() => setMontoParcial(alu.id, 'solv', c.id, c.monto_usd)}
                                                    className="text-[10px] px-2 py-1 rounded-md"
                                                    style={{ background: '#dc2626', color: '#fff' }}>
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

            {/* Mensualidades */}
            <div className="rounded-xl p-3" style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
                <p className="text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--ash)' }}>
                    Mensualidades pendientes
                </p>
                {mensualidades.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm py-2" style={{ color: 'var(--ash)' }}>
                        <CheckCircle2 size={15} style={{ color: '#16a34a' }} />
                        Sin mensualidades en mora
                    </div>
                ) : (
                    <div className="space-y-2">
                        {mensualidades.map(m => {
                            const isSel   = selectedMens.includes(m.id);
                            const ov      = montosParciales[`mens_${m.id}`];
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
                                                onChange={() => toggleMens(alu.id, m.id)}
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
                                                    onChange={v => setMontoParcial(alu.id, 'mens', m.id, v)}
                                                    max={parseFloat(m.monto_usd)}
                                                    aria-label={`Monto a abonar para mensualidad ${m.mes} ${m.anio}`}
                                                />
                                            </div>
                                            {parcial && (
                                                <button type="button"
                                                    onClick={() => setMontoParcial(alu.id, 'mens', m.id, m.monto_usd)}
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
                                const ov      = montosParciales[`futura_${m.id}`];
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
                                                    onChange={() => toggleFutura(alu.id, m.id)}
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
                                                        onChange={v => setMontoParcial(alu.id, 'futura', m.id, v)}
                                                        max={parseFloat(m.monto_usd)}
                                                        aria-label={`Monto adelanto para ${m.mes} ${m.anio}`}
                                                    />
                                                </div>
                                                {parcial && (
                                                    <button type="button"
                                                        onClick={() => setMontoParcial(alu.id, 'futura', m.id, m.monto_usd)}
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
            </div>
        </div>
    );
};

const CobranzaStep1 = ({
    cedula,
    buscarAlumno,
    loadingBusqueda,
    representanteNombre,
    alumnosRep,
    alumnosSeleccionados,
    toggleAlumno,
    datosAlumnos,
    seleccion,
    toggleCuota,
    toggleSolvencia,
    cuotasProyectoInversion,
    selectedProyectos,
    toggleProyecto,
    montosParcialesProyectos,
    setMontoParcialProyecto,
    toggleMens,
    setMontoParcial,
    toggleFutura,
    tasa,
    totalGenVES,
    totalGenUSD,
    setStep,
    haySeleccion,
}) => {
    const hayDeudaEnAlgunAlumno = alumnosRep.some(a =>
        (a.mensualidades_pendientes?.length || 0) +
        (a.cuotas_inscripcion_pendientes?.length || 0) +
        (a.cuotas_solvencia_pendientes?.length || 0) > 0
    );

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

                    {/* Alumnos: selección múltiple — se puede pagar la deuda de varios hijos a la vez */}
                    <div className="rounded-xl p-4" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                        <p className="text-[11px] uppercase tracking-widest mb-3" style={{ color: 'var(--ash)' }}>
                            Seleccionar alumno{alumnosRep.length > 1 ? '(es)' : ''}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {alumnosRep.map(alu => {
                                const isSel = alumnosSeleccionados.includes(alu.id);
                                return (
                                    <label
                                        key={alu.id}
                                        className="text-left p-3 rounded-lg transition-all cursor-pointer flex items-center gap-3"
                                        style={{
                                            border: isSel ? '1.5px solid var(--pb)' : '0.5px solid var(--border-md)',
                                            background: isSel ? 'var(--pb-light)' : '#fff',
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isSel}
                                            onChange={() => toggleAlumno(alu)}
                                            style={{ accentColor: 'var(--pb)', width: 15, height: 15 }}
                                            aria-label={`Incluir a ${alu.nombre} en el pago`}
                                        />
                                        <div>
                                            <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{alu.nombre}</p>
                                            <p className="text-[11px] mt-0.5" style={{ color: 'var(--ash)' }}>{alu.grado} · {alu.estatus}</p>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                        {alumnosRep.length > 1 && (
                            <p className="text-[10px] mt-3" style={{ color: 'var(--ash)' }}>
                                Marca a todos los hijos cuya deuda se pagará en esta misma operación.
                            </p>
                        )}
                    </div>

                    {/* Proyecto de Inversión pendiente (del representante, compartido entre hermanos) */}
                    {alumnosSeleccionados.length > 0 && cuotasProyectoInversion.length > 0 && (
                        <div className="rounded-xl p-4" style={{ border: '1.5px solid #dc262644', background: '#fef2f2' }}>
                            <p className="text-[11px] uppercase tracking-widest mb-3 font-bold" style={{ color: '#b91c1c' }}>
                                Proyecto de Inversión pendiente (representante)
                            </p>
                            <div className="space-y-2">
                                {cuotasProyectoInversion.map(c => {
                                    const isSel   = selectedProyectos.includes(c.id);
                                    const ov      = montosParcialesProyectos[c.id];
                                    const saldo   = c.saldo !== undefined ? c.saldo : c.monto_usd;
                                    const abonado = parseFloat(c.monto_pagado) > 0;
                                    const parcial = isSel && ov !== undefined && ov !== '' && parseFloat(ov) < parseFloat(saldo) - 0.01;
                                    return (
                                        <div key={c.id}>
                                            <label
                                                className="flex items-center justify-between p-3 cursor-pointer transition-all"
                                                style={{
                                                    border: isSel ? '1.5px solid #dc2626' : '0.5px solid #fecaca',
                                                    background: isSel ? '#fee2e2' : '#fff',
                                                    borderRadius: isSel ? '0.5rem 0.5rem 0 0' : '0.5rem',
                                                }}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSel}
                                                        onChange={() => toggleProyecto(c.id)}
                                                        style={{ accentColor: '#dc2626', width: 15, height: 15 }}
                                                        aria-label={`Proyecto de Inversión ${c.periodo_escolar}`}
                                                    />
                                                    <div>
                                                        <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                                            Proyecto de Inversión {c.periodo_escolar}
                                                        </span>
                                                        {parcial && <span className="text-[10px] font-bold ml-1.5 px-1.5 py-0.5 rounded" style={{ background: '#f97316', color: '#fff' }}>PARCIAL</span>}
                                                        {!isSel && abonado && <span className="text-[10px] font-bold ml-1.5 px-1.5 py-0.5 rounded" style={{ background: '#f97316', color: '#fff' }}>ABONADO</span>}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>${saldo}</span>
                                                    <p className="text-[10px]" style={{ color: 'var(--ash)' }}>Bs. {fmt(parseFloat(saldo) * tasa)}</p>
                                                    {abonado && (
                                                        <p className="text-[10px]" style={{ color: '#b91c1c' }}>
                                                            Ya abonado ${c.monto_pagado} de ${c.monto_usd}
                                                        </p>
                                                    )}
                                                </div>
                                            </label>
                                            {isSel && (
                                                <div className="flex items-center gap-2 px-3 py-2 rounded-b-lg"
                                                    style={{ background: '#fee2e2', borderLeft: '1.5px solid #dc2626', borderRight: '1.5px solid #dc2626', borderBottom: '1.5px solid #dc2626' }}>
                                                    <span className="text-[10px] font-medium flex-1" style={{ color: '#b91c1c' }}>Monto a abonar (USD):</span>
                                                    <div className="relative">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: 'var(--ash)' }}>$</span>
                                                        <DecimalInput
                                                            className="pl-6 pr-2 py-1 rounded-md text-sm font-semibold outline-none w-28"
                                                            style={{ border: '1px solid #dc2626', background: '#fff', color: 'var(--jet)' }}
                                                            value={ov !== undefined ? ov : saldo}
                                                            onChange={v => setMontoParcialProyecto(c.id, v)}
                                                            max={parseFloat(saldo)}
                                                            aria-label={`Monto a abonar para proyecto de inversión ${c.periodo_escolar}`}
                                                        />
                                                    </div>
                                                    {parcial && (
                                                        <button type="button"
                                                            onClick={() => setMontoParcialProyecto(c.id, saldo)}
                                                            className="text-[10px] px-2 py-1 rounded-md"
                                                            style={{ background: '#dc2626', color: '#fff' }}>
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

                    {/* Deudas por cada alumno seleccionado */}
                    {alumnosSeleccionados.map(id => (
                        <BloqueDeudaAlumno
                            key={id}
                            alu={{ id }}
                            datos={datosAlumnos[id] || {}}
                            sel={seleccion[id]}
                            toggleCuota={toggleCuota}
                            toggleSolvencia={toggleSolvencia}
                            toggleMens={toggleMens}
                            setMontoParcial={setMontoParcial}
                            toggleFutura={toggleFutura}
                            tasa={tasa}
                        />
                    ))}

                    {alumnosSeleccionados.length > 0 && (
                        <div className="rounded-xl p-4 flex items-center justify-between" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                            <div>
                                <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Total seleccionado</p>
                                <p className="text-lg font-bold" style={{ color: 'var(--jet)' }}>Bs. {fmt(totalGenVES)}</p>
                                <p className="text-xs" style={{ color: 'var(--ash)' }}>${fmt(totalGenUSD)}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setStep(2)}
                                disabled={hayDeudaEnAlgunAlumno && !haySeleccion}
                                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 min-h-[44px]"
                                style={{ background: 'var(--pb)' }}
                                aria-label="Ir a registrar pago"
                            >
                                Registrar pago <ArrowRight size={15} />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CobranzaStep1;
