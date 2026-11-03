import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { CloudOff, RotateCw, Store } from 'lucide-react';
import { cerrarCajaCantina, getCierreCajaHoy, getUltimoCierreCaja } from '../../api/cantina.service';
import ConfirmarCierreModal from '../../components/cantina/cierre/ConfirmarCierreModal';
import ConteoCierre from '../../components/cantina/cierre/ConteoCierre';
import { DineroRecibido, OrigenCierre } from '../../components/cantina/cierre/DesgloseCierre';
import ResultadoCierre from '../../components/cantina/cierre/ResultadoCierre';
import {
  cambiosEsperados, esperadosDe, estadoDiferencia, fechaHoraCierre, montoParaApi, parsearMonto,
} from '../../components/cantina/cierre/calculosCierre';
import { notificarAperturaCambiada, ETIQUETA_AREA } from '../aperturaEvento';

const esCancelado = (err) => err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED';
const mensajeDe = (err, respaldo) => err?.response?.data?.detail || respaldo;

const BOTON_PRIMARIO = 'w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white';
const BOTON_SECUNDARIO = 'w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold';
const ESTILO_SECUNDARIO = { background: '#fff', color: 'var(--jet)', border: '0.5px solid var(--border-md)' };

function BloqueSkeleton({ className }) {
  return (
    <div
      className={`rounded-xl animate-pulse motion-reduce:animate-none ${className}`}
      style={{ background: 'var(--border)' }}
    />
  );
}

// Reproduce el layout real: conteo primero bajo lg, a la derecha desde lg.
function SkeletonCierre() {
  return (
    <div
      role="status"
      aria-label="Cargando cierre de caja"
      className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] gap-5 lg:gap-6"
    >
      <div className="lg:col-start-2 lg:row-start-1 flex flex-col gap-3">
        <BloqueSkeleton className="h-36" />
        <BloqueSkeleton className="h-36" />
        <BloqueSkeleton className="h-14" />
      </div>
      <div className="lg:col-start-1 lg:row-start-1 grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
        {Array.from({ length: 6 }).map((_, i) => <BloqueSkeleton key={i} className="h-28" />)}
      </div>
    </div>
  );
}

function Encabezado({ titulo, detalle }) {
  return (
    <header>
      <h1 className="text-xl sm:text-2xl font-semibold" style={{ color: 'var(--jet)' }}>{titulo}</h1>
      {detalle && <p className="text-sm mt-0.5" style={{ color: 'var(--jet-mid)' }}>{detalle}</p>}
    </header>
  );
}

function ErrorDeCarga({ mensaje, onReintentar }) {
  return (
    <div role="alert" className="rounded-2xl p-4 sm:p-6 flex flex-col gap-4 max-w-xl" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
      <div className="flex gap-3">
        <CloudOff size={22} aria-hidden="true" className="shrink-0 mt-0.5" style={{ color: 'var(--red)' }} />
        <div className="min-w-0">
          <p className="font-semibold" style={{ color: 'var(--jet)' }}>No se pudo cargar tu caja</p>
          <p className="text-sm mt-0.5 break-words" style={{ color: 'var(--jet-mid)' }}>{mensaje}</p>
        </div>
      </div>
      <button type="button" onClick={onReintentar} className={BOTON_PRIMARIO} style={{ background: 'var(--pb-mid)' }}>
        <RotateCw size={16} aria-hidden="true" />
        Reintentar
      </button>
    </div>
  );
}

function SinApertura({ ultimo, onVerUltimo }) {
  return (
    <div className="rounded-2xl p-4 sm:p-6 flex flex-col gap-4 max-w-xl" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
      <div>
        <p className="font-semibold" style={{ color: 'var(--jet)' }}>No tienes una caja abierta</p>
        <p className="text-sm mt-0.5" style={{ color: 'var(--jet-mid)' }}>
          Abre tu caja en el punto de venta para poder vender y cerrarla al final del turno.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <Link to="/cantina/pos" className={BOTON_PRIMARIO} style={{ background: 'var(--pb-mid)' }}>
          <Store size={16} aria-hidden="true" />
          Ir al POS
        </Link>
        {ultimo && (
          <button type="button" onClick={onVerUltimo} className={BOTON_SECUNDARIO} style={ESTILO_SECUNDARIO}>
            Ver último cierre
          </button>
        )}
      </div>
    </div>
  );
}

