import { Link } from 'react-router-dom';
import { useSeo } from '../hooks/useSeo';

const NotFound = () => {
  useSeo({ titulo: 'Página no encontrada' });

  return (
    <div className="contenedor py-24 text-center">
      <p className="text-sm font-semibold text-[var(--color-primario)]">404</p>
      <h1 className="mt-2 text-3xl font-bold">No encontramos esta página</h1>
      <p className="mt-3 text-[var(--texto-suave)]">El contenido que buscas no existe o ya no está disponible.</p>
      <Link
        to="/"
        className="mt-8 inline-flex rounded-full bg-[var(--color-primario)] px-6 py-3 text-sm font-semibold hover:opacity-90"
        style={{ color: 'var(--marca-primario-texto)' }}
      >
        Volver al inicio
      </Link>
    </div>
  );
};

export default NotFound;
