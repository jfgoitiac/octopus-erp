import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { cambiarContrasena } from '../api/portal.service';

const PortalCambiarContrasena = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ contrasena_actual: '', contrasena_nueva: '', confirmar: '' });
  const [show, setShow] = useState({ actual: false, nueva: false, confirmar: false });
  const [loading, setLoading] = useState(false);

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
