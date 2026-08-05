import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { getMensajes } from '../api/comunicacion.service';

/**
 * Agrupa la bandeja plana de mensajes (GET comunicacion/mensajes/ sin filtro)
 * en una lista de conversaciones por alumno — último mensaje y cantidad de
 * no leídos — para armar la lista de chats del docente.
 */
export function useDocenteConversaciones() {
  const [conversaciones, setConversaciones] = useState([]);
  const [mensajes, setMensajes] = useState([]);
  const [loading, setLoading] = useState(true);

  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchConversaciones = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await getMensajes(null, controller.signal);
      if (controller.signal.aborted) return;
      const listaMensajes = res.data || [];
      setMensajes(listaMensajes);

      const mapa = new Map();
      listaMensajes.forEach(m => {
        const actual = mapa.get(m.alumno_id);
        const noLeido = !m.leido && !m.es_propio;
        if (!actual || new Date(m.fecha) > new Date(actual.ultimoMensaje.fecha)) {
          mapa.set(m.alumno_id, {
            alumno_id: m.alumno_id,
            alumno_nombre: m.alumno_nombre,
            ultimoMensaje: m,
            noLeidos: (actual?.noLeidos || 0) + (noLeido ? 1 : 0),
          });
        } else {
          actual.noLeidos += noLeido ? 1 : 0;
        }
      });

      const lista = [...mapa.values()].sort(
        (a, b) => new Date(b.ultimoMensaje.fecha) - new Date(a.ultimoMensaje.fecha)
      );
      setConversaciones(lista);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      toast.error('No se pudieron cargar las conversaciones.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConversaciones(); }, [fetchConversaciones]);

  return { conversaciones, mensajes, loading, refetch: fetchConversaciones };
}
