import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Package, Plus, Send, Trash2, Loader2, GraduationCap, X, CalendarRange,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { TablaScroll } from '../components/ui/TablaScroll';
import GradoSelect from '../components/GradoSelect';
import { INPUT_STYLE } from '../constants/styles';
import { usePaquetesHorario, useGradosPaquete } from '../hooks/usePaquetesHorario';
import { useSede } from '../context/SedeContext';

const ESTADO_ESTILO = {
  borrador:  { background: '#f4f4f5', color: 'var(--ash)' },
  publicado: { background: '#dcfce7', color: '#166534' },
};

const ModalNuevoPaquete = ({ sedeActiva, onClose, onCrear, saving }) => {
  const [form, setForm] = useState({
    nombre: '',
    periodo_escolar: '',
    sede: sedeActiva?.id ?? '',
  });

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.periodo_escolar.trim()) {
      toast.warning('Completa nombre y periodo escolar.');
      return;
    }
    const ok = await onCrear(form);
    if (ok) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      titulo={(<><Package size={17} />Nuevo paquete de horario</>)}
      size="sm"
      footer={(
        <>
          <button type="button" onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-sm"
            style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
            Cancelar
          </button>
          <button type="submit" form="form-paquete" disabled={saving}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white disabled:opacity-50"
            style={{ background: 'var(--pb)' }}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Crear
          </button>
        </>
      )}
    >
      <form id="form-paquete" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Nombre
          </label>
          <input type="text" placeholder="Ej: Horario Primaria 2026"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE}
            value={form.nombre} onChange={set('nombre')} autoFocus required />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Periodo escolar
          </label>
          <input type="text" placeholder="Ej: 2026-2027"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE}
            value={form.periodo_escolar} onChange={set('periodo_escolar')} required />
        </div>
      </form>
    </Modal>
  );
};

