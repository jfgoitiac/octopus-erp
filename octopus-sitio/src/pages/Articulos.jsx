import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getArticulos, getCategorias } from '../api/sitio.service';
import { useSeo } from '../hooks/useSeo';
import Skeleton from '../components/ui/Skeleton';
import { urlVariante } from '../lib/media';

const PAGE_SIZE = 9;

const Articulos = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') || 1);
  const categoria = searchParams.get('categoria') || '';

  const [categorias, setCategorias] = useState([]);
  // Se guarda la `key` de la consulta resuelta junto con el resultado (en vez
  // de un estado `cargando` aparte) para no llamar setState de forma
  // síncrona al inicio del efecto — `cargando` se deriva comparando contra
  // la key de los filtros actuales.
  const [resultado, setResultado] = useState({ key: null, data: null });
  const queryKey = `${page}|${categoria}`;

  useSeo({ titulo: 'Artículos', descripcion: 'Noticias y novedades institucionales.' });

  useEffect(() => {
    getCategorias().then((res) => setCategorias(res.data)).catch(() => setCategorias([]));
  }, []);

  useEffect(() => {
    let activo = true;
    getArticulos({ page, categoria })
      .then((res) => activo && setResultado({ key: queryKey, data: res.data }))
      .catch(() => activo && setResultado({ key: queryKey, data: { count: 0, results: [] } }));
    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, categoria]);

  const cargando = resultado.key !== queryKey;
  const data = cargando ? null : resultado.data;
  const totalPaginas = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  const cambiarCategoria = (slug) => {
    const next = new URLSearchParams();
    if (slug) next.set('categoria', slug);
    setSearchParams(next);
  };

  const irAPagina = (p) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(p));
    setSearchParams(next);
  };

  return (
    <div className="contenedor py-12">
      <h1 className="text-3xl font-bold">Artículos</h1>

      {categorias.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => cambiarCategoria('')}
            className={`px-4 py-1.5 rounded-full text-sm border ${!categoria ? 'bg-[var(--color-primario)] border-transparent' : 'border-[var(--border)] text-[var(--texto)]'}`}
            style={!categoria ? { color: 'var(--marca-primario-texto)' } : undefined}
          >
            Todas
          </button>
          {categorias.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => cambiarCategoria(cat.slug)}
              className={`px-4 py-1.5 rounded-full text-sm border ${categoria === cat.slug ? 'bg-[var(--color-primario)] border-transparent' : 'border-[var(--border)] text-[var(--texto)]'}`}
              style={categoria === cat.slug ? { color: 'var(--marca-primario-texto)' } : undefined}
            >
              {cat.nombre}
            </button>
          ))}
        </div>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cargando
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-72 w-full" />)
          : (data?.results ?? []).map((articulo) => {
              const imagenUrl = urlVariante(articulo.imagen_destacada, 'md', 'sm');
              return (
                <Link
                  key={articulo.id}
                  to={`/articulos/${articulo.slug}`}
                  className="rounded-xl border border-[var(--border)] overflow-hidden bg-white hover:shadow-md transition-shadow"
                >
                  {imagenUrl && <img src={imagenUrl} alt={articulo.titulo} className="h-44 w-full object-cover" />}
                  <div className="p-5">
                    {articulo.categoria && (
                      <span className="text-xs font-semibold text-[var(--color-primario)] uppercase">
                        {articulo.categoria.nombre}
                      </span>
                    )}
                    <h2 className="mt-1 font-semibold text-lg leading-snug">{articulo.titulo}</h2>
                    <p className="mt-2 text-sm text-[var(--texto-suave)] line-clamp-3">{articulo.resumen}</p>
                    {articulo.publicado_en && (
                      <p className="mt-3 text-xs text-[var(--texto-suave)]">
                        {format(new Date(articulo.publicado_en), "d 'de' MMMM 'de' yyyy", { locale: es })}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
      </div>

      {!cargando && (data?.results ?? []).length === 0 && (
        <p className="mt-10 text-center text-[var(--texto-suave)]">Todavía no hay artículos publicados.</p>
      )}

      {totalPaginas > 1 && (
        <div className="mt-10 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => irAPagina(page - 1)}
            className="p-2 rounded-full border border-[var(--border)] disabled:opacity-40"
            aria-label="Página anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm text-[var(--texto-suave)]">
            Página {page} de {totalPaginas}
          </span>
          <button
            type="button"
            disabled={page >= totalPaginas}
            onClick={() => irAPagina(page + 1)}
            className="p-2 rounded-full border border-[var(--border)] disabled:opacity-40"
            aria-label="Página siguiente"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
};

export default Articulos;
