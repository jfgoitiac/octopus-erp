import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Image, Search, Upload, Trash2, Loader2, Save } from 'lucide-react';
import { getMedia, subirMedia, deleteMedia, updateMedia } from '../../api/sitio.service';
import Pagination from '../shared/Pagination';
import ConfirmDeleteModal from '../ConfirmDeleteModal';
import { Modal } from '../ui/Modal';

const PAGE_SIZE = 20;
const MAX_MB = 15;
const MIME_WHITELIST = ['image/jpeg', 'image/png', 'image/webp'];

const formatBytes = (bytes) => {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`;
};

const SkeletonTile = () => (
  <div className="aspect-square rounded-lg animate-pulse" style={{ background: 'var(--ash-light)' }} />
);

/**
 * Biblioteca de medios: grid con preview, búsqueda por alt_text, subida
 * (mismo patrón de validación 15MB / MIME whitelist que portal/views.py) y
 * eliminación.
 *
 * Si se recibe `onSeleccionar`, funciona en "modo selector" para el editor
 * visual (clic en un item devuelve el media a quien la use).
 */
const BibliotecaMedia = ({ onSeleccionar = null }) => {
  const [media, setMedia] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [aEliminar, setAEliminar] = useState(null);
  const [preview, setPreview] = useState(null);
  const [altTextEditando, setAltTextEditando] = useState('');
  const [guardandoAlt, setGuardandoAlt] = useState(false);
  const inputRef = useRef(null);

  const fetchMedia = useCallback(async (signal) => {
    setLoading(true);
    try {
      const res = await getMedia({ page, search: search || undefined }, signal);
      setMedia(res.data.results);
      setCount(res.data.count);
    } catch (err) {
      if (err?.code !== 'ERR_CANCELED') {
        toast.error(err?.response?.data?.detail || 'No se pudo cargar la biblioteca de medios.');
      }
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    const controller = new AbortController();
    fetchMedia(controller.signal);
    return () => controller.abort();
  }, [fetchMedia]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!MIME_WHITELIST.includes(file.type)) {
      toast.error('Formato no permitido. Solo JPG, PNG o WEBP.');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`El archivo supera el límite de ${MAX_MB}MB.`);
      return;
    }

    setSubiendo(true);
    try {
      // Auditoría (Fase 0): antes se rellenaba alt_text con el nombre crudo
      // del archivo ("03.png"), inútil para lectores de pantalla. Se deja en
      // blanco y se sugiere completarlo — no bloquea la subida.
      await subirMedia(file);
      toast.success('Imagen subida correctamente.');
      toast.info('Tip: hacé clic en la imagen para agregarle una descripción (mejora accesibilidad y SEO).', { autoClose: 6000 });
      setPage(1);
      fetchMedia();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo subir la imagen.');
    } finally {
      setSubiendo(false);
    }
  };

  const handleGuardarAltText = async () => {
    if (!preview) return;
    setGuardandoAlt(true);
    try {
      const res = await updateMedia(preview.id, { alt_text: altTextEditando.trim() });
      setPreview(res.data);
      setMedia((prev) => prev.map((m) => (m.id === res.data.id ? res.data : m)));
      toast.success('Descripción actualizada.');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo guardar la descripción.');
    } finally {
      setGuardandoAlt(false);
    }
  };

  const handleEliminar = async () => {
    if (!aEliminar) return;
    try {
      await deleteMedia(aEliminar.id);
      toast.success('Imagen eliminada.');
      setAEliminar(null);
      fetchMedia();
    } catch (err) {
      // 409: referenciada en alguna Seccion.contenido o Articulo.imagen_destacada
      if (err?.response?.status === 409) {
        toast.error(err?.response?.data?.detail || 'No se puede eliminar: la imagen está en uso.');
      } else {
        toast.error(err?.response?.data?.detail || 'No se pudo eliminar la imagen.');
      }
    }
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
      {/* Toolbar */}
      <div className="px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            placeholder="Buscar por descripción..."
            className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
          />
        </div>
        <div>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={subiendo}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white whitespace-nowrap disabled:opacity-60"
            style={{ background: 'var(--pb)' }}
          >
            {subiendo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Subir Imagen
          </button>
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[...Array(12)].map((_, i) => <SkeletonTile key={i} />)}
          </div>
        ) : media.length === 0 ? (
          <div className="flex flex-col items-center py-14" style={{ color: 'var(--ash)' }}>
            <Image size={30} className="mb-2 opacity-20" />
            <p className="text-sm">No hay imágenes en la biblioteca.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {media.map((m) => (
              <div
                key={m.id}
                className="group relative aspect-square rounded-lg overflow-hidden cursor-pointer"
                style={{ border: '0.5px solid var(--border-md)' }}
                onClick={() => {
                  if (onSeleccionar) { onSeleccionar(m); return; }
                  setPreview(m);
                  setAltTextEditando(m.alt_text || '');
                }}
              >
                <img src={m.variantes?.thumb} alt={m.alt_text} className="w-full h-full object-cover" loading="lazy" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1.5" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.55) 100%)' }}>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setAEliminar(m); }}
                      className="p-1 rounded-md"
                      style={{ background: 'rgba(255,255,255,0.9)', color: 'var(--red)' }}
                      title="Eliminar"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <p className="text-[10px] text-white truncate">{m.alt_text || 'Sin descripción'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Pagination
        page={page}
        totalPages={Math.ceil(count / PAGE_SIZE)}
        total={count}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      {preview && (
        <Modal open onClose={() => setPreview(null)} titulo="Detalle de imagen" size="lg">
          <div className="-m-6 mb-4">
            <img src={preview.variantes?.md || preview.variantes?.original} alt={preview.alt_text} className="w-full max-h-[70vh] object-contain" />
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>
              Descripción (alt text — accesibilidad y SEO)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={altTextEditando}
                onChange={(e) => setAltTextEditando(e.target.value)}
                maxLength={200}
                placeholder="Ej. Estudiantes en el patio del colegio"
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
              />
              <button
                type="button"
                onClick={handleGuardarAltText}
                disabled={guardandoAlt || altTextEditando === (preview.alt_text || '')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--pb)' }}
              >
                {guardandoAlt ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Guardar
              </button>
            </div>
          </div>
          <div className="mt-3 pt-3 text-xs flex gap-4" style={{ color: 'var(--ash)', borderTop: '0.5px solid var(--border-md)' }}>
            <span>{preview.ancho_original}×{preview.alto_original}px</span>
            <span>{formatBytes(preview.peso_bytes)}</span>
          </div>
        </Modal>
      )}

      {aEliminar && (
        <ConfirmDeleteModal
          titulo="Eliminar imagen"
          nombre={aEliminar.alt_text || 'esta imagen'}
          onCancel={() => setAEliminar(null)}
          onConfirm={handleEliminar}
        />
      )}
    </div>
  );
};

export default BibliotecaMedia;
