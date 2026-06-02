import { useRef, useContext, useState } from 'react';
import {
    Loader2, Eye, EyeOff, Save, Mail, MessageCircle,
    CheckCircle2, XCircle, Bell, Send,
} from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { useConfiguracionNotificaciones } from '../hooks/useConfiguracionNotificaciones';

// ─── Primitive form components (defined at module level to prevent remount on re-render) ───

const FieldLabel = ({ children, htmlFor }) => (
    <label
        htmlFor={htmlFor}
        className="block text-[11px] uppercase tracking-widest mb-1.5"
        style={{ color: 'var(--ash)' }}
    >
        {children}
    </label>
);

const TextInput = ({ id, fieldKey, form, setField, placeholder, type = 'text' }) => (
    <input
        id={id ?? fieldKey}
        type={type}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
        value={form[fieldKey]}
        placeholder={placeholder}
        onChange={e =>
            setField(fieldKey, type === 'number' ? (Number(e.target.value) || '') : e.target.value)
        }
    />
);

const SecretInput = ({ id, fieldKey, form, setField, show, onToggle, placeholder }) => {
    const value = form[fieldKey];
    const masked = typeof value === 'string' && value.startsWith('••••');
    return (
        <div className="relative">
            <input
                id={id ?? fieldKey}
                type={show ? 'text' : 'password'}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none pr-10"
                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                value={masked ? '' : value}
                placeholder={masked ? '••••••••  (sin cambios)' : placeholder}
                onChange={e => setField(fieldKey, e.target.value)}
            />
            <button
                type="button"
                aria-label={show ? 'Ocultar campo' : 'Mostrar campo'}
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

const Toggle = ({ fieldKey, form, setField, label }) => (
    <div className="flex items-center gap-3">
        <label
            htmlFor={`toggle-${fieldKey}`}
            className="relative inline-flex items-center cursor-pointer"
            aria-label={label}
        >
            <input
                id={`toggle-${fieldKey}`}
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
        <span className="text-sm select-none" style={{ color: 'var(--jet)' }}>{label}</span>
    </div>
);

// ─── Skeleton ───

const CardSkeleton = () => (
    <div className="rounded-xl overflow-hidden animate-pulse" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
        <div className="px-5 py-3.5 flex items-center gap-3" style={{ background: 'var(--bg)' }}>
            <div className="w-5 h-5 rounded" style={{ background: 'var(--ash-light)' }} />
            <div className="w-40 h-4 rounded" style={{ background: 'var(--ash-light)' }} />
        </div>
        <div className="p-5 space-y-4">
            {[1, 2, 3].map(i => (
                <div key={i} className="space-y-1.5">
                    <div className="w-24 h-3 rounded" style={{ background: 'var(--ash-light)' }} />
                    <div className="w-full h-9 rounded-lg" style={{ background: 'var(--ash-light)' }} />
                </div>
            ))}
            <div className="w-40 h-9 rounded-lg" style={{ background: 'var(--ash-light)' }} />
        </div>
    </div>
);

// ─── Main component ───

const ROLES_AUTORIZADOS = ['director', 'sistemas', 'administrador'];

const ConfiguracionNotificaciones = () => {
    const { user } = useContext(AuthContext);
    const testSectionRef = useRef(null);

    const [visibleSecrets, setVisibleSecrets] = useState({
        email_host_password: false,
        twilio_auth_token: false,
        meta_whatsapp_token: false,
    });

    const {
        form, loading,
        savingEmail, savingWhatsApp,
        testForm, setTestForm,
        testLoading, testResult,
        setField,
        saveEmail, saveWhatsApp, sendTest,
    } = useConfiguracionNotificaciones();

    const toggleSecret = (key) =>
        setVisibleSecrets(prev => ({ ...prev, [key]: !prev[key] }));

    const scrollToTest = (canal) => {
        setTestForm(p => ({ ...p, canal }));
        testSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const isAuthorized = user && ROLES_AUTORIZADOS.includes(user.rol);

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

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-20" style={{ animation: 'fadeIn 0.2s ease' }}>

            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ background: 'var(--pb-light)' }}>
                    <Bell size={20} style={{ color: 'var(--pb)' }} />
                </div>
                <div>
                    <h1 className="text-xl font-bold" style={{ color: 'var(--jet)' }}>
                        Configuración de Notificaciones
                    </h1>
                    <p className="text-sm" style={{ color: 'var(--ash)' }}>
                        Proveedores de correo y WhatsApp para avisos automáticos
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="grid md:grid-cols-2 gap-6">
                    <CardSkeleton />
                    <CardSkeleton />
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
                            <Toggle fieldKey="email_activo" form={form} setField={setField} label="Activo" />
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <FieldLabel htmlFor="email_host">Servidor SMTP</FieldLabel>
                                    <TextInput fieldKey="email_host" form={form} setField={setField} placeholder="smtp.gmail.com" />
                                </div>
                                <div>
                                    <FieldLabel htmlFor="email_port">Puerto</FieldLabel>
                                    <TextInput fieldKey="email_port" form={form} setField={setField} placeholder="587" type="number" />
                                </div>
                            </div>

                            <div className="flex items-center gap-3 py-1">
                                <Toggle fieldKey="email_use_tls" form={form} setField={setField} label="Usar TLS" />
                            </div>

                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <FieldLabel htmlFor="email_host_user">Usuario SMTP</FieldLabel>
                                    <TextInput fieldKey="email_host_user" form={form} setField={setField} placeholder="tu@gmail.com" />
                                </div>
                                <div>
                                    <FieldLabel htmlFor="email_host_password">Contraseña SMTP</FieldLabel>
                                    <SecretInput
                                        fieldKey="email_host_password"
                                        form={form}
                                        setField={setField}
                                        show={visibleSecrets.email_host_password}
                                        onToggle={() => toggleSecret('email_host_password')}
                                        placeholder="Contraseña de aplicación"
                                    />
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <FieldLabel htmlFor="email_from">Remitente (From)</FieldLabel>
                                    <TextInput fieldKey="email_from" form={form} setField={setField} placeholder='Colegio <no-reply@colegio.edu.ve>' />
                                </div>
                                <div>
                                    <FieldLabel htmlFor="director_email">Email del Director</FieldLabel>
                                    <TextInput fieldKey="director_email" form={form} setField={setField} placeholder="director@colegio.edu.ve" type="email" />
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 pt-2">
                                <button
                                    onClick={saveEmail}
                                    disabled={savingEmail}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                                    style={{ background: 'var(--pb)' }}
                                >
                                    {savingEmail ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                    Guardar configuración email
                                </button>
                                <button
                                    onClick={() => scrollToTest('email')}
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
                            <Toggle fieldKey="whatsapp_activo" form={form} setField={setField} label="Activo" />
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <FieldLabel htmlFor="whatsapp_proveedor">Proveedor</FieldLabel>
                                <select
                                    id="whatsapp_proveedor"
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
                                        <FieldLabel htmlFor="twilio_account_sid">Account SID</FieldLabel>
                                        <TextInput fieldKey="twilio_account_sid" form={form} setField={setField} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                                    </div>
                                    <div>
                                        <FieldLabel htmlFor="twilio_auth_token">Auth Token</FieldLabel>
                                        <SecretInput
                                            fieldKey="twilio_auth_token"
                                            form={form}
                                            setField={setField}
                                            show={visibleSecrets.twilio_auth_token}
                                            onToggle={() => toggleSecret('twilio_auth_token')}
                                            placeholder="Auth token de Twilio"
                                        />
                                    </div>
                                    <div>
                                        <FieldLabel htmlFor="twilio_whatsapp_from">Número WhatsApp Twilio (From)</FieldLabel>
                                        <TextInput fieldKey="twilio_whatsapp_from" form={form} setField={setField} placeholder="+14155238886" />
                                    </div>
                                </div>
                            )}

                            {form.whatsapp_proveedor === 'meta' && (
                                <div className="space-y-4">
                                    <div>
                                        <FieldLabel htmlFor="meta_whatsapp_token">Token de acceso (Meta)</FieldLabel>
                                        <SecretInput
                                            fieldKey="meta_whatsapp_token"
                                            form={form}
                                            setField={setField}
                                            show={visibleSecrets.meta_whatsapp_token}
                                            onToggle={() => toggleSecret('meta_whatsapp_token')}
                                            placeholder="Token permanente de Meta"
                                        />
                                    </div>
                                    <div>
                                        <FieldLabel htmlFor="meta_whatsapp_phone_id">Phone Number ID</FieldLabel>
                                        <TextInput fieldKey="meta_whatsapp_phone_id" form={form} setField={setField} placeholder="ID del número en Meta Business" />
                                    </div>
                                </div>
                            )}

                            <div>
                                <FieldLabel htmlFor="director_whatsapp">WhatsApp del Director (alertas día 15)</FieldLabel>
                                <TextInput fieldKey="director_whatsapp" form={form} setField={setField} placeholder="+58 4XX XXXXXXX" />
                            </div>

                            <div className="flex flex-wrap items-center gap-3 pt-2">
                                <button
                                    onClick={saveWhatsApp}
                                    disabled={savingWhatsApp}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                                    style={{ background: 'var(--pb)' }}
                                >
                                    {savingWhatsApp ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                    Guardar configuración WhatsApp
                                </button>
                                <button
                                    onClick={() => scrollToTest('whatsapp')}
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
                    <div
                        ref={testSectionRef}
                        className="rounded-xl overflow-hidden"
                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}
                    >
                        <div className="px-5 py-3.5 flex items-center gap-3" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                            <Send size={17} style={{ color: 'var(--pb)' }} />
                            <span className="font-semibold text-sm" style={{ color: 'var(--jet)' }}>Probar conexión</span>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="grid sm:grid-cols-3 gap-4">
                                <div>
                                    <FieldLabel htmlFor="test_canal">Canal</FieldLabel>
                                    <select
                                        id="test_canal"
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
                                <div className="sm:col-span-2">
                                    <FieldLabel htmlFor="test_destino">
                                        {testForm.canal === 'whatsapp' ? 'Número destino' : 'Email destino'}
                                    </FieldLabel>
                                    <input
                                        id="test_destino"
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
                                <FieldLabel htmlFor="test_mensaje">Mensaje (opcional)</FieldLabel>
                                <textarea
                                    id="test_mensaje"
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                    rows={3}
                                    value={testForm.mensaje}
                                    placeholder="Mensaje de prueba personalizado..."
                                    onChange={e => setTestForm(p => ({ ...p, mensaje: e.target.value }))}
                                />
                            </div>

                            <button
                                onClick={sendTest}
                                disabled={testLoading || !testForm.destino.trim()}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                                style={{ background: 'var(--pb)' }}
                            >
                                {testLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                Enviar prueba
                            </button>

                            {testResult && (
                                <div
                                    className="flex items-start gap-3 px-4 py-3 rounded-lg text-sm"
                                    style={{
                                        background: testResult.ok ? 'var(--pb-light)' : 'var(--red-light)',
                                        border: `0.5px solid ${testResult.ok ? 'var(--pb)' : 'var(--red)'}`,
                                        color: testResult.ok ? 'var(--pb)' : 'var(--red)',
                                    }}
                                >
                                    {testResult.ok
                                        ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                                        : <XCircle size={16} className="mt-0.5 shrink-0" />
                                    }
                                    <div>
                                        <p className="font-semibold">
                                            {testResult.ok ? 'Prueba enviada correctamente' : 'Error al enviar'}
                                        </p>
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
