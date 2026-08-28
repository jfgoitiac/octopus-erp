import { useNavigate } from 'react-router-dom';
import { BookOpen, Users, ChevronRight } from 'lucide-react';
import { Avatar } from './shared';
import { useDocentePerfil } from '../../hooks/useDocentePerfil';

const WidgetPerfilDocente = ({ nombre, cantidadMaterias, cantidadAlumnos }) => {
  const navigate = useNavigate();
  const { perfil } = useDocentePerfil();

  return (
    <button
      type="button"
      onClick={() => navigate('/portal-docente/perfil')}
      className="relative w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col items-center text-center gap-3 h-full justify-center hover:shadow-md hover:-translate-y-0.5 transition-shadow"
    >
      <ChevronRight size={16} className="absolute top-3 right-3 text-gray-300" />
      <Avatar nombre={nombre} foto={perfil?.foto} className="w-14 h-14 text-base" />
      <div>
        <p className="text-sm font-semibold text-gray-900">{nombre || 'Docente'}</p>
        <p className="text-xs text-gray-400">Ver mi perfil</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full pt-1">
        <div className="flex flex-col items-center gap-1 rounded-xl bg-[var(--docente-bg)] py-2.5">
          <BookOpen size={16} className="text-[var(--docente-primary)]" />
          <p className="text-sm font-bold text-gray-900 leading-none">{cantidadMaterias}</p>
          <p className="text-[10px] text-gray-400">Materias</p>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-xl bg-[var(--docente-bg)] py-2.5">
          <Users size={16} className="text-[var(--docente-primary)]" />
          <p className="text-sm font-bold text-gray-900 leading-none">{cantidadAlumnos}</p>
          <p className="text-[10px] text-gray-400">Alumnos</p>
        </div>
      </div>
    </button>
  );
};

export default WidgetPerfilDocente;
