import { useState, useEffect, useMemo, useRef, useContext, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    DollarSign, Building2, Smartphone, CreditCard, Banknote,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import axiosInstance from '../api/apiClient';
import { getBancos } from '../api/cobranza.service';
import { AuthContext } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { useTasaBCV } from '../hooks/useTasaBCV';
import { useTasaPorFecha } from '../hooks/useTasaPorFecha';
import { printReciboCobranza } from '../utils/printReciboCobranza';
import { construirItemsRecibo } from '../utils/construirItemsRecibo';
import { fmt } from '../utils/formato';
import { esDivisa, esBolivares, requiereBanco } from '../utils/metodosPago';
import { today } from '../constants/reportes';
import CobranzaStep1 from './components/CobranzaStep1';
import CobranzaStep2 from './components/CobranzaStep2';
import ResumenPago from './components/ResumenPago';
import Stepper from '../components/shared/Stepper';

const MOTIVO_MIN_LEN = 10;

const COBRANZA_STEPS = ['Buscar y seleccionar deuda', 'Registrar pago'];

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
    { value: 'solvencia',    label: 'Solvencia' },
    { value: 'materiales',   label: 'Materiales' },
    { value: 'proyecto_inversion', label: 'Proyecto de Inversión' },
    { value: 'multa',        label: 'Multa' },
    { value: 'otro',         label: 'Otro' },
];

const crearLinea = () => ({
    id: Date.now() + Math.random(),
    metodo_pago: 'transferencia',
    monto_usd: '',
    monto_ves: '',
    banco_receptor_id: '',
    referencia: '',
    numero_lote: '',
});

const crearSeleccionAlumno = () => ({
    selectedMens: [],
    selectedCuotas: [],
    selectedSolvencias: [],
    selectedFuturas: [],
    montosParciales: {},
});

const metodoPagoIcons = {
    transferencia:  <Building2 size={16} />,
    pago_movil:     <Smartphone size={16} />,
    punto_de_venta: <CreditCard size={16} />,
    zelle:          <DollarSign size={16} />,
    efectivo:       <Banknote size={16} />,
    efectivo_ves:   <Banknote size={16} />,
};

