import { useState, useContext } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { User, Lock, Eye, EyeOff, GraduationCap } from 'lucide-react';
import { toast } from 'react-toastify';
import { DocenteAuthContext } from '../context/DocenteAuthContext';

const DocenteLogin = () => {
  const { login, isAuthenticated, loading } = useContext(DocenteAuthContext);
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Si ya está autenticado, redirigir al portal
  if (!loading && isAuthenticated) {
    return <Navigate to="/portal-docente" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.warning('Completa todos los campos');
      return;
    }

    setSubmitting(true);
    try {
      await login(username.trim(), password);
      navigate('/portal-docente', { replace: true });
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 400) {
        toast.error('Credenciales incorrectas. Verifica tu usuario y contraseña.');
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
          <div className="w-20 h-20 rounded-full bg-[var(--docente-primary)]/10 flex items-center justify-center">
            <GraduationCap size={40} className="text-[var(--docente-primary)]" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-800">Portal de Docentes</h1>
            <p className="text-sm text-gray-500 mt-1">Accede a tus materias y estudiantes</p>
          </div>
        </div>

        {/* Card formulario */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Usuario */}
            <div>
              <label htmlFor="docente-username" className="block text-sm font-medium text-gray-700 mb-1.5">
                Usuario
              </label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="docente-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Tu nombre de usuario"
                  autoComplete="username"
                  className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30 focus:border-[var(--docente-primary)] transition-colors"
                  disabled={submitting}
                />
              </div>
            </div>

            {/* Contraseña */}
            <div>
              <label htmlFor="docente-password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="docente-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                  autoComplete="current-password"
                  className="w-full pl-9 pr-12 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30 focus:border-[var(--docente-primary)] transition-colors"
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

            {/* Botón */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[var(--docente-primary)] hover:bg-[var(--docente-primary-dark)] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
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

export default DocenteLogin;
