import { useEffect, useState } from 'react';
import {
  Building2, Plus, Edit3, Trash2, UserPlus,
  Shield, X, Save, Loader2
} from 'lucide-react';
import { toast } from 'react-toastify';
import {
  getSedes, createSede, updateSede, deleteSede,
  getUsuariosSede, asignarUsuarioSede, revocarUsuarioSede,
} from '../api/multisede.service';

// ── helpers ───────────────────────────────────────────────────────────────────
const ROLES = ['director','administrador','secretaria','cajero','cobranza','sistemas','directivo_red'];

const initialSedeForm = {
  nombre: '', rif: '', direccion: '', telefono: '',
  correo: '', municipio: '', estado: '', activa: true,
};
const initialUserForm = { username: '', rol: 'cajero' };

// ── Skeleton ──────────────────────────────────────────────────────────────────
const SkeletonRow = () => (
  <tr className="animate-pulse">
    {[1,2,3,4,5].map(i => (
      <td key={i} className="px-4 py-3">
        <div className="h-3 rounded" style={{ background: 'var(--border-md)', width: i === 1 ? '60%' : '40%' }} />
      </td>
    ))}
  </tr>
);

// ── Modal genérico ────────────────────────────────────────────────────────────
const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
    <div
      className="w-full max-w-md rounded-2xl shadow-xl"
      style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
    >
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '0.5px solid var(--border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>{title}</h2>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ color: 'var(--ash)', transition: 'background 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--ash-light)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <X size={14} />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  </div>
);

// ── Input helper ──────────────────────────────────────────────────────────────
const Field = ({ label, name, value, onChange, type = 'text', required = false }) => (
  <div>
    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ash)' }}>
      {label}{required && ' *'}
    </label>
    <input
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      required={required}
      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
      style={{
        background: 'var(--bg)',
        border: '0.5px solid var(--border-md)',
        color: 'var(--jet)',
        transition: 'border-color 0.15s',
      }}
      onFocus={e => e.target.style.borderColor = 'var(--pb)'}
      onBlur={e => e.target.style.borderColor = 'var(--border-md)'}
    />
  </div>
);

// ── Tab button ────────────────────────────────────────────────────────────────
const Tab = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className="px-4 py-2 text-sm font-medium rounded-t-lg"
    style={{
      color: active ? 'var(--pb-mid)' : 'var(--ash)',
      borderBottom: active ? '2px solid var(--pb)' : '2px solid transparent',
      background: active ? 'var(--pb-light)' : 'transparent',
      transition: 'all 0.15s',
    }}
  >
    {children}
  </button>
);