const Cobranza = () => {
    const { user } = useContext(AuthContext);
    const location = useLocation();
    const navigate = useNavigate();
    const { tasa: tasaBCV, error: tasaError, ultimaActualizacion, refetch: refetchTasa } = useTasaBCV();

    // ── Modo retroactivo: el dinero ya se recibió en una fecha pasada. Cuando
    // está activo, la tasa manual del operador reemplaza a la del BCV de hoy
    // en TODOS los cálculos en vivo de esta pantalla (ver `tasa` más abajo).
    const [retroActivo, setRetroActivo]       = useState(false);
    const [fechaPagoRetro, setFechaPagoRetro] = useState(() => today());
    const [tasaManual, setTasaManual]         = useState('');
    const [motivoRetro, setMotivoRetro]       = useState('');

    const {
        valor: tasaSugerida,
        exacta: tasaSugerenciaExacta,
        fechaReal: tasaSugerenciaFechaReal,
        loading: tasaSugerenciaLoading,
    } = useTasaPorFecha(retroActivo ? fechaPagoRetro : null);

    // Se precarga/reemplaza el campo con la sugerencia cada vez que cambia la
    // fecha consultada — el operador puede seguir editándolo a mano después;
    // lo que escriba manda sobre la sugerencia (no se vuelve a sobreescribir
    // hasta el próximo cambio de fecha).
    useEffect(() => {
        if (retroActivo) setTasaManual(tasaSugerida != null ? String(tasaSugerida) : '');
    }, [tasaSugerida, retroActivo, fechaPagoRetro]);

    // Tasa efectiva usada en TODOS los cálculos en vivo de esta pantalla
    // (equivalentes Bs/USD, vuelto, totales, máximos por línea). Apagado el
    // modo retroactivo, es idéntica a la del badge BCV — comportamiento actual.
    const tasa = retroActivo ? (parseFloat(tasaManual) || 0) : tasaBCV;

    const [step, setStep]           = useState(1);
    const [cedula, setCedula]       = useState('');
    const [representanteNombre, setRepresentanteNombre] = useState('');
    const [representanteCedula, setRepresentanteCedula] = useState('');
    const [alumnosRep, setAlumnosRep]             = useState([]);

    // Selección multi-alumno: un representante puede pagar la deuda de varios
    // hijos en una misma operación/recibo. `alumnosSeleccionados` guarda el
    // orden de selección; `datosAlumnos` guarda los datos crudos devueltos
    // por la API (deudas pendientes) por alumno; `seleccion` guarda qué
    // deudas concretas se marcaron para cada alumno.
    const [alumnosSeleccionados, setAlumnosSeleccionados] = useState([]);
    const [datosAlumnos, setDatosAlumnos]         = useState({});
    const [seleccion, setSeleccion]               = useState({});

    // Proyecto de Inversión es una cuota por REPRESENTANTE (no por alumno), así
    // que se comparte entre todos los hermanos en vez de duplicarse por hijo.
    const [cuotasProyectoInversion, setCuotasProyectoInversion] = useState([]);
    const [selectedProyectos, setSelectedProyectos] = useState([]);
    const [montosParcialesProyectos, setMontosParcialesProyectos] = useState({});

    const [adelantosRequierenUSD, setAdelantosRequierenUSD] = useState(true);
    const [concepto, setConcepto]                 = useState('mensualidad');
    const [lineas, setLineas]                     = useState([crearLinea()]);
    const [bancos, setBancos]                     = useState([]);
    const [loading, setLoading]                   = useState(false);

    const searchRef = useRef(null);
    const abortRef  = useRef(null);
    // Guarda síncrona contra doble envío: `loading` (estado de React) no se
    // refleja en el DOM (botón disabled) hasta el siguiente render, así que
    // un doble clic muy rápido puede disparar handleSubmit dos veces antes
    // de que el botón se deshabilite. Este ref se lee/escribe de forma
    // síncrona en el mismo evento, sin esperar al re-render.
    const enviandoPagoRef = useRef(false);
    const [loadingBusqueda, setLoadingBusqueda] = useState(false);
    const [confirming, setConfirming]           = useState(false);

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

    // Subtotal en USD de un alumno concreto, sumando todas sus deudas
    // seleccionadas (respetando montos parciales/adelantos).
    const subtotalAlumnoUSD = useCallback((alumnoId) => {
        const datos = datosAlumnos[alumnoId];
        const sel   = seleccion[alumnoId];
        if (!datos || !sel) return 0;

        // Cada categoría de deuda tiene su propia tabla en el backend (Mensualidad,
        // CuotaInscripcion, CuotaSolvencia), así que sus IDs autoincrementales
        // pueden coincidir entre sí. Se prefija la clave por categoría para que
        // los montos parciales de una no se pisen con los de otra.
        const sumarLista = (categoria, lista, ids) => ids.reduce((s, id) => {
            const item = (lista || []).find(x => x.id === id);
            if (!item) return s;
            const ov = sel.montosParciales[`${categoria}_${id}`];
            return s + (ov !== undefined && ov !== '' ? parseFloat(ov) || 0 : parseFloat(item.monto_usd) || 0);
        }, 0);

        return sumarLista('mens', datos.mensualidades_pendientes, sel.selectedMens)
             + sumarLista('futura', datos.mensualidades_futuras, sel.selectedFuturas)
             + sumarLista('cuota', datos.cuotas_inscripcion_pendientes, sel.selectedCuotas)
             + sumarLista('solv', datos.cuotas_solvencia_pendientes, sel.selectedSolvencias);
    }, [datosAlumnos, seleccion]);

    const proyectosUSD = useMemo(() =>
        selectedProyectos.reduce((s, id) => {
            const c = cuotasProyectoInversion.find(x => x.id === id);
            if (!c) return s;
            const ov = montosParcialesProyectos[id];
            const saldo = c.saldo !== undefined ? c.saldo : c.monto_usd;
            return s + (ov !== undefined && ov !== '' ? parseFloat(ov) || 0 : parseFloat(saldo) || 0);
        }, 0), [cuotasProyectoInversion, selectedProyectos, montosParcialesProyectos]);

    const totalSelUSD = useMemo(() =>
        alumnosSeleccionados.reduce((s, id) => s + subtotalAlumnoUSD(id), 0) + proyectosUSD,
        [alumnosSeleccionados, subtotalAlumnoUSD, proyectosUSD]);

    const haySeleccion = useMemo(() =>
        alumnosSeleccionados.some(id => {
            const sel = seleccion[id];
            return sel && (sel.selectedMens.length || sel.selectedCuotas.length || sel.selectedSolvencias.length || sel.selectedFuturas.length);
        }) || selectedProyectos.length > 0,
        [alumnosSeleccionados, seleccion, selectedProyectos]);

    const deudaVES   = haySeleccion ? totalSelUSD * tasa : 0;
    const pagoVES    = totalVES;
    const totalGenUSD = haySeleccion ? totalSelUSD : totalUSD;
    const totalGenVES = haySeleccion ? totalSelUSD * tasa : totalVES;
    const saldoVES   = Math.max(0, deudaVES - pagoVES);
    const vueltoVES  = deudaVES > 0 ? Math.max(0, pagoVES - deudaVES) : 0;
    const vueltoUSD  = tasa > 0 ? vueltoVES / tasa : 0;
    const pct        = deudaVES > 0 ? Math.min(100, Math.round((pagoVES / deudaVES) * 100)) : 0;

    const todosDivisas    = lineas.length > 0 && lineas.every(l => esDivisa(l.metodo_pago));
    const hayAdelantos    = alumnosSeleccionados.some(id => seleccion[id]?.selectedFuturas.length > 0);
    const restriccionAdelantoActiva = adelantosRequierenUSD && hayAdelantos;

    // Auto-convertir líneas a dólares cuando se seleccionan adelantos
    useEffect(() => {
        if (restriccionAdelantoActiva) {
            setLineas(p => p.map(l =>
                esDivisa(l.metodo_pago) ? l : { ...l, metodo_pago: 'efectivo', banco_receptor_id: '', monto_ves: '' }
            ));
        }
    }, [restriccionAdelantoActiva]);

    // Solo el abono de mensualidades (pendientes o adelantos) exige divisas
    // (Efectivo USD / Zelle). Inscripción, solvencia y proyecto de inversión
    // se pueden abonar con cualquier método de pago, incluido Bs.
    const hayParciales = useMemo(() => alumnosSeleccionados.some(id => {
        const datos = datosAlumnos[id];
        const sel   = seleccion[id];
        if (!datos || !sel) return false;
        const parcialEn = (categoria, lista, ids) => ids.some(mid => {
            const m  = (lista || []).find(x => x.id === mid);
            const ov = sel.montosParciales[`${categoria}_${mid}`];
            return m && ov !== undefined && ov !== '' && parseFloat(ov) < parseFloat(m.monto_usd) - 0.01;
        });
        return parcialEn('mens', datos.mensualidades_pendientes, sel.selectedMens) ||
               parcialEn('futura', datos.mensualidades_futuras, sel.selectedFuturas);
    }), [alumnosSeleccionados, datosAlumnos, seleccion]);

    const requiereDivisas = restriccionAdelantoActiva || hayParciales;

    const resetBusqueda = useCallback(() => {
        setRepresentanteNombre(''); setRepresentanteCedula(''); setAlumnosRep([]);
        setAlumnosSeleccionados([]); setDatosAlumnos({}); setSeleccion({});
        setCuotasProyectoInversion([]); setSelectedProyectos([]); setMontosParcialesProyectos({});
        setRetroActivo(false); setFechaPagoRetro(today()); setTasaManual(''); setMotivoRetro('');
    }, []);

    // Pre-rellena banco y método de pago de la primera línea con el más usado
    // por el representante en sus últimos 3 pagos (queda editable, no bloqueado).
    // Best-effort: si falla, el operador simplemente los completa a mano.
    const autocompletarPagoRepresentante = useCallback(async (cedulaRepresentante) => {
        try {
            const res = await axiosInstance.get('cobranza/pagos/lista/', {
                params: { representante_documento: cedulaRepresentante, page_size: 3, page: 1 },
            });
            const ultimosPagos = res.data?.results || [];
            const masFrecuente = (campo) => {
                const conteo = new Map();
                ultimosPagos.forEach(p => {
                    const val = p[campo];
                    if (val === null || val === undefined || val === '') return;
                    conteo.set(val, (conteo.get(val) || 0) + 1);
                });
                let mejor = null, max = 0;
                conteo.forEach((count, val) => { if (count > max) { mejor = val; max = count; } });
                return mejor;
            };
            const metodoFrecuente = masFrecuente('metodo_pago');
            if (!metodoFrecuente) return;
            const bancoFrecuente = masFrecuente('banco_receptor_id');
            setLineas(prev => prev.map((l, i) => i === 0 ? {
                ...l,
                metodo_pago: metodoFrecuente,
                banco_receptor_id: requiereBanco(metodoFrecuente) && bancoFrecuente
                    ? String(bancoFrecuente)
                    : l.banco_receptor_id,
            } : l));
        } catch {
            // Autocompletado no crítico: no interrumpe la búsqueda del representante.
        }
    }, []);

    const buscarAlumno = useCallback((val) => {
        setCedula(val);
        clearTimeout(searchRef.current);
        abortRef.current?.abort();
        if (val.length > 6) {
            setLoadingBusqueda(true);
            searchRef.current = setTimeout(async () => {
                abortRef.current = new AbortController();
                try {
                    const res = await axiosInstance.get(`cobranza/buscar/${val}/`, {
                        signal: abortRef.current.signal,
                    });
                    const alumnos = res.data.alumnos || [];
                    const rep = res.data.representante || {};
                    setRepresentanteNombre(
                        rep.nombre_completo ||
                        `${rep.nombre || ''} ${rep.apellido || ''}`.trim() ||
                        ''
                    );
                    setRepresentanteCedula(rep.cedula || '');
                    setAlumnosRep(alumnos);
                    if (rep.cedula) autocompletarPagoRepresentante(rep.cedula);
                    setAlumnosSeleccionados([]); setDatosAlumnos({}); setSeleccion({});
                    setCuotasProyectoInversion(alumnos[0]?.cuotas_proyecto_inversion_pendientes || []);
                    setSelectedProyectos([]); setMontosParcialesProyectos({});
                    // Si hay exactamente un alumno, seleccionarlo automáticamente
                    if (alumnos.length === 1) {
                        const alu = alumnos[0];
                        setAlumnosSeleccionados([alu.id]);
                        setDatosAlumnos({ [alu.id]: alu });
                        setSeleccion({ [alu.id]: crearSeleccionAlumno() });
                    }
                } catch (err) {
                    if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
                    resetBusqueda();
                    const status = err.response?.status;
                    if (status === 404) toast.info('Representante no encontrado.');
                    else toast.error('Error al buscar. Verifica tu conexión.');
                } finally {
                    setLoadingBusqueda(false);
                }
            }, 350);
        } else {
            setLoadingBusqueda(false);
            resetBusqueda();
        }
    }, [resetBusqueda, autocompletarPagoRepresentante]);

    const bancosAbortRef = useRef(null);

    useEffect(() => {
        bancosAbortRef.current?.abort();
        bancosAbortRef.current = new AbortController();
        const init = async () => {
            try {
                const res = await getBancos(bancosAbortRef.current.signal);
                setBancos(res.data);
                const cedulaParam = new URLSearchParams(location.search).get('cedula');
                if (cedulaParam) buscarAlumno(cedulaParam);
            } catch (err) {
                if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
                toast.error('Error al cargar bancos. Recarga la página.');
            }
        };
        init();
        return () => {
            clearTimeout(searchRef.current);
            abortRef.current?.abort();
            bancosAbortRef.current?.abort();
        };
    }, [location.search, buscarAlumno]);

    // Se relee en cada envío (ver handleSubmit) además de al montar: el
    // toggle vive en Configuración y esta pantalla suele quedar abierta toda
    // la jornada, así que un fetch único al montar podía validar contra un
    // valor ya desactualizado si el admin cambiaba el flag en otra pestaña.
    const fetchAdelantosRequierenUSD = useCallback(async () => {
        try {
            const res = await axiosInstance.get('secretaria/configuracion/');
            const valor = res.data?.adelantos_requieren_usd ?? true;
            setAdelantosRequierenUSD(valor);
            return valor;
        } catch {
            return null; // fetch falló: handleSubmit conserva el último valor conocido
        }
    }, []);

    useEffect(() => { fetchAdelantosRequierenUSD(); }, [fetchAdelantosRequierenUSD]);

    // Alterna la inclusión de un alumno en la operación de pago (checkbox).
    const toggleAlumno = (alu) => {
        setAlumnosSeleccionados(prev => {
            if (prev.includes(alu.id)) {
                setDatosAlumnos(d => { const nd = { ...d }; delete nd[alu.id]; return nd; });
                setSeleccion(s => { const ns = { ...s }; delete ns[alu.id]; return ns; });
                return prev.filter(id => id !== alu.id);
            }
            setDatosAlumnos(d => ({ ...d, [alu.id]: alu }));
            setSeleccion(s => ({ ...s, [alu.id]: crearSeleccionAlumno() }));
            return [...prev, alu.id];
        });
    };

    const actualizarSeleccion = (alumnoId, campo, valor) =>
        setSeleccion(s => ({ ...s, [alumnoId]: { ...s[alumnoId], [campo]: valor } }));

    const toggleEnLista = (alumnoId, campo, id) => {
        const actual = seleccion[alumnoId]?.[campo] || [];
        actualizarSeleccion(alumnoId, campo, actual.includes(id) ? actual.filter(x => x !== id) : [...actual, id]);
    };

    const toggleFutura    = (alumnoId, id) => toggleEnLista(alumnoId, 'selectedFuturas', id);
    const toggleMens      = (alumnoId, id) => toggleEnLista(alumnoId, 'selectedMens', id);
    const toggleCuota     = (alumnoId, id) => toggleEnLista(alumnoId, 'selectedCuotas', id);
    const toggleSolvencia = (alumnoId, id) => toggleEnLista(alumnoId, 'selectedSolvencias', id);

    const setMontoParcial = (alumnoId, categoria, id, val) =>
        setSeleccion(s => ({
            ...s,
            [alumnoId]: { ...s[alumnoId], montosParciales: { ...s[alumnoId].montosParciales, [`${categoria}_${id}`]: val } },
        }));

    const toggleProyecto = (id) =>
        setSelectedProyectos(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

    const setMontoParcialProyecto = (id, val) =>
        setMontosParcialesProyectos(p => ({ ...p, [id]: val }));

    const actualizarLinea = (idx, field, val) =>
        setLineas(p => p.map((l, i) => i === idx ? { ...l, [field]: val } : l));

    const handleSubmit = async (e) => {
        e?.preventDefault();
        if (alumnosSeleccionados.length === 0) { toast.error('Selecciona al menos un alumno.'); return; }
        // Relee el flag justo antes de validar: si el admin lo desactivó en
        // Configuración mientras esta pantalla estaba abierta, el valor en
        // estado puede estar desactualizado (ver fetchAdelantosRequierenUSD).
        const flagVigente = await fetchAdelantosRequierenUSD();
        const restriccionVigente = (flagVigente ?? adelantosRequierenUSD) && hayAdelantos;
        if ((restriccionVigente || hayParciales) && !todosDivisas) {
            toast.error('Los adelantos y pagos parciales requieren Efectivo USD o Zelle como método de pago.');
            return;
        }
        if (deudaVES > 0 && pagoVES < deudaVES - 0.01) {
            toast.error(`Monto insuficiente. Se requieren al menos Bs. ${fmt(deudaVES)}.`);
            return;
        }
        const sinBanco = lineas.some(l => requiereBanco(l.metodo_pago) && !l.banco_receptor_id);
        if (sinBanco) { toast.error('Selecciona el banco receptor para todos los métodos de pago.'); return; }
        const posInvalido = lineas.some(l => l.metodo_pago === 'punto_de_venta' &&
            (!/^\d{4}$/.test(l.referencia || '') || !/^\d{4}$/.test(l.numero_lote || '')));
        if (posInvalido) { toast.error('Punto de Venta requiere referencia y número de lote de 4 dígitos.'); return; }
        if (retroActivo) {
            if (!fechaPagoRetro) { toast.error('Indica la fecha real en que se recibió el pago.'); return; }
            const tasaRetroNum = parseFloat(tasaManual);
            if (isNaN(tasaRetroNum) || tasaRetroNum <= 0) { toast.error('La tasa debe ser mayor a 0.'); return; }
            if (motivoRetro.trim().length < MOTIVO_MIN_LEN) {
                toast.error(`Explica el motivo del pago retroactivo (mínimo ${MOTIVO_MIN_LEN} caracteres).`);
                return;
            }
        }
        if (enviandoPagoRef.current) return;
        enviandoPagoRef.current = true;
        setLoading(true);
        try {
            const alumnosPayload = alumnosSeleccionados.map(id => {
                const sel = seleccion[id];
                return {
                    alumno_id: id,
                    mensualidad_ids: sel.selectedMens,
                    mensualidad_adelanto_ids: sel.selectedFuturas,
                    cuota_inscripcion_ids: sel.selectedCuotas,
                    cuota_solvencia_ids: sel.selectedSolvencias,
                };
            });

            const res = await axiosInstance.post('cobranza/registrar-pago/', {
                alumnos: alumnosPayload,
                concepto,
                representante_documento: representanteCedula || cedula,
                representante_nombre: representanteNombre,
                proyecto_inversion_ids: selectedProyectos,
                montos_proyecto_inversion: Object.fromEntries(
                    selectedProyectos
                        .filter(id => montosParcialesProyectos[id] !== undefined && montosParcialesProyectos[id] !== '')
                        .map(id => [id, parseFloat(montosParcialesProyectos[id]) || 0])
                ),
                vuelto_usd: parseFloat(vueltoUSD.toFixed(2)),
                vuelto_ves: parseFloat(vueltoVES.toFixed(2)),
                pagos: lineas.map(l => ({
                    metodo_pago: l.metodo_pago,
                    concepto,
                    monto_usd: esDivisa(l.metodo_pago)    ? parseFloat(l.monto_usd) || 0 : 0,
                    monto_ves: esBolivares(l.metodo_pago) ? parseFloat(l.monto_ves) || 0 : 0,
                    banco_receptor_id: l.banco_receptor_id || null,
                    referencia: l.referencia || '',
                    numero_lote: l.numero_lote || '',
                    observaciones: '',
                })),
                // Solo se agregan cuando el modo retroactivo está encendido; con el
                // modo apagado el backend se comporta idéntico a hoy (sin estos campos).
                ...(retroActivo ? {
                    fecha_pago: fechaPagoRetro,
                    tasa_aplicada: parseFloat(tasaManual),
                    motivo: motivoRetro.trim(),
                } : {}),
            });

            if (res.status === 201) {
                toast.success('¡Pago registrado correctamente!');
                const pagosCreados = res.data.pagos;
                // Con pago retroactivo, el recibo impreso debe reflejar la fecha real
                // en que se recibió el dinero, no la fecha de hoy en que se digitó.
                const ahora = retroActivo && fechaPagoRetro
                    ? (() => { const [y, m, d] = fechaPagoRetro.split('-').map(Number); return new Date(y, m - 1, d); })()
                    : new Date();

                const bloques = alumnosSeleccionados.map(id => {
                    const datos = datosAlumnos[id];
                    const sel   = seleccion[id];
                    return {
                        nombreAlumno: datos.nombre_completo || datos.nombre,
                        mensualidades: datos.mensualidades_pendientes,
                        mensualidadesFuturas: datos.mensualidades_futuras,
                        cuotasInscripcion: datos.cuotas_inscripcion_pendientes,
                        cuotasSolvencia: datos.cuotas_solvencia_pendientes,
                        selectedMens: sel.selectedMens,
                        selectedFuturas: sel.selectedFuturas,
                        selectedCuotas: sel.selectedCuotas,
                        selectedSolvencias: sel.selectedSolvencias,
                        montosParciales: sel.montosParciales,
                    };
                });

                const itemsRecibo = construirItemsRecibo({
                    bloques,
                    selectedProyectos,
                    cuotasProyectoInversion,
                    montosParcialesProyectos,
                    tasa,
                    CONCEPTOS,
                    totalUSD,
                    totalVES,
                });

                // Construir formas de pago (siempre en Bs.)
                const pagosRecibo = lineas.map(l => ({
                    metodo: METODOS_PAGO.find(m => m.value === l.metodo_pago)?.label || l.metodo_pago,
                    banco:  bancos.find(b => String(b.id) === String(l.banco_receptor_id))?.nombre || '',
                    referencia: l.referencia || '',
                    monto: esDivisa(l.metodo_pago)
                        ? (tasa > 0 ? (parseFloat(l.monto_usd) * tasa).toFixed(2) : '')
                        : l.monto_ves,
                }));

                const nombresAlumnos = alumnosSeleccionados
                    .map(id => datosAlumnos[id]?.nombre_completo || datosAlumnos[id]?.nombre)
                    .filter(Boolean)
                    .join(', ');
                const gradosAlumnos = alumnosSeleccionados
                    .map(id => datosAlumnos[id]?.grado)
                    .filter(Boolean)
                    .join(', ');

                printReciboCobranza({
                    nroControl:       pagosCreados?.[0]?.factura_id || (pagosCreados?.[0]?.id ? String(pagosCreados[0].id).padStart(6, '0') : '—'),
                    mes:              format(ahora, 'MMMM', { locale: es }).toUpperCase(),
                    año:              format(ahora, 'yyyy'),
                    fechaPago:        format(ahora, 'dd/MM/yyyy', { locale: es }),
                    nombreEstudiante: nombresAlumnos,
                    grado:            gradosAlumnos,
                    representante:    representanteNombre,
                    ciRepresentante:  representanteCedula || cedula,
                    cajero:           user?.username || '',
                    tasa,
                    items:            itemsRecibo,
                    pagos:            pagosRecibo,
                    numeroSolvencia:  res.data.numero_solvencia || null,
                });

                setCedula(''); setRepresentanteNombre(''); setRepresentanteCedula(''); setAlumnosRep([]);
                setLineas([crearLinea()]);
                setAlumnosSeleccionados([]); setDatosAlumnos({}); setSeleccion({});
                setCuotasProyectoInversion([]); setSelectedProyectos([]); setMontosParcialesProyectos({});
                setRetroActivo(false); setFechaPagoRetro(today()); setTasaManual(''); setMotivoRetro('');
                setConfirming(false);
                setStep(1);
            }
        } catch (err) {
            const data = err.response?.data;
            const msg = data?.error || data?.detail
                || (typeof data === 'object' ? Object.values(data).flat().join(' ') : null)
                || (!err.response ? 'Sin conexión con el servidor. Verifica tu internet e intenta de nuevo.' : 'Error al registrar el pago.');
            toast.error(msg);
        } finally {
            enviandoPagoRef.current = false;
            setLoading(false);
        }
    };


    const maxForLine = useMemo(() => (idx) => {
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
    }, [deudaVES, tasa, lineas]);

    const nombresSeleccionados = alumnosSeleccionados
        .map(id => datosAlumnos[id]?.nombre_completo || datosAlumnos[id]?.nombre)
        .filter(Boolean)
        .join(', ');

    /* ── STEP 1: Búsqueda ── */
    if (step === 1) return (
        <>
        <Stepper steps={COBRANZA_STEPS} current={step} />
        <CobranzaStep1
            cedula={cedula}
            buscarAlumno={buscarAlumno}
            loadingBusqueda={loadingBusqueda}
            representanteNombre={representanteNombre}
            alumnosRep={alumnosRep}
            alumnosSeleccionados={alumnosSeleccionados}
            toggleAlumno={toggleAlumno}
            datosAlumnos={datosAlumnos}
            seleccion={seleccion}
            toggleCuota={toggleCuota}
            toggleSolvencia={toggleSolvencia}
            cuotasProyectoInversion={cuotasProyectoInversion}
            selectedProyectos={selectedProyectos}
            toggleProyecto={toggleProyecto}
            montosParcialesProyectos={montosParcialesProyectos}
            setMontoParcialProyecto={setMontoParcialProyecto}
            toggleMens={toggleMens}
            setMontoParcial={setMontoParcial}
            toggleFutura={toggleFutura}
            tasa={tasa}
            totalGenVES={totalGenVES}
            totalGenUSD={totalGenUSD}
            setStep={setStep}
            haySeleccion={haySeleccion}
            adelantosRequierenUSD={adelantosRequierenUSD}
        />
        </>
    );

    /* ── STEP 2: Pago ── */
    return (
        <>
        <Stepper steps={COBRANZA_STEPS} current={step} />
        <CobranzaStep2
            nombreAlumno={nombresSeleccionados}
            cedula={cedula}
            setStep={setStep}
            concepto={concepto}
            setConcepto={setConcepto}
            haySeleccion={haySeleccion}
            hayMens={alumnosSeleccionados.some(id => (seleccion[id]?.selectedMens.length || seleccion[id]?.selectedFuturas.length))}
            hayInscripcion={alumnosSeleccionados.some(id => seleccion[id]?.selectedCuotas.length)}
            haySolvencia={alumnosSeleccionados.some(id => seleccion[id]?.selectedSolvencias.length)}
            hayProyecto={selectedProyectos.length > 0}
            alumnosSeleccionados={alumnosSeleccionados}
            datosAlumnos={datosAlumnos}
            seleccion={seleccion}
            requiereDivisas={requiereDivisas}
            hayAdelantos={hayAdelantos}
            todosDivisas={todosDivisas}
            lineas={lineas}
            setLineas={setLineas}
            bancos={bancos}
            actualizarLinea={actualizarLinea}
            tasa={tasa}
            tasaError={tasaError}
            ultimaActualizacion={ultimaActualizacion}
            refetchTasa={refetchTasa}
            deudaVES={deudaVES}
            maxForLine={maxForLine}
            metodoPagoIcons={metodoPagoIcons}
            retroActivo={retroActivo}
            setRetroActivo={setRetroActivo}
            fechaPagoRetro={fechaPagoRetro}
            setFechaPagoRetro={setFechaPagoRetro}
            tasaManual={tasaManual}
            setTasaManual={setTasaManual}
            motivoRetro={motivoRetro}
            setMotivoRetro={setMotivoRetro}
            tasaSugerida={tasaSugerida}
            tasaSugerenciaExacta={tasaSugerenciaExacta}
            tasaSugerenciaFechaReal={tasaSugerenciaFechaReal}
            tasaSugerenciaLoading={tasaSugerenciaLoading}
        >
            <ResumenPago
                nombreAlumno={nombresSeleccionados}
                cedula={cedula}
                alumnosSeleccionados={alumnosSeleccionados}
                datosAlumnos={datosAlumnos}
                seleccion={seleccion}
                cuotasProyectoInversion={cuotasProyectoInversion}
                selectedProyectos={selectedProyectos}
                montosParcialesProyectos={montosParcialesProyectos}
                confirming={confirming}
                deudaVES={deudaVES}
                vueltoVES={vueltoVES}
                vueltoUSD={vueltoUSD}
                pct={pct}
                saldoVES={saldoVES}
                totalGenUSD={totalGenUSD}
                totalGenVES={totalGenVES}
                loading={loading}
                setConfirming={setConfirming}
                handleSubmit={handleSubmit}
            />
        </CobranzaStep2>
        </>
    );
};

export default Cobranza;
