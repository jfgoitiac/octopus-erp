import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { FileText, Loader2, UploadCloud, X } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { parseApiError } from '../../../utils/apiError';
import { subirAdjuntoCierre } from '../api/auditoriaApi';
import { ESTILO_CAMPO, fmtTamano } from './CierreFormato';

const MAX_BYTES = 5 * 1024 * 1024;

// Misma regla que el backend (AdjuntoRevision: imagen o PDF ≤ 5 MB, D6).
const validarArchivo = (archivo) => {
  if (!archivo) return 'Selecciona un archivo.';
  const esImagen = archivo.type.startsWith('image/');
  const esPdf = archivo.type === 'application/pdf' || (!archivo.type && /\.pdf$/i.test(archivo.name));
  if (!esImagen && !esPdf) return 'Solo se aceptan imágenes o PDF.';
  if (archivo.size === 0) return 'El archivo está vacío.';
  if (archivo.size > MAX_BYTES) return `El archivo pesa ${fmtTamano(archivo.size)}; el máximo es 5 MB.`;
  return null;
};

// Uploader de respaldos del cierre con preview. `reemplazaA` (adjunto) activa
// el modo "reemplazar": el original no se borra, el nuevo lo referencia.
export default function AdjuntoSubirModal({ open, cierreId, reemplazaA, onClose, onSubido }) {
  const inputId = useId();
  const inputRef = useRef(null);
  const [archivo, setArchivo] = useState(null);
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);

  const preview = useMemo(
    () => (archivo && archivo.type.startsWith('image/') ? URL.createObjectURL(archivo) : null),
    [archivo],
  );
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const limpiar = () => {
    setArchivo(null);
    setDescripcion('');
    setError(null);
    setArrastrando(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const cerrar = () => {
    if (enviando) return;
    limpiar();
    onClose();
  };

  const elegir = (nuevo) => {
    if (!nuevo) return;
    const problema = validarArchivo(nuevo);
    setError(problema);
    setArchivo(problema ? null : nuevo);
    if (problema && inputRef.current) inputRef.current.value = '';
  };

  const subir = async () => {
    const problema = validarArchivo(archivo);
    if (problema) { setError(problema); return; }
    setEnviando(true);
    try {
      await subirAdjuntoCierre(cierreId, archivo, {
        descripcion: descripcion.trim(),
        reemplaza_a: reemplazaA?.id,
      });
      toast.success(reemplazaA ? 'Adjunto reemplazado.' : 'Adjunto subido.');
      limpiar();
      onSubido?.();
    } catch (err) {
      toast.error(`No se pudo subir el adjunto: ${parseApiError(err)}`);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={cerrar}
      size="md"
      titulo={reemplazaA ? 'Reemplazar adjunto' : 'Subir adjunto'}
      footer={
        <>
          <button
            type="button"
            onClick={cerrar}
            disabled={enviando}
            className="min-h-[44px] px-4 rounded-xl text-sm font-medium w-full sm:w-auto disabled:opacity-50"
            style={{ background: '#fff', border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={subir}
            disabled={enviando || !archivo}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-sm font-semibold w-full sm:w-auto disabled:opacity-50"
            style={{ background: 'var(--pb)', color: '#fff' }}
          >
            {enviando ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <UploadCloud size={16} aria-hidden="true" />}
            {reemplazaA ? 'Reemplazar' : 'Subir'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {reemplazaA && (
          <p className="text-sm rounded-xl p-3" style={{ background: 'var(--yellow-light)', color: 'var(--amber-ink)' }}>
            El archivo <strong className="break-all">{reemplazaA.nombre}</strong> se conserva en el historial; el nuevo quedará como su reemplazo.
          </p>
        )}

        {archivo ? (
          <div className="flex flex-col gap-2 rounded-2xl p-3" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
            {preview ? (
              <img src={preview} alt={`Vista previa de ${archivo.name}`} className="w-full max-h-64 object-contain rounded-xl" style={{ background: '#fff' }} />
            ) : (
              <div className="flex items-center justify-center h-32 rounded-xl" style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                <FileText size={40} aria-hidden="true" />
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--jet)' }}>{archivo.name}</p>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>{fmtTamano(archivo.size)}</p>
              </div>
              <button
                type="button"
                onClick={limpiar}
                disabled={enviando}
                aria-label="Quitar archivo seleccionado"
                className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl hover:bg-[var(--jet-light)]"
                style={{ color: 'var(--jet-mid)' }}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          <label
            htmlFor={inputId}
            onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastrando(false); elegir(e.dataTransfer.files?.[0]); }}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-colors"
            style={{
              border: `1.5px dashed ${error ? 'var(--red)' : arrastrando ? 'var(--pb)' : 'var(--border-md)'}`,
              background: arrastrando ? 'var(--pb-light)' : 'var(--porcelain)',
            }}
          >
            <UploadCloud size={32} aria-hidden="true" style={{ color: 'var(--pb-mid)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Toca para elegir un archivo</span>
            <span className="text-xs" style={{ color: 'var(--ash)' }}>Imagen o PDF, máximo 5 MB</span>
          </label>
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*,application/pdf"
          className="sr-only"
          onChange={(e) => elegir(e.target.files?.[0])}
        />
        {error && <p className="text-xs -mt-2" role="alert" style={{ color: 'var(--red)' }}>{error}</p>}

        <div>
          <label htmlFor={`${inputId}-desc`} className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Descripción (opcional)
          </label>
          <input
            id={`${inputId}-desc`}
            type="text"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            maxLength={255}
            placeholder="Ej.: Acta firmada por la cajera"
            className="w-full px-3 py-2 rounded-xl text-sm outline-none min-h-[44px] focus:ring-2 focus:ring-[var(--pb)]"
            style={ESTILO_CAMPO}
          />
        </div>
      </div>
    </Modal>
  );
}
