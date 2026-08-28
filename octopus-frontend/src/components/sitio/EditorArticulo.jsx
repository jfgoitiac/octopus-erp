import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import {
  PenSquare, Loader2, Save, Globe, Image as ImageIcon, X,
  Bold, Italic, Heading, List, ListOrdered, Quote, Link as LinkIcon, Code,
} from 'lucide-react';
import {
  createArticulo, updateArticulo, publicarArticulo, getCategorias,
} from '../../api/sitio.service';
import BibliotecaMedia from './BibliotecaMedia';
import { Modal } from '../ui/Modal';

const ESTADO_STYLE = {
  publicado: { background: '#dcfce7', color: '#16a34a' },
  borrador: { background: 'var(--ash-light)', color: 'var(--ash)' },
};

const slugify = (texto = '') =>
  texto
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const fieldLabel = 'block text-[11px] uppercase tracking-widest mb-1.5';
const fieldInput = 'w-full px-3 py-2 rounded-lg text-sm outline-none';
const fieldStyle = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };

/**
 * Editor de Artículo (rich text con Tiptap).
 *
 * Props:
 * - `articulo`: objeto Articulo a editar, o null si es uno nuevo.
 * - `onGuardado()`: callback tras guardar/crear/publicar con éxito.
 * - `onCancelar()`: cierra el editor sin guardar.
 */
