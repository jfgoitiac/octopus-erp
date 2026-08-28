import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import {
  Sliders, ImageOff, X, ArrowUp, ArrowDown, Trash2, Plus, Loader2, Check, PenLine,
} from 'lucide-react';
import { updateSeccion } from '../../../api/sitio.service';
import BibliotecaMedia from '../BibliotecaMedia';
import { resolverImagenUrl } from './bloques/utils';
import { Modal } from '../../ui/Modal';

const AUTOSAVE_DELAY_MS = 600;

const ANIMACIONES = [
  { value: '', label: 'Ninguna' },
  { value: 'fade-in', label: 'Fade in' },
  { value: 'slide-up', label: 'Slide up' },
  { value: 'slide-left', label: 'Slide left' },
  { value: 'slide-right', label: 'Slide right' },
  { value: 'scroll-reveal', label: 'Scroll reveal' },
  { value: 'stagger', label: 'Stagger' },
  { value: 'parallax', label: 'Parallax' },
  { value: 'hover-lift', label: 'Hover lift' },
  { value: 'hover-glow', label: 'Hover glow' },
  { value: 'zoom-on-scroll', label: 'Zoom on scroll' },
];

const extraerId = (v) => {
  if (v && typeof v === 'object') return v.id ?? null;
  return v ?? null;
};

// ─── Campos genéricos ───────────────────────────────────────────────────────

const Label = ({ children }) => (
  <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>{children}</label>
);

const inputStyle = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };

const CampoTexto = ({ label, value, onChange, placeholder, maxLength }) => (
  <div>
    <Label>{label}</Label>
    <input
      type="text"
      value={value || ''}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
      style={inputStyle}
    />
  </div>
);

const CampoTextarea = ({ label, value, onChange, rows = 3 }) => (
  <div>
    <Label>{label}</Label>
    <textarea
      value={value || ''}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
      style={inputStyle}
    />
  </div>
);

const CampoSelect = ({ label, value, onChange, opciones }) => (
  <div>
    <Label>{label}</Label>
    <select value={value || ''} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
      {opciones.map((op) => (
        <option key={op.value} value={op.value}>{op.label}</option>
      ))}
    </select>
  </div>
);

const CampoNumero = ({ label, value, onChange, min, max }) => (
  <div>
    <Label>{label}</Label>
    <input
      type="number"
      value={value ?? ''}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
      style={inputStyle}
    />
  </div>
);

const CampoCheckbox = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer" style={{ color: 'var(--jet)' }}>
    <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} className="w-3.5 h-3.5" />
    {label}
  </label>
);

// Campo de imagen: acepta id numérico o Media expandida ({id, variantes, alt_text}).
// `onAbrirSelector` recibe un callback que se invoca con la Media elegida.
const CampoImagen = ({ label, value, onChange, onAbrirSelector }) => {
  const url = resolverImagenUrl(value, 'sm');
  return (
    <div>
      <Label>{label}</Label>
      {url ? (
        <div className="relative rounded-lg overflow-hidden group" style={{ border: '0.5px solid var(--border-md)' }}>
          <img src={url} alt="" className="w-full h-24 object-cover" />
          <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(43,48,58,0.55)' }}>
            <button type="button" onClick={() => onAbrirSelector(() => onChange)} className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold" style={{ background: '#fff', color: 'var(--jet)' }}>
              Cambiar
            </button>
            <button type="button" onClick={() => onChange(null)} className="p-1.5 rounded-md" style={{ background: '#fff', color: 'var(--red)' }} title="Quitar imagen">
              <X size={13} />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onAbrirSelector(() => onChange)}
          className="w-full flex flex-col items-center justify-center gap-1.5 py-5 rounded-lg text-xs"
          style={{ border: '1px dashed var(--border-md)', color: 'var(--ash)' }}
        >
          <ImageOff size={16} className="opacity-50" />
          Elegir imagen
        </button>
      )}
    </div>
  );
};

