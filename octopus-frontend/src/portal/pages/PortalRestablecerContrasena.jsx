import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import logoColegio from '../../assets/logo-colegio.png';
import { toast } from 'react-toastify';
import { confirmarResetPassword } from '../api/portal.service';

const PortalRestablecerContrasena = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const uid = searchParams.get('uid') || '';
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [listo, setListo] = useState(false);

  const linkInvalido = !uid || !token;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.warning('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (password !== confirmar) {
      toast.warning('Las contraseñas no coinciden');
      return;
    }

    setSubmitting(true);
    try {
      await confirmarResetPassword(uid, token, password, confirmar);
      setListo(true);
      toast.success('Contraseña actualizada correctamente');
      setTimeout(() => navigate('/portal/login', { replace: true }), 2000);
    } catch (err) {
      const detalle = err?.response?.data?.non_field_errors?.[0]
        || err?.response?.data?.detail;
      toast.error(detalle || 'El enlace es inválido o ya expiró. Solicita uno nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="flex flex-col items-center mb-8 gap-3">
          <img src={logoColegio} alt="Logo del colegio" className="w-20 h-20 object-contain" />
          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-800">Restablecer contraseña</h1>
            <p className="text-sm text-gray-500 mt-1">Elige tu nueva contraseña de acceso</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          {linkInvalido ? (
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
                <AlertTriangle size={22} className="text-amber-600" />
              </div>
              <p className="text-sm text-gray-700">
                Este enlace no es válido. Ábrelo directamente desde el correo que recibiste,
                o solicita uno nuevo.
              </p>
              <Link
                to="/portal/olvide-contrasena"
                className="text-sm font-medium text-[var(--portal-primary,#0fa3b1)] hover:underline"
              >
                Solicitar enlace nuevo
              </Link>
            </div>
          ) : listo ? (
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 size={22} className="text-emerald-600" />
              </div>
              <p className="text-sm text-gray-700">
                Tu contraseña fue actualizada. Redirigiendo al inicio de sesión...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="reset-password-nueva" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Nueva contraseña
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    id="reset-password-nueva"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    autoComplete="new-password"
                    className="w-full pl-9 pr-12 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary,#0fa3b1)]/30 focus:border-[var(--portal-primary,#0fa3b1)] transition-colors"
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-0 top-0 h-full px-3 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors min-w-[44px]"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="reset-password-confirmar" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Confirmar contraseña
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    id="reset-password-confirmar"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmar}
                    onChange={(e) => setConfirmar(e.target.value)}
                    placeholder="Repite la contraseña"
                    autoComplete="new-password"
                    className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary,#0fa3b1)]/30 focus:border-[var(--portal-primary,#0fa3b1)] transition-colors"
                    disabled={submitting}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[var(--portal-primary,#0fa3b1)] hover:bg-[color-mix(in_srgb,var(--portal-primary,#0fa3b1)_85%,black)] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              >
                {submitting ? (
                  <>
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Guardando...
                  </>
                ) : (
                  'Guardar nueva contraseña'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default PortalRestablecerContrasena;
