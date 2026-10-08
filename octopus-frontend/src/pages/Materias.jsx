import { useContext, useMemo, useState } from 'react';
import { Plus, Search, UserRound, GraduationCap } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { ROLE_GROUPS } from '../constants/roles';
import GradoSelect from '../components/GradoSelect';
import { ModalMateria } from '../components/horarios/ModalMateria';
import { INPUT_STYLE } from '../constants/styles';
import { useMaterias } from '../hooks/useMaterias';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { coincideBusqueda } from '../utils/busqueda';

const Materias = () => {
  const { user } = useContext(AuthContext);
  const soloLectura = ROLE_GROUPS.ACADEMICO_SOLO_LECTURA.includes((user?.rol || '').toLowerCase().trim());
  const { materias, loading, saving, crear, actualizar, eliminar } = useMaterias();
  const [filtro, setFiltro] = useState('');
  const [grado, setGrado] = useState('');
  const [modal, setModal] = useState(null);

  const materiasFiltradas = useMemo(() => {
    return materias.filter(materia => {
      const coincideGrado = !grado || materia.grado_seccion === grado;
      const coincideTexto = coincideBusqueda(
        `${materia.nombre} ${materia.grado_seccion} ${materia.docente_nombre || materia.docente_username || ''}`,
        filtro,
      );
      return coincideGrado && coincideTexto;
    });
  }, [filtro, grado, materias]);

  const guardar = async (form) => {
    const ok = form.id ? await actualizar(form) : await crear(form);
    if (ok) setModal(null);
  };

  const borrar = async (id) => {
    const ok = await eliminar(id);
    if (ok) setModal(null);
  };

  return (
    <div className="animate-fadeIn">
      <PageHeader
        titulo="Materias"
        descripcion={soloLectura ? 'Consulta las materias por grado y docente.' : 'Registra cada materia y asígnala a un grado y docente.'}
        acciones={soloLectura ? null : (
          <button
            type="button"
            onClick={() => setModal({ materia: null })}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white w-full sm:w-auto"
            style={{ background: 'var(--pb)' }}
          >
            <Plus size={16} /> Nueva materia
          </button>
        )}
      />

      <div className="mb-5 grid gap-3 md:grid-cols-[1fr_240px]">
        <label className="relative block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
          <input
            type="search"
            value={filtro}
            onChange={event => setFiltro(event.target.value)}
            placeholder="Buscar materia, grado o docente"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
            style={INPUT_STYLE}
          />
        </label>
        <GradoSelect
          value={grado}
          onChange={event => setGrado(event.target.value)}
          incluirVacio
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={INPUT_STYLE}
        />
      </div>

      <Card padding="none">
        {loading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map(item => <div key={item} className="h-14 rounded-lg animate-pulse" style={{ background: 'var(--border)' }} />)}
          </div>
        ) : materiasFiltradas.length === 0 ? (
          <div className="p-12 text-center" style={{ color: 'var(--ash)' }}>
            <GraduationCap size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">{materias.length ? 'No hay materias que coincidan con el filtro.' : 'Todavía no hay materias registradas.'}</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {materiasFiltradas.map(materia => {
              const Fila = soloLectura ? 'div' : 'button';
              const propsFila = soloLectura ? {} : { type: 'button', onClick: () => setModal({ materia }) };
              return (
              <Fila
                key={materia.id}
                {...propsFila}
                className={`w-full px-4 py-3 text-left flex items-center justify-between gap-4 transition-colors ${soloLectura ? '' : 'hover:bg-[var(--ash-light)]'}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--jet)' }}>{materia.nombre}</p>
                  <p className="text-xs mt-1 flex items-center gap-1.5" style={{ color: 'var(--ash)' }}>
                    <GraduationCap size={13} /> {materia.grado_seccion}
                    <span aria-hidden="true">·</span>
                    <UserRound size={13} /> {materia.docente_nombre || materia.docente_username || 'Sin docente asignado'}
                  </p>
                </div>
                <span className="text-xs font-medium flex-shrink-0" style={{ color: 'var(--ash)' }}>{materia.horas_academicas} h/sem.</span>
              </Fila>
              );
            })}
          </div>
        )}
      </Card>

      {modal && !soloLectura && (
        <ModalMateria
          materia={modal.materia}
          mostrarGrado
          saving={saving}
          onClose={() => setModal(null)}
          onSave={guardar}
          onDelete={borrar}
        />
      )}
    </div>
  );
};

export default Materias;
