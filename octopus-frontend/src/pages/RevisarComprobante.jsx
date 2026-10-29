import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Banknote, Info, XCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { Card } from '../components/ui/Card';
import { Bone } from '../components/shared/Skeleton';
import VisorComprobante from '../components/comprobantes/VisorComprobante';
import ResumenComprobante from '../components/comprobantes/ResumenComprobante';
import ModalRechazo from '../components/comprobantes/ModalRechazo';
import RevisionSoloLectura from '../components/comprobantes/RevisionSoloLectura';
import {
  buscarSiguientePendiente, obtenerComprobante, rechazarComprobante,
} from '../services/comprobantesRevisionService';
import { mensajeError, normalizarCampos } from '../components/comprobantes/comprobantesUtils';
import { RUTA_REVISION as RUTA_LISTA, urlCajaComprobante } from '../components/comprobantes/cajaComprobante';

const EsqueletoPanel = () => (
  <div className="space-y-4">
    <Bone className="h-6 w-48" />
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {[1, 2, 3, 4].map((i) => <Bone key={i} className="h-10 w-full rounded-xl" />)}
    </div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {[1, 2, 3].map((i) => <Bone key={i} className="h-16 w-full rounded-xl" />)}
    </div>
    {[1, 2, 3, 4].map((i) => <Bone key={i} className="h-11 w-full rounded-xl" />)}
  </div>
);

/**
 * Acciones de un comprobante pendiente. La aprobación no tiene formulario
 * propio: el pago se registra en caja con todas sus reglas (tasa, retroactivo,
 * excedente, recibo) y eso aprueba el comprobante.
 */
const AccionesRevision = ({ procesando, onProcesar, onRechazar }) => (
  <div className="space-y-3">
    <p className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs sm:text-sm" style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
      <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      Para aprobarlo, procesa el pago en caja: verás este comprobante al lado y,
      al registrar el pago, quedará aprobado y se avisará al representante.
    </p>
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onRechazar}
        disabled={procesando}
        className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-red-700 disabled:opacity-60 sm:w-auto"
        style={{ border: '0.5px solid #fca5a5', background: 'var(--porcelain)' }}
      >
        <XCircle size={16} aria-hidden="true" /> Rechazar
      </button>
      <button
        type="button"
        onClick={onProcesar}
        disabled={procesando}
        className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
        style={{ background: 'var(--pb)' }}
      >
        <Banknote size={16} aria-hidden="true" /> Procesar pago
      </button>
    </div>
  </div>
);

const RevisarComprobante = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [comprobante, setComprobante] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errores, setErrores] = useState({});
  const [procesando, setProcesando] = useState(false);
  const [rechazoAbierto, setRechazoAbierto] = useState(false);

  const cargar = useCallback(async (signal) => {
    setCargando(true);
    setErrores({});
    setComprobante((previo) => (previo && String(previo.id) === String(id) ? previo : null));
    try {
      const { data } = await obtenerComprobante(id, signal);
      setComprobante(data);
    } catch (error) {
      if (error?.code === 'ERR_CANCELED') return;
      if (error?.response?.status === 404) {
        toast.error('El comprobante no existe o ya no está disponible.');
        navigate(RUTA_LISTA, { replace: true });
        return;
      }
      toast.error(mensajeError(error, 'No se pudo cargar el comprobante.'));
    } finally {
      if (!signal?.aborted) setCargando(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial tras respuesta HTTP
    cargar(controller.signal);
    return () => controller.abort();
  }, [cargar]);

  const irAlSiguiente = async () => {
    const siguienteId = await buscarSiguientePendiente(id);
    if (siguienteId) {
      toast.info('Abriendo el siguiente comprobante pendiente.');
      navigate(`${RUTA_LISTA}/${siguienteId}`);
      return;
    }
    toast.info('No quedan comprobantes pendientes.');
    navigate(RUTA_LISTA);
  };

  // Aprobar = registrar el pago en caja. La caja carga este comprobante,
  // preselecciona representante, alumno y mensualidad y, al registrar, lo
  // marca como aprobado (POST cobranza/registrar-pago/ con comprobante_portal_id).
  const procesarPago = () => {
    navigate(urlCajaComprobante({ cedula: comprobante?.representante_cedula, comprobanteId: comprobante.id }));
  };

  const manejarErrorProceso = (error, porDefecto) => {
    const status = error?.response?.status;
    const data = error?.response?.data || {};
    if (status === 400 && data.campos) {
      setErrores(normalizarCampos(data.campos));
      toast.error(data.error || 'Revise los datos del pago.');
      return;
    }
    if (status === 409) {
      toast.warning(data.error || 'Este comprobante ya fue procesado por otra persona.');
      setRechazoAbierto(false);
      cargar();
      return;
    }
    toast.error(mensajeError(error, porDefecto));
  };

  const mostrarResultado = (data) => {
    (data?.advertencias || []).forEach((mensaje) => toast.warning(mensaje, { autoClose: false }));
    toast.success(data?.mensaje || 'Comprobante procesado.');
  };

  const rechazar = async (datos) => {
    setProcesando(true);
    setErrores({});
    try {
      const { data } = await rechazarComprobante(id, datos);
      setRechazoAbierto(false);
      mostrarResultado(data);
      await irAlSiguiente();
    } catch (error) {
      manejarErrorProceso(error, 'No se pudo rechazar el comprobante.');
    } finally {
      setProcesando(false);
    }
  };

  const pendiente = comprobante?.estatus === 'pendiente';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Link
          to={RUTA_LISTA}
          className="inline-flex w-fit items-center gap-2 rounded-xl px-2 min-h-[40px] text-sm font-medium hover:bg-[var(--ash-light)]"
          style={{ color: 'var(--jet-mid)' }}
        >
          <ArrowLeft size={16} aria-hidden="true" /> Volver a la lista
        </Link>
        <h1 className="text-lg font-semibold sm:text-xl" style={{ color: 'var(--jet)' }}>
          {pendiente ? 'Revisar comprobante' : 'Detalle del comprobante'}
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="lg:sticky lg:top-0">
          {cargando && !comprobante ? (
            <Bone className="h-[55dvh] min-h-[320px] w-full rounded-2xl lg:h-[calc(100dvh-11rem)]" />
          ) : (
            <VisorComprobante key={comprobante?.archivo_url || 'sin-archivo'} archivoUrl={comprobante?.archivo_url} archivoTipo={comprobante?.archivo_tipo} />
          )}
        </div>

        <Card className="min-w-0">
          {cargando || !comprobante ? <EsqueletoPanel /> : (
            <div className="space-y-5">
              <ResumenComprobante comprobante={comprobante} />
              <div className="pt-4" style={{ borderTop: '0.5px solid var(--border)' }}>
                {pendiente ? (
                  <AccionesRevision
                    procesando={procesando}
                    onProcesar={procesarPago}
                    onRechazar={() => setRechazoAbierto(true)}
                  />
                ) : (
                  <RevisionSoloLectura comprobante={comprobante} />
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      {rechazoAbierto && (
      <ModalRechazo
        open
        onClose={() => setRechazoAbierto(false)}
        onConfirmar={rechazar}
        procesando={procesando}
        errores={errores}
      />
      )}
    </div>
  );
};

export default RevisarComprobante;