// ── Página ────────────────────────────────────────────────────────────────────
const GestionSedes = () => {
  const [tab, setTab] = useState('sedes');

  // — Sedes —
  const [sedes, setSedes] = useState([]);
  const [loadingSedes, setLoadingSedes] = useState(true);
  const [modalSede, setModalSede] = useState(false);
  const [editingSede, setEditingSede] = useState(null);
  const [sedeForm, setSedeForm] = useState(initialSedeForm);
  const [savingSedeForm, setSavingSedeForm] = useState(false);

  // — Usuarios —
  const [sedeSeleccionada, setSedeSeleccionada] = useState('');
  const [usuarios, setUsuarios] = useState([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);
  const [modalUsuario, setModalUsuario] = useState(false);
  const [userForm, setUserForm] = useState(initialUserForm);
  const [savingUser, setSavingUser] = useState(false);

  // ── cargar sedes ────────────────────────────────────────────────────────────
  const cargarSedes = async () => {
    setLoadingSedes(true);
    try {
      const data = await getSedes();
      setSedes(Array.isArray(data) ? data : (data.results || []));
    } catch {
      toast.error('Error al cargar las sedes');
    } finally {
      setLoadingSedes(false);
    }
  };

  useEffect(() => { cargarSedes(); }, []);

  // ── cargar usuarios de la sede seleccionada ─────────────────────────────────
  useEffect(() => {
    if (!sedeSeleccionada) { setUsuarios([]); return; }
    setLoadingUsuarios(true);
    getUsuariosSede(sedeSeleccionada)
      .then(data => setUsuarios(Array.isArray(data) ? data : (data.results || [])))
      .catch(() => toast.error('Error al cargar los usuarios'))
      .finally(() => setLoadingUsuarios(false));
  }, [sedeSeleccionada]);

  // ── handlers sede ───────────────────────────────────────────────────────────
  const abrirNuevaSede = () => {
    setEditingSede(null);
    setSedeForm(initialSedeForm);
    setModalSede(true);
  };

  const abrirEditarSede = (sede) => {
    setEditingSede(sede);
    setSedeForm({
      nombre: sede.nombre || '', rif: sede.rif || '',
      direccion: sede.direccion || '', telefono: sede.telefono || '',
      correo: sede.correo || '', municipio: sede.municipio || '',
      estado: sede.estado || '', activa: sede.activa ?? true,
    });
    setModalSede(true);
  };

  const handleSedeFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSedeForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const guardarSede = async (e) => {
    e.preventDefault();
    setSavingSedeForm(true);
    try {
      if (editingSede) {
        await updateSede(editingSede.id, sedeForm);
        toast.success('Sede actualizada');
      } else {
        await createSede(sedeForm);
        toast.success('Sede creada');
      }
      setModalSede(false);
      cargarSedes();
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.response?.data?.nombre?.[0] || 'Error al guardar la sede';
      toast.error(msg);
    } finally {
      setSavingSedeForm(false);
    }
  };

  const eliminarSede = async (id) => {
    if (!window.confirm('¿Eliminar esta sede? Esta acción no se puede deshacer.')) return;
    try {
      await deleteSede(id);
      toast.success('Sede eliminada');
      cargarSedes();
    } catch {
      toast.error('Error al eliminar la sede');
    }
  };

  // ── handlers usuarios ───────────────────────────────────────────────────────
  const asignarUsuario = async (e) => {
    e.preventDefault();
    setSavingUser(true);
    try {
      await asignarUsuarioSede(sedeSeleccionada, userForm);
      toast.success('Usuario asignado');
      setModalUsuario(false);
      setUserForm(initialUserForm);
      // recargar usuarios
      const data = await getUsuariosSede(sedeSeleccionada);
      setUsuarios(Array.isArray(data) ? data : (data.results || []));
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Error al asignar usuario';
      toast.error(msg);
    } finally {
      setSavingUser(false);
    }
  };

  const revocarUsuario = async (userId) => {
    if (!window.confirm('¿Revocar acceso a este usuario?')) return;
    try {
      await revocarUsuarioSede(sedeSeleccionada, userId);
      toast.success('Acceso revocado');
      setUsuarios(prev => prev.filter(u => u.id !== userId));
    } catch {
      toast.error('Error al revocar el acceso');
    }
  };

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--jet)' }}>Gestión de Sedes</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
          Administra las sedes y sus usuarios asignados
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-0" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
        <Tab active={tab === 'sedes'} onClick={() => setTab('sedes')}>
          <span className="flex items-center gap-1.5"><Building2 size={13} />Sedes</span>
        </Tab>
        <Tab active={tab === 'usuarios'} onClick={() => setTab('usuarios')}>
          <span className="flex items-center gap-1.5"><Shield size={13} />Usuarios por sede</span>
        </Tab>
      </div>

      <div
        className="rounded-b-xl rounded-tr-xl p-4"
        style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', borderTop: 'none' }}
      >
        {/* ── TAB SEDES ── */}
        {tab === 'sedes' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>
                Sedes registradas
              </h2>
              <button
                onClick={abrirNuevaSede}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--pb)', color: '#fff', transition: 'opacity 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <Plus size={13} />
                Nueva sede
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                    {['Nombre','Municipio','Estado','Alumnos','Activa','Acciones'].map(h => (
                      <th key={h} className="text-left pb-2 pr-3 font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingSedes ? (
                    [1,2,3].map(i => <SkeletonRow key={i} />)
                  ) : sedes.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8" style={{ color: 'var(--ash)' }}>
                        No hay sedes registradas.
                      </td>
                    </tr>
                  ) : sedes.map(sede => (
                    <tr key={sede.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                      <td className="py-2.5 pr-3 font-medium" style={{ color: 'var(--jet)' }}>{sede.nombre}</td>
                      <td className="py-2.5 pr-3" style={{ color: 'var(--ash)' }}>{sede.municipio || '—'}</td>
                      <td className="py-2.5 pr-3" style={{ color: 'var(--ash)' }}>{sede.estado || '—'}</td>
                      <td className="py-2.5 pr-3" style={{ color: 'var(--jet)' }}>{sede.alumnos_activos ?? '—'}</td>
                      <td className="py-2.5 pr-3">
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                          style={{
                            background: sede.activa ? 'var(--pb-light)' : 'var(--ash-light)',
                            color: sede.activa ? 'var(--pb-mid)' : 'var(--ash)',
                          }}
                        >
                          {sede.activa ? 'Sí' : 'No'}
                        </span>
                      </td>
                      <td className="py-2.5 flex items-center gap-1">
                        <button
                          onClick={() => abrirEditarSede(sede)}
                          className="p-1.5 rounded-lg"
                          title="Editar"
                          style={{ color: 'var(--ash)', transition: 'background 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--pb-light)'; e.currentTarget.style.color = 'var(--pb-mid)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ash)'; }}
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={() => eliminarSede(sede.id)}
                          className="p-1.5 rounded-lg"
                          title="Eliminar"
                          style={{ color: 'var(--ash)', transition: 'background 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-light)'; e.currentTarget.style.color = 'var(--red)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ash)'; }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── TAB USUARIOS ── */}
        {tab === 'usuarios' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Sede:</label>
                <select
                  value={sedeSeleccionada}
                  onChange={e => setSedeSeleccionada(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-xs outline-none"
                  style={{
                    background: 'var(--bg)',
                    border: '0.5px solid var(--border-md)',
                    color: 'var(--jet)',
                  }}
                >
                  <option value="">— Seleccionar sede —</option>
                  {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
              {sedeSeleccionada && (
                <button
                  onClick={() => setModalUsuario(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: 'var(--pb)', color: '#fff', transition: 'opacity 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  <UserPlus size={13} />
                  Asignar usuario
                </button>
              )}
            </div>

            {!sedeSeleccionada ? (
              <p className="text-sm text-center py-10" style={{ color: 'var(--ash)' }}>
                Selecciona una sede para ver sus usuarios
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                      {['Usuario','Rol','Activo','Acciones'].map(h => (
                        <th key={h} className="text-left pb-2 pr-3 font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loadingUsuarios ? (
                      [1,2,3].map(i => <SkeletonRow key={i} />)
                    ) : usuarios.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-8" style={{ color: 'var(--ash)' }}>
                          No hay usuarios asignados a esta sede.
                        </td>
                      </tr>
                    ) : usuarios.map(u => (
                      <tr key={u.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                        <td className="py-2.5 pr-3 font-medium" style={{ color: 'var(--jet)' }}>{u.username}</td>
                        <td className="py-2.5 pr-3">
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] capitalize"
                            style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
                          >
                            {u.rol}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px]"
                            style={{
                              background: u.activo !== false ? '#dcfce7' : 'var(--red-light)',
                              color: u.activo !== false ? '#16a34a' : 'var(--red)',
                            }}
                          >
                            {u.activo !== false ? 'Sí' : 'No'}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <button
                            onClick={() => revocarUsuario(u.id)}
                            className="p-1.5 rounded-lg"
                            title="Revocar acceso"
                            style={{ color: 'var(--ash)', transition: 'background 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-light)'; e.currentTarget.style.color = 'var(--red)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ash)'; }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modal: crear / editar sede ── */}
      {modalSede && (
        <Modal title={editingSede ? 'Editar sede' : 'Nueva sede'} onClose={() => setModalSede(false)}>
          <form onSubmit={guardarSede} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre" name="nombre" value={sedeForm.nombre} onChange={handleSedeFormChange} required />
              <Field label="RIF" name="rif" value={sedeForm.rif} onChange={handleSedeFormChange} />
              <Field label="Teléfono" name="telefono" value={sedeForm.telefono} onChange={handleSedeFormChange} />
              <Field label="Correo" name="correo" value={sedeForm.correo} onChange={handleSedeFormChange} type="email" />
              <Field label="Municipio" name="municipio" value={sedeForm.municipio} onChange={handleSedeFormChange} />
              <Field label="Estado" name="estado" value={sedeForm.estado} onChange={handleSedeFormChange} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ash)' }}>Dirección</label>
              <textarea
                name="direccion"
                value={sedeForm.direccion}
                onChange={handleSedeFormChange}
                rows={2}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                style={{ background: 'var(--bg)', border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
                onFocus={e => e.target.style.borderColor = 'var(--pb)'}
                onBlur={e => e.target.style.borderColor = 'var(--border-md)'}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="activa"
                checked={sedeForm.activa}
                onChange={handleSedeFormChange}
                className="rounded"
              />
              <span className="text-xs" style={{ color: 'var(--jet)' }}>Sede activa</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalSede(false)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingSedeForm}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--pb)', color: '#fff', opacity: savingSedeForm ? 0.7 : 1 }}
              >
                {savingSedeForm ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Guardar
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Modal: asignar usuario ── */}
      {modalUsuario && (
        <Modal title="Asignar usuario a sede" onClose={() => setModalUsuario(false)}>
          <form onSubmit={asignarUsuario} className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ash)' }}>
                Username o email *
              </label>
              <input
                type="text"
                value={userForm.username}
                onChange={e => setUserForm(prev => ({ ...prev, username: e.target.value }))}
                required
                placeholder="usuario@ejemplo.com"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg)', border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
                onFocus={e => e.target.style.borderColor = 'var(--pb)'}
                onBlur={e => e.target.style.borderColor = 'var(--border-md)'}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ash)' }}>Rol *</label>
              <select
                value={userForm.rol}
                onChange={e => setUserForm(prev => ({ ...prev, rol: e.target.value }))}
                required
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg)', border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalUsuario(false)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingUser}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--pb)', color: '#fff', opacity: savingUser ? 0.7 : 1 }}
              >
                {savingUser ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                Asignar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default GestionSedes;
