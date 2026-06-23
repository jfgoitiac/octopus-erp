import { useState } from 'react';
import {
  Building2, Plus, Edit3, Trash2, UserPlus,
  Shield, X, Save, Loader2,
} from 'lucide-react';
import { useSedes } from '../hooks/useSedes';
import { useUsuariosSede } from '../hooks/useUsuariosSede';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { ROL_OPTIONS } from '../constants/roles';

// ── Skeleton genérico ─────────────────────────────────────────────────────────
// cols debe coincidir con el número real de columnas de cada tabla
const SkeletonRow = ({ cols = 5 }) => (
  <tr className="animate-pulse">
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="px-4 py-3">
        <div className="h-3 rounded" style={{ background: 'var(--border-md)', width: i === 0 ? '60%' : '40%' }} />
      </td>
    ))}
  </tr>
);

// ── Modal genérico — scrollable en mobile ─────────────────────────────────────
const Modal = ({ title, onClose, children }) => (
  <div
    className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 overflow-y-auto"
    style={{ background: 'rgba(0,0,0,0.4)' }}
  >
    <div
      className="w-full max-w-md rounded-2xl shadow-xl"
      style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
    >
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '0.5px solid var(--border)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>{title}</h2>
        <button
          onClick={onClose}
          aria-label="Cerrar modal"
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

// ── Input reutilizable ────────────────────────────────────────────────────────
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
        fontSize: '16px',
        transition: 'border-color 0.15s',
      }}
      onFocus={e => e.target.style.borderColor = 'var(--pb)'}
      onBlur={e => e.target.style.borderColor = 'var(--border-md)'}
    />
  </div>
);

// ── Tab ───────────────────────────────────────────────────────────────────────
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

// ── IconButton — consolida todos los onMouseEnter/Leave inline ────────────────
const IconButton = ({ onClick, title, variant = 'primary', disabled = false, children }) => {
  const hoverBg    = variant === 'danger' ? 'var(--red-light)' : 'var(--pb-light)';
  const hoverColor = variant === 'danger' ? 'var(--red)'       : 'var(--pb-mid)';
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className="p-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ color: 'var(--ash)', transition: 'background 0.15s' }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = hoverBg; e.currentTarget.style.color = hoverColor; } }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ash)'; }}
    >
      {children}
    </button>
  );
};

