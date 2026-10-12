import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { usePolling } from './usePolling';
import {
    crearNotaConversacion, devolverConversacion, enviarMensajeConversacion, enviarPlantillaConversacion,
    getMensajesConversacion, marcarConversacionLeida, tomarConversacion, vincularConversacion,
} from '../api/cobranza.service';
import {
    fusionarPorId, mensajeError, ordenarMensajes,
} from '../components/cobranzaInteligente/conversaciones/conversacionesUtils';

const ESTADO_INICIAL = { id: undefined, mensajes: [], conversacion: null, hayMas: false, error: null };
let contadorTemporal = 0;

const mensajeOptimista = ({ cuerpo, direccion, archivo, usuario }) => ({
    id: `tmp-${Date.now()}-${contadorTemporal++}`,
    direccion,
    tipo: archivo ? (archivo.type === 'application/pdf' ? 'documento' : 'imagen') : 'texto',
    cuerpo: cuerpo || '',
    payload: {},
    estado_entrega: '',
    adjunto: archivo ? { url: null, nombre: archivo.name, tipo: archivo.type } : null,
    enviado_por: usuario || null,
    creado_en: new Date().toISOString(),
    actualizado_en: new Date().toISOString(),
    pendiente: true,
});

/**
 * Hilo de una conversación: carga inicial, consultas incrementales (`?desde=`) con usePolling,
 * envío optimista (texto, archivo, nota) reconciliado por `id`, y marcado de leída
 * al abrir y al llegar mensajes con la pestaña visible.
 *  - `onConversacion(conv)` se llama con cada versión nueva de la conversación (para la bandeja).
 */
