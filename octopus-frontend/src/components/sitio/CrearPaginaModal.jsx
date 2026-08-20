import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import {
  X, Loader2, ArrowLeft, FileText, LayoutTemplate, Check, Maximize2, FilePlus2,
} from 'lucide-react';
import { crearPaginaConSecciones, crearPreviewPlantilla, getPlantillasUsuario } from '../../api/sitio.service';
import { PLANTILLAS } from './plantillas';
import PreviewBloque from './EditorVisual/PreviewBloque';

const inputStyle = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };

// Mismo origin del sitio público que GestionSitio.jsx (octopus-sitio corre
// aparte del panel admin en producción — ver deploy/nginx/clhma.com.conf).
const SITIO_URL = (import.meta.env.VITE_SITIO_URL || 'http://localhost:5174').replace(/\/$/, '');

/**
 * Mockup de una plantilla: apila sus primeros bloques con `PreviewBloque`
 * (el mismo componente que ya usa `ConstructorPaginas` para previsualizar
 * secciones reales) escalado para caber en la tarjeta. A diferencia de un
 * `<iframe>` al sitio público, esto renderiza en el mismo árbol de React —
 * siempre aparece, sin depender de que `octopus-sitio` esté corriendo en
 * otro puerto/origin ni de generar un token de antemano. El botón
 * "expandir" de la tarjeta sigue abriendo la vista previa animada real
 * (Framer Motion/Embla) en una pestaña nueva para quien quiera verla así.
 */
const MockupPlantilla = ({ secciones }) => (
  <div className="relative w-full h-44 overflow-hidden pointer-events-none select-none" style={{ background: 'var(--bg)' }}>
    <div className="p-2.5 space-y-2.5" style={{ transform: 'scale(0.8)', transformOrigin: 'top left', width: '125%' }}>
      {secciones.slice(0, 3).map((seccion, i) => (
        <PreviewBloque key={i} seccion={seccion} />
      ))}
    </div>
    <div
      className="absolute inset-x-0 bottom-0 h-8"
      style={{ background: 'linear-gradient(to bottom, transparent, var(--bg))' }}
    />
  </div>
);

const TarjetaPlantilla = ({ plantilla, seleccionada, onClick, token, onAbrirPestana }) => (
  <div
    className="relative text-left rounded-xl overflow-hidden transition-colors"
    style={{
      border: seleccionada ? '1.5px solid var(--pb)' : '0.5px solid var(--border-md)',
      background: seleccionada ? 'var(--pb-light)' : '#fff',
    }}
  >
    <button type="button" onClick={onClick} className="w-full text-left block">
      {plantilla.secciones?.length > 0 ? (
        <MockupPlantilla secciones={plantilla.secciones} />
      ) : (
        <div className="w-full h-44 flex flex-col items-center justify-center gap-1.5" style={{ background: 'var(--bg)', color: 'var(--ash)' }}>
          <FilePlus2 size={22} className="opacity-40" />
          <span className="text-[11px]">Empieza sin bloques</span>
        </div>
      )}
      <div className="px-4 py-2.5" style={{ borderTop: '0.5px solid var(--border-md)' }}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>{plantilla.nombre}</p>
          {seleccionada && <Check size={14} style={{ color: 'var(--pb)' }} />}
        </div>
        {plantilla.familia && (
          <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider" style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}>
            {plantilla.familia}
          </span>
        )}
      </div>
    </button>
    {onAbrirPestana && (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onAbrirPestana(); }}
        disabled={!token}
        title={token ? 'Abrir vista previa completa animada en una pestaña nueva' : 'Generando vista previa animada…'}
        className="absolute top-2 right-2 p-1.5 rounded-lg disabled:opacity-40"
        style={{ background: 'rgba(43,48,58,0.55)', color: '#fff' }}
      >
        {token ? <Maximize2 size={12} /> : <Loader2 className="animate-spin" size={12} />}
      </button>
    )}
  </div>
);

/**
 * Modal de 2 pasos: metadatos de la Pagina, luego elegir plantilla (o
 * "Página en blanco"). Al confirmar, crea Pagina + Seccion(es) en una sola
 * llamada (`crearPaginaConSecciones`) y entrega la página creada a
 * `onCreada` para que GestionSitio abra el editor visual sobre ella.
 */