// Contenedor de un item dentro de un array editable (galería/cards/testimonios/carrusel).
const ItemArray = ({ children, onMoverArriba, onMoverAbajo, onEliminar, primero, ultimo }) => (
  <div className="rounded-lg p-3 space-y-2.5" style={{ border: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
    <div className="flex items-center justify-end gap-1">
      <button type="button" onClick={onMoverArriba} disabled={primero} className="p-1 rounded disabled:opacity-25" style={{ color: 'var(--ash)' }}><ArrowUp size={12} /></button>
      <button type="button" onClick={onMoverAbajo} disabled={ultimo} className="p-1 rounded disabled:opacity-25" style={{ color: 'var(--ash)' }}><ArrowDown size={12} /></button>
      <button type="button" onClick={onEliminar} className="p-1 rounded-md" style={{ color: 'var(--red)', background: 'var(--red-light)' }}><Trash2 size={12} /></button>
    </div>
    {children}
  </div>
);

const BotonAgregarItem = ({ onClick, label }) => (
  <button type="button" onClick={onClick} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold" style={{ border: '1px dashed var(--border-md)', color: 'var(--pb)' }}>
    <Plus size={13} /> {label}
  </button>
);

// ─── Serialización al guardar (imágenes expandidas -> id numérico) ────────

const serializarContenido = (tipo, c) => {
  switch (tipo) {
    case 'hero':
      return { ...c, imagen_fondo: extraerId(c.imagen_fondo) };
    case 'texto_imagen':
      return { ...c, imagen: extraerId(c.imagen) };
    case 'galeria':
      return { ...c, imagenes: (c.imagenes || []).map((i) => ({ ...i, media_id: extraerId(i.media_id) })) };
    case 'cards':
      return { ...c, items: (c.items || []).map((i) => ({ ...i, imagen: extraerId(i.imagen) })) };
    case 'cta':
      return { ...c, fondo: extraerId(c.fondo) };
    case 'testimonios':
      return { ...c, items: (c.items || []).map((i) => ({ ...i, foto: extraerId(i.foto) })) };
    case 'carrusel':
      return { ...c, slides: (c.slides || []).map((s) => ({ ...s, imagen: extraerId(s.imagen) })) };
    default:
      return c;
  }
};

/**
 * Panel lateral de propiedades del bloque seleccionado en
 * `ConstructorPaginas`. Renderiza un formulario distinto según `seccion.tipo`
 * y autoguarda (debounce ~600ms) contenido/animación/config_estilo vía
 * `updateSeccion`.
 *
 * Props:
 * - `seccion`: objeto Seccion seleccionado (o null si no hay selección).
 * - `onChange(seccionActualizada)`: notifica al padre tras guardar con éxito.
 */
const PanelPropiedadesBloque = ({ seccion = null, onChange }) => {
  const [contenido, setContenido] = useState({});
  const [animacion, setAnimacion] = useState('');
  const [configEstilo, setConfigEstilo] = useState({});
  const [sinGuardar, setSinGuardar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [selectorCallback, setSelectorCallback] = useState(null);
  const timeoutRef = useRef(null);
  const seccionIdRef = useRef(null);

  useEffect(() => {
    if (!seccion) return;
    seccionIdRef.current = seccion.id;
    setContenido(seccion.contenido || {});
    setAnimacion(seccion.animacion || '');
    setConfigEstilo(seccion.config_estilo || { ancho: 'contenido', espaciado_top: 'md', espaciado_bottom: 'md', fondo: 'blanco' });
    setSinGuardar(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, [seccion?.id]);

  const guardar = async (nuevoContenido, nuevaAnimacion, nuevoConfigEstilo) => {
    setGuardando(true);
    try {
      const payload = {
        contenido: serializarContenido(seccion.tipo, nuevoContenido),
        animacion: nuevaAnimacion,
        config_estilo: nuevoConfigEstilo,
      };
      const res = await updateSeccion(seccion.id, payload);
      setSinGuardar(false);
      onChange?.(res.data);
      toast.success('Bloque guardado.');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudieron guardar los cambios del bloque.');
    } finally {
      setGuardando(false);
    }
  };

  const programarGuardado = (nuevoContenido, nuevaAnimacion, nuevoConfigEstilo) => {
    setSinGuardar(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (seccionIdRef.current === seccion.id) guardar(nuevoContenido, nuevaAnimacion, nuevoConfigEstilo);
    }, AUTOSAVE_DELAY_MS);
  };

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  const actualizarContenido = (patch) => {
    setContenido((prev) => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
      programarGuardado(next, animacion, configEstilo);
      return next;
    });
  };

  const actualizarAnimacion = (valor) => {
    setAnimacion(valor);
    programarGuardado(contenido, valor, configEstilo);
  };

  const actualizarConfigEstilo = (campo, valor) => {
    setConfigEstilo((prev) => {
      const next = { ...prev, [campo]: valor };
      programarGuardado(contenido, animacion, next);
      return next;
    });
  };

  // ── Helpers de array genéricos (galería/cards/testimonios/carrusel) ──────
  const arr = (key) => contenido[key] || [];
  const setArr = (key, nuevoArr) => actualizarContenido({ [key]: nuevoArr });
  const agregarItem = (key, item) => setArr(key, [...arr(key), item]);
  const eliminarItem = (key, idx) => setArr(key, arr(key).filter((_, i) => i !== idx));
  const moverItem = (key, idx, delta) => {
    const lista = [...arr(key)];
    const nuevo = idx + delta;
    if (nuevo < 0 || nuevo >= lista.length) return;
    [lista[idx], lista[nuevo]] = [lista[nuevo], lista[idx]];
    setArr(key, lista);
  };
  const actualizarItem = (key, idx, campo, valor) => {
    const lista = [...arr(key)];
    lista[idx] = { ...lista[idx], [campo]: valor };
    setArr(key, lista);
  };

  if (!seccion) {
    return (
      <div className="rounded-xl p-5 text-center" style={{ border: '1px dashed var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
        <Sliders size={20} className="mx-auto mb-2 opacity-40" />
        <p className="text-xs">Selecciona un bloque para editar sus propiedades.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden max-h-[calc(100vh-140px)] flex flex-col" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
        <div className="flex items-center gap-1.5">
          <Sliders size={13} style={{ color: 'var(--pb)' }} />
          <p className="text-xs font-semibold" style={{ color: 'var(--jet)' }}>Propiedades</p>
        </div>
        {guardando ? (
          <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: 'var(--ash)' }}>
            <Loader2 size={11} className="animate-spin" /> Guardando…
          </span>
        ) : sinGuardar ? (
          <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#b45309' }}>
            <PenLine size={11} /> Cambios sin guardar
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#16a34a' }}>
            <Check size={11} /> Guardado
          </span>
        )}
      </div>

      <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar">
        {/* ── Campos por tipo ── */}
        {seccion.tipo === 'hero' && (
          <>
            <CampoTexto label="Título" value={contenido.titulo} onChange={(v) => actualizarContenido({ titulo: v })} />
            <CampoTextarea label="Subtítulo" value={contenido.subtitulo} onChange={(v) => actualizarContenido({ subtitulo: v })} />
            <CampoImagen label="Imagen de fondo" value={contenido.imagen_fondo} onChange={(v) => actualizarContenido({ imagen_fondo: v })} onAbrirSelector={setSelectorCallback} />
            <CampoTexto label="Texto del botón" value={contenido.cta_texto} onChange={(v) => actualizarContenido({ cta_texto: v })} />
            <CampoTexto label="URL del botón" value={contenido.cta_url} onChange={(v) => actualizarContenido({ cta_url: v })} />
            <CampoSelect label="Overlay" value={contenido.overlay} onChange={(v) => actualizarContenido({ overlay: v })}
              opciones={[{ value: 'oscuro', label: 'Oscuro' }, { value: 'claro', label: 'Claro' }, { value: 'ninguno', label: 'Ninguno' }]} />
          </>
        )}

        {seccion.tipo === 'texto_imagen' && (
          <>
            <CampoTexto label="Título" value={contenido.titulo} onChange={(v) => actualizarContenido({ titulo: v })} />
            <CampoTextarea label="Texto" value={contenido.texto} onChange={(v) => actualizarContenido({ texto: v })} rows={4} />
            <CampoImagen label="Imagen" value={contenido.imagen} onChange={(v) => actualizarContenido({ imagen: v })} onAbrirSelector={setSelectorCallback} />
            <CampoSelect label="Posición de la imagen" value={contenido.posicion_imagen} onChange={(v) => actualizarContenido({ posicion_imagen: v })}
              opciones={[{ value: 'izquierda', label: 'Izquierda' }, { value: 'derecha', label: 'Derecha' }]} />
            <CampoTexto label="Texto del botón (opcional)" value={contenido.cta_texto} onChange={(v) => actualizarContenido({ cta_texto: v })} />
            <CampoTexto label="URL del botón (opcional)" value={contenido.cta_url} onChange={(v) => actualizarContenido({ cta_url: v })} />
          </>
        )}

        {seccion.tipo === 'galeria' && (
          <>
            <CampoTexto label="Título (opcional)" value={contenido.titulo} onChange={(v) => actualizarContenido({ titulo: v })} />
            <CampoNumero label="Columnas" value={contenido.columnas} min={1} max={4} onChange={(v) => actualizarContenido({ columnas: v })} />
            <div className="space-y-2">
              <Label>Imágenes</Label>
              {arr('imagenes').map((img, idx) => (
                <ItemArray key={idx} primero={idx === 0} ultimo={idx === arr('imagenes').length - 1}
                  onMoverArriba={() => moverItem('imagenes', idx, -1)} onMoverAbajo={() => moverItem('imagenes', idx, 1)} onEliminar={() => eliminarItem('imagenes', idx)}>
                  <CampoImagen label={`Imagen ${idx + 1}`} value={img.media_id} onChange={(v) => actualizarItem('imagenes', idx, 'media_id', v)} onAbrirSelector={setSelectorCallback} />
                  <CampoTexto label="Caption (opcional)" value={img.caption} onChange={(v) => actualizarItem('imagenes', idx, 'caption', v)} />
                </ItemArray>
              ))}
              <BotonAgregarItem label="Agregar imagen" onClick={() => agregarItem('imagenes', { media_id: null, caption: '' })} />
            </div>
          </>
        )}

        {seccion.tipo === 'cards' && (
          <>
            <CampoTexto label="Título (opcional)" value={contenido.titulo} onChange={(v) => actualizarContenido({ titulo: v })} />
            <CampoNumero label="Columnas" value={contenido.columnas} min={1} max={4} onChange={(v) => actualizarContenido({ columnas: v })} />
            <div className="space-y-2">
              <Label>Cards</Label>
              {arr('items').map((it, idx) => (
                <ItemArray key={idx} primero={idx === 0} ultimo={idx === arr('items').length - 1}
                  onMoverArriba={() => moverItem('items', idx, -1)} onMoverAbajo={() => moverItem('items', idx, 1)} onEliminar={() => eliminarItem('items', idx)}>
                  <CampoTexto label="Título" value={it.titulo} onChange={(v) => actualizarItem('items', idx, 'titulo', v)} />
                  <CampoTextarea label="Texto" value={it.texto} onChange={(v) => actualizarItem('items', idx, 'texto', v)} rows={2} />
                  <CampoTexto label="Ícono (nombre lucide-react, ej. Star)" value={it.icono} onChange={(v) => actualizarItem('items', idx, 'icono', v)} />
                  <CampoImagen label="Imagen (opcional)" value={it.imagen} onChange={(v) => actualizarItem('items', idx, 'imagen', v)} onAbrirSelector={setSelectorCallback} />
                  <CampoTexto label="URL (opcional)" value={it.url} onChange={(v) => actualizarItem('items', idx, 'url', v)} />
                </ItemArray>
              ))}
              <BotonAgregarItem label="Agregar card" onClick={() => agregarItem('items', { icono: '', imagen: null, titulo: '', texto: '', url: '' })} />
            </div>
          </>
        )}

        {seccion.tipo === 'cta' && (
          <>
            <CampoTexto label="Título" value={contenido.titulo} onChange={(v) => actualizarContenido({ titulo: v })} />
            <CampoTextarea label="Texto" value={contenido.texto} onChange={(v) => actualizarContenido({ texto: v })} />
            <CampoTexto label="Texto del botón" value={contenido.boton_texto} onChange={(v) => actualizarContenido({ boton_texto: v })} />
            <CampoTexto label="URL del botón" value={contenido.boton_url} onChange={(v) => actualizarContenido({ boton_url: v })} />
            <CampoImagen label="Fondo (opcional)" value={contenido.fondo} onChange={(v) => actualizarContenido({ fondo: v })} onAbrirSelector={setSelectorCallback} />
          </>
        )}

        {seccion.tipo === 'testimonios' && (
          <>
            <CampoTexto label="Título (opcional)" value={contenido.titulo} onChange={(v) => actualizarContenido({ titulo: v })} />
            <div className="space-y-2">
              <Label>Testimonios</Label>
              {arr('items').map((it, idx) => (
                <ItemArray key={idx} primero={idx === 0} ultimo={idx === arr('items').length - 1}
                  onMoverArriba={() => moverItem('items', idx, -1)} onMoverAbajo={() => moverItem('items', idx, 1)} onEliminar={() => eliminarItem('items', idx)}>
                  <CampoTexto label="Nombre" value={it.nombre} onChange={(v) => actualizarItem('items', idx, 'nombre', v)} />
                  <CampoTexto label="Cargo (opcional)" value={it.cargo} onChange={(v) => actualizarItem('items', idx, 'cargo', v)} />
                  <CampoImagen label="Foto" value={it.foto} onChange={(v) => actualizarItem('items', idx, 'foto', v)} onAbrirSelector={setSelectorCallback} />
                  <CampoTextarea label="Texto" value={it.texto} onChange={(v) => actualizarItem('items', idx, 'texto', v)} rows={3} />
                </ItemArray>
              ))}
              <BotonAgregarItem label="Agregar testimonio" onClick={() => agregarItem('items', { nombre: '', cargo: '', foto: null, texto: '' })} />
            </div>
          </>
        )}

        {seccion.tipo === 'carrusel' && (
          <>
            <div className="flex items-center justify-between">
              <CampoCheckbox label="Autoplay" checked={contenido.autoplay} onChange={(v) => actualizarContenido({ autoplay: v })} />
            </div>
            <CampoNumero label="Intervalo (ms)" value={contenido.intervalo_ms} min={1000} max={20000} onChange={(v) => actualizarContenido({ intervalo_ms: v })} />
            <div className="space-y-2">
              <Label>Slides</Label>
              {arr('slides').map((s, idx) => (
                <ItemArray key={idx} primero={idx === 0} ultimo={idx === arr('slides').length - 1}
                  onMoverArriba={() => moverItem('slides', idx, -1)} onMoverAbajo={() => moverItem('slides', idx, 1)} onEliminar={() => eliminarItem('slides', idx)}>
                  <CampoImagen label="Imagen" value={s.imagen} onChange={(v) => actualizarItem('slides', idx, 'imagen', v)} onAbrirSelector={setSelectorCallback} />
                  <CampoTexto label="Título (opcional)" value={s.titulo} onChange={(v) => actualizarItem('slides', idx, 'titulo', v)} />
                  <CampoTextarea label="Texto (opcional)" value={s.texto} onChange={(v) => actualizarItem('slides', idx, 'texto', v)} rows={2} />
                </ItemArray>
              ))}
              <BotonAgregarItem label="Agregar slide" onClick={() => agregarItem('slides', { imagen: null, titulo: '', texto: '' })} />
            </div>
          </>
        )}

        {/* ── Animación y estilo (comunes a todos los tipos) ── */}
        <div className="pt-3 space-y-4" style={{ borderTop: '0.5px solid var(--border-md)' }}>
          <CampoSelect label="Animación" value={animacion} onChange={actualizarAnimacion} opciones={ANIMACIONES} />

          <div>
            <Label>Ancho</Label>
            <select value={configEstilo.ancho || 'contenido'} onChange={(e) => actualizarConfigEstilo('ancho', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
              <option value="contenido">Contenido</option>
              <option value="completo">Completo</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Espaciado superior</Label>
              <select value={configEstilo.espaciado_top || 'md'} onChange={(e) => actualizarConfigEstilo('espaciado_top', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                <option value="sm">Chico</option>
                <option value="md">Medio</option>
                <option value="lg">Grande</option>
              </select>
            </div>
            <div>
              <Label>Espaciado inferior</Label>
              <select value={configEstilo.espaciado_bottom || 'md'} onChange={(e) => actualizarConfigEstilo('espaciado_bottom', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                <option value="sm">Chico</option>
                <option value="md">Medio</option>
                <option value="lg">Grande</option>
              </select>
            </div>
          </div>
          <div>
            <Label>Fondo</Label>
            <select value={configEstilo.fondo || 'blanco'} onChange={(e) => actualizarConfigEstilo('fondo', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
              <option value="blanco">Blanco</option>
              <option value="gris">Gris</option>
              <option value="primario">Primario</option>
              <option value="transparente">Transparente</option>
            </select>
          </div>
        </div>
      </div>

      {selectorCallback && (
        <Modal open onClose={() => setSelectorCallback(null)} className="z-[110]" titulo="Elegir imagen" size="xl">
          <BibliotecaMedia
            onSeleccionar={(media) => {
              selectorCallback(media);
              setSelectorCallback(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
};

export default PanelPropiedadesBloque;
