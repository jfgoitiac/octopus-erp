import { useState } from 'react';
import { Plus, Trash2, ArrowLeft, DollarSign, RefreshCw, History, AlertTriangle, Loader2 } from 'lucide-react';
import DecimalInput from '../../components/DecimalInput';
import DatePickerES from '../../components/DatePickerES';
import { fmt } from '../../utils/formato';
import { useConfiguracion } from '../../hooks/useConfiguracion';
import { Card } from '../../components/ui/Card';
import { esDivisa, esBolivares, esCash, requiereBanco } from '../../utils/metodosPago';
import { today } from '../../constants/reportes';

const MOTIVO_MIN_LEN = 10;

const METODOS_PAGO = [
    { value: 'transferencia',  label: 'Transferencia Bancaria' },
    { value: 'pago_movil',     label: 'Pago Móvil' },
    { value: 'punto_de_venta', label: 'Punto de Venta' },
    { value: 'zelle',          label: 'Zelle' },
    { value: 'efectivo',       label: 'Efectivo USD' },
    { value: 'efectivo_ves',   label: 'Efectivo Bs.' },
];

const CONCEPTOS = [
    { value: 'mensualidad', label: 'Mensualidad' },
    { value: 'inscripcion',  label: 'Inscripción' },
    { value: 'materiales',   label: 'Materiales' },
    { value: 'proyecto_inversion', label: 'Proyecto de Inversión' },
    { value: 'multa',        label: 'Multa' },
    { value: 'otro',         label: 'Otro' },
];

