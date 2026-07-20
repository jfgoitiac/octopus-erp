import { useState, useCallback, useEffect } from 'react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';

export const AREAS_EMAIL = [
    { value: 'cobranza', label: 'Cobranza' },
    { value: 'control_estudios', label: 'Control de Estudios' },
];

export const EMPTY_FORM = {
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

export const EMPTY_PERFIL_EMAIL = {
    email_activo: false,
    email_host: 'smtp.hostinger.com',
    email_port: 465,
    email_use_tls: true,
    email_host_user: '',
    email_host_password: '',
    email_from: '',
};

const SECRET_FIELDS = ['email_host_password', 'twilio_auth_token', 'meta_whatsapp_token'];

const isSecretMasked = (val) => typeof val === 'string' && val.startsWith('••••');

const WHATSAPP_KEYS = [
    'whatsapp_activo', 'whatsapp_proveedor',
    'twilio_account_sid', 'twilio_auth_token', 'twilio_whatsapp_from',
    'meta_whatsapp_token', 'meta_whatsapp_phone_id', 'director_whatsapp',
];

const emptyPerfiles = () =>
    AREAS_EMAIL.reduce((acc, { value }) => ({ ...acc, [value]: EMPTY_PERFIL_EMAIL }), {});

export function useConfiguracionNotificaciones() {
    const [form, setFormState] = useState(EMPTY_FORM);
    const [perfiles, setPerfiles] = useState(emptyPerfiles);
    const [perfilesOriginal, setPerfilesOriginal] = useState(emptyPerfiles);
    const [loading, setLoading] = useState(true);
    const [savingEmailArea, setSavingEmailArea] = useState({});
    const [savingWhatsApp, setSavingWhatsApp] = useState(false);
    const [testForm, setTestForm] = useState({ canal: 'email', destino: '', mensaje: '', area: 'cobranza' });
    const [testLoading, setTestLoading] = useState(false);
    const [testResult, setTestResult] = useState(null);

    const setField = useCallback((key, value) => {
        setFormState(prev => ({ ...prev, [key]: value }));
    }, []);

    const setPerfilField = useCallback((area, key, value) => {
        setPerfiles(prev => ({ ...prev, [area]: { ...prev[area], [key]: value } }));
    }, []);

    const fetchConfig = useCallback(async () => {
        try {
            const [{ data: cfgData }, ...perfilRes] = await Promise.all([
                axiosInstance.get('notificaciones/configuracion/'),
                ...AREAS_EMAIL.map(({ value }) => axiosInstance.get(`notificaciones/perfiles-email/${value}/`)),
            ]);
            setFormState({ ...EMPTY_FORM, ...cfgData });
            const nuevos = {};
            AREAS_EMAIL.forEach(({ value }, i) => {
                nuevos[value] = { ...EMPTY_PERFIL_EMAIL, ...perfilRes[i].data };
            });
            setPerfiles(nuevos);
            setPerfilesOriginal(nuevos);
        } catch {
            toast.error('Error al cargar la configuración de notificaciones.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchConfig(); }, [fetchConfig]);

    const saveEmailArea = useCallback(async (area) => {
        setSavingEmailArea(prev => ({ ...prev, [area]: true }));
        try {
            const payload = {};
            Object.keys(EMPTY_PERFIL_EMAIL).forEach(key => {
                const val = perfiles[area][key];
                if (SECRET_FIELDS.includes(key)) {
                    if (val && !isSecretMasked(val) && val !== perfilesOriginal[area][key]) payload[key] = val;
                } else {
                    payload[key] = val;
                }
            });
            const { data } = await axiosInstance.patch(`notificaciones/perfiles-email/${area}/`, payload);
            const actualizado = { ...EMPTY_PERFIL_EMAIL, ...data };
            setPerfiles(prev => ({ ...prev, [area]: actualizado }));
            setPerfilesOriginal(prev => ({ ...prev, [area]: actualizado }));
            toast.success('Configuración de email guardada.');
        } catch (err) {
            toast.error(err.response?.data?.error || err.response?.data?.detail || 'Error al guardar.');
        } finally {
            setSavingEmailArea(prev => ({ ...prev, [area]: false }));
        }
    }, [perfiles, perfilesOriginal]);

    const saveWhatsApp = useCallback(async () => {
        setSavingWhatsApp(true);
        try {
            const payload = {};
            WHATSAPP_KEYS.forEach(key => {
                const val = form[key];
                if (SECRET_FIELDS.includes(key)) {
                    if (val && !isSecretMasked(val)) payload[key] = val;
                } else {
                    payload[key] = val;
                }
            });
            const { data } = await axiosInstance.patch('notificaciones/configuracion/', payload);
            setFormState({ ...EMPTY_FORM, ...data });
            toast.success('Configuración de WhatsApp guardada.');
        } catch (err) {
            toast.error(err.response?.data?.error || err.response?.data?.detail || 'Error al guardar.');
        } finally {
            setSavingWhatsApp(false);
        }
    }, [form]);

    const sendTest = useCallback(async () => {
        setTestLoading(true);
        setTestResult(null);
        try {
            const { data } = await axiosInstance.post('notificaciones/probar/', testForm);
            const resultados = data.resultados || {};
            const fallo = Object.values(resultados).some(v => v !== 'enviado');
            setTestResult({ ok: !fallo, data });
            if (fallo) {
                toast.error('El envío de prueba falló — revisa la configuración.');
            } else {
                toast.success('Prueba enviada.');
            }
        } catch (err) {
            setTestResult({ ok: false, data: err.response?.data });
            toast.error('Error al enviar prueba.');
        } finally {
            setTestLoading(false);
        }
    }, [testForm]);

    return {
        form,
        perfiles,
        loading,
        savingEmailArea,
        savingWhatsApp,
        testForm,
        setTestForm,
        testLoading,
        testResult,
        setTestResult,
        setField,
        setPerfilField,
        saveEmailArea,
        saveWhatsApp,
        sendTest,
    };
}
