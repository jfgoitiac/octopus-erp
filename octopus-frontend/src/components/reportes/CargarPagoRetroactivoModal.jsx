import { useState, useCallback, useRef, useEffect } from 'react';
import { PlusCircle, Loader2, Save, Search, User, AlertCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'react-toastify';
import DatePickerES from '../DatePickerES';
import DecimalInput from '../DecimalInput';
import { getDeudaAlumno, cargarPagoRetroactivo } from '../../api/cobranza.service';
import { METODO_LABELS, today } from '../../constants/reportes';
import { esBolivares, requiereBanco } from '../../utils/metodosPago';
import { useTasaPorFecha } from '../../hooks/useTasaPorFecha';
import { fmt } from '../../utils/formato';
import { Modal } from '../ui/Modal';

const MOTIVO_MIN_LEN = 10;

// Mismas etiquetas que Cobranza.jsx / CobranzaStep2 (registro normal de pago),
// sin 'mixto' (es un estado derivado del backend, no una opción manual).
const CONCEPTOS = [
    { value: 'mensualidad', label: 'Mensualidad' },
    { value: 'inscripcion', label: 'Inscripción' },
    { value: 'solvencia', label: 'Solvencia' },
    { value: 'materiales', label: 'Materiales' },
    { value: 'proyecto_inversion', label: 'Proyecto de Inversión' },
    { value: 'multa', label: 'Multa' },
    { value: 'otro', label: 'Otro' },
];

/**
 * Registra un pago cuyo dinero se recibió en el pasado (fecha_pago retroactiva),
 * fuera del flujo normal de Cobranza.jsx. Busca al alumno por cédula del
 * representante (mismo endpoint `cobranza/buscar/<cedula>/` que usa
 * CobranzaStep1), igual que el registro normal, pero en un formulario reducido
 * pensado para uso puntual/correctivo — no repite el flujo multi-alumno
 * completo de Cobranza.jsx.
 */
const CargarPagoRetroactivoModal = ({ bancosDisponibles, onClose, onGuardado }) => {
    // ── Búsqueda de alumno/representante por cédula ──
    const [cedula, setCedula] = useState('');
    const [buscando, setBuscando] = useState(false);
    const [representante, setRepresentante] = useState(null);
    const [alumnos, setAlumnos] = useState([]);
    const [alumnoSeleccionado, setAlumnoSeleccionado] = useState(null);
    const searchRef = useRef(null);
    const abortRef = useRef(null);

    const buscarAlumno = useCallback((val) => {
        setCedula(val);
        clearTimeout(searchRef.current);
        abortRef.current?.abort();
        setRepresentante(null);
        setAlumnos([]);
        setAlumnoSeleccionado(null);
        if (val.trim().length > 6) {
            setBuscando(true);
            searchRef.current = setTimeout(async () => {
                abortRef.current = new AbortController();
                try {
                    const res = await getDeudaAlumno(val.trim(), abortRef.current.signal);
                    const alus = res.data?.alumnos || [];
                    const rep = res.data?.representante || {};
                    setRepresentante({
                        cedula: rep.cedula || val.trim(),
                        nombre: rep.nombre_completo || `${rep.nombre || ''} ${rep.apellido || ''}`.trim() || '—',
                    });
                    setAlumnos(alus);
                    if (alus.length === 1) setAlumnoSeleccionado(alus[0]);
                } catch (err) {
                    if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
                    if (err.response?.status === 404) toast.info('Representante no encontrado.');
                    else toast.error('Error al buscar. Verifica tu conexión.');
                } finally {
                    setBuscando(false);
                }
            }, 400);
        } else {
            setBuscando(false);
        }
    }, []);

    // ── Datos del pago ──
    const [concepto, setConcepto] = useState('mensualidad');
    const [metodoPago, setMetodoPago] = useState('transferencia');
    const [montoUsd, setMontoUsd] = useState('');
    const [montoVes, setMontoVes] = useState('');
    const [tasaAplicada, setTasaAplicada] = useState('');
    const [bancoReceptor, setBancoReceptor] = useState('');
    const [referencia, setReferencia] = useState('');
    const [numeroLote, setNumeroLote] = useState('');
    const [fechaPago, setFechaPago] = useState(today);
    const [motivo, setMotivo] = useState('');
    const [touched, setTouched] = useState(false);
    const [guardando, setGuardando] = useState(false);

    const esPuntoDeVenta = metodoPago === 'punto_de_venta';
    const bancoRequerido = requiereBanco(metodoPago);
    const enBolivares = esBolivares(metodoPago);

    // Tasa histórica de la fecha elegida — el campo Tasa se precarga/reemplaza
    // con la sugerencia cada vez que cambia la fecha; el operador puede seguir
    // editándolo a mano (lo que escriba manda sobre la sugerencia).
    const {
        valor: tasaSugerida,
        exacta: tasaSugerenciaExacta,
        fechaReal: tasaSugerenciaFechaReal,
        loading: tasaSugerenciaLoading,
    } = useTasaPorFecha(enBolivares ? fechaPago : null);

    useEffect(() => {
        if (enBolivares) setTasaAplicada(tasaSugerida != null ? String(tasaSugerida) : '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tasaSugerida, enBolivares, fechaPago]);

    const tasaAplicadaNum = parseFloat(tasaAplicada);
    const desviacionAlta = enBolivares && tasaSugerida > 0 && !isNaN(tasaAplicadaNum) && tasaAplicadaNum > 0
        && Math.abs(tasaAplicadaNum - tasaSugerida) / tasaSugerida > 0.2;
    const equivalenteUsd = enBolivares && tasaAplicadaNum > 0
        ? (parseFloat(montoVes) || 0) / tasaAplicadaNum
        : null;

    const errores = {
        alumno: !alumnoSeleccionado,
        monto: enBolivares
            ? !(parseFloat(montoVes) > 0)
            : !(parseFloat(montoUsd) > 0),
        tasa: enBolivares && !(tasaAplicadaNum > 0),
        banco: bancoRequerido && !bancoReceptor,
        lote: esPuntoDeVenta && (numeroLote || '').length !== 4,
        referenciaPdv: esPuntoDeVenta && (referencia || '').length !== 4,
        fecha: !fechaPago || fechaPago > today(),
        motivo: motivo.trim().length < MOTIVO_MIN_LEN,
    };
    const hayErrores = Object.values(errores).some(Boolean);

    const handleGuardar = async () => {
        setTouched(true);
        if (errores.alumno) { toast.warning('Busca y selecciona el alumno/representante.'); return; }
        if (errores.monto) { toast.warning(enBolivares ? 'Ingresa un monto en Bs. válido.' : 'Ingresa un monto USD válido.'); return; }
        if (errores.tasa) { toast.warning('La tasa debe ser mayor a 0.'); return; }
        if (errores.banco) { toast.warning('Selecciona el banco receptor.'); return; }
        if (errores.lote || errores.referenciaPdv) { toast.warning('Referencia y lote de Punto de Venta deben tener 4 dígitos.'); return; }
        if (errores.fecha) { toast.warning('La fecha de pago no puede ser futura.'); return; }
        if (errores.motivo) { toast.warning(`Explica el motivo (mínimo ${MOTIVO_MIN_LEN} caracteres).`); return; }

        setGuardando(true);
        try {
            await cargarPagoRetroactivo({
                alumno: alumnoSeleccionado.id,
                concepto,
                metodo_pago: metodoPago,
                // Contrato PagoRetroactivoSerializer: monto_usd para métodos en
                // divisas; monto_ves + tasa_aplicada para métodos en bolívares.
                // Nunca se envían ambos pares a la vez.
                ...(enBolivares
                    ? { monto_ves: parseFloat(montoVes), tasa_aplicada: tasaAplicadaNum }
                    : { monto_usd: parseFloat(montoUsd) }),
                banco_receptor: bancoRequerido ? (bancoReceptor || null) : null,
                referencia,
                numero_lote: esPuntoDeVenta ? numeroLote : '',
                representante_documento: representante?.cedula,
                representante_nombre: representante?.nombre,
                fecha_pago: fechaPago,
                motivo: motivo.trim(),
            });
            onGuardado();
        } catch (err) {
            // Ej.: período escolar cerrado, o el rango cae en un cierre de caja ya
            // validado — se muestra el mensaje real del backend, sin reformular.
            const data = err.response?.data;
            const msg = data?.error || data?.detail
                || (typeof data === 'object' ? Object.values(data).flat().join(' ') : null)
                || 'No se pudo registrar el pago retroactivo.';
            toast.error(msg);
        } finally {
            setGuardando(false);
        }
    };

    const footer = (
        <>
            <button onClick={onClose}
                className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium"
                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                Cancelar
            </button>
            <button
                onClick={handleGuardar}
                disabled={guardando || (touched && hayErrores)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--pb)' }}>
                {guardando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Registrar pago
            </button>
        </>
    );

    return (
        <Modal
            open
            onClose={onClose}
            className="z-[100]"
            titulo={(
                <div>
                    <div className="flex items-center gap-2">
                        <PlusCircle size={17} />
                        Cargar Pago Retroactivo
                    </div>
                    <p className="text-xs mt-0.5 font-normal" style={{ color: 'rgba(255,255,255,0.8)' }}>
                        Registra un pago cuyo dinero ya se recibió, con fecha en el pasado.
                    </p>
                </div>
            )}
            footer={footer}
            size="md"
        >
            <div className="space-y-4">
                {/* Búsqueda de alumno */}
                <div>
                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                        Cédula del representante
                    </label>
                    <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                        <input
                            type="text"
                            value={cedula}
                            onChange={e => buscarAlumno(e.target.value)}
                            placeholder="Ej: V-12345678"
                            className="w-full pl-9 pr-8 py-2 rounded-lg text-sm outline-none"
                            style={{ border: `0.5px solid ${touched && errores.alumno ? 'var(--red)' : 'var(--border-md)'}`, color: 'var(--jet)' }}
                        />
                        {buscando && <Loader2 size={14} className="animate-spin absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--pb)' }} />}
                    </div>
                    {touched && errores.alumno && (
                        <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: 'var(--red)' }}>
                            <AlertCircle size={11} /> Busca y selecciona el alumno.
                        </p>
                    )}
                </div>

                {representante && (
                    <div className="rounded-lg p-3" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                        <p className="text-xs font-semibold" style={{ color: 'var(--jet)' }}>{representante.nombre}</p>
                        <p className="text-[10px] font-mono" style={{ color: 'var(--ash)' }}>{representante.cedula}</p>
                    </div>
                )}

                {/* Selección de alumno (si hay más de uno) */}
                {alumnos.length > 0 && (
                    <div>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                            Alumno
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                            {alumnos.map(a => (
                                <button
                                    key={a.id}
                                    type="button"
                                    onClick={() => setAlumnoSeleccionado(a)}
                                    className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium"
                                    style={{
                                        border: alumnoSeleccionado?.id === a.id ? '1.5px solid var(--pb)' : '0.5px solid var(--border-md)',
                                        background: alumnoSeleccionado?.id === a.id ? 'var(--pb-light)' : '#fff',
                                        color: alumnoSeleccionado?.id === a.id ? 'var(--pb)' : 'var(--ash)',
                                    }}>
                                    <User size={12} />
                                    {a.nombre_completo || a.nombre}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Concepto */}
                <div>
                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                        Concepto
                    </label>
                    <select
                        value={concepto}
                        onChange={e => setConcepto(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
                        {CONCEPTOS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                </div>

                {/* Método + Monto */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                            Método de pago
                        </label>
                        <select
                            value={metodoPago}
                            onChange={e => {
                                const val = e.target.value;
                                setMetodoPago(val);
                                if (!requiereBanco(val)) setBancoReceptor('');
                                if (val !== 'punto_de_venta') setNumeroLote('');
                                // Al cruzar de divisas a bolívares (o viceversa) se limpia el
                                // monto del par que ya no aplica — el contrato del backend
                                // rechaza combinaciones cruzadas (monto_usd + monto_ves a la vez).
                                if (esBolivares(val)) setMontoUsd('');
                                else { setMontoVes(''); setTasaAplicada(''); }
                            }}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                            style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
                            {Object.entries(METODO_LABELS).map(([val, label]) => (
                                <option key={val} value={val}>{label}</option>
                            ))}
                        </select>
                    </div>
                    {enBolivares ? (
                        <div>
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                Monto Bs.
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: 'var(--ash)' }}>Bs.</span>
                                <DecimalInput
                                    value={montoVes}
                                    onChange={setMontoVes}
                                    className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: `0.5px solid ${touched && errores.monto ? 'var(--red)' : 'var(--border-md)'}`, color: 'var(--jet)' }}
                                />
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                Monto USD
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: 'var(--ash)' }}>$</span>
                                <DecimalInput
                                    value={montoUsd}
                                    onChange={setMontoUsd}
                                    className="w-full pl-7 pr-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: `0.5px solid ${touched && errores.monto ? 'var(--red)' : 'var(--border-md)'}`, color: 'var(--jet)' }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Tasa aplicada + equivalente USD (solo métodos en bolívares) */}
                {enBolivares && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                Tasa aplicada (Bs./$)
                            </label>
                            <div className="relative">
                                <DecimalInput
                                    value={tasaAplicada}
                                    onChange={setTasaAplicada}
                                    className="w-full px-3 py-2 rounded-lg text-sm font-semibold outline-none"
                                    style={{ border: `0.5px solid ${touched && errores.tasa ? 'var(--red)' : 'var(--border-md)'}`, color: 'var(--jet)' }}
                                />
                                {tasaSugerenciaLoading && (
                                    <Loader2 size={13} className="animate-spin absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--pb)' }} />
                                )}
                            </div>
                            {touched && errores.tasa && (
                                <p className="text-[10px] mt-1" style={{ color: 'var(--red)' }}>La tasa debe ser mayor a 0.</p>
                            )}
                            {!(touched && errores.tasa) && !tasaSugerenciaExacta && tasaSugerenciaFechaReal && (
                                <p className="text-[10px] mt-1" style={{ color: '#b45309' }}>
                                    No hay tasa registrada para esa fecha; se cargó la del {tasaSugerenciaFechaReal}. Verifíquela.
                                </p>
                            )}
                            {!tasaSugerenciaLoading && !tasaSugerida && (
                                <p className="text-[10px] mt-1" style={{ color: 'var(--red)' }}>
                                    No se encontró tasa histórica para esa fecha. Ingresa la tasa manualmente.
                                </p>
                            )}
                            {desviacionAlta && (
                                <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: 'var(--red)' }}>
                                    <AlertTriangle size={11} /> Se desvía más de 20% de la tasa sugerida (Bs. {fmt(tasaSugerida)}). Verifica que sea correcta.
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                Equivalente USD
                            </label>
                            <div className="w-full px-3 py-2 rounded-lg text-sm font-semibold"
                                style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
                                $ {equivalenteUsd !== null ? fmt(equivalenteUsd) : '—'}
                            </div>
                        </div>
                    </div>
                )}

                {/* Banco */}
                {bancoRequerido && (
                    <div>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                            Banco receptor
                        </label>
                        <select
                            value={bancoReceptor}
                            onChange={e => setBancoReceptor(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                            style={{ border: `0.5px solid ${touched && errores.banco ? 'var(--red)' : 'var(--border-md)'}`, color: 'var(--jet)' }}>
                            <option value="">Seleccionar banco…</option>
                            {bancosDisponibles.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                        </select>
                    </div>
                )}

                {/* Referencia + lote */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className={esPuntoDeVenta ? '' : 'col-span-2'}>
                        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                            Nº de referencia{esPuntoDeVenta ? ' (4 dígitos)' : ''}
                        </label>
                        <input
                            type="text"
                            value={referencia}
                            onChange={e => setReferencia(esPuntoDeVenta ? e.target.value.replace(/\D/g, '').slice(0, 4) : e.target.value)}
                            maxLength={esPuntoDeVenta ? 4 : undefined}
                            placeholder={esPuntoDeVenta ? 'Ej: 1234' : 'Opcional'}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                            style={{ border: `0.5px solid ${touched && errores.referenciaPdv ? 'var(--red)' : 'var(--border-md)'}`, color: 'var(--jet)' }}
                        />
                    </div>
                    {esPuntoDeVenta && (
                        <div>
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                Nº de lote (4 dígitos)
                            </label>
                            <input
                                type="text"
                                value={numeroLote}
                                onChange={e => setNumeroLote(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                maxLength={4}
                                placeholder="Ej: 0042"
                                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                style={{ border: `0.5px solid ${touched && errores.lote ? 'var(--red)' : 'var(--border-md)'}`, color: 'var(--jet)' }}
                            />
                        </div>
                    )}
                </div>

                {/* Fecha de pago (retroactiva, no futura) */}
                <div>
                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                        Fecha en que se recibió el pago
                    </label>
                    <DatePickerES
                        value={fechaPago}
                        onChange={e => setFechaPago(e.target.value)}
                        maxDate={today()}
                        className="px-3 py-2 rounded-lg text-sm outline-none w-full"
                        style={{ border: `0.5px solid ${touched && errores.fecha ? 'var(--red)' : 'var(--border-md)'}`, color: 'var(--jet)' }}
                    />
                </div>

                {/* Motivo (obligatorio) */}
                <div>
                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--jet)' }}>
                        Motivo de la carga retroactiva <span style={{ color: 'var(--red)' }}>*</span>
                    </label>
                    <textarea
                        value={motivo}
                        onChange={e => setMotivo(e.target.value)}
                        rows={3}
                        placeholder="Explica por qué se registra este pago fuera del flujo normal (mínimo 10 caracteres)…"
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                        style={{ border: `0.5px solid ${touched && errores.motivo ? 'var(--red)' : 'var(--border-md)'}`, color: 'var(--jet)' }}
                    />
                    {touched && errores.motivo && (
                        <p className="text-[10px] mt-1" style={{ color: 'var(--red)' }}>
                            Escribe al menos {MOTIVO_MIN_LEN} caracteres explicando el motivo.
                        </p>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default CargarPagoRetroactivoModal;
