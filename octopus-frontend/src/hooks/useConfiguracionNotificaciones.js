import { useState, useCallback, useEffect } from 'react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';

export const EMPTY_FORM = {
    email_activo: false,
    email_host: '',
    email_port: 587,
    email_use_tls: true,
    email_host_user: '',
    email_host_password: '',
    email_from: '',
    director_email: '',
    whatsapp_activo: false,
    whatsapp_proveedor: '',
    twilio_account_sid: '',
    twilio_auth_token: '',
    twilio_whatsapp_from: '',
    meta_whatsapp_token: '',
    meta_whatsapp_phone_id: '',
    director_whatsapp: '',
};

const SECRET_FIELDS = ['email_host_password', 'twilio_auth_token', 'meta_whatsapp_token'];

const isSecretMasked = (val) => typeof val === 'string' && val.startsWith('••••');

const EMAIL_KEYS = [
    'email_activo', 'email_host', 'email_port', 'email_use_tls',
    'email_host_user', 'email_host_password', 'email_from', 'director_email',
];

const WHATSAPP_KEYS = [
    'whatsapp_activo', 'whatsapp_proveedor',
    'twilio_account_sid', 'twilio_auth_token', 'twilio_whatsapp_from',
    'meta_whatsapp_token', 'meta_whatsapp_phone_id', 'director_whatsapp',
];

export function useConfiguracionNotificaciones() {
    const [form, setFormState] = useState(EMPTY_FORM);
    const [original, setOriginal] = useState(EMPTY_FORM);
    const [loading, setLoading] = useState(true);
    const [savingEmail, setSavingEmail] = useState(false);
    const [savingWhatsApp, setSavingWhatsApp] = useState(false);
    const [testForm, setTestForm] = useState({ canal: 'email', destino: '', mensaje: '' });
    const [testLoading, setTestLoading] = useState(false);
    const [testResult, setTestResult] = useState(null);

    const setField = useCallback((key, value) => {
        setFormState(prev => ({ ...prev, [key]: value }));
    }, []);

    const applyData = useCallback((data) => {
        const merged = { ...EMPTY_FORM, ...data };
        setFormState(merged);
        setOriginal(merged);
    }, []);

    const reloadConfig = useCallback(async () => {
        const { data } = await axiosInstance.get('notificaciones/configuracion/');
        applyData(data);
    }, [applyData]);

    const fetchConfig = useCallback(async () => {
        try {
            await reloadConfig();
        } catch {
            toast.error('Error al cargar la configuración de notificaciones.');
        } finally {
            setLoading(false);
        }
    }, [reloadConfig]);

    useEffect(() => { fetchConfig(); }, [fetchConfig]);

    // Builds the PATCH payload. Secrets are omitted if unchanged or masked
    // (sending '' could clear stored credentials on the backend).
    const buildPayload = useCallback((keys) => {
        const payload = {};
        keys.forEach(key => {
            const val = form[key];
            if (SECRET_FIELDS.includes(key)) {
                if (val && !isSecretMasked(val) && val !== original[key]) {
                    payload[key] = val;
                }
            } else {
                payload[key] = val;
            }
        });
        return payload;
    }, [form, original]);

    const saveEmail = useCallback(async () => {
        setSavingEmail(true);
        try {
            await axiosInstance.patch('notificaciones/configuracion/', buildPayload(EMAIL_KEYS));
            toast.success('Configuración de email guardada.');
            try { await reloadConfig(); } catch { /* save succeeded, silent reload failure */ }
        } catch (err) {
            toast.error(err.response?.data?.error || err.response?.data?.detail || 'Error al guardar.');
        } finally {
            setSavingEmail(false);
        }
    }, [buildPayload, reloadConfig]);

    const saveWhatsApp = useCallback(async () => {
        setSavingWhatsApp(true);
        try {
            await axiosInstance.patch('notificaciones/configuracion/', buildPayload(WHATSAPP_KEYS));
            toast.success('Configuración de WhatsApp guardada.');
            try { await reloadConfig(); } catch { /* save succeeded, silent reload failure */ }
        } catch (err) {
            toast.error(err.response?.data?.error || err.response?.data?.detail || 'Error al guardar.');
        } finally {
            setSavingWhatsApp(false);
        }
    }, [buildPayload, reloadConfig]);

    const sendTest = useCallback(async () => {
        setTestLoading(true);
        setTestResult(null);
        try {
            const { data } = await axiosInstance.post('notificaciones/probar/', testForm);
            setTestResult({ ok: true, data });
            toast.success('Prueba enviada.');
        } catch (err) {
            setTestResult({ ok: false, data: err.response?.data });
            toast.error('Error al enviar prueba.');
        } finally {
            setTestLoading(false);
        }
    }, [testForm]);

    return {
        form,
        loading,
        savingEmail,
        savingWhatsApp,
        testForm,
        setTestForm,
        testLoading,
        testResult,
        setTestResult,
        setField,
        saveEmail,
        saveWhatsApp,
        sendTest,
    };
}
