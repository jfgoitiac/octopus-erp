import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, MailCheck } from 'lucide-react';
import logoColegio from '../../assets/logo-colegio.png';
import { toast } from 'react-toastify';
import { solicitarResetPassword } from '../api/portal.service';

const PortalOlvideContrasena = () => {
  const [cedulaOEmail, setCedulaOEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!cedulaOEmail.trim()) {
      toast.warning('Ingresa tu cédula o correo electrónico');
      return;
    }

    setSubmitting(true);
    try {
      await solicitarResetPassword(cedulaOEmail.trim());
      // El backend siempre responde 200 con el mismo mensaje exista o no la
      // cuenta (evita revelar qué cédulas tienen portal activo) — por eso
      // acá no distinguimos casos, solo mostramos la confirmación.
      setEnviado(true);
    } catch {
      toast.error('Error de conexión. Intenta más tarde.');
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
            <h1 className="text-xl font-bold text-gray-800">Recuperar contraseña</h1>
            <p className="text-sm text-gray-500 mt-1">
              Te enviaremos un enlace para restablecer tu acceso al portal
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          {enviado ? (
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
                <MailCheck size={22} className="text-emerald-600" />
              </div>
              <p className="text-sm text-gray-700">
                Si <strong>{cedulaOEmail}</strong> corresponde a una cuenta del portal,
                recibirás un correo con las instrucciones para restablecer tu contraseña.
              </p>
              <p className="text-xs text-gray-400">
                Revisa también tu carpeta de spam o correo no deseado.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="portal-recuperar-cedula" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Cédula o correo electrónico
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    id="portal-recuperar-cedula"
                    type="text"
                    value={cedulaOEmail}
                    onChange={(e) => setCedulaOEmail(e.target.value)}
                    placeholder="Ej: V-12345678 o correo@ejemplo.com"
                    autoComplete="username"
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
                    Enviando...
                  </>
                ) : (
                  'Enviar enlace de recuperación'
                )}
              </button>
            </form>
          )}
        </div>

        <Link
          to="/portal/login"
          className="flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mt-6 transition-colors"
        >
          <ArrowLeft size={15} />
          Volver a iniciar sesión
        </Link>
      </div>
    </div>
  );
};

export default PortalOlvideContrasena;
