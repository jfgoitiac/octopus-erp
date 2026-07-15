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
import { printReciboCobranza } from '../utils/printReciboCobranza';
import { construirItemsRecibo } from '../utils/construirItemsRecibo';
import { fmt } from '../utils/formato';
import CobranzaStep1 from './components/CobranzaStep1';
import CobranzaStep2 from './components/CobranzaStep2';
import ResumenPago from './components/ResumenPago';

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

const esDivisa    = (m) => ['zelle', 'efectivo'].includes(m);
const esBolivares = (m) => ['transferencia', 'pago_movil', 'punto_de_venta', 'efectivo_ves'].includes(m);
const requiereBanco = (m) => m && !['efectivo', 'efectivo_ves'].includes(m);

const crearLinea = () => ({
    id: Date.now() + Math.random(),
    metodo_pago: 'transferencia',
    monto_usd: '',
    monto_ves: '',
    banco_receptor_id: '',
    referencia: '',
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
    const { tasa, error: tasaError, ultimaActualizacion, refetch: refetchTasa } = useTasaBCV();
    const [step, setStep]           = useState(1);
    const [cedula, setCedula]       = useState('');
    const [alumnoId, setAlumnoId]   = useState(null);
    const [nombreAlumno, setNombreAlumno]         = useState('');
    const [gradoAlumno,  setGradoAlumno]          = useState('');
    const [estatusFinanciero, setEstatusFinanciero] = useState('');
    const [representanteNombre, setRepresentanteNombre] = useState('');
    const [representanteCedula, setRepresentanteCedula] = useState('');
    const [alumnosRep, setAlumnosRep]             = useState([]);
    const [mensualidades, setMensualidades]       = useState([]);
    const [selectedMens, setSelectedMens]         = useState([]);
    const [cuotasInscripcion, setCuotasInscripcion] = useState([]);
    const [selectedCuotas, setSelectedCuotas]     = useState([]);
    const [cuotasSolvencia, setCuotasSolvencia]   = useState([]);
    const [selectedSolvencias, setSelectedSolvencias] = useState([]);
    const [cuotasProyectoInversion, setCuotasProyectoInversion] = useState([]);
    const [selectedProyectos, setSelectedProyectos] = useState([]);
    const [concepto, setConcepto]                 = useState('mensualidad');
    const [lineas, setLineas]                     = useState([crearLinea()]);
    const [bancos, setBancos]                     = useState([]);
    const [loading, setLoading]                   = useState(false);
    const [mensualidadesFuturas, setMensualidadesFuturas] = useState([]);
    const [selectedFuturas, setSelectedFuturas]   = useState([]);
    const [montosParciales, setMontosParciales]   = useState({}); // id → monto_usd string override

    const searchRef = useRef(null);
    const abortRef  = useRef(null);
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

    const mensUSD = useMemo(() =>
        selectedMens.reduce((s, id) => {
            const m = mensualidades.find(x => x.id === id);
            if (!m) return s;
            const ov = montosParciales[id];
            return s + (ov !== undefined && ov !== '' ? parseFloat(ov) || 0 : parseFloat(m.monto_usd) || 0);
        }, 0), [mensualidades, selectedMens, montosParciales]);

    const cuotasUSD = useMemo(() =>
        selectedCuotas.reduce((s, id) => {
            const c = cuotasInscripcion.find(x => x.id === id);
            return s + (c ? parseFloat(c.monto_usd) || 0 : 0);
        }, 0), [cuotasInscripcion, selectedCuotas]);

    const solvenciasUSD = useMemo(() =>
        selectedSolvencias.reduce((s, id) => {
            const c = cuotasSolvencia.find(x => x.id === id);
            return s + (c ? parseFloat(c.monto_usd) || 0 : 0);
        }, 0), [cuotasSolvencia, selectedSolvencias]);

    const proyectosUSD = useMemo(() =>
        selectedProyectos.reduce((s, id) => {
            const c = cuotasProyectoInversion.find(x => x.id === id);
            return s + (c ? parseFloat(c.monto_usd) || 0 : 0);
        }, 0), [cuotasProyectoInversion, selectedProyectos]);

    const futurasUSD = useMemo(() =>
        selectedFuturas.reduce((s, id) => {
            const m = mensualidadesFuturas.find(x => x.id === id);
            if (!m) return s;
            const ov = montosParciales[id];
            return s + (ov !== undefined && ov !== '' ? parseFloat(ov) || 0 : parseFloat(m.monto_usd) || 0);
        }, 0), [mensualidadesFuturas, selectedFuturas, montosParciales]);

    const haySeleccion = selectedMens.length > 0 || selectedCuotas.length > 0 || selectedFuturas.length > 0 || selectedSolvencias.length > 0 || selectedProyectos.length > 0;
    const totalSelUSD  = mensUSD + cuotasUSD + futurasUSD + solvenciasUSD + proyectosUSD;
    const deudaVES   = haySeleccion ? totalSelUSD * tasa : 0;
    const pagoVES    = totalVES;
    const totalGenUSD = haySeleccion ? totalSelUSD : totalUSD;
    const totalGenVES = haySeleccion ? totalSelUSD * tasa : totalVES;
    const saldoVES   = Math.max(0, deudaVES - pagoVES);
    const vueltoVES  = deudaVES > 0 ? Math.max(0, pagoVES - deudaVES) : 0;
    const vueltoUSD  = tasa > 0 ? vueltoVES / tasa : 0;
    const pct        = deudaVES > 0 ? Math.min(100, Math.round((pagoVES / deudaVES) * 100)) : 0;

    const todosDivisas    = lineas.length > 0 && lineas.every(l => esDivisa(l.metodo_pago));
    const hayAdelantos    = selectedFuturas.length > 0;

    // Auto-convertir líneas a dólares cuando se seleccionan adelantos
    useEffect(() => {
        if (hayAdelantos) {
            setLineas(p => p.map(l =>
                esDivisa(l.metodo_pago) ? l : { ...l, metodo_pago: 'efectivo', banco_receptor_id: '', monto_ves: '' }
            ));
        }
    }, [hayAdelantos]);
    const hayParciales    = selectedMens.some(id => {
        const m  = mensualidades.find(x => x.id === id);
        const ov = montosParciales[id];
        return m && ov !== undefined && ov !== '' && parseFloat(ov) < parseFloat(m.monto_usd) - 0.01;
    }) || selectedFuturas.some(id => {
        const m  = mensualidadesFuturas.find(x => x.id === id);
        const ov = montosParciales[id];
        return m && ov !== undefined && ov !== '' && parseFloat(ov) < parseFloat(m.monto_usd) - 0.01;
    });
    const requiereDivisas = hayAdelantos || hayParciales;

    const resetBusqueda = useCallback(() => {
        setRepresentanteNombre(''); setRepresentanteCedula(''); setAlumnosRep([]); setNombreAlumno('');
        setEstatusFinanciero(''); setAlumnoId(null);
        setMensualidades([]); setCuotasInscripcion([]); setMensualidadesFuturas([]); setCuotasSolvencia([]); setCuotasProyectoInversion([]);
        setSelectedMens([]); setSelectedCuotas([]); setSelectedFuturas([]); setSelectedSolvencias([]); setSelectedProyectos([]); setMontosParciales({});
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
                    setSelectedMens([]); setSelectedCuotas([]); setSelectedFuturas([]); setSelectedSolvencias([]); setSelectedProyectos([]); setMontosParciales({});
                    // Si hay exactamente un alumno, seleccionarlo automáticamente
                    if (alumnos.length === 1) {
                        const alu = alumnos[0];
                        setNombreAlumno(alu.nombre_completo || alu.nombre);
                        setGradoAlumno(alu.grado || '');
                        setEstatusFinanciero(alu.estatus);
                        setAlumnoId(alu.id);
                        setMensualidades(alu.mensualidades_pendientes || []);
                        setCuotasInscripcion(alu.cuotas_inscripcion_pendientes || []);
                        setMensualidadesFuturas(alu.mensualidades_futuras || []);
                        setCuotasSolvencia(alu.cuotas_solvencia_pendientes || []);
                        setCuotasProyectoInversion(alu.cuotas_proyecto_inversion_pendientes || []);
                    } else {
                        setNombreAlumno(''); setEstatusFinanciero(''); setAlumnoId(null);
                        setMensualidades([]); setCuotasInscripcion([]); setMensualidadesFuturas([]); setCuotasSolvencia([]); setCuotasProyectoInversion([]);
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
    }, [resetBusqueda]);

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

    const selAlumno = (alu) => {
        setNombreAlumno(alu.nombre_completo || alu.nombre);
        setGradoAlumno(alu.grado || '');
        setEstatusFinanciero(alu.estatus);
        setAlumnoId(alu.id);
        setMensualidades(alu.mensualidades_pendientes || []);
        setCuotasInscripcion(alu.cuotas_inscripcion_pendientes || []);
        setMensualidadesFuturas(alu.mensualidades_futuras || []);
        setCuotasSolvencia(alu.cuotas_solvencia_pendientes || []);
        setCuotasProyectoInversion(alu.cuotas_proyecto_inversion_pendientes || []);
        setSelectedMens([]);
        setSelectedCuotas([]);
        setSelectedFuturas([]);
        setSelectedSolvencias([]);
        setSelectedProyectos([]);
        setMontosParciales({});
    };

    const toggleFutura = (id) =>
        setSelectedFuturas(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

    const setMontoParcial = (id, val) =>
        setMontosParciales(p => ({ ...p, [id]: val }));

    const toggleMens = (id) =>
        setSelectedMens(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

    const toggleCuota = (id) =>
        setSelectedCuotas(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

    const toggleSolvencia = (id) =>
        setSelectedSolvencias(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

    const toggleProyecto = (id) =>
        setSelectedProyectos(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

    const actualizarLinea = (idx, field, val) =>
        setLineas(p => p.map((l, i) => i === idx ? { ...l, [field]: val } : l));

    const handleSubmit = async (e) => {
        e?.preventDefault();
        if (!alumnoId) { toast.error('Selecciona un alumno primero.'); return; }
        if (requiereDivisas && !todosDivisas) {
            toast.error('Los adelantos y pagos parciales requieren Efectivo USD o Zelle como método de pago.');
            return;
        }
        if (deudaVES > 0 && pagoVES < deudaVES - 0.01) {
            toast.error(`Monto insuficiente. Se requieren al menos Bs. ${fmt(deudaVES)}.`);
            return;
        }
        const sinBanco = lineas.some(l => requiereBanco(l.metodo_pago) && !l.banco_receptor_id);
        if (sinBanco) { toast.error('Selecciona el banco receptor para todos los métodos de pago.'); return; }
        setLoading(true);
        try {
            const buildMontoPago = (id, lista) => {
                const m  = lista.find(x => x.id === id);
                const ov = montosParciales[id];
                return parseFloat(ov !== undefined && ov !== '' ? ov : (m?.monto_usd || 0));
            };
            const res = await axiosInstance.post('cobranza/registrar-pago/', {
                alumno_id: alumnoId,
                concepto,
                representante_documento: representanteCedula || cedula,
                representante_nombre: representanteNombre,
                mensualidad_ids: selectedMens,
                mensualidad_adelanto_ids: selectedFuturas,
                mensualidades_pago: selectedMens.map(id => ({
                    id, monto_usd: buildMontoPago(id, mensualidades),
                })),
                mensualidades_adelanto: selectedFuturas.map(id => ({
                    id, monto_usd: buildMontoPago(id, mensualidadesFuturas),
                })),
                cuota_inscripcion_ids: selectedCuotas,
                cuota_solvencia_ids: selectedSolvencias,
                proyecto_inversion_ids: selectedProyectos,
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
                const ahora = new Date();

                const itemsRecibo = construirItemsRecibo({
                    selectedMens,
                    selectedFuturas,
                    selectedCuotas,
                    selectedSolvencias,
                    selectedProyectos,
                    mensualidades,
                    mensualidadesFuturas,
                    cuotasInscripcion,
                    cuotasSolvencia,
                    cuotasProyectoInversion,
                    montosParciales,
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

                printReciboCobranza({
                    nroControl:       pagosCreados?.[0]?.factura_id || (pagosCreados?.[0]?.id ? String(pagosCreados[0].id).padStart(6, '0') : '—'),
                    mes:              format(ahora, 'MMMM', { locale: es }).toUpperCase(),
                    año:              format(ahora, 'yyyy'),
                    fechaPago:        format(ahora, 'dd/MM/yyyy', { locale: es }),
                    nombreEstudiante: nombreAlumno,
                    grado:            gradoAlumno,
                    representante:    representanteNombre,
                    ciRepresentante:  representanteCedula || cedula,
                    cajero:           user?.username || '',
                    tasa,
                    items:            itemsRecibo,
                    pagos:            pagosRecibo,
                    numeroSolvencia:  res.data.numero_solvencia || null,
                });

                setCedula(''); setNombreAlumno(''); setGradoAlumno(''); setEstatusFinanciero('');
                setAlumnoId(null); setRepresentanteNombre(''); setRepresentanteCedula(''); setAlumnosRep([]);
                setLineas([crearLinea()]); setMensualidades([]); setSelectedMens([]);
                setCuotasInscripcion([]); setSelectedCuotas([]);
                setCuotasSolvencia([]); setSelectedSolvencias([]);
                setCuotasProyectoInversion([]); setSelectedProyectos([]);
                setMensualidadesFuturas([]); setSelectedFuturas([]); setMontosParciales({});
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

    /* ── STEP 1: Búsqueda ── */
    if (step === 1) return (
        <CobranzaStep1
            cedula={cedula}
            buscarAlumno={buscarAlumno}
            loadingBusqueda={loadingBusqueda}
            representanteNombre={representanteNombre}
            alumnosRep={alumnosRep}
            alumnoId={alumnoId}
            selAlumno={selAlumno}
            cuotasInscripcion={cuotasInscripcion}
            selectedCuotas={selectedCuotas}
            toggleCuota={toggleCuota}
            cuotasSolvencia={cuotasSolvencia}
            selectedSolvencias={selectedSolvencias}
            toggleSolvencia={toggleSolvencia}
            cuotasProyectoInversion={cuotasProyectoInversion}
            selectedProyectos={selectedProyectos}
            toggleProyecto={toggleProyecto}
            mensualidades={mensualidades}
            selectedMens={selectedMens}
            toggleMens={toggleMens}
            setMontoParcial={setMontoParcial}
            montosParciales={montosParciales}
            mensualidadesFuturas={mensualidadesFuturas}
            selectedFuturas={selectedFuturas}
            toggleFutura={toggleFutura}
            tasa={tasa}
            totalGenVES={totalGenVES}
            totalGenUSD={totalGenUSD}
            setStep={setStep}
            haySeleccion={haySeleccion}
        />
    );

    /* ── STEP 2: Pago ── */
    return (
        <CobranzaStep2
            nombreAlumno={nombreAlumno}
            cedula={cedula}
            setStep={setStep}
            concepto={concepto}
            setConcepto={setConcepto}
            haySeleccion={haySeleccion}
            hayMens={selectedMens.length > 0 || selectedFuturas.length > 0}
            hayInscripcion={selectedCuotas.length > 0}
            haySolvencia={selectedSolvencias.length > 0}
            hayProyecto={selectedProyectos.length > 0}
            selectedMens={selectedMens}
            mensualidades={mensualidades}
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
        >
            <ResumenPago
                nombreAlumno={nombreAlumno}
                cedula={cedula}
                selectedMens={selectedMens}
                selectedFuturas={selectedFuturas}
                mensualidades={mensualidades}
                mensualidadesFuturas={mensualidadesFuturas}
                montosParciales={montosParciales}
                confirming={confirming}
                deudaVES={deudaVES}
                vueltoVES={vueltoVES}
                vueltoUSD={vueltoUSD}
                pct={pct}
                saldoVES={saldoVES}
                totalGenUSD={totalGenUSD}
                totalGenVES={totalGenVES}
                loading={loading}
                alumnoId={alumnoId}
                setConfirming={setConfirming}
                handleSubmit={handleSubmit}
            />
        </CobranzaStep2>
    );
};

export default Cobranza;
