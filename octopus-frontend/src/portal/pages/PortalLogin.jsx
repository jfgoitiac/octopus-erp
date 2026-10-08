import { useState, useContext } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { User, Lock, Eye, EyeOff } from 'lucide-react';
import logoColegioFallback from '../../assets/logo-colegio.png';
import { toast } from 'react-toastify';
import { PortalAuthContext } from '../context/PortalAuthContext';
import { useBranding } from '../../context/BrandingContext';
import BannerInstalarApp from '../components/BannerInstalarApp';

const PortalLogin = () => {
  const { login, isAuthenticated, loading } = useContext(PortalAuthContext);
  const { nombreColegio, logoUrl } = useBranding();
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
      const { debeCambiarPassword } = await login(cedulaOEmail.trim(), password);
      navigate(debeCambiarPassword ? '/portal/cambiar-contrasena' : '/portal', { replace: true });
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
    <div className="min-h-dvh bg-[var(--surface-sunken)] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        {/* Logo / branding */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <img
            src={logoUrl || logoColegioFallback}
            alt={nombreColegio || 'Logo del colegio'}
            className="w-20 h-20 object-contain"
            onError={e => { e.target.src = logoColegioFallback; }}
          />
          <div className="text-center">
            <h1 className="text-xl font-bold text-[var(--jet)]">Portal de Representantes</h1>
            <p className="text-sm text-[var(--ash)] mt-1">Accede a la información de tu representado</p>
          </div>
        </div>

        {/* Card formulario */}
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Cédula o email */}
            <div>
              <label htmlFor="portal-cedula" className="block text-sm font-medium text-[var(--jet-mid)] mb-1.5">
                Cédula o correo electrónico
              </label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ash)]" />
                <input
                  id="portal-cedula"
                  type="text"
                  value={cedulaOEmail}
                  onChange={(e) => setCedulaOEmail(e.target.value)}
                  placeholder="Ej: V-12345678 o correo@ejemplo.com"
                  autoComplete="username"
                  className="w-full pl-9 pr-4 py-3 rounded-xl border border-[var(--border)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/30 focus:border-[var(--portal-primary)] transition-colors"
                  disabled={submitting}
                />
              </div>
            </div>

            {/* Contraseña */}
            <div>
              <label htmlFor="portal-password" className="block text-sm font-medium text-[var(--jet-mid)] mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ash)]" />
                <input
                  id="portal-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                  autoComplete="current-password"
                  className="w-full pl-9 pr-12 py-3 rounded-xl border border-[var(--border)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/30 focus:border-[var(--portal-primary)] transition-colors"
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-0 top-0 h-full px-3 flex items-center justify-center text-[var(--ash)] hover:text-[var(--jet-mid)] transition-colors min-w-[44px]"
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
              className="w-full bg-[var(--portal-primary)] hover:bg-[color-mix(in_srgb,var(--portal-primary)_85%,black)] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
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

            <Link
              to="/portal/olvide-contrasena"
              className="block text-center text-sm text-[var(--portal-primary)] hover:underline mt-1"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </form>
        </div>

        <BannerInstalarApp className="mt-4" />

        <p className="text-center text-xs text-[var(--ash)] mt-6">
          ¿Problemas para acceder? Contacta a la administración del colegio.
        </p>
      </div>
    </div>
  );
};

export default PortalLogin;
