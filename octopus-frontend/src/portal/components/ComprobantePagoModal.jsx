import { useState, useEffect, useCallback, useMemo } from 'react';
import { Upload, X, FileText, CheckCircle, AlertCircle, Camera, Landmark, Info } from 'lucide-react';
import { toast } from 'react-toastify';
import { subirComprobante, getMetodosPago } from '../api/portal.service';
import { Modal } from '../../components/ui/Modal';
import { fmtMonto, montoEnBs } from '../utils/montos';
import GrupoMensualidadesVencidas from './GrupoMensualidadesVencidas';

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
 * venta. El representante elige una o varias mensualidades vencidas, incluso
 * de distintos hijos, y adjunta un único comprobante.
 * Nada más: la referencia, el banco, el método, la fecha y el monto los llena
 * el colegio al revisarlo, para evitar errores de tipeo. Los datos bancarios
 * del colegio se muestran solo como guía de a dónde transferir. Las mensualidades con un comprobante aún en revisión no se
 * pueden elegir: el backend rechazaría un segundo envío (409).
 *
 * Props:
 *   opciones: mensualidades vencidas ({ id, mes_nombre, anio, alumno_nombre, ... })
 *   mensualidadesInicialesIds: las que se preseleccionan desde el dashboard
 *   comprobantePorMensualidad: { [mensualidadId]: último comprobante }
 */
const ComprobantePagoModal = ({
  isOpen, onClose, opciones = [], mensualidadesInicialesIds = [],
  comprobantePorMensualidad = {}, onSuccess, tasaBcv = null, variosAlumnos = false,
}) => {
  const [seleccionadasIds, setSeleccionadasIds] = useState(() => mensualidadesInicialesIds);
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
  const disponibles = useMemo(() => opciones.filter(
    (mensualidad) => !enRevision(mensualidad.id),
  ), [opciones, enRevision]);
  const disponiblesIds = useMemo(() => new Set(disponibles.map((m) => m.id)), [disponibles]);
  const seleccionadasSet = useMemo(() => new Set(
    seleccionadasIds.filter((id) => disponiblesIds.has(id)),
  ), [seleccionadasIds, disponiblesIds]);
  const seleccionadas = useMemo(() => disponibles.filter(
    (mensualidad) => seleccionadasSet.has(mensualidad.id),
  ), [disponibles, seleccionadasSet]);
  const grupos = useMemo(() => {
    const mapa = new Map();
    disponibles.forEach((mensualidad) => {
      const clave = `${mensualidad.anio}-${String(mensualidad.mes).padStart(2, '0')}`;
      if (!mapa.has(clave)) {
        mapa.set(clave, { titulo: `${mensualidad.mes_nombre} ${mensualidad.anio}`, mensualidades: [] });
      }
      mapa.get(clave).mensualidades.push(mensualidad);
    });
    return [...mapa.values()];
  }, [disponibles]);

  useEffect(() => {
    if (!isOpen) return;
    getMetodosPago().then((res) => setMetodos(res.data || [])).catch(() => setMetodos([]));
  }, [isOpen]);

  // Libera la URL temporal de la vista previa al cambiar de archivo o cerrar.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const quitarArchivo = () => { setArchivo(null); setPreview(null); setEstado('idle'); };

  const cerrar = useCallback(() => {
    setArchivo(null); setPreview(null); setEstado('idle'); setMetodoVistoId(null); setSeleccionadasIds([]);
    onClose();
  }, [onClose]);

  const cambiarSeleccion = useCallback((mensualidadId) => {
    setSeleccionadasIds((actuales) => (
      actuales.includes(mensualidadId)
        ? actuales.filter((id) => id !== mensualidadId)
        : [...actuales, mensualidadId]
    ));
  }, []);

  const cambiarGrupo = useCallback((mensualidades, seleccionar) => {
    const idsGrupo = mensualidades.map((mensualidad) => mensualidad.id);
    setSeleccionadasIds((actuales) => {
      const siguiente = new Set(actuales);
      idsGrupo.forEach((id) => seleccionar ? siguiente.add(id) : siguiente.delete(id));
      if (siguiente.size > 24) {
        toast.warning('Puedes incluir hasta 24 mensualidades por comprobante.');
        return actuales;
      }
      return [...siguiente];
    });
  }, []);

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

  const metodoVisto = metodos.find((m) => m.id === metodoVistoId) || metodos[0] || null;
  const montoTotal = seleccionadas.reduce((total, mensualidad) => total + Number(montoDe(mensualidad) || 0), 0);
  const listo = Boolean(seleccionadas.length && archivo);

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
      await subirComprobante(seleccionadas.map((mensualidad) => mensualidad.id), archivo);
      toast.success(`Comprobante enviado para ${seleccionadas.length} mensualidad${seleccionadas.length === 1 ? '' : 'es'}. El colegio lo revisará.`);
      onSuccess?.();
      cerrar();
    } catch (err) {
      setEstado('error');
      toast.error(err?.response?.data?.error || 'No se pudo enviar el comprobante. Intenta nuevamente.');
    }
  };

  // Indica qué falta para habilitar el envío, en vez de un botón gris mudo.
  const faltante = seleccionadas.length === 0
    ? 'Selecciona al menos una mensualidad vencida.'
    : !archivo ? 'Adjunta la foto o el PDF del comprobante.' : null;

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
          : <><Upload size={16} aria-hidden="true" />Enviar comprobante{seleccionadas.length > 1 ? ` (${seleccionadas.length})` : ''}</>}
      </button>
    </div>
  );

  return (
    <Modal open onClose={cerrar} size="sm" titulo="Reportar un pago" footer={footer}>
      <div className="space-y-5">
        <Paso numero={1} titulo="¿Qué estás pagando?">
          <div className="space-y-3" aria-labelledby="paso-pago-1">
            {grupos.map((grupo) => (
              <GrupoMensualidadesVencidas
                key={grupo.titulo}
                titulo={grupo.titulo}
                mensualidades={grupo.mensualidades}
                seleccionadas={seleccionadasSet}
                onToggle={cambiarSeleccion}
                onToggleGrupo={cambiarGrupo}
                tasaBcv={tasaBcv}
                variosAlumnos={variosAlumnos}
                comprobantePorMensualidad={comprobantePorMensualidad}
              />
            ))}
          </div>
          <div className="rounded-xl bg-[var(--portal-canvas)] px-3 py-3" aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-[var(--portal-ink)]">
                {seleccionadas.length} mensualidad{seleccionadas.length === 1 ? '' : 'es'}
              </span>
              <span className="text-right">
                <span className="block whitespace-nowrap text-sm font-bold text-[var(--portal-ink)]">REF. {fmtMonto(montoTotal)}</span>
                {tasaBcv && <span className="block whitespace-nowrap text-xs text-[var(--portal-muted)]">Bs. {fmtMonto(montoEnBs(montoTotal, tasaBcv))}</span>}
              </span>
            </div>
          </div>
          <p className="text-xs text-[var(--portal-muted)]">Esto no realiza el pago. Solo envía al colegio el comprobante de una transferencia que ya hiciste.</p>
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