// ── Página ────────────────────────────────────────────────────────────────────
const GestionSedes = () => {
  const [tab, setTab] = useState('sedes');

  // C-2 fix: ID almacenado como Number (el select siempre devuelve string, parseamos al cambio)
  const [sedeSeleccionada, setSedeSeleccionada] = useState('');

  const {
    sedes, loading: loadingSedes,
    form: sedeForm, editingSede, showModal: modalSede, saving: savingSedeForm,
    sedeParaEliminar, deletingId,
    abrirNueva, abrirEditar, cerrarModal: cerrarModalSede,
    handleFormChange, guardar,
    solicitarEliminar, cancelarEliminar, confirmarEliminar,
  } = useSedes();

  const {
    usuarios, loading: loadingUsuarios,
    form: userForm, setForm: setUserForm,
    showModal: modalUsuario, setShowModal: setModalUsuario,
    saving: savingUser,
    usuarioParaRevocar, revokingId,
    cerrarModal: cerrarModalUsuario, asignar: asignarUsuario,
    solicitarRevocar, cancelarRevocar, confirmarRevocar,
  } = useUsuariosSede(sedeSeleccionada);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
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
              <h2 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Sedes registradas</h2>
              <button
                onClick={abrirNueva}
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
                    {['Nombre', 'Municipio', 'Estado', 'Alumnos', 'Activa', 'Acciones'].map(h => (
                      <th
                        key={h}
                        className="text-left pb-2 pr-3 font-medium uppercase tracking-wide"
                        style={{ color: 'var(--ash)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingSedes ? (
                    [1, 2, 3].map(i => <SkeletonRow key={i} cols={6} />)
                  ) : sedes.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10" style={{ color: 'var(--ash)' }}>
                        No hay sedes registradas.{' '}
                        <button
                          onClick={abrirNueva}
                          className="underline"
                          style={{ color: 'var(--pb-mid)' }}
                        >
                          Crear la primera
                        </button>
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
                        <IconButton
                          onClick={() => abrirEditar(sede)}
                          title="Editar sede"
                          disabled={deletingId === sede.id}
                        >
                          <Edit3 size={13} />
                        </IconButton>
                        <IconButton
                          onClick={() => solicitarEliminar(sede)}
                          title="Eliminar sede"
                          variant="danger"
                          disabled={deletingId === sede.id}
                        >
                          {deletingId === sede.id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Trash2 size={13} />
                          }
                        </IconButton>
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
                  onChange={e => setSedeSeleccionada(Number(e.target.value) || '')}
                  disabled={loadingSedes}
                  className="px-3 py-1.5 rounded-lg text-xs outline-none disabled:opacity-60"
                  style={{
                    background: 'var(--bg)',
                    border: '0.5px solid var(--border-md)',
                    color: 'var(--jet)',
                  }}
                >
                  <option value="">
                    {loadingSedes ? 'Cargando sedes…' : '— Seleccionar sede —'}
                  </option>
                  {sedes.map(s => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
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
                      {['Usuario', 'Rol', 'Activo', 'Acciones'].map(h => (
                        <th
                          key={h}
                          className="text-left pb-2 pr-3 font-medium uppercase tracking-wide"
                          style={{ color: 'var(--ash)' }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loadingUsuarios ? (
                      [1, 2, 3].map(i => <SkeletonRow key={i} cols={4} />)
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
                              background: u.activo ? '#dcfce7' : 'var(--red-light)',
                              color:      u.activo ? '#16a34a' : 'var(--red)',
                            }}
                          >
                            {u.activo ? 'Sí' : 'No'}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <IconButton
                            onClick={() => solicitarRevocar(u)}
                            title="Revocar acceso"
                            variant="danger"
                            disabled={revokingId === u.id}
                          >
                            {revokingId === u.id
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Trash2 size={13} />
                            }
                          </IconButton>
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
        <Modal title={editingSede ? 'Editar sede' : 'Nueva sede'} onClose={cerrarModalSede}>
          <form onSubmit={guardar} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre"    name="nombre"    value={sedeForm.nombre}    onChange={handleFormChange} required />
              <Field label="RIF"       name="rif"       value={sedeForm.rif}       onChange={handleFormChange} />
              <Field label="Teléfono"  name="telefono"  value={sedeForm.telefono}  onChange={handleFormChange} />
              <Field label="Correo"    name="correo"    value={sedeForm.correo}    onChange={handleFormChange} type="email" />
              <Field label="Municipio" name="municipio" value={sedeForm.municipio} onChange={handleFormChange} />
              <Field label="Estado"    name="estado"    value={sedeForm.estado}    onChange={handleFormChange} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ash)' }}>Dirección</label>
              <textarea
                name="direccion"
                value={sedeForm.direccion}
                onChange={handleFormChange}
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
                onChange={handleFormChange}
                className="rounded"
              />
              <span className="text-xs" style={{ color: 'var(--jet)' }}>Sede activa</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={cerrarModalSede}
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
        <Modal title="Asignar usuario a sede" onClose={cerrarModalUsuario}>
          <form onSubmit={asignarUsuario} className="space-y-3">
            {/* Q-3 fix: reutiliza Field en lugar de input inline */}
            <Field
              label="Username o email"
              name="username"
              value={userForm.username}
              onChange={e => setUserForm(prev => ({ ...prev, username: e.target.value }))}
              required
            />
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ash)' }}>Rol *</label>
              <select
                value={userForm.rol}
                onChange={e => setUserForm(prev => ({ ...prev, rol: e.target.value }))}
                required
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg)', border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
              >
                {/* Fuente única de roles: constants/roles.js — deuda técnica resuelta */}
                {ROL_OPTIONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={cerrarModalUsuario}
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

      {/* ── Confirm: eliminar sede (reemplaza window.confirm — UX-1 fix) ── */}
      {sedeParaEliminar && (
        <ConfirmDeleteModal
          titulo="Eliminar sede"
          nombre={sedeParaEliminar.nombre}
          onConfirm={confirmarEliminar}
          onCancel={cancelarEliminar}
        />
      )}

      {/* ── Confirm: revocar acceso (reemplaza window.confirm — UX-1 fix) ── */}
      {usuarioParaRevocar && (
        <ConfirmDeleteModal
          titulo="Revocar acceso a la sede"
          nombre={usuarioParaRevocar.username}
          onConfirm={confirmarRevocar}
          onCancel={cancelarRevocar}
        />
      )}
    </div>
  );
};

export default GestionSedes;