const CobranzaStep2 = ({
    nombreAlumno,
    cedula,
    setStep,
    concepto,
    setConcepto,
    haySeleccion,
    hayMens,
    hayInscripcion,
    haySolvencia,
    hayProyecto,
    alumnosSeleccionados,
    datosAlumnos,
    seleccion,
    requiereDivisas,
    hayAdelantos,
    todosDivisas,
    lineas,
    setLineas,
    bancos,
    actualizarLinea,
    tasa,
    tasaError,
    ultimaActualizacion,
    refetchTasa,
    deudaVES,
    maxForLine,
    metodoPagoIcons,
    // Modo retroactivo — el dinero ya se recibió en una fecha pasada. Cuando
    // está activo, `tasa` (arriba) YA viene sobrescrita por el valor manual
    // que el operador cargó aquí (ver Cobranza.jsx), así que todos los
    // cálculos en vivo de esta pantalla quedan consistentes sin tocarlos.
    retroActivo,
    setRetroActivo,
    fechaPagoRetro,
    setFechaPagoRetro,
    tasaManual,
    setTasaManual,
    motivoRetro,
    setMotivoRetro,
    tasaSugerida,
    tasaSugerenciaExacta,
    tasaSugerenciaFechaReal,
    tasaSugerenciaLoading,
    children,
}) => {
    const { config: configColegio, loading: loadingConfig } = useConfiguracion();
    const [touched, setTouched] = useState({});

    const tasaManualNum = parseFloat(tasaManual);
    const tasaInvalida  = retroActivo && (isNaN(tasaManualNum) || tasaManualNum <= 0);
    const desviacionAlta = retroActivo && tasaSugerida > 0 && !isNaN(tasaManualNum) && tasaManualNum > 0
        && Math.abs(tasaManualNum - tasaSugerida) / tasaSugerida > 0.2;

    const marcarTocado = (i, campo) => setTouched(p => ({ ...p, [`${i}_${campo}`]: true }));
    const esTocado = (i, campo) => !!touched[`${i}_${campo}`];

    const conceptosDetectados = [
        hayMens && 'Mensualidad',
        hayInscripcion && 'Inscripción',
        haySolvencia && 'Solvencia',
        hayProyecto && 'Proyecto de Inversión',
    ].filter(Boolean);

    const crearLinea = () => ({
        id: Date.now() + Math.random(),
        metodo_pago: 'transferencia',
        monto_usd: '',
        monto_ves: '',
        banco_receptor_id: '',
        referencia: '',
        numero_lote: '',
    });

    return (
        <Card padding="none" className="max-w-4xl mx-auto anim-fade-up">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6 pb-4" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                <button
                    onClick={() => setStep(1)}
                    aria-label="Volver a buscar alumno"
                    className="flex items-center justify-center px-3 rounded-lg min-h-[44px] min-w-[44px]"
                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                >
                    <ArrowLeft size={14} />
                </button>
                <div>
                    <h2 className="text-base font-semibold" style={{ color: 'var(--jet)' }}>Registrar Pago</h2>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>{nombreAlumno} · Cédula: {cedula}</p>
                </div>
                {!loadingConfig && configColegio?.periodo_escolar_activo && (
                    <span
                        className="text-[10px] font-medium px-2 py-1 rounded-md whitespace-nowrap"
                        style={{ background: 'var(--porcelain)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}
                    >
                        Período {configColegio.periodo_escolar_activo}
                    </span>
                )}
                {retroActivo ? (
                    <span
                        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background: '#f59e0b', color: '#fff' }}
                        title="Modo retroactivo: se usa la tasa manual, no el BCV de hoy"
                    >
                        <History size={12} />
                        Tasa manual: Bs. {tasaManual || '—'}
                    </span>
                ) : (
                    <button
                        type="button"
                        onClick={refetchTasa}
                        title={ultimaActualizacion ? `Actualizado: ${ultimaActualizacion.toLocaleTimeString('es-VE')}` : 'Actualizar tasa'}
                        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                        style={{ background: tasaError ? 'var(--red)' : 'var(--jet)', color: '#fff' }}
                        aria-label="Actualizar tasa BCV"
                    >
                        {tasaError ? <RefreshCw size={12} /> : <DollarSign size={12} />}
                        BCV: Bs. {tasa}
                    </button>
                )}
            </div>

            {/* Banner divisas requeridas */}
            {requiereDivisas && (
                <div className="mb-4 px-4 py-3 rounded-xl flex items-center gap-3"
                    style={{ background: todosDivisas ? '#ede9fe' : '#fef2f2', border: `1px solid ${todosDivisas ? '#7c3aed' : '#ef4444'}` }}>
                    <DollarSign size={16} style={{ color: todosDivisas ? '#7c3aed' : '#ef4444' }} />
                    <div className="flex-1">
                        <p className="text-xs font-bold" style={{ color: todosDivisas ? '#7c3aed' : '#ef4444' }}>
                            {hayAdelantos ? 'Adelanto de mensualidades' : 'Pago parcial'}
                            {' — solo se acepta pago en divisas'}
                        </p>
                        <p className="text-[10px]" style={{ color: todosDivisas ? '#7c3aed' : '#ef4444' }}>
                            {todosDivisas ? 'Método válido: Efectivo USD o Zelle ✓' : 'Cambia el método de pago a Efectivo USD o Zelle'}
                        </p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                {/* Formulario (3/5) */}
                <div className="lg:col-span-3 space-y-4">
                    {/* Concepto */}
                    <div className="rounded-xl p-4" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                        <label className="block text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--ash)' }}>
                            Concepto de pago
                        </label>
                        {haySeleccion ? (
                            <div className="flex flex-wrap gap-1.5">
                                {conceptosDetectados.map(label => (
                                    <span key={label} className="py-1.5 px-3 rounded-lg text-xs font-medium"
                                        style={{ border: '1.5px solid var(--pb)', background: 'var(--pb-light)', color: 'var(--pb)' }}>
                                        {label}
                                    </span>
                                ))}
                                {conceptosDetectados.length > 1 && (
                                    <p className="w-full text-[10px] mt-1" style={{ color: 'var(--ash)' }}>
                                        Pago mixto — se registrará con el detalle de cada deuda saldada.
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {CONCEPTOS.map(c => (
                                    <button
                                        key={c.value}
                                        type="button"
                                        onClick={() => setConcepto(c.value)}
                                        className="py-2 px-3 rounded-lg text-xs font-medium transition-all text-center"
                                        style={{
                                            border: concepto === c.value ? '1.5px solid var(--pb)' : '0.5px solid var(--border-md)',
                                            background: concepto === c.value ? 'var(--pb-light)' : '#fff',
                                            color: concepto === c.value ? 'var(--pb)' : 'var(--ash)',
                                        }}
                                    >
                                        {c.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Mensualidades seleccionadas (por alumno) */}
                    {(() => {
                        const totalMens = alumnosSeleccionados.reduce((s, id) => s + (seleccion[id]?.selectedMens.length || 0), 0);
                        if (totalMens === 0) return null;
                        return (
                            <div className="rounded-xl px-4 py-3 space-y-2" style={{ background: 'var(--pb-light)', border: '0.5px solid var(--pb)' }}>
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px]" style={{ color: 'var(--pb)' }}>✓</span>
                                    <span className="text-xs font-semibold" style={{ color: 'var(--pb)' }}>
                                        {totalMens} mensualidad{totalMens > 1 ? 'es' : ''} seleccionada{totalMens > 1 ? 's' : ''}
                                    </span>
                                </div>
                                {alumnosSeleccionados.map(id => {
                                    const mens = seleccion[id]?.selectedMens || [];
                                    if (mens.length === 0) return null;
                                    const datos = datosAlumnos[id];
                                    return (
                                        <div key={id} className="pl-5">
                                            {alumnosSeleccionados.length > 1 && (
                                                <p className="text-[10px] font-semibold mb-0.5" style={{ color: 'var(--pb)' }}>
                                                    {datos?.nombre_completo || datos?.nombre}
                                                </p>
                                            )}
                                            <div className="flex flex-wrap gap-1">
                                                {mens.map(mid => {
                                                    const m = (datos?.mensualidades_pendientes || []).find(x => x.id === mid);
                                                    return m ? (
                                                        <span key={mid} className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                                                            style={{ background: 'var(--pb)', color: '#fff' }}>
                                                            {m.mes} {m.anio}
                                                        </span>
                                                    ) : null;
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })()}

                    {/* Modo retroactivo — el dinero ya se recibió en el pasado */}
                    <div className="rounded-xl p-4 space-y-3"
                        style={{ border: `0.5px solid ${retroActivo ? '#f59e0b' : 'var(--border-md)'}`, background: retroActivo ? '#fffbeb' : 'var(--porcelain)' }}>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <History size={15} style={{ color: retroActivo ? '#b45309' : 'var(--ash)' }} />
                                <div>
                                    <p className="text-xs font-semibold" style={{ color: retroActivo ? '#b45309' : 'var(--jet)' }}>
                                        Pago retroactivo
                                    </p>
                                    <p className="text-[10px]" style={{ color: 'var(--ash)' }}>
                                        El dinero ya se recibió en una fecha pasada
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={retroActivo}
                                aria-label="Activar pago retroactivo"
                                onClick={() => setRetroActivo(v => !v)}
                                className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
                                style={{ background: retroActivo ? '#f59e0b' : 'var(--border-md)' }}
                            >
                                <span
                                    className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                                    style={{ transform: retroActivo ? 'translateX(22px)' : 'translateX(4px)' }}
                                />
                            </button>
                        </div>

                        {retroActivo && (
                            <div className="space-y-3 pt-3" style={{ borderTop: '0.5px solid #fcd34d' }}>
                                <div className="flex items-start gap-2 p-2.5 rounded-lg" style={{ background: '#fef3c7' }}>
                                    <AlertTriangle size={14} style={{ color: '#b45309', flexShrink: 0, marginTop: '1px' }} />
                                    <p className="text-[10px]" style={{ color: '#92400e' }}>
                                        Esta operación se registrará con fecha pasada. La tasa que definas aquí
                                        reemplaza al badge BCV en todos los cálculos de esta pantalla.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                            Fecha real del pago
                                        </label>
                                        <DatePickerES
                                            value={fechaPagoRetro}
                                            onChange={e => setFechaPagoRetro(e.target.value)}
                                            maxDate={today()}
                                            className="px-3 py-2 rounded-lg text-sm outline-none w-full"
                                            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                            Tasa aplicada (Bs./$)
                                        </label>
                                        <div className="relative">
                                            <DecimalInput
                                                className="w-full px-3 py-2 rounded-lg text-sm font-semibold outline-none"
                                                style={{ border: `1px solid ${tasaInvalida ? '#ef4444' : 'var(--border-md)'}`, background: '#fff', color: 'var(--jet)' }}
                                                value={tasaManual}
                                                onChange={setTasaManual}
                                                aria-label="Tasa aplicada al pago retroactivo"
                                            />
                                            {tasaSugerenciaLoading && (
                                                <Loader2 size={13} className="animate-spin absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--pb)' }} />
                                            )}
                                        </div>
                                        {tasaInvalida && (
                                            <p className="text-[10px] mt-1" style={{ color: '#ef4444' }}>La tasa debe ser mayor a 0.</p>
                                        )}
                                        {!tasaInvalida && !tasaSugerenciaExacta && tasaSugerenciaFechaReal && (
                                            <p className="text-[10px] mt-1" style={{ color: '#b45309' }}>
                                                No hay tasa registrada para esa fecha; se cargó la del {tasaSugerenciaFechaReal}. Verifíquela.
                                            </p>
                                        )}
                                        {!tasaSugerenciaLoading && !tasaSugerida && (
                                            <p className="text-[10px] mt-1" style={{ color: '#ef4444' }}>
                                                No se encontró tasa histórica para esa fecha. Ingresa la tasa manualmente.
                                            </p>
                                        )}
                                        {desviacionAlta && (
                                            <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: '#ef4444' }}>
                                                <AlertTriangle size={11} /> Se desvía más de 20% de la tasa sugerida (Bs. {fmt(tasaSugerida)}). Verifica que sea correcta.
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--jet)' }}>
                                        Motivo <span style={{ color: 'var(--red)' }}>*</span>
                                    </label>
                                    <textarea
                                        value={motivoRetro}
                                        onChange={e => setMotivoRetro(e.target.value)}
                                        rows={2}
                                        placeholder="Explica por qué se registra este pago con fecha pasada (mínimo 10 caracteres)…"
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                                        style={{
                                            border: `0.5px solid ${motivoRetro && motivoRetro.trim().length < MOTIVO_MIN_LEN ? '#ef4444' : 'var(--border-md)'}`,
                                            background: '#fff', color: 'var(--jet)',
                                        }}
                                    />
                                    {motivoRetro && motivoRetro.trim().length < MOTIVO_MIN_LEN && (
                                        <p className="text-[10px] mt-1" style={{ color: '#ef4444' }}>
                                            Escribe al menos {MOTIVO_MIN_LEN} caracteres.
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Líneas de pago */}
                    <div className="rounded-xl p-4 space-y-3" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                        <div className="flex items-center justify-between">
                            <p className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: 'var(--ash)' }}>
                                Forma{lineas.length > 1 ? 's' : ''} de pago
                            </p>
                            <button
                                type="button"
                                onClick={() => setLineas(p => [...p, crearLinea()])}
                                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
                                style={{ border: '0.5px solid var(--pb)', color: 'var(--pb)', background: 'var(--pb-light)' }}
                            >
                                <Plus size={12} /> Agregar método
                            </button>
                        </div>

                        {lineas.map((l, i) => (
                            <div key={l.id} className="rounded-xl p-4" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
                                {lineas.length > 1 && (
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md"
                                            style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
                                            Pago {i + 1}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setLineas(p => p.filter((_, j) => j !== i))}
                                            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md"
                                            style={{ color: 'var(--red)', background: 'var(--red-light)' }}
                                        >
                                            <Trash2 size={10} /> Quitar
                                        </button>
                                    </div>
                                )}

                                {/* Método de pago */}
                                <div className="mb-3">
                                    <label className="block text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--ash)' }}>Método de pago</label>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                        {METODOS_PAGO.map(m => {
                                            const bloqueado = requiereDivisas && !esDivisa(m.value);
                                            return (
                                                <button
                                                    key={m.value}
                                                    type="button"
                                                    disabled={bloqueado}
                                                    onClick={() => !bloqueado && setLineas(p => p.map((l, j) => j !== i ? l : {
                                                        ...l,
                                                        metodo_pago: m.value,
                                                        banco_receptor_id: requiereBanco(m.value) ? l.banco_receptor_id : '',
                                                    }))}
                                                    title={bloqueado ? 'Los adelantos solo se pagan en USD' : undefined}
                                                    className="flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-[10px] font-medium transition-all"
                                                    style={{
                                                        border: l.metodo_pago === m.value ? '1.5px solid var(--pb)' : '0.5px solid var(--border-md)',
                                                        background: bloqueado ? 'var(--border)' : l.metodo_pago === m.value ? 'var(--pb-light)' : 'var(--porcelain)',
                                                        color: bloqueado ? 'var(--border-md)' : l.metodo_pago === m.value ? 'var(--pb)' : 'var(--ash)',
                                                        cursor: bloqueado ? 'not-allowed' : 'pointer',
                                                        opacity: bloqueado ? 0.45 : 1,
                                                    }}
                                                >
                                                    <span className="flex items-center justify-center">{metodoPagoIcons[m.value]}</span>
                                                    <span className="text-center leading-tight">{m.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Monto */}
                                <div className="flex gap-3 mb-3">
                                    <div className="flex-1">
                                        <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                            Monto en {esDivisa(l.metodo_pago) ? 'USD ($)' : 'Bolívares (Bs.)'}
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
                                                style={{ color: 'var(--ash)' }}>
                                                {esDivisa(l.metodo_pago) ? '$' : 'Bs.'}
                                            </span>
                                            <DecimalInput
                                                className="w-full pl-10 pr-3 py-2.5 rounded-lg text-sm font-semibold outline-none"
                                                style={{ border: '1px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                                value={esDivisa(l.metodo_pago) ? l.monto_usd : l.monto_ves}
                                                onChange={v => actualizarLinea(i, esDivisa(l.metodo_pago) ? 'monto_usd' : 'monto_ves', v)}
                                                max={esCash(l.metodo_pago) ? undefined : maxForLine(i)}
                                                autoFocus={i === 0}
                                                aria-label={`Monto pago ${i + 1} en ${esDivisa(l.metodo_pago) ? 'USD' : 'Bolívares'}`}
                                            />
                                        </div>
                                        {esDivisa(l.metodo_pago) && l.monto_usd > 0 && tasa > 0 && (
                                            <p className="text-[10px] mt-1" style={{ color: 'var(--ash)' }}>
                                                ≈ Bs. {fmt(parseFloat(l.monto_usd) * tasa)}
                                            </p>
                                        )}
                                        {esBolivares(l.metodo_pago) && l.monto_ves > 0 && tasa > 0 && (
                                            <p className="text-[10px] mt-1" style={{ color: 'var(--ash)' }}>
                                                ≈ $ {fmt(parseFloat(l.monto_ves) / tasa)}
                                            </p>
                                        )}
                                        {!esCash(l.metodo_pago) && deudaVES > 0 && (() => {
                                            const mx = maxForLine(i);
                                            return mx !== undefined && mx > 0 ? (
                                                <p className="text-[10px] mt-1 font-medium" style={{ color: 'var(--ash)' }}>
                                                    Máx: {esDivisa(l.metodo_pago) ? `$${fmt(mx)}` : `Bs. ${fmt(mx)}`}
                                                </p>
                                            ) : null;
                                        })()}
                                    </div>
                                </div>

                                {/* Banco + Referencia */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {requiereBanco(l.metodo_pago) && (
                                        <div>
                                            <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                                Banco receptor
                                            </label>
                                            <select
                                                className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                                                style={{
                                                    border: esTocado(i, 'banco') && !l.banco_receptor_id ? '1px solid #ef4444' : '1px solid var(--border-md)',
                                                    background: '#fff', color: 'var(--jet)',
                                                }}
                                                value={l.banco_receptor_id}
                                                onChange={e => actualizarLinea(i, 'banco_receptor_id', e.target.value)}
                                                onBlur={() => marcarTocado(i, 'banco')}
                                                aria-label="Banco receptor"
                                            >
                                                <option value="">Seleccionar banco…</option>
                                                {bancos.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                                            </select>
                                            {esTocado(i, 'banco') && !l.banco_receptor_id && (
                                                <p className="text-[10px] mt-1" style={{ color: '#ef4444' }}>Selecciona un banco</p>
                                            )}
                                        </div>
                                    )}
                                    <div className={requiereBanco(l.metodo_pago) && l.metodo_pago !== 'punto_de_venta' ? '' : 'col-span-2'}>
                                        <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                            Nº de referencia{l.metodo_pago === 'punto_de_venta' ? ' (4 dígitos)' : ''}
                                        </label>
                                        <input
                                            type="text"
                                            className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                                            style={{
                                                border: esTocado(i, 'referencia') && l.metodo_pago === 'punto_de_venta' && (l.referencia || '').length !== 4
                                                    ? '1px solid #ef4444' : '1px solid var(--border-md)',
                                                background: '#fff', color: 'var(--jet)',
                                            }}
                                            placeholder={l.metodo_pago === 'punto_de_venta' ? 'Ej: 1234' : requiereBanco(l.metodo_pago) ? 'Ej: 000123456' : 'Opcional'}
                                            value={l.referencia}
                                            onChange={e => actualizarLinea(i, 'referencia', l.metodo_pago === 'punto_de_venta' ? e.target.value.replace(/\D/g, '').slice(0, 4) : e.target.value)}
                                            onBlur={() => marcarTocado(i, 'referencia')}
                                            maxLength={l.metodo_pago === 'punto_de_venta' ? 4 : undefined}
                                            aria-label="Número de referencia"
                                        />
                                        {esTocado(i, 'referencia') && l.metodo_pago === 'punto_de_venta' && (l.referencia || '').length !== 4 && (
                                            <p className="text-[10px] mt-1" style={{ color: '#ef4444' }}>Ingresa los 4 dígitos de referencia</p>
                                        )}
                                    </div>
                                    {l.metodo_pago === 'punto_de_venta' && (
                                        <div>
                                            <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                                Nº de lote (4 dígitos)
                                            </label>
                                            <input
                                                type="text"
                                                className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                                                style={{ border: '1px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                                placeholder="Ej: 0042"
                                                value={l.numero_lote}
                                                onChange={e => actualizarLinea(i, 'numero_lote', e.target.value.replace(/\D/g, '').slice(0, 4))}
                                                maxLength={4}
                                                aria-label="Número de lote"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Resumen (2/5) ── */}
                {children}
            </div>
        </Card>
    );
};

export default CobranzaStep2;
