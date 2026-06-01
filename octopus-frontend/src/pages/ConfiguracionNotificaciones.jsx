import { useState, useEffect, useContext } from 'react';
import {
    Loader2, Eye, EyeOff, Save, Mail, MessageCircle,
    CheckCircle2, XCircle, Bell, RefreshCcw, Send
} from 'lucide-react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';
import { AuthContext } from '../context/AuthContext';

const SECRET_FIELDS = ['email_host_password', 'twilio_auth_token', 'meta_whatsapp_token'];

const isSecretMasked = (val) => typeof val === 'string' && val.startsWith('••••');

const EMPTY_FORM = {
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

const ConfiguracionNotificaciones = () => {
    const { user } = useContext(AuthContext);

    const [form, setForm] = useState(EMPTY_FORM);
    const [original, setOriginal] = useState(EMPTY_FORM);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testLoading, setTestLoading] = useState(false);
    const [testForm, setTestForm] = useState({ canal: 'email', destino: '', mensaje: '' });
    const [testResult, setTestResult] = useState(null);

    const [showPass, setShowPass] = useState(false);
    const [showTwilioToken, setShowTwilioToken] = useState(false);
    const [showMetaToken, setShowMetaToken] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const { data } = await axiosInstance.get('notificaciones/configuracion/');
                const merged = { ...EMPTY_FORM, ...data };
                setForm(merged);
                setOriginal(merged);
            } catch (err) {
                toast.error('Error al cargar la configuración de notificaciones.');
            } finally {
                setLoading(false);
            }
        };
        fetchConfig();
    }, []);

    const isAuthorized = user && ['director', 'sistemas', 'administrador'].includes(user.rol);

    if (!isAuthorized && !loading) {
        return (
            <div className="max-w-4xl mx-auto py-20 text-center">
                <XCircle size={48} className="mx-auto mb-4" style={{ color: 'var(--red)' }} />
                <p className="text-lg font-semibold" style={{ color: 'var(--jet)' }}>Acceso Restringido</p>
                <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
                    No tienes permisos para ver esta sección.
                </p>
            </div>
        );
    }

    const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

    const buildPayload = (keys) => {
        const payload = {};
        keys.forEach(key => {
            const val = form[key];
            if (SECRET_FIELDS.includes(key)) {
                if (val === original[key] || val === '' || isSecretMasked(val)) {
                    payload[key] = '';
                } else {
                    payload[key] = val;
                }
            } else {
                payload[key] = val;
            }
        });
        return payload;
    };

    const saveEmail = async () => {
        setSaving(true);
        try {
            const payload = buildPayload([
                'email_activo', 'email_host', 'email_port', 'email_use_tls',
                'email_host_user', 'email_host_password', 'email_from', 'director_email'
            ]);
            await axiosInstance.patch('notificaciones/configuracion/', payload);
            toast.success('Configuración de email guardada.');
            const { data } = await axiosInstance.get('notificaciones/configuracion/');
            const merged = { ...EMPTY_FORM, ...data };
            setForm(merged);
            setOriginal(merged);
        } catch (err) {
            toast.error(err.response?.data?.error || err.response?.data?.detail || 'Error al guardar.');
        } finally {
            setSaving(false);
        }
    };

    const saveWhatsApp = async () => {
        setSaving(true);
        try {
            const payload = buildPayload([
                'whatsapp_activo', 'whatsapp_proveedor',
                'twilio_account_sid', 'twilio_auth_token', 'twilio_whatsapp_from',
                'meta_whatsapp_token', 'meta_whatsapp_phone_id', 'director_whatsapp'
            ]);
            await axiosInstance.patch('notificaciones/configuracion/', payload);
            toast.success('Configuración de WhatsApp guardada.');
            const { data } = await axiosInstance.get('notificaciones/configuracion/');
            const merged = { ...EMPTY_FORM, ...data };
            setForm(merged);
            setOriginal(merged);
        } catch (err) {
            toast.error(err.response?.data?.error || err.response?.data?.detail || 'Error al guardar.');
        } finally {
            setSaving(false);
        }
    };

    const sendTest = async () => {
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
    };

    const SecretInput = ({ fieldKey, show, onToggle, placeholder }) => {
        const value = form[fieldKey];
        const masked = isSecretMasked(value);
        return (
            <div className="relative">
                <input
                    type={show ? 'text' : 'password'}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none pr-10"
                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                    value={masked ? '' : value}
                    placeholder={masked ? '••••••••  (sin cambios)' : placeholder}
                    onChange={e => setField(fieldKey, e.target.value)}
                />
                <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--ash)' }}
                    onClick={onToggle}
                    tabIndex={-1}
                >
                    {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
            </div>
        );
    };

    const Toggle = ({ fieldKey, label }) => (
        <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
                <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={!!form[fieldKey]}
                    onChange={e => setField(fieldKey, e.target.checked)}
                />
                <div
                    className="w-11 h-6 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"
                    style={{ background: form[fieldKey] ? 'var(--pb)' : 'var(--ash-light)' }}
                />
            </label>
            <span className="text-sm" style={{ color: 'var(--jet)' }}>{label}</span>
        </div>
    );

    const FieldLabel = ({ children }) => (
        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            {children}
        </label>
    );

    const TextInput = ({ fieldKey, placeholder, type = 'text' }) => (
        <input
            type={type}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
            value={form[fieldKey]}
            placeholder={placeholder}
            onChange={e => setField(fieldKey, type === 'number' ? Number(e.target.value) : e.target.value)}
        />
    );

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-20" style={{ animation: 'fadeIn 0.2s ease' }}>
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ background: 'var(--pb-light)' }}>
                    <Bell size={20} style={{ color: 'var(--pb)' }} />
                </div>
                <div>
                    <h1 className="text-xl font-bold" style={{ color: 'var(--jet)' }}>Configuración de Notificaciones</h1>
                    <p className="text-sm" style={{ color: 'var(--ash)' }}>Proveedores de correo y WhatsApp para avisos automáticos</p>
                </div>
            </div>

            {loading ? (
                <div className="grid md:grid-cols-2 gap-6">
                    <div className="animate-pulse rounded-xl h-48" style={{ background: 'var(--ash-light)' }} />
                    <div className="animate-pulse rounded-xl h-48" style={{ background: 'var(--ash-light)' }} />
                </div>
            ) : (
                <>
                    {/* ─── Card Email ─── */}
                    <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                        <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                            <div className="flex items-center gap-3">
                                <Mail size={17} style={{ color: 'var(--pb)' }} />
                                <span className="font-semibold text-sm" style={{ color: 'var(--jet)' }}>Correo Electrónico</span>
                            </div>
                            <Toggle fieldKey="email_activo" label="Activo" />
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <FieldLabel>Servidor SMTP</FieldLabel>
                                    <TextInput fieldKey="email_host" placeholder="smtp.gmail.com" />
                                </div>
                                <div>
                                    <FieldLabel>Puerto</FieldLabel>
                                    <TextInput fieldKey="email_port" placeholder="587" type="number" />
                                </div>
                            </div>

                            <div className="flex items-center gap-3 py-1">
                                <Toggle fieldKey="email_use_tls" label="Usar TLS" />
                            </div>

                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <FieldLabel>Usuario SMTP</FieldLabel>
                                    <TextInput fieldKey="email_host_user" placeholder="tu@gmail.com" />
                                </div>
                                <div>
                                    <FieldLabel>Contraseña SMTP</FieldLabel>
                                    <SecretInput
                                        fieldKey="email_host_password"
                                        show={showPass}
                                        onToggle={() => setShowPass(v => !v)}
                                        placeholder="Contraseña de aplicación"
                                    />
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <FieldLabel>Remitente (From)</FieldLabel>
                                    <TextInput fieldKey="email_from" placeholder='Colegio <no-reply@colegio.edu.ve>' />
                                </div>
                                <div>
                                    <FieldLabel>Email del Director</FieldLabel>
                                    <TextInput fieldKey="director_email" placeholder="director@colegio.edu.ve" type="email" />
                                </div>
                            </div>

                            <div className="flex items-center gap-3 pt-2">
                                <button
                                    onClick={saveEmail}
                                    disabled={saving}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                                    style={{ background: 'var(--pb)' }}
                                >
                                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                    Guardar configuración email
                                </button>
                                <button
                                    onClick={() => { setTestForm(p => ({ ...p, canal: 'email' })); document.getElementById('test-section')?.scrollIntoView({ behavior: 'smooth' }); }}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)', background: 'var(--bg)' }}
                                >
                                    <Send size={14} />
                                    Probar email
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ─── Card WhatsApp ─── */}
                    <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                        <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                            <div className="flex items-center gap-3">
                                <MessageCircle size={17} style={{ color: 'var(--pb)' }} />
                                <span className="font-semibold text-sm" style={{ color: 'var(--jet)' }}>WhatsApp</span>
                            </div>
                            <Toggle fieldKey="whatsapp_activo" label="Activo" />
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <FieldLabel>Proveedor</FieldLabel>
                                <select
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                    value={form.whatsapp_proveedor}
                                    onChange={e => setField('whatsapp_proveedor', e.target.value)}
                                >
                                    <option value="">No configurado</option>
                                    <option value="twilio">Twilio</option>
                                    <option value="meta">Meta Business API</option>
                                </select>
                            </div>

                            {form.whatsapp_proveedor === 'twilio' && (
                                <div className="space-y-4">
                                    <div>
                                        <FieldLabel>Account SID</FieldLabel>
                                        <TextInput fieldKey="twilio_account_sid" placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                                    </div>
                                    <div>
                                        <FieldLabel>Auth Token</FieldLabel>
                                        <SecretInput
                                            fieldKey="twilio_auth_token"
                                            show={showTwilioToken}
                                            onToggle={() => setShowTwilioToken(v => !v)}
                                            placeholder="Auth token de Twilio"
                                        />
                                    </div>
                                    <div>
                                        <FieldLabel>Número WhatsApp Twilio (From)</FieldLabel>
                                        <TextInput fieldKey="twilio_whatsapp_from" placeholder="+14155238886" />
                                    </div>
                                </div>
                            )}

                            {form.whatsapp_proveedor === 'meta' && (
                                <div className="space-y-4">
                                    <div>
                                        <FieldLabel>Token de acceso (Meta)</FieldLabel>
                                        <SecretInput
                                            fieldKey="meta_whatsapp_token"
                                            show={showMetaToken}
                                            onToggle={() => setShowMetaToken(v => !v)}
                                            placeholder="Token permanente de Meta"
                                        />
                                    </div>
                                    <div>
                                        <FieldLabel>Phone Number ID</FieldLabel>
                                        <TextInput fieldKey="meta_whatsapp_phone_id" placeholder="ID del número en Meta Business" />
                                    </div>
                                </div>
                            )}

                            <div>
                                <FieldLabel>WhatsApp del Director (alertas día 15)</FieldLabel>
                                <TextInput fieldKey="director_whatsapp" placeholder="+58 4XX XXXXXXX" />
                            </div>

                            <div className="flex items-center gap-3 pt-2">
                                <button
                                    onClick={saveWhatsApp}
                                    disabled={saving}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                                    style={{ background: 'var(--pb)' }}
                                >
                                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                    Guardar configuración WhatsApp
                                </button>
                                <button
                                    onClick={() => { setTestForm(p => ({ ...p, canal: 'whatsapp' })); document.getElementById('test-section')?.scrollIntoView({ behavior: 'smooth' }); }}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)', background: 'var(--bg)' }}
                                >
                                    <Send size={14} />
                                    Probar WhatsApp
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ─── Card Probar conexión ─── */}
                    <div id="test-section" className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                        <div className="px-5 py-3.5 flex items-center gap-3" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                            <Send size={17} style={{ color: 'var(--pb)' }} />
                            <span className="font-semibold text-sm" style={{ color: 'var(--jet)' }}>Probar conexión</span>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="grid md:grid-cols-3 gap-4">
                                <div>
                                    <FieldLabel>Canal</FieldLabel>
                                    <select
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                        value={testForm.canal}
                                        onChange={e => setTestForm(p => ({ ...p, canal: e.target.value }))}
                                    >
                                        <option value="email">Email</option>
                                        <option value="whatsapp">WhatsApp</option>
                                        <option value="ambos">Ambos</option>
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <FieldLabel>
                                        {testForm.canal === 'whatsapp' ? 'Número destino' : 'Email destino'}
                                    </FieldLabel>
                                    <input
                                        type={testForm.canal === 'email' ? 'email' : 'text'}
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                        value={testForm.destino}
                                        placeholder={testForm.canal === 'whatsapp' ? '+58 4XX XXXXXXX' : 'destino@ejemplo.com'}
                                        onChange={e => setTestForm(p => ({ ...p, destino: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div>
                                <FieldLabel>Mensaje (opcional)</FieldLabel>
                                <textarea
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                    rows={3}
                                    value={testForm.mensaje}
                                    placeholder="Mensaje de prueba personalizado..."
                                    onChange={e => setTestForm(p => ({ ...p, mensaje: e.target.value }))}
                                />
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={sendTest}
                                    disabled={testLoading || !testForm.destino}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                                    style={{ background: 'var(--pb)' }}
                                >
                                    {testLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                    Enviar prueba
                                </button>
                            </div>

                            {testResult && (
                                <div className={`flex items-start gap-3 px-4 py-3 rounded-lg text-sm`}
                                    style={{
                                        background: testResult.ok ? 'var(--pb-light)' : 'var(--red-light)',
                                        border: `0.5px solid ${testResult.ok ? 'var(--pb)' : 'var(--red)'}`,
                                        color: testResult.ok ? 'var(--pb)' : 'var(--red)'
                                    }}
                                >
                                    {testResult.ok
                                        ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                                        : <XCircle size={16} className="mt-0.5 shrink-0" />
                                    }
                                    <div>
                                        <p className="font-semibold">{testResult.ok ? 'Prueba enviada correctamente' : 'Error al enviar'}</p>
                                        {testResult.data && (
                                            <p className="mt-0.5 opacity-80 text-xs">
                                                {typeof testResult.data === 'string'
                                                    ? testResult.data
                                                    : testResult.data.detail || testResult.data.error || JSON.stringify(testResult.data)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default ConfiguracionNotificaciones;
