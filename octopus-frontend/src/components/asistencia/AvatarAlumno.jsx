import { useState } from 'react';
import { iniciales } from './paseLista.utils';

const AVATAR_STYLE = { background: 'var(--pb-light)', color: 'var(--pb-mid)', boxShadow: 'inset 0 0 0 1px rgba(15,163,177,0.15)' };

/**
 * Foto del alumno o, si no tiene (o no carga), sus iniciales.
 * Es decorativo: el nombre siempre se muestra al lado, por eso alt="".
 */
const AvatarAlumno = ({ nombre, foto, className = '' }) => {
  const [fotoFallida, setFotoFallida] = useState(null);
  const mostrarFoto = Boolean(foto) && foto !== fotoFallida;

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center overflow-hidden font-bold tracking-tight ${className}`}
      style={AVATAR_STYLE}
    >
      {mostrarFoto ? (
        <img
          src={foto}
          alt=""
          draggable={false}
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFotoFallida(foto)}
        />
      ) : (
        iniciales(nombre)
      )}
    </span>
  );
};

export default AvatarAlumno;
