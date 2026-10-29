import { useState, useEffect, useCallback, useMemo } from 'react';
import { Upload, X, FileText, CheckCircle, AlertCircle, Camera, Landmark, Info } from 'lucide-react';
import { toast } from 'react-toastify';
import { subirComprobante, getMetodosPago } from '../api/portal.service';
import { Modal } from '../../components/ui/Modal';
import { fmtMonto, montoEnBs } from '../utils/montos';
import { textoVencimiento } from '../utils/fechas';

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 10 * 1024 * 1024;
const ETIQUETAS_DATOS = { titular: 'Titular', identificacion: 'Cédula / RIF', numero_cuenta: 'Número de cuenta', telefono: 'Teléfono', correo: 'Correo Zelle', instrucciones: 'Indicaciones' };

const montoDe = (m) => m.monto_total ?? m.monto_usd;

const Paso = ({ numero, titulo, children }) => (
  <section className="space-y-2" aria-labelledby={`paso-pago-${numero}`}>
    <h3 id={`paso-pago-${numero}`} className="flex items-center gap-2 text-sm font-semibold text-[var(--jet)]">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--portal-primary)] text-xs font-bold text-white" aria-hidden="true">{numero}</span>
      {titulo}
    </h3>
    {children}
  </section>
);

/**
 * Reporte de un pago hecho por transferencia, pago móvil, Zelle o punto de
 * venta. El representante elige qué mensualidad paga (cualquiera pendiente,
 * vencida o próxima, de cualquiera de sus hijos) y adjunta el comprobante.
 * Nada más: la referencia, el banco, el método, la fecha y el monto los llena
 * el colegio al revisarlo, para evitar errores de tipeo. Los datos bancarios
 * del colegio se muestran solo como guía de a dónde transferir. Las mensualidades con un comprobante aún en revisión no se
 * pueden elegir: el backend rechazaría un segundo envío (409).
 *
 * Props:
 *   opciones: mensualidades pendientes ({ id, mes_nombre, anio, alumno_nombre, ... })
 *   mensualidadInicialId: la que se preselecciona (la del botón "Pagar" pulsado)
 *   comprobantePorMensualidad: { [mensualidadId]: último comprobante }
 */
