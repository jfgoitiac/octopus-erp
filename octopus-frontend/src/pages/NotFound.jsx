import { useNavigate } from 'react-router-dom';
import { FileQuestion, ArrowLeft } from 'lucide-react';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen gap-5 px-4"
      style={{ background: 'var(--bg)' }}
    >
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--jet-light)', color: 'var(--ash)' }}
      >
        <FileQuestion size={32} />
      </div>

      <div className="text-center">
        <p className="text-5xl font-bold mb-2" style={{ color: 'var(--jet)' }}>404</p>
        <p className="text-base font-medium mb-1" style={{ color: 'var(--jet)' }}>
          Página no encontrada
        </p>
        <p className="text-sm" style={{ color: 'var(--ash)' }}>
          La ruta que buscas no existe o no tienes permiso para acceder a ella.
        </p>
      </div>

      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
        style={{ background: 'var(--pb)', color: '#fff' }}
      >
        <ArrowLeft size={16} />
        Volver al inicio
      </button>
    </div>
  );
};

export default NotFound;
