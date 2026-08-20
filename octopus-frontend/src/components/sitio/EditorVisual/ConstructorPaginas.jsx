import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  LayoutTemplate, Plus, GripVertical, Trash2, Image as ImageIcon, AlignLeft,
  Images, LayoutGrid, MousePointerClick, MessageSquareQuote, GalleryHorizontal,
  ChevronDown, FilePlus2, Eye, Loader2, BookmarkPlus, Bookmark, Radio,
} from 'lucide-react';
import {
  getSecciones, createSeccion, deleteSeccion, reordenarSecciones, crearPreviewPagina,
  getPatronesBloque, createPatronBloque,
} from '../../../api/sitio.service';
import ConfirmDeleteModal from '../../ConfirmDeleteModal';
import GuardarComoModal from '../GuardarComoModal';
import PreviewBloque from './PreviewBloque';
import PanelPropiedadesBloque from './PanelPropiedadesBloque';
import { contenidoPorDefecto, CONFIG_ESTILO_DEFAULT } from './bloques/utils';

const TIPOS = [
  { value: 'hero', label: 'Hero', icon: ImageIcon },
  { value: 'texto_imagen', label: 'Texto + Imagen', icon: AlignLeft },
  { value: 'galeria', label: 'Galería', icon: Images },
  { value: 'cards', label: 'Cards', icon: LayoutGrid },
  { value: 'cta', label: 'Llamado a la acción', icon: MousePointerClick },
  { value: 'testimonios', label: 'Testimonios', icon: MessageSquareQuote },
  { value: 'carrusel', label: 'Carrusel', icon: GalleryHorizontal },
];

const ICONO_POR_TIPO = TIPOS.reduce((acc, t) => ({ ...acc, [t.value]: t.icon }), {});
const LABEL_POR_TIPO = TIPOS.reduce((acc, t) => ({ ...acc, [t.value]: t.label }), {});

// Mismo origin del sitio público que GestionSitio.jsx (ahí se explica por qué
// no es una ruta relativa: octopus-sitio corre en otro origin en producción).
const SITIO_URL = (import.meta.env.VITE_SITIO_URL || 'http://localhost:5174').replace(/\/$/, '');

const SkeletonBloque = () => (
  <div className="rounded-xl p-4 animate-pulse" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
    <div className="h-4 w-1/3 rounded mb-3" style={{ background: 'var(--ash-light)' }} />
    <div className="h-24 w-full rounded" style={{ background: 'var(--ash-light)' }} />
  </div>
);

const BloqueOrdenable = ({ seccion, seleccionado, onSeleccionar, onEliminar, onGuardarPatron }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: seccion.id });
  const Icono = ICONO_POR_TIPO[seccion.tipo] || LayoutTemplate;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        border: seleccionado ? '1px solid var(--pb)' : '0.5px solid var(--border-md)',
        background: 'var(--porcelain)',
      }}
      className="rounded-xl overflow-hidden cursor-pointer"
      onClick={() => onSeleccionar(seccion)}
    >
      <div className="px-3.5 py-2.5 flex items-center gap-2" style={{ borderBottom: '0.5px solid var(--border-md)', background: seleccionado ? 'var(--pb-light)' : 'var(--bg)' }}>
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="p-1 rounded-md cursor-grab active:cursor-grabbing touch-none"
          style={{ color: 'var(--ash)' }}
          title="Arrastrar para reordenar"
        >
          <GripVertical size={14} />
        </button>
        <Icono size={14} style={{ color: seleccionado ? 'var(--pb)' : 'var(--ash)' }} />
        <p className="text-xs font-semibold flex-1 truncate" style={{ color: 'var(--jet)' }}>
          {LABEL_POR_TIPO[seccion.tipo] || seccion.tipo}
        </p>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onGuardarPatron(seccion); }}
          className="p-1.5 rounded-md"
          style={{ color: 'var(--ash)', background: 'var(--ash-light)' }}
          title="Guardar como patrón reutilizable"
        >
          <BookmarkPlus size={12} />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEliminar(seccion); }}
          className="p-1.5 rounded-md"
          style={{ color: 'var(--red)', background: 'var(--red-light)' }}
          title="Eliminar bloque"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="p-3 pointer-events-none max-h-[240px] overflow-hidden">
        <PreviewBloque seccion={seccion} />
      </div>
    </div>
  );
};

/**
 * Constructor de bloques de una Página: reorder con @dnd-kit, alta/baja de
 * bloques y edición vía `PanelPropiedadesBloque`.
 *
 * Props:
 * - `pagina`: objeto Pagina (id, titulo, slug, ...) sobre la que se edita.
 */
