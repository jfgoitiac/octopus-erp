import { useState } from 'react';
import { toast } from 'react-toastify';
import { Modal } from '../../ui/Modal';
import { crearClienteCxc, actualizarClienteCxc } from '../../../api/cantina.service';
import { mensajeError } from './utilsCxc';

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const LABEL_CLASS = 'block text-xs uppercase tracking-widest mb-1.5';

const TIPOS = [
  { value: 'personal', label: 'Personal del colegio' },
  { value: 'otro', label: 'Otro' },
];

const vacio = { nombre: '', apellido: '', documento: '', telefono: '', email: '', tipo: 'personal', activo: true };

// Alta / edición de un cliente general de cuentas por cobrar (personal u otros).
// Los representantes NO se crean aquí: se buscan como representantes existentes.
// `cliente` (opcional) = datos actuales para editar; `onGuardado(clienteResumen)`.
const ClienteFormModal = ({ open, onClose, cliente = null, onGuardado }) => {
  const editando = Boolean(cliente?.id);
  const [form, setForm] = useState(() => (editando
    ? {
      nombre: cliente.nombre || '',
      apellido: cliente.apellido || '',
      documento: cliente.cedula || cliente.documento || '',
      telefono: cliente.telefono || '',
      email: cliente.email || '',
      tipo: cliente.tipo || 'personal',
      activo: cliente.activo !== false,
    }
    : vacio));
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);

  const cambiar = (campo) => (e) => {
    const valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [campo]: valor }));
    setErrores(er => ({ ...er, [campo]: undefined }));
  };

  const guardar = async (e) => {
    e?.preventDefault();
    if (guardando) return;
    if (!form.nombre.trim()) {
      setErrores({ nombre: 'El nombre es obligatorio.' });
      return;
    }
    setGuardando(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        apellido: form.apellido.trim(),
        documento: form.documento.trim(),
        telefono: form.telefono.trim(),
        email: form.email.trim(),
        tipo: form.tipo,
        activo: form.activo,
      };
      const res = editando
        ? await actualizarClienteCxc(cliente.id, payload)
        : await crearClienteCxc(payload);
      toast.success(editando ? 'Cliente actualizado.' : 'Cliente agregado.');
      onGuardado?.(res.data);
      onClose();
    } catch (err) {
      const data = err?.response?.data;
      if (data && typeof data === 'object' && !data.detail) {
        const porCampo = {};
        Object.entries(data).forEach(([k, v]) => { porCampo[k] = Array.isArray(v) ? v[0] : String(v); });
        setErrores(porCampo);
      }
      toast.error(await mensajeError(err, 'No se pudo guardar el cliente.'));
    } finally {
      setGuardando(false);
    }
  };

  const campo = (id, etiqueta, props = {}) => (
    <div>
      <label htmlFor={`cli-${id}`} className={LABEL_CLASS} style={{ color: 'var(--ash)' }}>{etiqueta}</label>
      <input
        id={`cli-${id}`}
        value={form[id]}
        onChange={cambiar(id)}
        aria-invalid={Boolean(errores[id])}
        className="w-full px-3 py-2 rounded-lg outline-none min-h-[44px]"
        style={FIELD_STYLE}
        {...props}
      />
      {errores[id] && <p className="text-xs mt-1" style={{ color: 'var(--red)' }}>{errores[id]}</p>}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      titulo={editando ? 'Editar cliente' : 'Agregar cliente'}
      size="md"
      footer={(
        <>
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm min-h-[44px]" style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
            Cancelar
          </button>
          <button type="submit" form="cliente-cxc-form" disabled={guardando} className="px-4 py-2.5 rounded-xl text-sm font-medium text-white min-h-[44px] disabled:opacity-60" style={{ background: 'var(--pb)' }}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      )}
    >
      <form id="cliente-cxc-form" onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {campo('nombre', 'Nombre', { autoFocus: true, maxLength: 100, required: true })}
        {campo('apellido', 'Apellido', { maxLength: 100 })}
        {campo('documento', 'Documento (opcional)', { maxLength: 30, placeholder: 'V-12345678' })}
        {campo('telefono', 'Teléfono', { maxLength: 30, inputMode: 'tel' })}
        {campo('email', 'Correo electrónico', { type: 'email', inputMode: 'email' })}
        <div>
          <label htmlFor="cli-tipo" className={LABEL_CLASS} style={{ color: 'var(--ash)' }}>Tipo</label>
          <select id="cli-tipo" value={form.tipo} onChange={cambiar('tipo')} className="w-full px-3 py-2 rounded-lg outline-none min-h-[44px]" style={FIELD_STYLE}>
            {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <label className="sm:col-span-2 flex items-center gap-2 text-sm cursor-pointer min-h-[44px]" style={{ color: 'var(--jet)' }}>
          <input type="checkbox" checked={form.activo} onChange={cambiar('activo')} className="h-4 w-4" />
          <span>Activo (puede recibir ventas a crédito)</span>
        </label>
      </form>
    </Modal>
  );
};

export default ClienteFormModal;
