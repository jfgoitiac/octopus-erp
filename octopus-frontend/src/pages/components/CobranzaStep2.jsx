import { Plus, Trash2, ArrowLeft, DollarSign, RefreshCw } from 'lucide-react';
import DecimalInput from '../../components/DecimalInput';

const fmt = (v, d = 2) => Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });

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
    { value: 'actividades',  label: 'Actividades' },
    { value: 'multa',        label: 'Multa' },
    { value: 'otro',         label: 'Otro' },
];

const esDivisa    = (m) => ['zelle', 'efectivo'].includes(m);
const esBolivares = (m) => ['transferencia', 'pago_movil', 'punto_de_venta', 'efectivo_ves'].includes(m);
const esCash      = (m) => ['efectivo', 'efectivo_ves'].includes(m);
const requiereBanco = (m) => m && !['efectivo', 'efectivo_ves'].includes(m);

const CobranzaStep2 = ({
    nombreAlumno,
    cedula,
    setStep,
    concepto,
    setConcepto,
    selectedMens,
    mensualidades,
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
    children,
}) => {
    const crearLinea = () => ({
        id: Date.now() + Math.random(),
        metodo_pago: 'transferencia',
        monto_usd: '',
        monto_ves: '',
        banco_receptor_id: '',
        referencia: '',
    });

    return (
        <div className="max-w-4xl mx-auto anim-fade-up">
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
                        <div className="grid grid-cols-3 gap-2">
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
                                    {c.value === 'mensualidad' && selectedMens.length === 1
                                        ? (() => { const m = mensualidades.find(x => x.id === selectedMens[0]); return m ? `${c.label} ${m.mes} ${m.anio}` : c.label; })()
                                        : c.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Mensualidades seleccionadas */}
                    {selectedMens.length > 0 && (
                        <div className="rounded-xl px-4 py-3" style={{ background: 'var(--pb-light)', border: '0.5px solid var(--pb)' }}>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-[11px]" style={{ color: 'var(--pb)' }}>✓</span>
                                <span className="text-xs font-semibold" style={{ color: 'var(--pb)' }}>
                                    {selectedMens.length} mensualidad{selectedMens.length > 1 ? 'es' : ''} seleccionada{selectedMens.length > 1 ? 's' : ''}
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-1 pl-5">
                                {selectedMens.map(id => {
                                    const m = mensualidades.find(x => x.id === id);
                                    return m ? (
                                        <span key={id} className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                                            style={{ background: 'var(--pb)', color: '#fff' }}>
                                            {m.mes} {m.anio}
                                        </span>
                                    ) : null;
                                })}
                            </div>
                        </div>
                    )}

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
                                    <div className="grid grid-cols-3 gap-1.5">
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
                                <div className="grid grid-cols-2 gap-3">
                                    {requiereBanco(l.metodo_pago) && (
                                        <div>
                                            <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                                Banco receptor
                                            </label>
                                            <select
                                                className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                                                style={{ border: '1px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                                value={l.banco_receptor_id}
                                                onChange={e => actualizarLinea(i, 'banco_receptor_id', e.target.value)}
                                                aria-label="Banco receptor"
                                            >
                                                <option value="">Seleccionar banco…</option>
                                                {bancos.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                                            </select>
                                        </div>
                                    )}
                                    <div className={requiereBanco(l.metodo_pago) ? '' : 'col-span-2'}>
                                        <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                            Nº de referencia
                                        </label>
                                        <input
                                            type="text"
                                            className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                                            style={{ border: '1px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                            placeholder={requiereBanco(l.metodo_pago) ? 'Ej: 000123456' : 'Opcional'}
                                            value={l.referencia}
                                            onChange={e => actualizarLinea(i, 'referencia', e.target.value)}
                                            aria-label="Número de referencia"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Resumen (2/5) ── */}
                {children}
            </div>
        </div>
    );
};

export default CobranzaStep2;