const ConstructorPaginas = ({ pagina }) => {
  const [secciones, setSecciones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [seleccionadaId, setSeleccionadaId] = useState(null);
  const [aEliminar, setAEliminar] = useState(null);
  const [menuAgregarAbierto, setMenuAgregarAbierto] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [generandoPreview, setGenerandoPreview] = useState(false);
  const [patrones, setPatrones] = useState([]);
  const [aGuardarComoPatron, setAGuardarComoPatron] = useState(null);
  const [guardandoPatron, setGuardandoPatron] = useState(false);
  const [vistaEnVivoActiva, setVistaEnVivoActiva] = useState(false);
  const [tokenVistaEnVivo, setTokenVistaEnVivo] = useState(null);
  const [iframeListo, setIframeListo] = useState(false);
  const menuRef = useRef(null);
  const iframeRef = useRef(null);

  const fetchSecciones = useCallback(async (signal) => {
    if (!pagina?.id) { setSecciones([]); return; }
    setLoading(true);
    try {
      const res = await getSecciones(pagina.id, signal);
      const ordenadas = [...res.data].sort((a, b) => a.orden - b.orden);
      setSecciones(ordenadas);
    } catch (err) {
      if (err?.code !== 'ERR_CANCELED') {
        toast.error(err?.response?.data?.detail || 'No se pudieron cargar los bloques de la página.');
      }
    } finally {
      setLoading(false);
    }
  }, [pagina?.id]);

  useEffect(() => {
    const controller = new AbortController();
    setSeleccionadaId(null);
    fetchSecciones(controller.signal);
    return () => controller.abort();
  }, [fetchSecciones]);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuAgregarAbierto(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Patrones (Fase 2): catálogo propio del colegio, no depende de la página
  // seleccionada — se carga una sola vez y se ofrece en "Agregar bloque".
  useEffect(() => {
    getPatronesBloque()
      .then((res) => setPatrones(res.data))
      .catch(() => {});
  }, []);

  // Vista en vivo (Fase 3): se apaga y se resetea al cambiar de página — un
  // token de preview es de una sola página, no tiene sentido arrastrarlo.
  useEffect(() => {
    setVistaEnVivoActiva(false);
    setTokenVistaEnVivo(null);
    setIframeListo(false);
  }, [pagina?.id]);

  useEffect(() => {
    if (!vistaEnVivoActiva || !pagina?.id || tokenVistaEnVivo) return;
    crearPreviewPagina(pagina.id)
      .then((res) => setTokenVistaEnVivo(res.data.token))
      .catch(() => {
        toast.error('No se pudo iniciar la vista en vivo.');
        setVistaEnVivoActiva(false);
      });
  }, [vistaEnVivoActiva, pagina?.id, tokenVistaEnVivo]);

  useEffect(() => {
    if (!tokenVistaEnVivo) return undefined;
    const handler = (event) => {
      if (event.data?.type === 'sitio-preview-listo' && event.data?.token === tokenVistaEnVivo) {
        setIframeListo(true);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [tokenVistaEnVivo]);

  // Empuja el estado actual (título + secciones, misma forma que ya usa
  // PreviewBloque/RenderSeccion — media ya expandida) al iframe cada vez que
  // cambia algo, con debounce para no saturar el postMessage mientras se
  // escribe. Sin esto, "vista en vivo" sería un nombre engañoso: sería el
  // mismo flujo de token+reload que ya existía en "Vista previa".
  useEffect(() => {
    if (!tokenVistaEnVivo || !iframeListo || !iframeRef.current) return undefined;
    const idTimeout = setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: 'sitio-preview-update',
          token: tokenVistaEnVivo,
          pagina: { titulo: pagina?.titulo, secciones },
        },
        '*',
      );
    }, 300);
    return () => clearTimeout(idTimeout);
  }, [secciones, pagina?.titulo, tokenVistaEnVivo, iframeListo]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = secciones.findIndex((s) => s.id === active.id);
    const newIndex = secciones.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const anterior = secciones;
    const reordenadas = arrayMove(secciones, oldIndex, newIndex);
    setSecciones(reordenadas);

    try {
      await reordenarSecciones(pagina.id, reordenadas.map((s) => s.id));
    } catch (err) {
      setSecciones(anterior);
      toast.error(err?.response?.data?.detail || 'No se pudo reordenar los bloques.');
    }
  };

  const handleAgregarBloque = async (tipo) => {
    setMenuAgregarAbierto(false);
    setAgregando(true);
    try {
      const res = await createSeccion(pagina.id, {
        tipo,
        orden: secciones.length,
        contenido: contenidoPorDefecto(tipo),
        animacion: '',
        config_estilo: { ...CONFIG_ESTILO_DEFAULT },
      });
      setSecciones((prev) => [...prev, res.data]);
      setSeleccionadaId(res.data.id);
      toast.success('Bloque agregado.');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo agregar el bloque.');
    } finally {
      setAgregando(false);
    }
  };

  const handleInsertarPatron = async (patron) => {
    setMenuAgregarAbierto(false);
    setAgregando(true);
    try {
      const res = await createSeccion(pagina.id, {
        tipo: patron.tipo,
        orden: secciones.length,
        contenido: patron.contenido,
        animacion: patron.animacion,
        config_estilo: patron.config_estilo,
      });
      setSecciones((prev) => [...prev, res.data]);
      setSeleccionadaId(res.data.id);
      toast.success(`"${patron.nombre}" insertado.`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo insertar el patrón.');
    } finally {
      setAgregando(false);
    }
  };

  const handleConfirmarGuardarPatron = async (nombre) => {
    if (!aGuardarComoPatron) return;
    setGuardandoPatron(true);
    try {
      const res = await createPatronBloque({
        nombre,
        tipo: aGuardarComoPatron.tipo,
        contenido: aGuardarComoPatron.contenido,
        animacion: aGuardarComoPatron.animacion,
        config_estilo: aGuardarComoPatron.config_estilo,
      });
      setPatrones((prev) => [res.data, ...prev]);
      toast.success(`Patrón "${nombre}" guardado.`);
      setAGuardarComoPatron(null);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo guardar el patrón.');
    } finally {
      setGuardandoPatron(false);
    }
  };

  const handleEliminar = async () => {
    if (!aEliminar) return;
    try {
      await deleteSeccion(aEliminar.id);
      setSecciones((prev) => prev.filter((s) => s.id !== aEliminar.id));
      if (seleccionadaId === aEliminar.id) setSeleccionadaId(null);
      toast.success('Bloque eliminado.');
      setAEliminar(null);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo eliminar el bloque.');
    }
  };

  const handleSeccionActualizada = (seccionActualizada) => {
    setSecciones((prev) => prev.map((s) => (s.id === seccionActualizada.id ? seccionActualizada : s)));
  };

  const handleVistaPrevia = async () => {
    setGenerandoPreview(true);
    try {
      const res = await crearPreviewPagina(pagina.id);
      window.open(`${SITIO_URL}/preview/${res.data.token}`, '_blank');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo generar la vista previa.');
    } finally {
      setGenerandoPreview(false);
    }
  };

  const seccionSeleccionada = secciones.find((s) => s.id === seleccionadaId) || null;

  if (!pagina) {
    return (
      <div className="rounded-xl flex flex-col items-center justify-center text-center py-20 px-6" style={{ border: '1px dashed var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
        <div className="p-3 rounded-xl mb-4" style={{ background: 'var(--pb-light)' }}>
          <LayoutTemplate size={24} style={{ color: 'var(--pb)' }} />
        </div>
        <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--jet)' }}>Editor visual</h3>
        <p className="text-xs max-w-sm">Selecciona una página en la pestaña "Páginas" para editar sus bloques aquí.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>{pagina.titulo}</h3>
          <p className="text-[11px]" style={{ color: 'var(--ash)' }}>/{pagina.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleVistaPrevia}
            disabled={generandoPreview || secciones.length === 0}
            title={secciones.length === 0 ? 'Agrega al menos un bloque para previsualizar' : 'Ver esta página con animaciones reales en una pestaña nueva'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}
          >
            {generandoPreview ? <Loader2 className="animate-spin" size={14} /> : <Eye size={14} />} Vista previa
          </button>
          <button
            type="button"
            onClick={() => setVistaEnVivoActiva((v) => !v)}
            disabled={secciones.length === 0 && !vistaEnVivoActiva}
            title={secciones.length === 0 ? 'Agrega al menos un bloque para ver el preview en vivo' : 'Panel lateral que se actualiza mientras editás, sin recargar'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={vistaEnVivoActiva ? { background: 'var(--pb)', color: '#fff' } : { background: 'var(--pb-light)', color: 'var(--pb)' }}
          >
            <Radio size={14} /> Vista en vivo
          </button>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuAgregarAbierto((v) => !v)}
            disabled={agregando}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
            style={{ background: 'var(--pb)' }}
          >
            <Plus size={14} /> Agregar bloque <ChevronDown size={12} />
          </button>
          {menuAgregarAbierto && (
            <div className="absolute right-0 mt-1.5 w-52 rounded-xl overflow-hidden z-20 shadow-lg" style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
              {TIPOS.map(({ value, label, icon: Icono }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleAgregarBloque(value)}
                  className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-left hover:bg-[var(--bg)]"
                  style={{ color: 'var(--jet)' }}
                >
                  <Icono size={14} style={{ color: 'var(--pb)' }} />
                  {label}
                </button>
              ))}
              {patrones.length > 0 && (
                <>
                  <div className="px-3.5 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ash)', borderTop: '0.5px solid var(--border)' }}>
                    Tus patrones
                  </div>
                  {patrones.map((patron) => {
                    const Icono = ICONO_POR_TIPO[patron.tipo] || Bookmark;
                    return (
                      <button
                        key={patron.id}
                        type="button"
                        onClick={() => handleInsertarPatron(patron)}
                        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-left hover:bg-[var(--bg)]"
                        style={{ color: 'var(--jet)' }}
                      >
                        <Icono size={14} style={{ color: 'var(--ash)' }} />
                        <span className="truncate">{patron.nombre}</span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-5 items-start ${vistaEnVivoActiva ? 'lg:grid-cols-[1fr_320px_380px]' : 'lg:grid-cols-[1fr_320px]'}`}>
        <div className="space-y-3">
          {loading ? (
            <>
              <SkeletonBloque />
              <SkeletonBloque />
            </>
          ) : secciones.length === 0 ? (
            <div className="rounded-xl flex flex-col items-center justify-center text-center py-16 px-6" style={{ border: '1px dashed var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
              <FilePlus2 size={22} className="mb-3 opacity-40" />
              <h4 className="text-sm font-semibold mb-1" style={{ color: 'var(--jet)' }}>Esta página no tiene bloques todavía</h4>
              <p className="text-xs max-w-xs mb-4">Agrega el primer bloque para empezar a armar el contenido de "{pagina.titulo}".</p>
              <button
                type="button"
                onClick={() => setMenuAgregarAbierto(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white"
                style={{ background: 'var(--pb)' }}
              >
                <Plus size={14} /> Agregar bloque
              </button>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={secciones.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                {secciones.map((seccion) => (
                  <BloqueOrdenable
                    key={seccion.id}
                    seccion={seccion}
                    seleccionado={seccion.id === seleccionadaId}
                    onSeleccionar={(s) => setSeleccionadaId(s.id)}
                    onEliminar={setAEliminar}
                    onGuardarPatron={setAGuardarComoPatron}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>

        <div className="lg:sticky lg:top-4">
          <PanelPropiedadesBloque seccion={seccionSeleccionada} onChange={handleSeccionActualizada} />
        </div>

        {vistaEnVivoActiva && (
          <div className="lg:sticky lg:top-4 rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
            <div className="px-3 py-2 flex items-center gap-1.5 text-[11px] font-semibold" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)', color: 'var(--ash)' }}>
              <Radio size={11} style={{ color: iframeListo ? '#16a34a' : 'var(--ash)' }} /> Vista en vivo — se actualiza mientras editás
            </div>
            {!tokenVistaEnVivo ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="animate-spin" size={20} style={{ color: 'var(--pb)' }} />
              </div>
            ) : (
              <iframe
                ref={iframeRef}
                key={tokenVistaEnVivo}
                src={`${SITIO_URL}/preview/${tokenVistaEnVivo}`}
                title="Vista en vivo"
                className="w-full"
                style={{ height: 560, border: 'none', background: '#fff' }}
                onLoad={() => setIframeListo(false)}
              />
            )}
          </div>
        )}
      </div>

      {aEliminar && (
        <ConfirmDeleteModal
          titulo="Eliminar bloque"
          nombre={LABEL_POR_TIPO[aEliminar.tipo] || aEliminar.tipo}
          onCancel={() => setAEliminar(null)}
          onConfirm={handleEliminar}
        />
      )}

      {aGuardarComoPatron && (
        <GuardarComoModal
          titulo="Guardar como patrón"
          descripcion="Este bloque quedará disponible para insertarlo en cualquier página desde el menú 'Agregar bloque'."
          labelInput="Nombre del patrón"
          nombreSugerido={LABEL_POR_TIPO[aGuardarComoPatron.tipo] || aGuardarComoPatron.tipo}
          guardando={guardandoPatron}
          onCancelar={() => !guardandoPatron && setAGuardarComoPatron(null)}
          onConfirmar={handleConfirmarGuardarPatron}
        />
      )}
    </div>
  );
};

export default ConstructorPaginas;