export function useHiloConversacion(conversacionId, { onConversacion, usuario } = {}) {
    const [estado, setEstado] = useState(ESTADO_INICIAL);
    const [ocupado, setOcupado] = useState(false);
    const idRef = useRef(conversacionId);
    const ahoraRef = useRef(null);
    const leyendoRef = useRef(false);
    const onConvRef = useRef(onConversacion);
    useEffect(() => {
        onConvRef.current = onConversacion;
    }, [onConversacion]);

    const aplicarConversacion = useCallback((conv) => {
        if (!conv) return;
        setEstado(prev => (prev.id === conv.id ? { ...prev, conversacion: conv } : prev));
        onConvRef.current?.(conv);
    }, []);

    useEffect(() => {
        idRef.current = conversacionId;
        ahoraRef.current = null;
        if (!conversacionId) return undefined;
        const controller = new AbortController();
        getMensajesConversacion(conversacionId, null, controller.signal)
            .then(res => {
                ahoraRef.current = res.data?.ahora || null;
                setEstado({
                    id: conversacionId, mensajes: ordenarMensajes(res.data?.results || []),
                    conversacion: res.data?.conversacion || null, hayMas: !!res.data?.hay_mas, error: null,
                });
                if (res.data?.conversacion) onConvRef.current?.(res.data.conversacion);
            })
            .catch(err => {
                if (err?.code === 'ERR_CANCELED') return;
                const status = err?.response?.status;
                const codigo = status === 409 ? 'apagada' : status === 404 ? 'no_encontrada' : 'error';
                setEstado({ ...ESTADO_INICIAL, id: conversacionId, error: codigo });
                if (codigo !== 'apagada') toast.error(mensajeError(err, 'No se pudo cargar la conversación.'));
            });
        return () => controller.abort();
    }, [conversacionId]);

    const refrescar = useCallback(async () => {
        const idConsulta = idRef.current;
        if (!idConsulta) return;
        const res = await getMensajesConversacion(idConsulta, ahoraRef.current);
        if (idRef.current !== idConsulta) return;
        if (res.data?.ahora) ahoraRef.current = res.data.ahora;
        const nuevos = res.data?.results || [];
        setEstado(prev => {
            if (prev.id !== idConsulta) return prev;
            const mensajes = nuevos.length ? ordenarMensajes(fusionarPorId(prev.mensajes, nuevos)) : prev.mensajes;
            return { ...prev, mensajes, conversacion: res.data?.conversacion || prev.conversacion };
        });
        if (res.data?.conversacion) onConvRef.current?.(res.data.conversacion);
    }, []);

    const cargado = !!conversacionId && estado.id === conversacionId && !estado.error;
    usePolling(refrescar, { activo: cargado });

    // Marcar leída al abrir y al llegar mensajes con el hilo visible.
    const noLeidos = cargado ? estado.conversacion?.no_leidos || 0 : 0;
    useEffect(() => {
        if (!cargado || noLeidos <= 0 || document.hidden || leyendoRef.current) return;
        leyendoRef.current = true;
        marcarConversacionLeida(conversacionId)
            .then(res => aplicarConversacion(res.data))
            .catch(() => { /* silencioso: se reintenta con el siguiente poll */ })
            .finally(() => { leyendoRef.current = false; });
    }, [cargado, noLeidos, conversacionId, aplicarConversacion]);

    const quitarTemporal = (tmpId) =>
        setEstado(prev => ({ ...prev, mensajes: prev.mensajes.filter(m => m.id !== tmpId) }));

    // Reemplaza el mensaje temporal por el real; el siguiente poll lo vuelve a fusionar por id.
    const reconciliar = (tmpId, real) =>
        setEstado(prev => ({
            ...prev,
            mensajes: ordenarMensajes(fusionarPorId(prev.mensajes.filter(m => m.id !== tmpId), real ? [real] : [])),
        }));

    /** Envía texto libre o un archivo; devuelve true si se envió (el compositor limpia entonces). */
    const enviar = useCallback(async ({ cuerpo = '', archivo = null }) => {
        const id = idRef.current;
        const temporal = mensajeOptimista({ cuerpo, direccion: 'saliente', archivo, usuario });
        setEstado(prev => ({ ...prev, mensajes: [...prev.mensajes, temporal] }));
        try {
            let datos = { cuerpo };
            if (archivo) {
                datos = new FormData();
                datos.append('archivo', archivo);
                if (cuerpo) datos.append('cuerpo', cuerpo);
            }
            const res = await enviarMensajeConversacion(id, datos);
            reconciliar(temporal.id, res.data?.mensaje);
            aplicarConversacion(res.data?.conversacion);
            return true;
        } catch (err) {
            quitarTemporal(temporal.id);
            if (err?.response?.data?.ventana_cerrada) {
                toast.error('La ventana de 24 h está cerrada: envía una plantilla.');
                refrescar().catch(() => {});
            } else {
                toast.error(mensajeError(err, 'No se pudo enviar el mensaje.'));
            }
            return false;
        }
    }, [aplicarConversacion, refrescar, usuario]);

    const enviarNota = useCallback(async (cuerpo) => {
        const id = idRef.current;
        const temporal = mensajeOptimista({ cuerpo, direccion: 'nota', usuario });
        setEstado(prev => ({ ...prev, mensajes: [...prev.mensajes, temporal] }));
        try {
            const res = await crearNotaConversacion(id, { cuerpo });
            reconciliar(temporal.id, res.data?.mensaje);
            return true;
        } catch (err) {
            quitarTemporal(temporal.id);
            toast.error(mensajeError(err, 'No se pudo guardar la nota.'));
            return false;
        }
    }, [usuario]);

    const enviarPlantilla = useCallback(async (datos) => {
        const id = idRef.current;
        try {
            const res = await enviarPlantillaConversacion(id, datos);
            reconciliar(null, res.data?.mensaje);
            aplicarConversacion(res.data?.conversacion);
            toast.success('Plantilla enviada.');
            return true;
        } catch (err) {
            toast.error(mensajeError(err, 'No se pudo enviar la plantilla.'));
            return false;
        }
    }, [aplicarConversacion]);

    const accion = useCallback(async (fn, exito, fallo) => {
        setOcupado(true);
        try {
            const res = await fn(idRef.current);
            aplicarConversacion(res.data);
            if (exito) toast.success(exito);
            refrescar().catch(() => {});
            return true;
        } catch (err) {
            toast.error(mensajeError(err, fallo));
            return false;
        } finally {
            setOcupado(false);
        }
    }, [aplicarConversacion, refrescar]);

    const tomar = useCallback(() => accion(tomarConversacion, 'Conversación tomada.', 'No se pudo tomar la conversación.'), [accion]);
    const devolver = useCallback(() => accion(devolverConversacion, 'Devuelta al automático.', 'No se pudo devolver la conversación.'), [accion]);
    const vincular = useCallback(
        (representanteId) => accion(
            (id) => vincularConversacion(id, { representante_id: representanteId }),
            'Conversación vinculada.', 'No se pudo vincular la conversación.',
        ),
        [accion],
    );

    const actual = !!conversacionId && estado.id === conversacionId;
    return {
        mensajes: actual ? estado.mensajes : [],
        conversacion: actual ? estado.conversacion : null,
        hayMas: actual ? estado.hayMas : false,
        error: actual ? estado.error : null,
        loading: !!conversacionId && !actual,
        ocupado,
        enviar, enviarNota, enviarPlantilla, tomar, devolver, vincular,
    };
}

export default useHiloConversacion;
