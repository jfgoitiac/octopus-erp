import { useState, useContext } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { User, Lock, Eye, EyeOff } from 'lucide-react';
import logoColegio from '../../assets/logo-colegio.png';
import { toast } from 'react-toastify';
import { PortalAuthContext } from '../context/PortalAuthContext';

const PortalLogin = () => {
  const { login, isAuthenticated, loading } = useContext(PortalAuthContext);
  const navigate = useNavigate();

  const [cedulaOEmail, setCedulaOEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Si ya está autenticado, redirigir al portal
  if (!loading && isAuthenticated) {
    return <Navigate to="/portal" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!cedulaOEmail.trim() || !password.trim()) {
      toast.warning('Completa todos los campos');
      return;
    }

    setSubmitting(true);
    try {
      await login(cedulaOEmail.trim(), password);
      navigate('/portal', { replace: true });
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 400) {
        toast.error('Credenciales incorrectas. Verifica tu cédula/correo y contraseña.');
      } else {
        toast.error('Error de conexión. Intenta más tarde.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        {/* Logo / branding */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <img src={logoColegio} alt="Logo del colegio" className="w-20 h-20 object-contain" />
          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-800">Portal de Familias</h1>
            <p className="text-sm text-gray-500 mt-1">Accede a la información de tu representado</p>
          </div>
        </div>

        {/* Card formulario */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Cédula o email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Cédula o correo electrónico
              </label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={cedulaOEmail}
                  onChange={(e) => setCedulaOEmail(e.target.value)}
                  placeholder="Ej: V-12345678 o correo@ejemplo.com"
                  autoComplete="username"
                  className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fa3b1]/30 focus:border-[#0fa3b1] transition-colors"
                  disabled={submitting}
                />
              </div>
            </div>

            {/* Contraseña */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                  autoComplete="current-password"
                  className="w-full pl-9 pr-10 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0fa3b1]/30 focus:border-[#0fa3b1] transition-colors"
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Botón */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#0fa3b1] hover:bg-[#0d93a0] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
            >
              {submitting ? (
                <>
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Ingresando...
                </>
              ) : (
                'Ingresar'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          ¿Problemas para acceder? Contacta a la administración del colegio.
        </p>
      </div>
    </div>
  );
};

export default PortalLogin;