const CrearPaginaModal = ({ onCerrar, onCreada }) => {
  const [paso, setPaso] = useState(1);
  const [titulo, setTitulo] = useState('');
  const [mostrarEnMenu, setMostrarEnMenu] = useState(true);
  const [esHome, setEsHome] = useState(false);
  const [plantillaId, setPlantillaId] = useState('blanco');
  const [creando, setCreando] = useState(false);
  const [tokensPorId, setTokensPorId] = useState({});
  const [plantillasUsuario, setPlantillasUsuario] = useState([]);

  // Plantillas propias del colegio (Fase 2) — se muestran junto al catálogo
  // fijo, prefijadas 'usuario-<id>' para no chocar con los ids string del
  // catálogo estático (plantillas.js).
  useEffect(() => {
    getPlantillasUsuario()
      .then((res) => setPlantillasUsuario(res.data))
      .catch(() => {});
  }, []);

  // Dispara las 9 vistas previas en paralelo apenas se abre el modal (no
  // recién al llegar al paso 2) para que ya estén listas —o casi— cuando el
  // usuario ve la galería. Fallos individuales no bloquean al resto (esa
  // tarjeta simplemente se queda con el spinner y el botón de pestaña
  // deshabilitado, sin tirar abajo el modal).
  useEffect(() => {
    let cancelado = false;
    Promise.allSettled(
      PLANTILLAS.map((p) =>
        crearPreviewPlantilla({ titulo: p.nombre, secciones: p.secciones }).then((res) => ({ id: p.id, token: res.data.token }))),
    ).then((resultados) => {
      if (cancelado) return;
      const nuevos = {};
      resultados.forEach((r) => {
        if (r.status === 'fulfilled') nuevos[r.value.id] = r.value.token;
      });
      setTokensPorId(nuevos);
    });
    return () => { cancelado = true; };
  }, []);

  const irAPlantillas = (e) => {
    e.preventDefault();
    if (!titulo.trim()) {
      toast.error('El título es obligatorio.');
      return;
    }
    setPaso(2);
  };

  const handleCrear = async () => {
    setCreando(true);
    try {
      const esDeUsuario = typeof plantillaId === 'string' && plantillaId.startsWith('usuario-');
      const datosBase = { titulo: titulo.trim(), mostrar_en_menu: mostrarEnMenu, es_home: esHome };
      // Las plantillas de usuario se copian server-side por id (ver docstring
      // de PaginaConSeccionesAdminView) — el frontend nunca reenvía su
      // `secciones` ya expandida como si fuera cruda.
      const payload = esDeUsuario
        ? { ...datosBase, plantilla_usuario_id: Number(plantillaId.replace('usuario-', '')) }
        : { ...datosBase, secciones: PLANTILLAS.find((p) => p.id === plantillaId)?.secciones ?? [] };
      const res = await crearPaginaConSecciones(payload);
      toast.success(`Página "${res.data.titulo}" creada.`);
      onCreada(res.data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo crear la página.');
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ background: 'rgba(43,48,58,0.6)' }} onClick={() => !creando && onCerrar()}>
      <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl" style={{ background: 'var(--bg)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 sticky top-0 z-10" style={{ background: 'var(--bg)', borderBottom: '0.5px solid var(--border-md)' }}>
          <div className="flex items-center gap-2">
            {paso === 2 && (
              <button type="button" onClick={() => setPaso(1)} className="p-1 rounded-lg" style={{ color: 'var(--ash)' }}>
                <ArrowLeft size={16} />
              </button>
            )}
            <p className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>
              {paso === 1 ? 'Nueva página' : 'Elegir plantilla'}
            </p>
          </div>
          <button type="button" onClick={onCerrar} disabled={creando} className="p-1 rounded-lg disabled:opacity-40" style={{ color: 'var(--ash)' }}>
            <X size={16} />
          </button>
        </div>

        {paso === 1 ? (
          <form onSubmit={irAPlantillas} className="p-5 space-y-4">
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Título</label>
              <input
                type="text"
                autoFocus
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej. Admisiones"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--jet)' }}>
              <input type="checkbox" checked={mostrarEnMenu} onChange={(e) => setMostrarEnMenu(e.target.checked)} />
              Mostrar en el menú de navegación
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--jet)' }}>
              <input type="checkbox" checked={esHome} onChange={(e) => setEsHome(e.target.checked)} />
              Usar como página de inicio
            </label>
            {esHome && (
              <p className="text-[11px]" style={{ color: '#b45309' }}>
                Al publicarla, reemplazará a la página de inicio actual.
              </p>
            )}
            <div className="flex justify-end pt-2">
              <button type="submit" className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--pb)' }}>
                Continuar
              </button>
            </div>
          </form>
        ) : (
          <div className="p-5 space-y-4">
            {plantillasUsuario.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ash)' }}>Tus plantillas</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {plantillasUsuario.map((p) => (
                    <TarjetaPlantilla
                      key={`usuario-${p.id}`}
                      plantilla={p}
                      seleccionada={plantillaId === `usuario-${p.id}`}
                      onClick={() => setPlantillaId(`usuario-${p.id}`)}
                    />
                  ))}
                </div>
              </div>
            )}
            <div>
              {plantillasUsuario.length > 0 && (
                <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ash)' }}>Catálogo</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TarjetaPlantilla
                  plantilla={{ nombre: 'Página en blanco' }}
                  seleccionada={plantillaId === 'blanco'}
                  onClick={() => setPlantillaId('blanco')}
                />
                {PLANTILLAS.map((p) => (
                  <TarjetaPlantilla
                    key={p.id}
                    plantilla={p}
                    seleccionada={plantillaId === p.id}
                    onClick={() => setPlantillaId(p.id)}
                    token={tokensPorId[p.id]}
                    onAbrirPestana={() => window.open(`${SITIO_URL}/preview/${tokensPorId[p.id]}`, '_blank')}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleCrear}
                disabled={creando}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: 'var(--pb)' }}
              >
                {creando ? <Loader2 className="animate-spin" size={16} /> : (plantillaId === 'blanco' ? <FileText size={16} /> : <LayoutTemplate size={16} />)}
                Crear página
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CrearPaginaModal;
