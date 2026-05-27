import { useState, useEffect, useMemo, useRef, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import {
    DollarSign, ArrowRight, Save, User,
    Plus, Trash2, ArrowLeft, AlertTriangle, Loader2, CheckCircle2,
    RefreshCw
} from 'lucide-react';
import axiosInstance from '../api/apiClient';
import { AuthContext } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { useTasaBCV } from './useTasaBCV';

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

const crearLinea = () => ({
    id: Date.now() + Math.random(),
    metodo_pago: 'transferencia',
    monto_usd: '',
    monto_ves: '',
    banco_receptor_id: '',
    referencia: '',
});

const fmt = (v, d = 2) => Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });

const DecimalInput = ({ value, onChange, className, style, placeholder, autoFocus, max }) => {
    const handleChange = (e) => {
        const digits = e.target.value.replace(/\D/g, '');
        if (!digits || parseInt(digits, 10) === 0) { onChange(''); return; }
        let num = parseInt(digits, 10) / 100;
        if (max !== undefined && max > 0 && num > max) num = parseFloat(max.toFixed(2));
        onChange(num.toFixed(2));
    };
    return (
        <input
            type="text"
            inputMode="numeric"
            className={className}
            style={style}
            placeholder={placeholder ?? '0.00'}
            value={value}
            onChange={handleChange}
            autoFocus={autoFocus}
        />
    );
};

const openPdfBlob = (blobData, filename) => {
    try {
        const blob = new Blob([blobData], { type: 'application/pdf' });
        const url  = URL.createObjectURL(blob);
        // Intentar abrir en nueva pestaña
        const newTab = window.open(url, '_blank', 'noopener,noreferrer');
        if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
            // Si el navegador bloqueó la pestaña, descargar directamente
            const a = Object.assign(document.createElement('a'), {
                href: url, download: filename || 'comprobante.pdf',
            });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
        console.error('Error abriendo PDF:', e);
    }
};