const EditorArticulo = ({ articulo = null, onGuardado = () => {}, onCancelar = () => {} }) => {
  const [titulo, setTitulo] = useState(articulo?.titulo || '');
  const [slug, setSlug] = useState(articulo?.slug || '');
  const [slugTocado, setSlugTocado] = useState(Boolean(articulo?.slug));
  const [resumen, setResumen] = useState(articulo?.resumen || '');
  const [categoria, setCategoria] = useState(articulo?.categoria?.id ?? articulo?.categoria ?? '');
  const [categorias, setCategorias] = useState([]);
  const [seoTitulo, setSeoTitulo] = useState(articulo?.seo_titulo || '');
  const [seoDescripcion, setSeoDescripcion] = useState(articulo?.seo_descripcion || '');
  const [imagenDestacada, setImagenDestacada] = useState(
    articulo?.imagen_destacada_data || articulo?.imagen_destacada_expandida || null,
  );
  const [imagenId, setImagenId] = useState(
    articulo?.imagen_destacada_data?.id ?? articulo?.imagen_destacada ?? null,
  );
  const [selectorMediaAbierto, setSelectorMediaAbierto] = useState(false);
  const [insertarImagenAbierto, setInsertarImagenAbierto] = useState(false);
  const [guardandoBorrador, setGuardandoBorrador] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [articuloId, setArticuloId] = useState(articulo?.id ?? null);
  const [estadoActual, setEstadoActual] = useState(articulo?.estado || 'borrador');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
    ],
    content: articulo?.cuerpo || '',
  });

  useEffect(() => {
    getCategorias()
      .then((res) => setCategorias(res.data))
      .catch(() => toast.error('No se pudieron cargar las categorías.'));
  }, []);

  useEffect(() => {
    if (!slugTocado) setSlug(slugify(titulo));
  }, [titulo, slugTocado]);

  const handleSlugChange = (e) => {
    setSlugTocado(true);
    setSlug(slugify(e.target.value));
  };

  const handleSeleccionarDestacada = (media) => {
    setImagenDestacada(media);
    setImagenId(media.id);
    setSelectorMediaAbierto(false);
  };

  const handleInsertarImagenCuerpo = (media) => {
    const url = media.variantes?.md || media.variantes?.lg || media.variantes?.original;
    if (url) {
      editor?.chain().focus().setImage({ src: url, alt: media.alt_text || '' }).run();
    }
    setInsertarImagenAbierto(false);
  };

  const handleLink = () => {
    const previa = editor?.getAttributes('link')?.href || '';
    const url = window.prompt('URL del enlace:', previa);
    if (url === null) return;
    if (url === '') {
      editor?.chain().focus().unsetLink().run();
      return;
    }
    editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const buildPayload = () => ({
    titulo,
    slug,
    resumen,
    cuerpo: editor?.getHTML() || '',
    imagen_destacada: imagenId || null,
    categoria: categoria || null,
    seo_titulo: seoTitulo,
    seo_descripcion: seoDescripcion,
  });

  const validar = () => {
    if (!titulo.trim()) {
      toast.error('El título es obligatorio.');
      return false;
    }
    if (!resumen.trim()) {
      toast.error('El resumen es obligatorio.');
      return false;
    }
    return true;
  };

  const guardar = async () => {
    if (!validar()) return null;
    const payload = buildPayload();
    if (articuloId) {
      const res = await updateArticulo(articuloId, payload);
      return res.data;
    }
    const res = await createArticulo(payload);
    setArticuloId(res.data.id);
    return res.data;
  };

  const handleGuardarBorrador = async () => {
    setGuardandoBorrador(true);
    try {
      const data = await guardar();
      if (!data) return;
      setEstadoActual(data.estado || 'borrador');
      toast.success('Artículo guardado como borrador.');
      onGuardado();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo guardar el artículo.');
    } finally {
      setGuardandoBorrador(false);
    }
  };

  const handlePublicar = async () => {
    setPublicando(true);
    try {
      const data = await guardar();
      if (!data) return;
      const id = data.id ?? articuloId;
      await publicarArticulo(id);
      setEstadoActual('publicado');
      toast.success('Artículo publicado.');
      onGuardado();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo publicar el artículo.');
    } finally {
      setPublicando(false);
    }
  };

  const guardando = guardandoBorrador || publicando;

  const toolbarBtns = useMemo(() => {
    if (!editor) return [];
    return [
      { icon: Bold, label: 'Negrita', activo: editor.isActive('bold'), onClick: () => editor.chain().focus().toggleBold().run() },
      { icon: Italic, label: 'Cursiva', activo: editor.isActive('italic'), onClick: () => editor.chain().focus().toggleItalic().run() },
      { icon: Heading, label: 'Título', activo: editor.isActive('heading', { level: 2 }), onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
      { icon: List, label: 'Lista', activo: editor.isActive('bulletList'), onClick: () => editor.chain().focus().toggleBulletList().run() },
      { icon: ListOrdered, label: 'Lista numerada', activo: editor.isActive('orderedList'), onClick: () => editor.chain().focus().toggleOrderedList().run() },
      { icon: Quote, label: 'Cita', activo: editor.isActive('blockquote'), onClick: () => editor.chain().focus().toggleBlockquote().run() },
      { icon: Code, label: 'Código', activo: editor.isActive('codeBlock'), onClick: () => editor.chain().focus().toggleCodeBlock().run() },
      { icon: LinkIcon, label: 'Enlace', activo: editor.isActive('link'), onClick: handleLink },
      { icon: ImageIcon, label: 'Imagen', activo: false, onClick: () => setInsertarImagenAbierto(true) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
      <div className="px-5 py-3.5 flex items-center justify-between gap-3" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg" style={{ background: 'var(--pb-light)' }}>
            <PenSquare size={15} style={{ color: 'var(--pb)' }} />
          </div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>
            {articulo ? 'Editar artículo' : 'Nuevo artículo'}
          </h3>
        </div>
        {articulo && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider" style={ESTADO_STYLE[estadoActual] || ESTADO_STYLE.borrador}>
            {estadoActual}
          </span>
        )}
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={fieldLabel} style={{ color: 'var(--ash)' }}>Título</label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Título del artículo"
              className={fieldInput}
              style={fieldStyle}
            />
          </div>
          <div>
            <label className={fieldLabel} style={{ color: 'var(--ash)' }}>Slug</label>
            <input
              type="text"
              value={slug}
              onChange={handleSlugChange}
              placeholder="url-del-articulo"
              className={`${fieldInput} font-mono`}
              style={fieldStyle}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={fieldLabel} style={{ color: 'var(--ash)', margin: 0 }}>Resumen</label>
            <span className="text-[11px]" style={{ color: 'var(--ash)' }}>{resumen.length}/300</span>
          </div>
          <textarea
            value={resumen}
            onChange={(e) => setResumen(e.target.value.slice(0, 300))}
            maxLength={300}
            rows={2}
            placeholder="Resumen breve para las tarjetas del listado"
            className={`${fieldInput} resize-none`}
            style={fieldStyle}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={fieldLabel} style={{ color: 'var(--ash)' }}>Categoría</label>
            <select
              value={categoria || ''}
              onChange={(e) => setCategoria(e.target.value)}
              className={fieldInput}
              style={fieldStyle}
            >
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={fieldLabel} style={{ color: 'var(--ash)' }}>Imagen destacada</label>
            {imagenDestacada ? (
              <div className="flex items-center gap-2">
                <img
                  src={imagenDestacada.variantes?.thumb || imagenDestacada.variantes?.sm}
                  alt={imagenDestacada.alt_text || ''}
                  className="h-9 w-9 rounded-lg object-cover"
                  style={{ border: '0.5px solid var(--border-md)' }}
                />
                <button
                  type="button"
                  onClick={() => setSelectorMediaAbierto(true)}
                  className="px-3 py-2 rounded-lg text-xs font-medium flex-1"
                  style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)', background: '#fff' }}
                >
                  Cambiar
                </button>
                <button
                  type="button"
                  onClick={() => { setImagenDestacada(null); setImagenId(null); }}
                  className="p-2 rounded-lg"
                  style={{ color: 'var(--red)', background: 'var(--red-light)' }}
                  title="Quitar imagen"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSelectorMediaAbierto(true)}
                className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px dashed var(--border-md)', color: 'var(--ash)', background: '#fff' }}
              >
                <ImageIcon size={14} /> Elegir imagen
              </button>
            )}
          </div>
        </div>

        <div>
          <label className={fieldLabel} style={{ color: 'var(--ash)' }}>Cuerpo</label>
          <div className="rounded-lg overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
            <div className="flex items-center gap-1 px-2 py-1.5 flex-wrap" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
              {toolbarBtns.map(({ icon: Icon, label, activo, onClick }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  title={label}
                  className="p-1.5 rounded-md"
                  style={{
                    color: activo ? 'var(--pb)' : 'var(--ash)',
                    background: activo ? 'var(--pb-light)' : 'transparent',
                  }}
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
            <div className="px-3 py-2.5 tiptap-editor-wrap" style={{ minHeight: 260 }}>
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={fieldLabel} style={{ color: 'var(--ash)', margin: 0 }}>SEO — Título</label>
              <span className="text-[11px]" style={{ color: 'var(--ash)' }}>{seoTitulo.length}/70</span>
            </div>
            <input
              type="text"
              value={seoTitulo}
              onChange={(e) => setSeoTitulo(e.target.value.slice(0, 70))}
              maxLength={70}
              className={fieldInput}
              style={fieldStyle}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={fieldLabel} style={{ color: 'var(--ash)', margin: 0 }}>SEO — Descripción</label>
              <span className="text-[11px]" style={{ color: 'var(--ash)' }}>{seoDescripcion.length}/160</span>
            </div>
            <textarea
              value={seoDescripcion}
              onChange={(e) => setSeoDescripcion(e.target.value.slice(0, 160))}
              maxLength={160}
              rows={2}
              className={`${fieldInput} resize-none`}
              style={fieldStyle}
            />
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancelar}
            disabled={guardando}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: '#fff' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGuardarBorrador}
            disabled={guardando}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)', background: '#fff' }}
          >
            {guardandoBorrador ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
            Guardar borrador
          </button>
          <button
            type="button"
            onClick={handlePublicar}
            disabled={guardando}
            className="flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--pb)' }}
          >
            {publicando ? <Loader2 className="animate-spin" size={15} /> : <Globe size={15} />}
            Publicar
          </button>
        </div>
      </div>

      {(selectorMediaAbierto || insertarImagenAbierto) && (
        <Modal
          open
          onClose={() => { setSelectorMediaAbierto(false); setInsertarImagenAbierto(false); }}
          titulo={selectorMediaAbierto ? 'Elegir imagen destacada' : 'Insertar imagen en el cuerpo'}
          size="xl"
        >
          <BibliotecaMedia onSeleccionar={selectorMediaAbierto ? handleSeleccionarDestacada : handleInsertarImagenCuerpo} />
        </Modal>
      )}
    </div>
  );
};

export default EditorArticulo;
