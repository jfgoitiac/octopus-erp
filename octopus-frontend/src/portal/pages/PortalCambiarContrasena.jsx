import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Lock, Eye, EyeOff, ArrowLeft, Bell, Megaphone, GraduationCap, Receipt, MessageCircle } from 'lucide-react';
import { cambiarContrasena } from '../api/portal.service';
import { getEstadoPush, actualizarTiposPush } from '../api/notificaciones.service';
import useWebPush from '../hooks/useWebPush';

const TIPOS_PUSH = [
  { tipo: 'circular', icon: Megaphone, label: 'Circulares y comunicados' },
  { tipo: 'nota', icon: GraduationCap, label: 'Notas cargadas' },
  { tipo: 'factura', icon: Receipt, label: 'Facturas y pagos' },
  { tipo: 'mensaje', icon: MessageCircle, label: 'Mensajes de docentes' },
];

const Switch = ({ checked, onChange, disabled, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${checked ? 'bg-[#0fa3b1]' : 'bg-gray-200'}`}
  >
    <span
      className={`block w-5 h-5 bg-white rounded-full shadow transform transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
    />
  </button>
);

const PortalCambiarContrasena = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ contrasena_actual: '', contrasena_nueva: '', confirmar: '' });
  const [show, setShow] = useState({ actual: false, nueva: false, confirmar: false });
  const [loading, setLoading] = useState(false);

  const { supported: pushSupported, subscribe } = useWebPush();
  const [pushActiva, setPushActiva] = useState(false);
  const [tiposActivos, setTiposActivos] = useState([]);
  const [pushCargando, setPushCargando] = useState(false);

  useEffect(() => {
    if (!pushSupported) return;
    getEstadoPush()
      .then((res) => {
        setPushActiva(res.data.activa);
        setTiposActivos(res.data.tipos_activos);
      })
      .catch(() => {});
  }, [pushSupported]);

  const handleToggleTipo = useCallback(async (tipo, activar) => {
    setPushCargando(true);
    try {
      if (!pushActiva) {
        // Sin suscripción activa todavía: activar equivale a suscribirse con
        // ese tipo como único habilitado.
        await subscribe(activar ? [tipo] : []);
        setPushActiva(true);
        setTiposActivos(activar ? [tipo] : []);
        toast.success('Notificaciones activadas');
        return;
      }
      const nuevosTipos = activar
        ? [...new Set([...tiposActivos, tipo])]
        : tiposActivos.filter((t) => t !== tipo);
      await actualizarTiposPush(nuevosTipos);
      setTiposActivos(nuevosTipos);
    } catch (err) {
      toast.error(err?.message || 'No se pudo actualizar la preferencia.');
    } finally {
      setPushCargando(false);
    }
  }, [pushActiva, tiposActivos, subscribe]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.contrasena_nueva !== form.confirmar) {
      toast.error('Las contraseñas nuevas no coinciden.');
      return;
    }
    if (form.contrasena_nueva.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setLoading(true);
    try {
      await cambiarContrasena(form);
      toast.success('¡Contraseña actualizada exitosamente!');
      navigate('/portal');
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al cambiar la contraseña.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Mapea cada campo de formulario a su clave de visibilidad
  const showKey = (key) =>
    key === 'contrasena_actual' ? 'actual' : key === 'contrasena_nueva' ? 'nueva' : 'confirmar';

  const ToggleBtn = ({ field }) => (
    <button
      type="button"
      onClick={() => setShow((s) => ({ ...s, [field]: !s[field] }))}
      className="absolute right-0 top-0 h-full px-3 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors min-w-[44px]"
      aria-label={show[field] ? 'Ocultar contraseña' : 'Mostrar contraseña'}
    >
      {show[field] ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );

  return (
    <div className="max-w-sm mx-auto px-4 py-6">
      <button
        onClick={() => navigate('/portal')}
        className="flex items-center gap-1 text-sm text-gray-500 mb-4 hover:text-gray-700 py-2 min-h-[44px]"
      >
        <ArrowLeft size={16} /> Volver
      </button>

      {pushSupported && (
        <div className="mb-6 border border-gray-100 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bell size={18} className="text-[#0fa3b1]" />
            <h2 className="text-sm font-semibold text-gray-800">Notificaciones</h2>
          </div>
          <div className="space-y-3">
            {TIPOS_PUSH.map(({ tipo, icon: Icon, label }) => {
              const activo = pushActiva && tiposActivos.includes(tipo);
              return (
                <div key={tipo} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Icon size={16} className="text-gray-400 shrink-0" aria-hidden="true" />
                    {label}
                  </div>
                  <Switch
                    checked={activo}
                    disabled={pushCargando}
                    onChange={(val) => handleToggleTipo(tipo, val)}
                    label={label}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-6">
        <Lock size={20} className="text-[#0fa3b1]" />
        <h1 className="text-lg font-bold text-gray-800">Cambiar contraseña</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {[
          { key: 'contrasena_actual', label: 'Contraseña actual' },
          { key: 'contrasena_nueva', label: 'Nueva contraseña' },
          { key: 'confirmar', label: 'Confirmar nueva contraseña' },
        ].map(({ key, label }) => {
          const sk = showKey(key);
          return (
            <div key={key}>
              <label htmlFor={`portal-pwd-${key}`} className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <div className="relative">
                <input
                  id={`portal-pwd-${key}`}
                  type={show[sk] ? 'text' : 'password'}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  required
                  autoComplete={key === 'contrasena_actual' ? 'current-password' : 'new-password'}
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base pr-12 focus:outline-none focus:ring-2 focus:ring-[#0fa3b1]/30"
                />
                <ToggleBtn field={sk} />
              </div>
            </div>
          );
        })}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#0fa3b1] text-white font-medium py-3 rounded-xl text-sm hover:bg-[#0d93a0] transition-colors disabled:opacity-60 mt-2"
        >
          {loading ? 'Guardando...' : 'Actualizar contraseña'}
        </button>
      </form>
    </div>
  );
};

export default PortalCambiarContrasena;