const Cobranza = () => {
    const { user } = useContext(AuthContext);
    const location = useLocation();
    const { tasa, error: tasaError, ultimaActualizacion, refetch: refetchTasa } = useTasaBCV();
    const [step, setStep]           = useState(1);
    const [cedula, setCedula]       = useState('');
    const [alumnoId, setAlumnoId]   = useState(null);
    const [nombreAlumno, setNombreAlumno]         = useState('');
    const [estatusFinanciero, setEstatusFinanciero] = useState('');
    const [representanteNombre, setRepresentanteNombre] = useState('');
    const [alumnosRep, setAlumnosRep]             = useState([]);
    const [mensualidades, setMensualidades]       = useState([]);
    const [selectedMens, setSelectedMens]         = useState([]);
    const [cuotasInscripcion, setCuotasInscripcion] = useState([]);
    const [selectedCuotas, setSelectedCuotas]     = useState([]);
    const [concepto, setConcepto]                 = useState('mensualidad');
    const [lineas, setLineas]                     = useState([crearLinea()]);
    const [bancos, setBancos]                     = useState([]);
    const [loading, setLoading]                   = useState(false);

    const searchRef = useRef(null);

    const totalUSD = useMemo(() => {
        return parseFloat(lineas.reduce((acc, l) => {
            if (esDivisa(l.metodo_pago)) return acc + (parseFloat(l.monto_usd) || 0);
            const ves = parseFloat(l.monto_ves) || 0;
            return acc + (tasa > 0 ? ves / tasa : 0);
        }, 0).toFixed(2));
    }, [lineas, tasa]);

    const totalVES = useMemo(() => {
        return parseFloat(lineas.reduce((acc, l) => {
            if (esBolivares(l.metodo_pago)) return acc + (parseFloat(l.monto_ves) || 0);
            return acc + (parseFloat(l.monto_usd) || 0) * tasa;
        }, 0).toFixed(2));
    }, [lineas, tasa]);

    const mensUSD = useMemo(() =>
        selectedMens.reduce((s, id) => {
            const m = mensualidades.find(x => x.id === id);
            return s + (m ? parseFloat(m.monto_usd) || 0 : 0);
        }, 0), [mensualidades, selectedMens]);

    const cuotasUSD = useMemo(() =>
        selectedCuotas.reduce((s, id) => {
            const c = cuotasInscripcion.find(x => x.id === id);
            return s + (c ? parseFloat(c.monto_usd) || 0 : 0);
        }, 0), [cuotasInscripcion, selectedCuotas]);

    const haySeleccion = selectedMens.length > 0 || selectedCuotas.length > 0;
    const totalSelUSD  = mensUSD + cuotasUSD;
    const deudaVES   = haySeleccion ? totalSelUSD * tasa : 0;
    const pagoVES    = totalVES;
    const totalGenUSD = haySeleccion ? totalSelUSD : totalUSD;
    const totalGenVES = haySeleccion ? totalSelUSD * tasa : totalVES;
    const saldoVES   = Math.max(0, deudaVES - pagoVES);
    const vueltoVES  = deudaVES > 0 ? Math.max(0, pagoVES - deudaVES) : 0;
    const vueltoUSD  = tasa > 0 ? vueltoVES / tasa : 0;
    const pct        = deudaVES > 0 ? Math.min(100, Math.round((pagoVES / deudaVES) * 100)) : 0;

    const buscarAlumno = async (val) => {
        setCedula(val);
        if (val.length > 6) {
            try {
                const res = await axiosInstance.get(`cobranza/buscar/${val}/`);
                setRepresentanteNombre(res.data.representante?.nombre || '');
                setAlumnosRep(res.data.alumnos || []);
                setSelectedMens([]);
                setSelectedCuotas([]);
                if (res.data.id) {
                    setNombreAlumno(res.data.nombre);
                    setEstatusFinanciero(res.data.estatus);
                    setAlumnoId(res.data.id);
                    setMensualidades(res.data.mensualidades_pendientes || []);
                    setCuotasInscripcion(res.data.cuotas_inscripcion_pendientes || []);
                } else {
                    setNombreAlumno(''); setEstatusFinanciero(''); setAlumnoId(null);
                    setMensualidades([]); setCuotasInscripcion([]);
                }
            } catch {
                setRepresentanteNombre(''); setAlumnosRep([]); setNombreAlumno('');
                setEstatusFinanciero(''); setAlumnoId(null);
                setMensualidades([]); setCuotasInscripcion([]);
                setSelectedMens([]); setSelectedCuotas([]);
            }
        } else {
            setRepresentanteNombre(''); setAlumnosRep([]); setNombreAlumno('');
            setEstatusFinanciero(''); setAlumnoId(null);
            setMensualidades([]); setCuotasInscripcion([]);
            setSelectedMens([]); setSelectedCuotas([]);
        }
    };

    useEffect(() => {
        const init = async () => {
            const res = await axiosInstance.get('cobranza/bancos/');
            setBancos(res.data);
            const cedulaParam = new URLSearchParams(location.search).get('cedula');
            if (cedulaParam) buscarAlumno(cedulaParam);
        };
        init();
        return () => clearTimeout(searchRef.current);
    }, [location.search]);

    const selAlumno = (alu) => {
        setCedula(alu.cedula_escolar);
        setNombreAlumno(alu.nombre_completo || alu.nombre);
        setEstatusFinanciero(alu.estatus);
        setAlumnoId(alu.id);
        setMensualidades(alu.mensualidades_pendientes || []);
        setCuotasInscripcion(alu.cuotas_inscripcion_pendientes || []);
        setSelectedMens([]);
        setSelectedCuotas([]);
    };

    const toggleMens = (id) =>
        setSelectedMens(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

    const toggleCuota = (id) =>
        setSelectedCuotas(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

    const actualizarLinea = (idx, field, val) =>
        setLineas(p => p.map((l, i) => i === idx ? { ...l, [field]: val } : l));

    const handleSubmit = async (e) => {
        e?.preventDefault();
        if (!alumnoId) { toast.error('Selecciona un alumno primero.'); return; }
        if (deudaVES > 0 && pagoVES < deudaVES - 0.01) {
            toast.error(`Monto insuficiente. Se requieren al menos Bs. ${fmt(deudaVES)}.`);
            return;
        }
        setLoading(true);
        try {
            const res = await axiosInstance.post('cobranza/registrar-pago/', {
                alumno_id: alumnoId,
                concepto,
                representante_documento: cedula,
                representante_nombre: representanteNombre,
                mensualidad_ids: selectedMens,
                cuota_inscripcion_ids: selectedCuotas,
                vuelto_usd: parseFloat(vueltoUSD.toFixed(2)),
                vuelto_ves: parseFloat(vueltoVES.toFixed(2)),
                pagos: lineas.map(l => ({
                    metodo_pago: l.metodo_pago,
                    concepto,
                    monto_usd: esDivisa(l.metodo_pago)    ? parseFloat(l.monto_usd) || 0 : 0,
                    monto_ves: esBolivares(l.metodo_pago) ? parseFloat(l.monto_ves) || 0 : 0,
                    banco_receptor_id: l.banco_receptor_id || null,
                    referencia: l.referencia || '',
                    observaciones: '',
                })),
            });

            if (res.status === 201) {
                toast.success('¡Pago registrado correctamente!');
                const pagosCreados = res.data.pagos;
                if (pagosCreados?.length > 0) {
                    const pagoId = pagosCreados[0].id;
                    try {
                        const pdf = await axiosInstance.get(`cobranza/recibo/${pagoId}/`, { responseType: 'blob' });
                        openPdfBlob(pdf.data, `Recibo_${pagoId}.pdf`);
                    } catch {
                        toast.warning('Pago guardado. El comprobante no pudo abrirse, búscalo en el historial.');
                    }
                }
                setCedula(''); setNombreAlumno(''); setEstatusFinanciero('');
                setAlumnoId(null); setRepresentanteNombre(''); setAlumnosRep([]);
                setLineas([crearLinea()]); setMensualidades([]); setSelectedMens([]);
                setCuotasInscripcion([]); setSelectedCuotas([]);
                setStep(1);
            }
        } catch (err) {
            const data = err.response?.data;
            const msg = data?.error || data?.detail
                || (typeof data === 'object' ? Object.values(data).flat().join(' ') : null)
                || 'Error al registrar el pago.';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    const isAuthorized = user && ['director', 'administrador', 'cajero', 'cobranza'].includes(
        (user?.perfil?.rol || user?.rol || '').toLowerCase()
    );

    if (!isAuthorized) return (
        <div className="flex flex-col items-center justify-center py-20">
            <div className="p-8 rounded-2xl text-center max-w-md" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                <AlertTriangle size={40} className="mx-auto mb-4" style={{ color: 'var(--red)' }} />
                <h2 className="text-lg font-medium mb-2" style={{ color: 'var(--jet)' }}>Acceso Restringido</h2>
                <p className="text-sm mb-5" style={{ color: 'var(--ash)' }}>
                    Su cuenta no tiene permisos para el módulo de cobranza.
                </p>
                <button onClick={() => window.history.back()}
                    className="px-5 py-2 rounded-lg text-sm font-medium text-white"
                    style={{ background: 'var(--jet)' }}>
                    Regresar
                </button>
            </div>
        </div>
    );

    /* ── STEP 1: Búsqueda ── */
    if (step === 1) return (
        <div className={`max-w-2xl mx-auto anim-fade-up ${!representanteNombre ? 'py-16' : 'py-4'}`}>

            {/* Search box */}
            <div className="rounded-xl p-5 mb-5" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <label className="block text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--ash)' }}>
                    Cédula del representante
                </label>
                <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} size={15} />
                    <input
                        type="text"
                        className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                        placeholder="Ej: 12345678"
                        value={cedula}
                        onChange={e => buscarAlumno(e.target.value)}
                        autoFocus
                    />
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
                                    {mensualidades.map(m => (
                                        <label
                                            key={m.id}
                                            className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all"
                                            style={{
                                                border: selectedMens.includes(m.id) ? '1.5px solid var(--pb)' : '0.5px solid var(--border)',
                                                background: selectedMens.includes(m.id) ? 'var(--pb-light)' : 'var(--bg)',
                                            }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedMens.includes(m.id)}
                                                    onChange={() => toggleMens(m.id)}
                                                    style={{ accentColor: 'var(--pb)', width: 15, height: 15 }}
                                                />
                                                <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                                    {m.mes} {m.anio}
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>${m.monto_usd}</span>
                                                <p className="text-[10px]" style={{ color: 'var(--ash)' }}>Bs. {fmt(parseFloat(m.monto_usd) * tasa)}</p>
                                            </div>
                                        </label>
                                    ))}
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
                                        selectedMens.length === 0 && selectedCuotas.length === 0
                                    )}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                                    style={{ background: 'var(--pb)' }}
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

    /* ── STEP 2: Pago ── */
    const maxForLine = (idx) => {
        if (deudaVES <= 0 || tasa <= 0) return undefined;
        const otherVES = lineas.reduce((acc, line, i) => {
            if (i === idx) return acc;
            if (esBolivares(line.metodo_pago)) return acc + (parseFloat(line.monto_ves) || 0);
            return acc + (parseFloat(line.monto_usd) || 0) * tasa;
        }, 0);
        const maxVES = Math.max(0, deudaVES - otherVES);
        return esDivisa(lineas[idx].metodo_pago)
            ? parseFloat((maxVES / tasa).toFixed(2))
            : parseFloat(maxVES.toFixed(2));
    };

    const metodoPagoIcons = {
        transferencia: '🏦', pago_movil: '📱', punto_de_venta: '💳',
        zelle: '💵', efectivo: '💵', efectivo_ves: '💴',
    };

    return (
        <div className="max-w-4xl mx-auto anim-fade-up">

            {/* Header */}
            <div className="flex items-center gap-3 mb-6 pb-4" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                <button
                    onClick={() => setStep(1)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm"
                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                >
                    <ArrowLeft size={14} />
                </button>
                <div>
                    <h2 className="text-base font-semibold" style={{ color: 'var(--jet)' }}>Registrar Pago</h2>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>{nombreAlumno} · Cédula: {cedula}</p>
                </div>
                {/* Tasa inline */}
                <button
                    type="button"
                    onClick={refetchTasa}
                    title={ultimaActualizacion ? `Actualizado: ${ultimaActualizacion.toLocaleTimeString('es-VE')}` : 'Actualizar tasa'}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                    style={{ background: tasaError ? 'var(--red)' : 'var(--jet)', color: '#fff' }}>
                    {tasaError ? <RefreshCw size={12} /> : <DollarSign size={12} />}
                    BCV: Bs. {tasa}
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

                {/* ── Formulario (3/5) ── */}
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
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Mensualidades seleccionadas (recordatorio) */}
                    {selectedMens.length > 0 && (
                        <div className="rounded-xl px-4 py-3 flex items-center gap-2" style={{ background: 'var(--pb-light)', border: '0.5px solid var(--pb)' }}>
                            <CheckCircle2 size={14} style={{ color: 'var(--pb)' }} />
                            <span className="text-xs font-medium" style={{ color: 'var(--pb)' }}>
                                {selectedMens.length} mensualidad{selectedMens.length > 1 ? 'es' : ''} seleccionada{selectedMens.length > 1 ? 's' : ''} · Total: ${fmt(mensUSD)} (Bs. {fmt(mensUSD * tasa)})
                            </span>
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
                                {/* Número de pago si hay más de uno */}
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

                                {/* Método de pago — botones visuales */}
                                <div className="mb-3">
                                    <label className="block text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--ash)' }}>Método de pago</label>
                                    <div className="grid grid-cols-3 gap-1.5">
                                        {METODOS_PAGO.map(m => (
                                            <button
                                                key={m.value}
                                                type="button"
                                                onClick={() => actualizarLinea(i, 'metodo_pago', m.value)}
                                                className="flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-[10px] font-medium transition-all"
                                                style={{
                                                    border: l.metodo_pago === m.value ? '1.5px solid var(--pb)' : '0.5px solid var(--border-md)',
                                                    background: l.metodo_pago === m.value ? 'var(--pb-light)' : 'var(--porcelain)',
                                                    color: l.metodo_pago === m.value ? 'var(--pb)' : 'var(--ash)',
                                                }}
                                            >
                                                <span className="text-base">{metodoPagoIcons[m.value]}</span>
                                                <span className="text-center leading-tight">{m.label}</span>
                                            </button>
                                        ))}
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
                                            />
                                        </div>
                                        {/* Conversión automática */}
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
                                        {/* Límite visible para métodos no efectivo */}
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
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Resumen (2/5) ── */}
                <div className="lg:col-span-2 space-y-4 self-start sticky" style={{ top: '66px' }}>
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

                        {/* Mensualidades */}
                        {selectedMens.length > 0 && (
                            <div className="mb-3 space-y-1">
                                <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Períodos</p>
                                {selectedMens.map(id => {
                                    const m = mensualidades.find(x => x.id === id);
                                    return m ? (
                                        <div key={id} className="flex justify-between text-xs px-2 py-1 rounded-md"
                                            style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
                                            <span>{m.mes} {m.anio}</span>
                                            <span className="font-semibold">${fmt(m.monto_usd)}</span>
                                        </div>
                                    ) : null;
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
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={loading || !alumnoId}
                            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
                            style={{ background: 'var(--pb)' }}
                        >
                            {loading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                            {loading ? 'Procesando…' : 'Confirmar Pago'}
                        </button>

                        <p className="text-[10px] text-center mt-2" style={{ color: 'var(--ash)' }}>
                            Se generará comprobante PDF automáticamente
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Cobranza;
