import { useEffect, useMemo, useState } from 'react';
import { UserRound, Plus, Search, GraduationCap, BookOpen } from 'lucide-react';
import apiClient from '../api/apiClient';
import { ModalDocente } from '../components/docentes/ModalDocente';
import { ModalAsignarMaterias } from '../components/docentes/ModalAsignarMaterias';
import { INPUT_STYLE } from '../constants/styles';
import { useDocentesAdmin } from '../hooks/useDocentesAdmin';
import { fmtFecha } from '../utils/format';

const Docentes = () => {
  const { docentes, loading, saving, crear, actualizar, eliminar, asignarMaterias } = useDocentesAdmin();
  const [filtro, setFiltro] = useState('');
  const [modal, setModal] = useState(null);
  const [modalAsignar, setModalAsignar] = useState(null);
  const [usuariosDocentes, setUsuariosDocentes] = useState([]);

  useEffect(() => {
    const controller = new AbortController();
    apiClient.get('authentication/users/', { signal: controller.signal })
      .then(res => setUsuariosDocentes((res.data || []).filter(u => u.perfil?.rol === 'docente')))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const docentesConUsuarioLibre = useMemo(() => {
    const idsConDocente = new Set(docentes.map(d => d.user_id));
    return usuariosDocentes.filter(u => !idsConDocente.has(u.id));
  }, [usuariosDocentes, docentes]);

  const docentesFiltrados = useMemo(() => {
    const termino = filtro.trim().toLowerCase();
    return docentes.filter(docente => {
      if (!termino) return true;
      const texto = `${docente.nombre_completo} ${docente.especialidad || ''}`.toLowerCase();
      return texto.includes(termino);
    });
  }, [filtro, docentes]);

  const guardar = async (form) => {
    const ok = form.id ? await actualizar(form) : await crear(form);
    if (ok) setModal(null);
  };

  const borrar = async (id) => {
    const ok = await eliminar(id);
    if (ok) setModal(null);
  };

  const guardarAsignacion = async (id, materiaIds) => {
    const ok = await asignarMaterias(id, materiaIds);
    if (ok) setModalAsignar(null);
  };

  return (
    <div className="animate-fadeIn">
      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--jet)' }}>
            <UserRound size={20} style={{ color: 'var(--pb)' }} />
            Docentes
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
            Gestiona los docentes del colegio y sus materias asignadas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ docente: null })}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'var(--pb)' }}
        >
          <Plus size={16} /> Nuevo docente
        </button>
      </div>

      <div className="mb-5">
        <label className="relative block max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
          <input
            type="search"
            value={filtro}
            onChange={event => setFiltro(event.target.value)}
            placeholder="Buscar por nombre o especialidad"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
            style={INPUT_STYLE}
          />
        </label>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
        {loading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map(item => <div key={item} className="h-14 rounded-lg animate-pulse" style={{ background: 'var(--border)' }} />)}
          </div>
        ) : docentesFiltrados.length === 0 ? (
          <div className="p-12 text-center" style={{ color: 'var(--ash)' }}>
            <UserRound size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">{docentes.length ? 'No hay docentes que coincidan con el filtro.' : 'Todavía no hay docentes registrados.'}</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {docentesFiltrados.map(docente => (
              <div
                key={docente.id}
                className="w-full px-4 py-3 flex items-center justify-between gap-4"
              >
                <button
                  type="button"
                  onClick={() => setModal({ docente })}
                  className="min-w-0 text-left flex-1 hover:opacity-80 transition-opacity"
                >
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--jet)' }}>
                    {docente.nombre_completo}
                    {!docente.activo && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                        Inactivo
                      </span>
                    )}
                  </p>
                  <p className="text-xs mt-1 flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--ash)' }}>
                    {docente.especialidad || 'Sin especialidad'}
                    <span aria-hidden="true">·</span>
                    <BookOpen size={13} /> {docente.materias?.length || 0} materia(s)
                    {docente.fecha_ingreso && (
                      <>
                        <span aria-hidden="true">·</span>
                        Ingreso: {fmtFecha(docente.fecha_ingreso)}
                      </>
                    )}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setModalAsignar({ docente })}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ border: '0.5px solid var(--border-md)', color: 'var(--pb)' }}
                >
                  <GraduationCap size={13} /> Asignar materias
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <ModalDocente
          docente={modal.docente}
          docentesDisponibles={docentesConUsuarioLibre}
          saving={saving}
          onClose={() => setModal(null)}
          onSave={guardar}
          onDelete={borrar}
        />
      )}

      {modalAsignar && (
        <ModalAsignarMaterias
          docente={modalAsignar.docente}
          saving={saving}
          onClose={() => setModalAsignar(null)}
          onSave={guardarAsignacion}
        />
      )}
    </div>
  );
};

export default Docentes;
