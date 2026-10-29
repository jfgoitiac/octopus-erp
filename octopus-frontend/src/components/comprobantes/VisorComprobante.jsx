import { useEffect, useState } from 'react';
import { ExternalLink, FileQuestion, Maximize2, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { toast } from 'react-toastify';
import { Bone } from '../shared/Skeleton';
import { descargarArchivoComprobante } from '../../services/comprobantesRevisionService';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

const BotonHerramienta = ({ titulo, onClick, children, disabled }) => (
  <button
    type="button"
    title={titulo}
    aria-label={titulo}
    onClick={onClick}
    disabled={disabled}
    className="inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-[var(--ash-light)] disabled:opacity-40"
    style={{ color: 'var(--jet)' }}
  >
    {children}
  </button>
);

const inferirTipo = (tipo, blob) => {
  if (tipo === 'imagen' || tipo === 'pdf') return tipo;
  const mime = blob?.type || '';
  if (mime.startsWith('image/')) return 'imagen';
  if (mime === 'application/pdf') return 'pdf';
  return null;
};

/**
 * Visor del archivo del comprobante. La ruta del archivo es protegida, por
 * eso se descarga como blob con apiClient y se muestra vía object URL, que se
 * revoca al desmontar. Montar con key={archivoUrl} para reiniciar al cambiar de archivo.
 */
export default function VisorComprobante({ archivoUrl, archivoTipo }) {
  const [estado, setEstado] = useState({ url: null, tipo: null, cargando: Boolean(archivoUrl), error: false });
  const [zoom, setZoom] = useState(1);
  const [rotacion, setRotacion] = useState(0);
  const [ajustar, setAjustar] = useState(true);

  // El padre monta el visor con key={archivoUrl}: el estado inicial ya
  // corresponde al archivo actual y aquí solo se actualiza tras la descarga.
  useEffect(() => {
    if (!archivoUrl) return undefined;
    const controller = new AbortController();
    let objectUrl = null;
    descargarArchivoComprobante(archivoUrl, controller.signal)
      .then(({ data }) => {
        objectUrl = URL.createObjectURL(data);
        setEstado({ url: objectUrl, tipo: inferirTipo(archivoTipo, data), cargando: false, error: false });
      })
      .catch((error) => {
        if (error?.code === 'ERR_CANCELED') return;
        toast.error('No se pudo cargar el archivo del comprobante.');
        setEstado({ url: null, tipo: null, cargando: false, error: true });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [archivoUrl, archivoTipo]);

  const abrirEnPestana = () => {
    if (estado.url) window.open(estado.url, '_blank', 'noopener,noreferrer');
  };

  const esImagen = estado.tipo === 'imagen';
  const cambiarZoom = (delta) => {
    setAjustar(false);
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + delta) * 100) / 100)));
  };

  return (
    <section
      aria-label="Archivo del comprobante"
      className="flex h-[55dvh] min-h-[320px] flex-col overflow-hidden rounded-2xl lg:h-[calc(100dvh-11rem)]"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5" style={{ borderBottom: '0.5px solid var(--border)' }}>
        <p className="mr-auto px-2 text-sm font-semibold" style={{ color: 'var(--jet)' }}>Comprobante</p>
        {esImagen && (
          <>
            <BotonHerramienta titulo="Alejar" onClick={() => cambiarZoom(-0.25)} disabled={!ajustar && zoom <= ZOOM_MIN}>
              <ZoomOut size={18} aria-hidden="true" />
            </BotonHerramienta>
            <span className="w-12 text-center text-xs tabular-nums" style={{ color: 'var(--ash)' }}>
              {ajustar ? 'Ajust.' : `${Math.round(zoom * 100)}%`}
            </span>
            <BotonHerramienta titulo="Acercar" onClick={() => cambiarZoom(0.25)} disabled={!ajustar && zoom >= ZOOM_MAX}>
              <ZoomIn size={18} aria-hidden="true" />
            </BotonHerramienta>
            <BotonHerramienta titulo="Ajustar a la pantalla" onClick={() => { setAjustar(true); setZoom(1); }}>
              <Maximize2 size={18} aria-hidden="true" />
            </BotonHerramienta>
            <BotonHerramienta titulo="Rotar" onClick={() => setRotacion((r) => (r + 90) % 360)}>
              <RotateCw size={18} aria-hidden="true" />
            </BotonHerramienta>
          </>
        )}
        <BotonHerramienta titulo="Abrir en otra pestaña" onClick={abrirEnPestana} disabled={!estado.url}>
          <ExternalLink size={18} aria-hidden="true" />
        </BotonHerramienta>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto scroll-fino" style={{ background: 'var(--surface-sunken)' }}>
        {estado.cargando && (
          <div className="flex h-full items-center justify-center p-6">
            <Bone className="h-full w-full max-w-md rounded-xl" />
          </div>
        )}

        {!estado.cargando && !estado.url && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <FileQuestion size={32} style={{ color: 'var(--ash)' }} aria-hidden="true" />
            <p className="text-sm" style={{ color: 'var(--ash)' }}>
              {estado.error ? 'No se pudo cargar el archivo.' : 'Este comprobante no tiene archivo adjunto.'}
            </p>
          </div>
        )}

        {estado.url && esImagen && (
          ajustar ? (
            <div className="flex h-full w-full items-center justify-center p-3">
              <img
                src={estado.url}
                alt="Comprobante de pago"
                className="max-h-full max-w-full object-contain transition-transform"
                style={{ transform: `rotate(${rotacion}deg)` }}
              />
            </div>
          ) : (
            <div className="inline-block min-w-full p-3 text-center">
              <img
                src={estado.url}
                alt="Comprobante de pago"
                className="inline-block max-w-none transition-transform"
                style={{ width: `${zoom * 100}%`, transform: `rotate(${rotacion}deg)` }}
              />
            </div>
          )
        )}

        {estado.url && estado.tipo === 'pdf' && (
          <iframe src={estado.url} title="Comprobante en PDF" className="h-full w-full border-0" />
        )}

        {estado.url && !estado.tipo && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm" style={{ color: 'var(--ash)' }}>No se puede previsualizar este tipo de archivo.</p>
            <button
              type="button"
              onClick={abrirEnPestana}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 text-sm font-semibold"
              style={{ border: '0.5px solid var(--pb)', color: 'var(--pb-mid)' }}
            >
              <ExternalLink size={16} aria-hidden="true" /> Abrir archivo
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