// Cierre de caja del cajero autenticado. El backend resuelve la apertura y
// recalcula los totales; aquí solo se registra lo que hay en la gaveta.
export default function CantinaCierreCaja() {
  const [vista, setVista] = useState('cargando'); // cargando | lista | sin_apertura | error
  const [errorCarga, setErrorCarga] = useState('');
  const [cierre, setCierre] = useState(null);
  const [ultimo, setUltimo] = useState(null);
  const [recienCerrada, setRecienCerrada] = useState(false);

  const [conteos, setConteos] = useState({ usd: '', ves: '' });
  const [observaciones, setObservaciones] = useState('');
  const [faltantes, setFaltantes] = useState({ usd: false, ves: false });

  const [revisando, setRevisando] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [fase, setFase] = useState('cargando'); // cargando | lista | error
  const [errorRefresco, setErrorRefresco] = useState('');
  const [errorEnvio, setErrorEnvio] = useState('');
  const [cambios, setCambios] = useState([]);
  const [enviando, setEnviando] = useState(false);

  const cargaRef = useRef(null);
  const refrescoRef = useRef(null);
  const refUsd = useRef(null);
  const refVes = useRef(null);

  const pasarASinApertura = useCallback((signal) => {
    setVista('sin_apertura');
    // El último cierre es un extra: si no carga, simplemente no se ofrece.
    getUltimoCierreCaja(signal)
      .then((res) => setUltimo(res.data))
      .catch(() => setUltimo(null));
  }, []);

  const cargar = useCallback(() => {
    cargaRef.current?.abort();
    const controller = new AbortController();
    cargaRef.current = controller;
    return getCierreCajaHoy(controller.signal)
      .then((res) => {
        setCierre(res.data);
        setVista('lista');
      })
      .catch((err) => {
        if (esCancelado(err)) return;
        // 400 sin apertura no es un fallo: el cajero aún no abrió caja.
        if (err.response?.status === 400) {
          pasarASinApertura(controller.signal);
          return;
        }
        setErrorCarga(mensajeDe(err, 'Revisa la conexión e inténtalo de nuevo.'));
        setVista('error');
      });
  }, [pasarASinApertura]);

  useEffect(() => {
    cargar();
    return () => {
      cargaRef.current?.abort();
      refrescoRef.current?.abort();
    };
  }, [cargar]);

  const reintentarCarga = () => {
    setVista('cargando');
    cargar();
  };

  const contados = useMemo(() => ({
    usd: parsearMonto(conteos.usd),
    ves: parsearMonto(conteos.ves),
  }), [conteos]);

  const esperados = esperadosDe(cierre);

  const estadoDe = (moneda) => {
    if (conteos[moneda].trim() !== '' && contados[moneda] === null) {
      return { tipo: 'invalido', texto: 'Revisa este monto: usa solo números, como 1.234,50' };
    }
    if (faltantes[moneda] && contados[moneda] === null) {
      return { tipo: 'invalido', texto: 'Escribe lo que contaste. Si no hay, escribe 0' };
    }
    return estadoDiferencia(contados[moneda], esperados[moneda], moneda);
  };
  const estados = { usd: estadoDe('usd'), ves: estadoDe('ves') };
  const hayDiferencia = [estados.usd.tipo, estados.ves.tipo].some((t) => t === 'faltante' || t === 'sobrante');

  const cambiarConteo = (moneda, valor) => {
    setConteos((prev) => ({ ...prev, [moneda]: valor }));
    setFaltantes((prev) => ({ ...prev, [moneda]: false }));
  };

  // Vuelve a pedir las cifras: entre contar y confirmar pudo entrar una venta.
  const refrescarCifras = () => {
    refrescoRef.current?.abort();
    const controller = new AbortController();
    refrescoRef.current = controller;
    return getCierreCajaHoy(controller.signal)
      .then((res) => {
        setCierre(res.data);
        if (res.data.ya_cerrado) {
          setModalAbierto(false);
          toast.info('Esta caja ya estaba cerrada.');
          return;
        }
        setCambios(cambiosEsperados(cierre, res.data));
        setErrorEnvio('');
        setFase('lista');
        setModalAbierto(true);
      })
      .catch((err) => {
        if (esCancelado(err)) return;
        if (err.response?.status === 400) {
          setModalAbierto(false);
          pasarASinApertura(controller.signal);
          return;
        }
        setErrorRefresco(mensajeDe(err, 'Revisa la conexión e inténtalo de nuevo.'));
        setFase('error');
        setModalAbierto(true);
      });
  };

  const revisar = () => {
    if (revisando) return;
    const vacios = { usd: contados.usd === null, ves: contados.ves === null };
    if (vacios.usd || vacios.ves) {
      setFaltantes(vacios);
      (vacios.usd ? refUsd : refVes).current?.focus();
      return;
    }
    setRevisando(true);
    refrescarCifras().finally(() => setRevisando(false));
  };

  const reintentarRefresco = () => {
    setFase('cargando');
    refrescarCifras();
  };

  const volverAContar = () => {
    if (enviando) return;
    refrescoRef.current?.abort();
    setModalAbierto(false);
  };

  const confirmarCierre = async () => {
    if (enviando) return;
    setEnviando(true);
    setErrorEnvio('');
    try {
      const res = await cerrarCajaCantina({
        conteo_usd: montoParaApi(contados.usd),
        conteo_ves: montoParaApi(contados.ves),
        observaciones: observaciones.trim(),
      });
      setCierre({ ...res.data, ya_cerrado: true });
      setRecienCerrada(true);
      setModalAbierto(false);
      notificarAperturaCambiada(); // el chip "Caja: …" del layout ya no aplica
      toast.success('Caja cerrada correctamente.');
    } catch (err) {
      if (esCancelado(err)) return;
      const mensaje = mensajeDe(err, 'No se pudo cerrar la caja. Intenta de nuevo.');
      setErrorEnvio(mensaje);
      toast.error(mensaje);
    } finally {
      setEnviando(false);
    }
  };

  const verUltimo = () => {
    setCierre(ultimo);
    setVista('lista');
  };

  const area = cierre?.area ? (ETIQUETA_AREA[cierre.area] ?? cierre.area) : '';
  const yaCerrado = vista === 'lista' && cierre?.ya_cerrado;
  const hora = fechaHoraCierre(cierre?.fecha_hora_apertura, "d 'de' MMMM, HH:mm");
  const cajero = cierre?.cajero_nombre || cierre?.cajero_username;

  const titulo = yaCerrado ? `Cierre de caja ${area}`.trim() : `Cerrar caja ${vista === 'lista' ? area : ''}`.trim();
  const detalle = vista === 'lista' && !yaCerrado
    ? [cajero, hora && `Abierta el ${hora}`].filter(Boolean).join(' · ')
    : '';

  return (
    <div className="flex flex-col gap-5 sm:gap-6 w-full max-w-6xl">
      <Encabezado titulo={titulo} detalle={detalle} />

      {vista === 'cargando' && <SkeletonCierre />}
      {vista === 'error' && <ErrorDeCarga mensaje={errorCarga} onReintentar={reintentarCarga} />}
      {vista === 'sin_apertura' && <SinApertura ultimo={ultimo} onVerUltimo={verUltimo} />}
      {yaCerrado && <ResultadoCierre cierre={cierre} enfocar={recienCerrada} />}

      {vista === 'lista' && !yaCerrado && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] gap-5 lg:gap-6 items-start">
          <div className="lg:col-start-2 lg:row-start-1 min-w-0 lg:sticky lg:top-4">
            <ConteoCierre
              conteos={conteos}
              esperados={esperados}
              estados={estados}
              observaciones={observaciones}
              hayDiferencia={hayDiferencia}
              revisando={revisando}
              onCambiarConteo={cambiarConteo}
              onCambiarObservaciones={setObservaciones}
              onRevisar={revisar}
              refUsd={refUsd}
              refVes={refVes}
            />
          </div>
          <div className="lg:col-start-1 lg:row-start-1 min-w-0 flex flex-col gap-6">
            <DineroRecibido totales={cierre?.totales_por_metodo} />
            <OrigenCierre cierre={cierre} />
          </div>
        </div>
      )}

      <ConfirmarCierreModal
        abierto={modalAbierto}
        fase={fase}
        errorRefresco={errorRefresco}
        errorEnvio={errorEnvio}
        cambios={cambios}
        contados={contados}
        esperados={esperados}
        estados={estados}
        nota={observaciones.trim()}
        enviando={enviando}
        onVolver={volverAContar}
        onReintentar={reintentarRefresco}
        onConfirmar={confirmarCierre}
      />
    </div>
  );
}
