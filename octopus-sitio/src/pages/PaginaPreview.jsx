import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { getPreview } from '../api/sitio.service';
import { useSeo } from '../hooks/useSeo';
import RenderSeccion from '../components/bloques/RenderSeccion';
import SeccionesSkeleton from '../components/ui/SeccionesSkeleton';

/**
 * Ruta `/preview/:token` — igual que `PaginaDinamica` (mismo `RenderSeccion`
 * animado, Framer Motion/Embla incluidos) pero consumiendo
 * `GET /api/sitio/preview/<token>/` en vez de `paginas/<slug>/`: el único
 * endpoint público que no filtra por `estado='publicado'`, protegido por un
 * token opaco de un solo uso temporal (TTL 30min) en vez de autenticación,
 * generado desde el panel admin (botón "Vista previa" en CrearPaginaModal /
 * ConstructorPaginas — ver `sitio/views.py::_crear_preview_sesion`).
 *
 * Se sirve dentro de `LayoutPublico` (mismo header/footer que el sitio real)
 * para que "cómo va quedando" incluya la navegación real, no solo el bloque.
 */
const PaginaPreview = () => {
  const { token } = useParams();
  const [resultado, setResultado] = useState({ token: null, pagina: null, error: false });

  useEffect(() => {
    let activo = true;
    getPreview(token)
      .then((res) => activo && setResultado({ token, pagina: res.data, error: false }))
      .catch(() => activo && setResultado({ token, pagina: null, error: true }));
    return () => {
      activo = false;
    };
  }, [token]);

  // Fase 3 — preview en tiempo real: cuando esta ruta se abre embebida en un
  // <iframe> dentro del editor visual del panel admin, el admin empuja el
  // estado actual de secciones por postMessage en cada cambio (debounced),
  // sin recargar el iframe ni volver a golpear el backend por cada tecla. El
  // fetch por token de arriba sigue siendo la carga inicial y el fallback
  // para el link de "Vista previa" abierto en pestaña nueva (no embebido).
  // `event.source === window.parent` limita esto a quien nos está embebiendo
  // (si alguien más nos iframea, solo afecta a su propio iframe) y el chequeo
  // de `token` es una segunda barrera: un mensaje solo se aplica si coincide
  // con el preview realmente cargado.
  useEffect(() => {
    if (window.parent === window) return undefined; // no embebido, nada que escuchar
    const handler = (event) => {
      if (event.source !== window.parent) return;
      const { type, token: tokenMensaje, pagina: paginaMensaje } = event.data || {};
      if (type !== 'sitio-preview-update' || tokenMensaje !== token || !paginaMensaje) return;
      setResultado({ token, pagina: paginaMensaje, error: false });
    };
    window.addEventListener('message', handler);
    // Avisa al padre que ya está listo para recibir actualizaciones — evita
    // que el primer postMessage del admin se pierda si llega antes de que
    // este listener exista.
    window.parent.postMessage({ type: 'sitio-preview-listo', token }, '*');
    return () => window.removeEventListener('message', handler);
  }, [token]);

  const cargando = resultado.token !== token;
  const { pagina, error } = resultado;

  useSeo({ titulo: pagina ? `Vista previa · ${pagina.titulo}` : 'Vista previa' });

  return (
    <div>
      <div
        className="sticky top-16 z-30 flex items-center justify-center gap-2 py-2 text-xs font-semibold"
        style={{ background: '#1f3864', color: '#fff' }}
      >
        <Eye size={13} /> Vista previa — estos cambios todavía no están publicados
      </div>

      {cargando ? (
        <SeccionesSkeleton />
      ) : error || !pagina ? (
        <div className="contenedor py-24 text-center">
          <h1 className="text-3xl font-bold">Esta vista previa expiró</h1>
          <p className="mt-3 text-[var(--texto-suave)]">
            Los enlaces de vista previa duran 30 minutos. Volvé al panel y generá uno nuevo.
          </p>
        </div>
      ) : pagina.secciones.length === 0 ? (
        <div className="contenedor py-24 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold">{pagina.titulo}</h1>
          <p className="mt-4 text-[var(--texto-suave)]">Esta página todavía no tiene contenido.</p>
        </div>
      ) : (
        <div>
          {pagina.secciones
            .slice()
            .sort((a, b) => a.orden - b.orden)
            .map((seccion, i) => (
              <RenderSeccion key={seccion.id ?? i} seccion={seccion} />
            ))}
        </div>
      )}
    </div>
  );
};

export default PaginaPreview;
