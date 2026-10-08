import { useSyncExternalStore } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'react-toastify';
import { saveAsistencia } from '../api/academico.service';
import { borrarBorrador, leerCola, quitarDeCola, suscribirCola } from './asistenciaLocal';

/** Sin respuesta del servidor (sin señal, timeout): vale la pena reintentar. */
export const esErrorDeRed = (err) => !err?.response && err?.code !== 'ERR_CANCELED';

const describir = ({ gradoSeccion, fecha }) =>
  `${gradoSeccion} del ${format(parseISO(fecha), "d 'de' MMMM", { locale: es })}`;

let enviando = false;

/**
 * Reenvía los guardados de asistencia que quedaron sin conexión.
 * - Éxito: sale de la cola y se borra el borrador local de esa fecha.
 * - Sin red otra vez: se detiene y espera al próximo intento.
 * - Rechazo del servidor (4xx/5xx): sale de la cola pero el borrador queda,
 *   para que el docente lo recupere y corrija.
 */
export async function enviarPendientes() {
  if (enviando || !leerCola().length) return;
  enviando = true;
  try {
    for (const envio of [...leerCola()]) {
      try {
        await saveAsistencia(envio.gradoSeccion, envio.fecha, envio.registros);
        quitarDeCola(envio.gradoSeccion, envio.fecha);
        borrarBorrador(envio.gradoSeccion, envio.fecha);
        toast.success(`Asistencia de ${describir(envio)} enviada.`);
      } catch (err) {
        if (esErrorDeRed(err)) break;
        quitarDeCola(envio.gradoSeccion, envio.fecha);
        const motivo = err.response?.data?.error || err.response?.data?.detail || 'el servidor la rechazó';
        toast.error(`No se pudo enviar la asistencia de ${describir(envio)}: ${motivo}. Ábrela para recuperarla y guardarla de nuevo.`);
      }
    }
  } finally {
    enviando = false;
  }
}

/** true si la asistencia de esa sección y fecha está esperando conexión. */
export function usePendienteEnvio(gradoSeccion, fechaStr) {
  return useSyncExternalStore(
    suscribirCola,
    () => leerCola().some(e => e.gradoSeccion === gradoSeccion && e.fecha === fechaStr),
  );
}
