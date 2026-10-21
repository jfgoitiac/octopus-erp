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
    <div className="portal-shell min-h-dvh flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-[440px] lg:max-w-5xl lg:grid lg:grid-cols-2 lg:gap-6 lg:items-stretch">
        {/* Bloque de marca del colegio */}
        <section className="portal-hero p-6 sm:p-8 lg:p-10 flex flex-col gap-5 lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white p-2 shadow-sm">
              <img
                src={logoUrl || logoColegioFallback}
                alt={nombreColegio || 'Logo del colegio'}
                className="h-full w-full object-contain"
                onError={e => { e.target.src = logoColegioFallback; }}
              />
            </span>
            <p className="text-base font-semibold leading-tight text-white/90 line-clamp-2">{nombreColegio || 'Portal escolar'}</p>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight leading-tight">Portal de Representantes</h1>
            <p className="mt-2 text-sm sm:text-base text-white/80 max-w-sm">Accede a la información de tu representado</p>
          </div>
        </section>

        <div className="-mt-4 relative lg:mt-0 lg:flex lg:flex-col lg:justify-center">
        {/* Card formulario */}
        <div className="portal-card p-6 sm:p-8 space-y-4">
          <h2 className="portal-section-title text-xl">Ingresa a tu cuenta</h2>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Cédula o email */}
            <div>
              <label htmlFor="portal-cedula" className="block text-sm font-medium text-[var(--portal-ink)] mb-1.5">
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
                  className="w-full pl-9 pr-4 py-3 rounded-2xl border border-[var(--portal-line)] bg-[var(--portal-canvas)] text-base focus:bg-[var(--portal-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/30 focus:border-[var(--portal-primary)] transition-colors"
                  disabled={submitting}
                />
              </div>
            </div>

            {/* Contraseña */}
            <div>
              <label htmlFor="portal-password" className="block text-sm font-medium text-[var(--portal-ink)] mb-1.5">
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
                  className="w-full pl-9 pr-12 py-3 rounded-2xl border border-[var(--portal-line)] bg-[var(--portal-canvas)] text-base focus:bg-[var(--portal-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/30 focus:border-[var(--portal-primary)] transition-colors"
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
              className="w-full bg-[var(--portal-hero)] hover:bg-[color-mix(in_srgb,var(--portal-hero)_85%,black)] text-white font-semibold py-3.5 rounded-2xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
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
              className="block text-center text-sm text-[var(--portal-tint-ink)] font-medium hover:underline underline-offset-4 py-2"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </form>
        </div>

        <BannerInstalarApp className="mt-4" />

        <p className="text-center text-xs text-[var(--portal-muted)] mt-6">
          ¿Problemas para acceder? Contacta a la administración del colegio.
        </p>
        </div>
      </div>
    </div>
  );
};

export default PortalLogin;