const ModalGradosPaquete = ({ paquete, onClose, onAgregar, onQuitar, saving }) => {
  const { grados, loading } = useGradosPaquete(paquete.id);
  const [gradoNuevo, setGradoNuevo] = useState('');

  const handleAgregar = async () => {
    if (!gradoNuevo) { toast.warning('Selecciona un grado.'); return; }
    const ok = await onAgregar(paquete.id, gradoNuevo);
    if (ok) setGradoNuevo('');
  };

  return (
    <Modal
      open
      onClose={onClose}
      titulo={(<><GraduationCap size={17} />Grados de "{paquete.nombre}"</>)}
      size="sm"
      footer={(
        <button type="button" onClick={onClose}
          className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-sm text-white"
          style={{ background: 'var(--pb)' }}>
          Listo
        </button>
      )}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
          <GradoSelect
            value={gradoNuevo}
            onChange={e => setGradoNuevo(e.target.value)}
            incluirVacio
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={INPUT_STYLE}
          />
          <button type="button" onClick={handleAgregar} disabled={saving}
            className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 text-white disabled:opacity-50"
            style={{ background: 'var(--pb)' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Agregar
          </button>
        </div>

        {loading ? (
          <p className="text-xs" style={{ color: 'var(--ash)' }}>Cargando grados...</p>
        ) : grados.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--ash)' }}>Este paquete aún no tiene grados asignados.</p>
        ) : (
          <ul className="space-y-1.5">
            {grados.map(g => (
              <li key={g.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                <span style={{ color: 'var(--jet)' }}>{g.grado_seccion}</span>
                <button type="button" onClick={() => onQuitar(paquete.id, g.id)} disabled={saving}
                  aria-label={`Quitar ${g.grado_seccion}`}
                  className="p-1 rounded hover:bg-[var(--red-light)] disabled:opacity-50">
                  <X size={13} style={{ color: 'var(--red)' }} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
};

const PaquetesHorario = () => {
  const navigate = useNavigate();
  const sede = useSede();
  const {
    paquetes, loading, saving, recargar,
    crear, eliminar, publicar, agregarGrado, quitarGrado,
  } = usePaquetesHorario(sede?.sedeActiva?.id);

  const [modalNuevo, setModalNuevo]   = useState(false);
  const [modalGrados, setModalGrados] = useState(null); // paquete | null
  const [confirmEliminar, setConfirmEliminar] = useState(null); // id | null

  const handleCrear = async (form) => {
    const res = await crear(form);
    return res.ok;
  };

  const handleEliminar = async (id) => {
    const ok = await eliminar(id);
    if (ok) setConfirmEliminar(null);
  };

  return (
    <div className="animate-fadeIn">
      <PageHeader
        titulo="Paquetes de Horario"
        descripcion="Jornadas horarias por sede y periodo — agrupan grados, bloques y clases"
        acciones={
          <button
            onClick={() => setModalNuevo(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 focus-visible:ring-offset-2"
            style={{ background: 'var(--pb)' }}
          >
            <Plus size={16} />
            Nuevo paquete
          </button>
        }
      />

      <Card padding="none">
        {loading ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--ash)' }}>
            <Loader2 size={20} className="animate-spin mx-auto mb-2" />
            Cargando paquetes...
          </div>
        ) : paquetes.length === 0 ? (
          <div className="p-12 text-center" style={{ color: 'var(--ash)' }}>
            <Package size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aún no hay paquetes de horario. Crea el primero para empezar.</p>
          </div>
        ) : (
          <TablaScroll>
            <table className="w-full border-collapse" style={{ minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                  <th className="px-4 py-3 text-left text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Nombre</th>
                  <th className="px-4 py-3 text-left text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Periodo</th>
                  <th className="px-4 py-3 text-left text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Estado</th>
                  <th className="px-4 py-3 text-left text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Grados</th>
                  <th className="px-4 py-3 text-right text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paquetes.map(p => (
                  <tr key={p.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                    <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--jet)' }}>{p.nombre}</td>
                    <td className="px-4 py-3 text-sm flex items-center gap-1.5" style={{ color: 'var(--ash)' }}>
                      <CalendarRange size={13} />
                      {p.periodo_escolar}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-full text-[11px] font-medium"
                        style={ESTADO_ESTILO[p.estado] || ESTADO_ESTILO.borrador}>
                        {p.estado === 'publicado' ? 'Publicado' : 'Borrador'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setModalGrados(p)}
                        className="text-xs font-medium underline-offset-2 hover:underline"
                        style={{ color: 'var(--pb)' }}>
                        {p.grados?.length || 0} grado{(p.grados?.length || 0) !== 1 ? 's' : ''}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <button type="button"
                          onClick={() => navigate(`/horarios?paquete=${p.id}`)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
                          style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
                          Ver horario
                        </button>
                        {p.estado !== 'publicado' && (
                          <button type="button" onClick={() => publicar(p.id)} disabled={saving}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                            style={{ background: 'var(--pb)' }}>
                            <Send size={11} />
                            Publicar
                          </button>
                        )}
                        {confirmEliminar === p.id ? (
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => handleEliminar(p.id)} disabled={saving}
                              className="px-2 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                              style={{ background: 'var(--red)' }}>
                              Confirmar
                            </button>
                            <button type="button" onClick={() => setConfirmEliminar(null)}
                              className="px-2 py-1.5 rounded-lg text-xs"
                              style={{ color: 'var(--ash)' }}>
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setConfirmEliminar(p.id)}
                            aria-label={`Eliminar ${p.nombre}`}
                            className="p-1.5 rounded-lg hover:bg-[var(--red-light)]">
                            <Trash2 size={13} style={{ color: 'var(--red)' }} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TablaScroll>
        )}
      </Card>

      {modalNuevo && (
        <ModalNuevoPaquete
          sedeActiva={sede?.sedeActiva}
          onClose={() => setModalNuevo(false)}
          onCrear={handleCrear}
          saving={saving}
        />
      )}

      {modalGrados && (
        <ModalGradosPaquete
          paquete={modalGrados}
          onClose={() => { setModalGrados(null); recargar(); }}
          onAgregar={agregarGrado}
          onQuitar={quitarGrado}
          saving={saving}
        />
      )}
    </div>
  );
};

export default PaquetesHorario;
