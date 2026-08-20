import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPagina } from '../api/sitio.service';
import { useSeo } from '../hooks/useSeo';
import RenderSeccion from '../components/bloques/RenderSeccion';
import SeccionesSkeleton from '../components/ui/SeccionesSkeleton';
import NotFound from './NotFound';

/** Ruta catch-all `/:slug` — consume GET /api/sitio/paginas/<slug>/. */
const PaginaDinamica = () => {
  const { slug } = useParams();
  // Se guarda el `slug` resuelto junto con el resultado (en vez de un estado
  // `cargando` aparte) para no llamar setState de forma síncrona al inicio
  // del efecto — `cargando` se deriva comparando contra el slug de la ruta.
  const [resultado, setResultado] = useState({ slug: null, pagina: null, error: false });

  useEffect(() => {
    let activo = true;
    getPagina(slug)
      .then((res) => activo && setResultado({ slug, pagina: res.data, error: false }))
      .catch(() => activo && setResultado({ slug, pagina: null, error: true }));
    return () => {
      activo = false;
    };
  }, [slug]);

  const cargando = resultado.slug !== slug;
  const { pagina, error } = resultado;

  useSeo({ titulo: pagina?.seo_titulo, descripcion: pagina?.seo_descripcion });

  if (cargando) return <SeccionesSkeleton />;
  if (error || !pagina) return <NotFound />;

  if (pagina.secciones.length === 0) {
    return (
      <div className="contenedor py-24 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold">{pagina.titulo}</h1>
        <p className="mt-4 text-[var(--texto-suave)]">Esta página todavía no tiene contenido.</p>
      </div>
    );
  }

  return (
    <div>
      {pagina.secciones
        .slice()
        .sort((a, b) => a.orden - b.orden)
        .map((seccion) => (
          <RenderSeccion key={seccion.id} seccion={seccion} />
        ))}
    </div>
  );
};

export default PaginaDinamica;
