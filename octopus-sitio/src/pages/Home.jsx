import { useEffect, useState } from 'react';
import { getPaginaHome } from '../api/sitio.service';
import { useSeo } from '../hooks/useSeo';
import RenderSeccion from '../components/bloques/RenderSeccion';
import SeccionesSkeleton from '../components/ui/SeccionesSkeleton';
import NotFound from './NotFound';

const Home = () => {
  const [pagina, setPagina] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let activo = true;
    getPaginaHome()
      .then((res) => activo && setPagina(res.data))
      .catch(() => activo && setError(true))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, []);

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

export default Home;
