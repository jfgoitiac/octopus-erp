import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { diferir } from '../utils/diferir';
import {
    listarWhatsAppSedes, guardarWhatsAppSede, quitarWhatsAppSede, probarWhatsAppSede,
} from '../services/whatsappSedes';

export const CAMPOS_SECRETOS_SEDE = ['meta_whatsapp_token', 'meta_app_secret'];
export const CAMPOS_SEDE = [
    'activo', 'numero_visible', 'meta_whatsapp_phone_id', 'meta_whatsapp_token',
    'meta_waba_id', 'meta_app_secret', 'meta_webhook_verify_token',
];

export const esMascara = (valor) => typeof valor === 'string' && valor.startsWith('••••');

const mensajeError = (err, defecto) =>
    err.response?.data?.error || err.response?.data?.detail || defecto;

/** Payload del PATCH: los secretos solo si el usuario escribió uno nuevo. */
export const armarPayloadSede = (form) => {
    const payload = {};
    CAMPOS_SEDE.forEach((campo) => {
        const valor = form[campo];
        if (CAMPOS_SECRETOS_SEDE.includes(campo) && (!valor || esMascara(valor))) return;
        payload[campo] = valor;
    });
    return payload;
};

export function useWhatsAppSedes() {
    const [sedes, setSedes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [version, setVersion] = useState(0);

    const reemplazar = useCallback((actualizada) => {
        setSedes(prev => prev.map(s => (s.sede.id === actualizada.sede.id ? actualizada : s)));
        setVersion(v => v + 1);
    }, []);

    useEffect(() => diferir(async () => {
        try {
            setSedes(await listarWhatsAppSedes());
        } catch {
            toast.error('Error al cargar el WhatsApp por sede.');
        } finally {
            setLoading(false);
        }
    }), []);

    const guardar = useCallback(async (sedeId, form) => {
        setSaving(true);
        try {
            reemplazar(await guardarWhatsAppSede(sedeId, armarPayloadSede(form)));
            toast.success('WhatsApp de la sede guardado.');
            return true;
        } catch (err) {
            toast.error(mensajeError(err, 'Error al guardar.'));
            return false;
        } finally {
            setSaving(false);
        }
    }, [reemplazar]);

    const quitar = useCallback(async (sedeId) => {
        setSaving(true);
        try {
            reemplazar(await quitarWhatsAppSede(sedeId));
            toast.success('La sede vuelve a usar la configuración general.');
            return true;
        } catch (err) {
            toast.error(mensajeError(err, 'Error al quitar la configuración.'));
            return false;
        } finally {
            setSaving(false);
        }
    }, [reemplazar]);

    const probar = useCallback(async (sedeId, destino) => {
        try {
            const data = await probarWhatsAppSede(sedeId, destino);
            const fallo = Object.values(data.resultados || {}).some(v => v !== 'enviado');
            if (fallo) toast.error('El envío de prueba falló: revise la configuración de la sede.');
            else toast.success('Prueba enviada.');
        } catch (err) {
            toast.error(mensajeError(err, 'Error al enviar la prueba.'));
        }
    }, []);

    return { sedes, loading, saving, version, guardar, quitar, probar };
}