const ComprobantePagoModal = ({
  isOpen, onClose, opciones = [], mensualidadInicialId = null,
  comprobantePorMensualidad = {}, onSuccess, tasaBcv = null, variosAlumnos = false,
}) => {
  const [seleccionadaId, setSeleccionadaId] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [estado, setEstado] = useState('idle');
  const [metodos, setMetodos] = useState([]);
  // Solo informativo: qué datos bancarios del colegio se están viendo.
  const [metodoVistoId, setMetodoVistoId] = useState(null);

  const enRevision = useCallback(
    (id) => comprobantePorMensualidad[id]?.estatus === 'pendiente',
    [comprobantePorMensualidad]
  );
  const disponibles = useMemo(() => opciones.filter((m) => !enRevision(m.id)), [opciones, enRevision]);

  // La elección del usuario manda; si no eligió (o eligió una que ya no está
  // disponible) se usa la del botón pulsado y, en su defecto, la primera.
  const seleccionId = (disponibles.some((m) => m.id === seleccionadaId) && seleccionadaId)
    || (disponibles.find((m) => m.id === mensualidadInicialId) || disponibles[0])?.id
    || null;

  useEffect(() => {
    if (!isOpen) return;
    getMetodosPago().then((res) => setMetodos(res.data || [])).catch(() => setMetodos([]));
  }, [isOpen]);

  // Libera la URL temporal de la vista previa al cambiar de archivo o cerrar.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const quitarArchivo = () => { setArchivo(null); setPreview(null); setEstado('idle'); };

  const cerrar = useCallback(() => {
    setArchivo(null); setPreview(null); setEstado('idle'); setMetodoVistoId(null); setSeleccionadaId(null);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  if (disponibles.length === 0) {
    return (
      <Modal open onClose={cerrar} size="sm" titulo="Reportar un pago">
        {opciones.length > 0 ? (
          <div role="status" className="flex items-start gap-3 rounded-xl bg-[var(--yellow-light)] px-4 py-3 text-sm text-[var(--jet-mid)]">
            <CheckCircle size={18} className="mt-0.5 shrink-0 text-[var(--yellow)]" aria-hidden="true" />
            <span>Ya enviaste comprobantes para todas tus mensualidades pendientes. El colegio los está revisando; no hace falta enviarlos de nuevo.</span>
          </div>
        ) : (
          <p className="text-sm text-[var(--jet-mid)]">No tienes mensualidades pendientes por pagar. Si debes otro concepto (inscripción o proyecto de inversión), coordina el pago con administración.</p>
        )}
      </Modal>
    );
  }

  const seleccionada = opciones.find((m) => m.id === seleccionId) || null;
  const metodoVisto = metodos.find((m) => m.id === metodoVistoId) || metodos[0] || null;
  const listo = Boolean(seleccionada && archivo);

  const seleccionarArchivo = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!TIPOS_PERMITIDOS.includes(file.type)) { toast.error('Formato no permitido. Solo JPG, PNG, WEBP o PDF.'); event.target.value = ''; return; }
    if (file.size > MAX_BYTES) { toast.error('El archivo supera el límite de 10 MB.'); event.target.value = ''; return; }
    setArchivo(file);
    setEstado('idle');
    setPreview(file.type === 'application/pdf' ? null : URL.createObjectURL(file));
  };

  const enviar = async () => {
    if (!listo) return;
    setEstado('uploading');
    try {
      await subirComprobante(seleccionada.id, archivo);
      toast.success('Comprobante enviado. El colegio lo revisará y verás aquí su estado.');
      onSuccess?.();
      cerrar();
    } catch (err) {
      setEstado('error');
      toast.error(err?.response?.data?.error || 'No se pudo enviar el comprobante. Intenta nuevamente.');
    }
  };

  // Indica qué falta para habilitar el envío, en vez de un botón gris mudo.
  const faltante = !archivo ? 'Adjunta la foto o el PDF del comprobante.' : null;

  const footer = (
    <div className="space-y-2">
      {faltante && <p className="text-center text-xs text-[var(--ash)]">{faltante}</p>}
      <button
        type="button"
        onClick={enviar}
        disabled={!listo || estado === 'uploading'}
        className="w-full bg-[var(--portal-primary)] text-white font-semibold py-3 rounded-xl min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {estado === 'uploading'
          ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" aria-hidden="true" />Enviando…</>
          : <><Upload size={16} aria-hidden="true" />Enviar comprobante</>}
      </button>
    </div>
  );

  return (
    <Modal open onClose={cerrar} size="sm" titulo="Reportar un pago" footer={footer}>
      <div className="space-y-5">
        <Paso numero={1} titulo="¿Qué estás pagando?">
          <div className="space-y-2" role="radiogroup" aria-labelledby="paso-pago-1">
            {opciones.map((m) => {
              const bloqueada = enRevision(m.id);
              const activa = m.id === seleccionId;
              const ultimo = comprobantePorMensualidad[m.id];
              const rechazo = ultimo?.estatus === 'rechazado' ? ultimo : null;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={activa}
                  disabled={bloqueada}
                  onClick={() => setSeleccionadaId(m.id)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left min-h-[44px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${activa ? 'border-[var(--portal-primary)] bg-[var(--portal-primary)]/10' : 'border-[var(--border)] bg-[var(--surface)]'}`}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--jet)]">{m.mes_nombre} {m.anio}</span>
                      {variosAlumnos && m.alumno_nombre && <span className="block truncate text-xs text-[var(--jet-mid)]">{m.alumno_nombre}</span>}
                      <span className={`block text-xs ${!bloqueada && Number(m.dias_mora) > 0 ? 'text-[var(--red)]' : 'text-[var(--ash)]'}`}>
                        {bloqueada ? 'Comprobante en revisión' : textoVencimiento(m)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold text-[var(--jet)] whitespace-nowrap">REF. {fmtMonto(montoDe(m))}</span>
                      {tasaBcv && <span className="block text-xs text-[var(--ash)] whitespace-nowrap">Bs. {fmtMonto(montoEnBs(montoDe(m), tasaBcv))}</span>}
                    </span>
                  </span>
                  {rechazo && (
                    <span className="mt-1.5 block whitespace-pre-line break-words rounded-lg bg-[var(--red-light)] px-2 py-1 text-xs text-[var(--red)]">
                      Tu comprobante anterior fue rechazado{rechazo.observaciones ? `: ${rechazo.observaciones}` : '.'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[var(--ash)]">Envía un comprobante por mensualidad. Si pagaste varias en una sola transferencia, avisa a administración.</p>
        </Paso>

        <Paso numero={2} titulo="¿A dónde transferir?">
          {metodos.length === 0 ? (
            <p className="text-xs rounded-xl bg-[var(--yellow-light)] text-[var(--jet-mid)] px-3 py-2.5">No hay datos bancarios configurados. Consulta a administración a qué cuenta pagar.</p>
          ) : (
            <>
              {metodos.length > 1 && (
                <div className="flex flex-wrap gap-2" role="tablist" aria-label="Formas de pago del colegio">
                  {metodos.map((metodo) => {
                    const activo = metodoVisto?.id === metodo.id;
                    return (
                      <button
                        key={metodo.id}
                        type="button"
                        role="tab"
                        aria-selected={activo}
                        onClick={() => setMetodoVistoId(metodo.id)}
                        className={`rounded-full border px-3 py-2 text-xs font-semibold min-h-[44px] transition-colors ${activo ? 'border-[var(--portal-primary)] bg-[var(--portal-primary)]/10 text-[var(--jet)]' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--jet-mid)]'}`}
                      >
                        {metodo.nombre}
                      </button>
                    );
                  })}
                </div>
              )}
              {metodoVisto && (
                <div className="rounded-xl bg-[var(--surface-sunken)] p-3 space-y-1.5" role={metodos.length > 1 ? 'tabpanel' : undefined}>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--jet-mid)]">
                    <Landmark size={14} className="shrink-0 text-[var(--portal-primary)]" aria-hidden="true" />
                    <span className="min-w-0 break-words">{metodoVisto.nombre}{metodoVisto.banco ? ` · ${metodoVisto.banco}` : ''}</span>
                  </p>
                  {Object.entries(metodoVisto.datos || {}).filter(([, valor]) => valor).map(([campo, valor]) => (
                    <p key={campo} className="text-xs text-[var(--jet-mid)] break-words"><span className="text-[var(--ash)]">{ETIQUETAS_DATOS[campo] || campo}:</span> {valor}</p>
                  ))}
                </div>
              )}
            </>
          )}
        </Paso>

        <Paso numero={3} titulo="Adjunta el comprobante">
          <p className="flex items-start gap-2 text-xs text-[var(--jet-mid)]">
            <Info size={14} className="mt-0.5 shrink-0 text-[var(--portal-primary)]" aria-hidden="true" />
            <span>Sube la captura o PDF de tu pago. El colegio verificará los datos.</span>
          </p>
          {!archivo ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-[var(--border)] cursor-pointer hover:border-[var(--portal-primary)] focus-within:border-[var(--portal-primary)] min-h-[90px]">
                <Camera size={26} className="text-[var(--portal-primary)]" aria-hidden="true" />
                <span className="text-sm font-medium text-[var(--jet-mid)]">Tomar foto</span>
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={seleccionarArchivo} />
              </label>
              <label className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-[var(--border)] cursor-pointer hover:border-[var(--portal-primary)] focus-within:border-[var(--portal-primary)] min-h-[90px]">
                <Upload size={26} className="text-[var(--ash)]" aria-hidden="true" />
                <span className="text-sm font-medium text-[var(--jet-mid)]">Subir imagen o PDF</span>
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={seleccionarArchivo} />
              </label>
            </div>
          ) : (
            <div className="relative">
              {preview ? (
                <img src={preview} alt="Vista previa del comprobante" className="w-full max-h-48 rounded-2xl object-contain bg-[var(--surface-sunken)]" />
              ) : (
                <div className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-[var(--surface-sunken)] text-[var(--portal-primary)]">
                  <FileText size={40} aria-hidden="true" />
                  <span className="text-sm text-[var(--jet-mid)] break-all">{archivo.name}</span>
                </div>
              )}
              <button type="button" onClick={quitarArchivo} className="absolute top-1 right-1 w-11 h-11 bg-black/50 rounded-full flex items-center justify-center" aria-label="Quitar archivo">
                <X size={14} className="text-white" aria-hidden="true" />
              </button>
            </div>
          )}
          <p className="text-xs text-[var(--ash)]">JPG, PNG, WEBP o PDF de hasta 10 MB.</p>
        </Paso>

        {estado === 'error' && (
          <div role="alert" className="flex items-center gap-2 bg-[var(--red-light)] text-[var(--red)] rounded-xl px-4 py-3 text-sm">
            <AlertCircle size={18} aria-hidden="true" /><span>No se pudo enviar. Revisa el archivo e intenta nuevamente.</span>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ComprobantePagoModal;
