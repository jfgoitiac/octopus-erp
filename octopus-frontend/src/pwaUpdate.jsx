import { toast } from 'react-toastify';

// Registra el Service Worker al arrancar la app (antes solo se registraba al
// activar push en useWebPush.js, así que cualquier dispositivo que nunca
// activara notificaciones nunca detectaba una versión nueva del panel).
// registerSW() es idempotente: si useWebPush.js ya lo registró, reutiliza el
// mismo registration en vez de crear uno duplicado.
export async function iniciarActualizacionAutomatica() {
  if (!('serviceWorker' in navigator)) return;

  let registerSW;
  try {
    ({ registerSW } = await import('virtual:pwa-register'));
  } catch {
    // En dev sin devOptions.enabled no existe el módulo virtual.
    return;
  }

  const actualizar = registerSW({
    immediate: true,
    onNeedRefresh() {
      toast.info(
        ({ closeToast }) => (
          <div>
            <p style={{ margin: 0 }}>Hay una nueva versión disponible.</p>
            <button
              onClick={() => {
                closeToast();
                actualizar(true);
              }}
              style={{
                marginTop: 8,
                padding: '4px 12px',
                border: 'none',
                borderRadius: 4,
                background: '#0fa3b1',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Recargar
            </button>
          </div>
        ),
        { autoClose: false, closeOnClick: false },
      );
    },
  });
}
