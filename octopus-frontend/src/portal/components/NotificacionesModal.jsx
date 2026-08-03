import { useEffect, useState } from 'react';
import { Bell, Megaphone, GraduationCap, Receipt, MessageCircle, X } from 'lucide-react';
import { toast } from 'react-toastify';
import useWebPush from '../hooks/useWebPush';

const DISMISS_KEY = 'portal_push_prompt_dismissed_until';
const APPEAR_DELAY_MS = 10_000;
const DISMISS_DAYS = 7;

const TIPOS = [
  { icon: Megaphone, label: 'Circulares y comunicados del colegio' },
  { icon: GraduationCap, label: 'Notas cargadas por los docentes' },
  { icon: Receipt, label: 'Facturas y recordatorios de pago' },
  { icon: MessageCircle, label: 'Mensajes nuevos de docentes' },
];

const estaPospuesto = () => {
  const hasta = Number(localStorage.getItem(DISMISS_KEY) || 0);
  return Date.now() < hasta;
};

const posponer = () => {
  localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000));
};

/**
 * Prompt de activación de notificaciones push — no bloqueante (sin backdrop),
 * aparece 10s después del primer login exitoso. "Ahora no" lo pospone 7 días.
 */
const NotificacionesModal = () => {
  const { supported, permission, loading, subscribe } = useWebPush();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (permission === 'granted' || permission === 'denied' || estaPospuesto()) return;
    const timer = setTimeout(() => setVisible(true), APPEAR_DELAY_MS);
    return () => clearTimeout(timer);
  }, [permission]);

  if (!visible) return null;

  const handleAhoraNo = () => {
    posponer();
    setVisible(false);
  };

  const handleActivar = async () => {
    try {
      await subscribe();
      toast.success('Notificaciones activadas');
    } catch (err) {
      toast.error(err?.message || 'No se pudieron activar las notificaciones.');
    } finally {
      setVisible(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="Activar notificaciones"
      className="fixed bottom-[70px] sm:bottom-4 left-0 right-0 z-40 px-4 flex justify-center"
    >
      <div className="w-full max-w-[440px] bg-white rounded-2xl shadow-xl border border-gray-100 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'color-mix(in srgb, var(--portal-primary, #0fa3b1) 15%, white)' }}
            >
              <Bell size={18} style={{ color: 'var(--portal-primary, #0fa3b1)' }} aria-hidden="true" />
            </span>
            <h2 className="font-semibold text-gray-800 text-sm">Mantente informado</h2>
          </div>
          <button
            onClick={handleAhoraNo}
            aria-label="Cerrar"
            className="w-9 h-9 -mr-1.5 -mt-1 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {supported ? (
          <>
            <p className="text-xs text-gray-500 mt-2 mb-3">
              Activa las notificaciones para recibir alertas de:
            </p>
            <ul className="space-y-2 mb-4">
              {TIPOS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2 text-sm text-gray-600">
                  <Icon size={16} className="text-gray-400 shrink-0" aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleActivar}
                disabled={loading}
                className="w-full h-11 rounded-xl text-white text-sm font-medium disabled:opacity-60 transition-colors"
                style={{ backgroundColor: 'var(--portal-primary, #0fa3b1)' }}
              >
                {loading ? 'Activando…' : 'Activar Notificaciones'}
              </button>
              <button
                onClick={handleAhoraNo}
                className="w-full h-11 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50"
              >
                Ahora no
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-500 mt-2 mb-4">
              Tu navegador no soporta notificaciones push. Seguirás recibiendo los avisos por correo electrónico.
            </p>
            <button
              onClick={handleAhoraNo}
              className="w-full h-11 rounded-xl text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100"
            >
              Entendido
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default NotificacionesModal;
