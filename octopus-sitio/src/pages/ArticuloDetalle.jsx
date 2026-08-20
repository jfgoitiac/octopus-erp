import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft } from 'lucide-react';
import { getArticulo } from '../api/sitio.service';
import { useSeo } from '../hooks/useSeo';
import Skeleton from '../components/ui/Skeleton';
import NotFound from './NotFound';
import { urlVariante } from '../lib/media';

const ArticuloDetalle = () => {
  const { slug } = useParams();
  // Se guarda el `slug` resuelto junto con el resultado (en vez de un estado
  // `cargando` aparte) para no llamar setState de forma síncrona al inicio
  // del efecto — `cargando` se deriva comparando contra el slug de la ruta.
  const [resultado, setResultado] = useState({ slug: null, articulo: null, error: false });

  useEffect(() => {
    let activo = true;
    getArticulo(slug)
      .then((res) => activo && setResultado({ slug, articulo: res.data, error: false }))
      .catch(() => activo && setResultado({ slug, articulo: null, error: true }));
    return () => {
      activo = false;
    };
  }, [slug]);

  const cargando = resultado.slug !== slug;
  const { articulo, error } = resultado;

  useSeo({ titulo: articulo?.seo_titulo || articulo?.titulo, descripcion: articulo?.seo_descripcion || articulo?.resumen });

  if (cargando) {
    return (
      <div className="contenedor py-12 space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    );
  }

  if (error || !articulo) return <NotFound />;

  const imagenUrl = urlVariante(articulo.imagen_destacada, 'lg', 'md');

  return (
    <article className="contenedor py-12 max-w-3xl">
      <Link to="/articulos" className="inline-flex items-center gap-1 text-sm text-[var(--texto-suave)] hover:text-[var(--color-primario)]">
        <ArrowLeft size={16} /> Volver a artículos
      </Link>

      {articulo.categoria && (
        <p className="mt-6 text-xs font-semibold text-[var(--color-primario)] uppercase">{articulo.categoria.nombre}</p>
      )}
      <h1 className="mt-2 text-3xl sm:text-4xl font-bold leading-tight">{articulo.titulo}</h1>

      <div className="mt-3 flex items-center gap-3 text-sm text-[var(--texto-suave)]">
        {articulo.autor?.nombre && <span>{articulo.autor.nombre}</span>}
        {articulo.publicado_en && (
          <span>{format(new Date(articulo.publicado_en), "d 'de' MMMM 'de' yyyy", { locale: es })}</span>
        )}
      </div>

      {imagenUrl && <img src={imagenUrl} alt={articulo.titulo} className="mt-8 w-full rounded-xl object-cover" />}

      <div
        className="mt-8 prose prose-slate max-w-none text-[var(--texto)] leading-relaxed"
        dangerouslySetInnerHTML={{ __html: articulo.cuerpo }}
      />
    </article>
  );
};

export default ArticuloDetalle;
