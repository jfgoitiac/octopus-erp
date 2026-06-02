import { useState } from 'react';
import { Mail, MessageSquare, Eye, EyeOff, Send, Settings, Loader2 } from 'lucide-react';
import { useConfiguracionNotificaciones } from '../../hooks/useConfiguracionNotificaciones';

// Extiende el hook con estados de visibilidad de credenciales que son UI-only.
function useNotifCfg() {
    const [showEmailPass,   setShowEmailPass]   = useState(false);
    const [showTwilioToken, setShowTwilioToken] = useState(false);
    const [showMetaToken,   setShowMetaToken]   = useState(false);
    const hook = useConfiguracionNotificaciones();
    return { ...hook, showEmailPass, setShowEmailPass, showTwilioToken, setShowTwilioToken, showMetaToken, setShowMetaToken };
}

// ── Sub-componentes inline ──────────────────────────────────────────────────

const InputRow = ({ label, campo, placeholder, type = 'text', form, setField }) => (
    <div>
        <label className="block text-[11px] uppercase tracking-widest mb-1.5"
            style={{ color: 'var(--ash)' }}>{label}</label>
        <input type={type} placeholder={placeholder}
            value={form[campo] ?? ''}
            onChange={e => setField(campo, e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
    </div>
);

const SecretInput = ({ label, campo, placeholder, show, onToggle, form, setField }) => (
    <div>
        <label className="block text-[11px] uppercase tracking-widest mb-1.5"
            style={{ color: 'var(--ash)' }}>{label}</label>
        <div className="relative">
            <input type={show ? 'text' : 'password'} placeholder={placeholder}
                value={form[campo] ?? ''}
                onChange={e => setField(campo, e.target.value)}
                className="w-full pl-3 pr-9 py-2 rounded-lg text-sm outline-none"
                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
            <button type="button" onClick={onToggle}
                className="absolute right-3 top-2.5" style={{ color: 'var(--ash)' }}
                aria-label={show ? 'Ocultar credencial' : 'Mostrar credencial'}>
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
        </div>
    </div>
);

const Toggle = ({ campo, form, setField }) => (
    <div className="relative" role="switch" aria-checked={!!form[campo]}>
        <input type="checkbox" className="sr-only"
            checked={!!form[campo]}
            onChange={e => setField(campo, e.target.checked)} />
        <div className="w-9 h-5 rounded-full transition-colors"
            style={{ background: form[campo] ? 'var(--pb)' : 'var(--border-md)' }}>
            <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                style={{ transform: form[campo] ? 'translateX(16px)' : 'translateX(0)' }} />
        </div>
    </div>
);

// ── Componente principal ────────────────────────────────────────────────────

const NotificacionesTab = () => {
    const {
        form, loading,
        savingEmail, savingWhatsApp,
        testForm, setTestForm, testLoading,
        setField, saveEmail, saveWhatsApp, sendTest,
        showEmailPass,   setShowEmailPass,
        showTwilioToken, setShowTwilioToken,
        showMetaToken,   setShowMetaToken,
    } = useNotifCfg();

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <Loader2 className="animate-spin" size={24} style={{ color: 'var(--pb)' }} />
            </div>
        );
    }

    if (!form) return null;

    const shared = { form, setField };

    return (
        <div className="space-y-5">
            {/* ── Email ─────────────────────────────────────────────── */}
            <div className="rounded-xl overflow-hidden"
                style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <div className="flex items-center justify-between px-5 py-3"
                    style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                    <div className="flex items-center gap-2">
                        <Mail size={15} style={{ color: 'var(--pb)' }} />
                        <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                            Correo electrónico (SMTP)
                        </span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-xs" style={{ color: 'var(--ash)' }}>
                            {form.email_activo ? 'Activo' : 'Inactivo'}
                        </span>
                        <Toggle campo="email_activo" {...shared} />
                    </label>
                </div>

                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InputRow label="Servidor SMTP"      campo="email_host"           placeholder="smtp.gmail.com"                    {...shared} />
                    <InputRow label="Puerto"             campo="email_port"           placeholder="587" type="number"                 {...shared} />
                    <InputRow label="Usuario / correo"   campo="email_host_user"      placeholder="noreply@colegio.edu.ve"            {...shared} />
                    <InputRow label="Remitente visible"  campo="email_from"           placeholder="Colegio <noreply@colegio.edu.ve>"  {...shared} />
                    <InputRow label="Email del director" campo="director_email"       placeholder="director@colegio.edu.ve"           {...shared} />
                    <SecretInput label="Contraseña / App Password" campo="email_host_password"
                        placeholder="••••••••••••"
                        show={showEmailPass} onToggle={() => setShowEmailPass(v => !v)} {...shared} />
                    <div className="flex items-center gap-2">
                        <input type="checkbox" id="tls"
                            checked={!!form.email_use_tls}
                            onChange={e => setField('email_use_tls', e.target.checked)}
                            className="rounded" />
                        <label htmlFor="tls" className="text-sm" style={{ color: 'var(--jet)' }}>
                            Usar TLS (recomendado)
                        </label>
                    </div>
                </div>

                <div className="px-5 pb-4 flex justify-end">
                    <button type="button" onClick={saveEmail} disabled={savingEmail}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        style={{ background: 'var(--pb)' }}>
                        {savingEmail ? <Loader2 className="animate-spin" size={14} /> : <Settings size={14} />}
                        {savingEmail ? 'Guardando...' : 'Guardar email'}
                    </button>
                </div>
            </div>

            {/* ── WhatsApp ──────────────────────────────────────────── */}
            <div className="rounded-xl overflow-hidden"
                style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <div className="flex items-center justify-between px-5 py-3"
                    style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                    <div className="flex items-center gap-2">
                        <MessageSquare size={15} style={{ color: 'var(--pb)' }} />
                        <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>WhatsApp</span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-xs" style={{ color: 'var(--ash)' }}>
                            {form.whatsapp_activo ? 'Activo' : 'Inactivo'}
                        </span>
                        <Toggle campo="whatsapp_activo" {...shared} />
                    </label>
                </div>

                <div className="p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                style={{ color: 'var(--ash)' }}>Proveedor</label>
                            <select value={form.whatsapp_proveedor ?? ''}
                                onChange={e => setField('whatsapp_proveedor', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg text-sm outline-none appearance-none"
                                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                                <option value="">No configurado</option>
                                <option value="twilio">Twilio</option>
                                <option value="meta">Meta Business API</option>
                            </select>
                        </div>
                        <InputRow label="WhatsApp del director (alertas día 15)"
                            campo="director_whatsapp" placeholder="+584120000000" {...shared} />
                    </div>

                    {form.whatsapp_proveedor === 'twilio' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg"
                            style={{ background: 'rgba(0,0,0,0.03)', border: '0.5px solid var(--border)' }}>
                            <p className="col-span-full text-xs font-semibold" style={{ color: 'var(--ash)' }}>
                                Credenciales Twilio
                            </p>
                            <InputRow  label="Account SID"      campo="twilio_account_sid"   placeholder="ACxxxxxxxxxxxxxxxx"  {...shared} />
                            <SecretInput label="Auth Token"     campo="twilio_auth_token"    placeholder="••••••••••••"
                                show={showTwilioToken} onToggle={() => setShowTwilioToken(v => !v)} {...shared} />
                            <InputRow  label="Número de origen" campo="twilio_whatsapp_from" placeholder="+14155238886"        {...shared} />
                        </div>
                    )}

                    {form.whatsapp_proveedor === 'meta' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg"
                            style={{ background: 'rgba(0,0,0,0.03)', border: '0.5px solid var(--border)' }}>
                            <p className="col-span-full text-xs font-semibold" style={{ color: 'var(--ash)' }}>
                                Credenciales Meta Business API
                            </p>
                            <InputRow    label="Phone Number ID" campo="meta_whatsapp_phone_id" placeholder="1234567890"    {...shared} />
                            <SecretInput label="Access Token"    campo="meta_whatsapp_token"   placeholder="••••••••••••"
                                show={showMetaToken} onToggle={() => setShowMetaToken(v => !v)} {...shared} />
                        </div>
                    )}
                </div>

                <div className="px-5 pb-4 flex justify-end">
                    <button type="button" onClick={saveWhatsApp} disabled={savingWhatsApp}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        style={{ background: 'var(--pb)' }}>
                        {savingWhatsApp ? <Loader2 className="animate-spin" size={14} /> : <Settings size={14} />}
                        {savingWhatsApp ? 'Guardando...' : 'Guardar WhatsApp'}
                    </button>
                </div>
            </div>

            {/* ── Prueba de envío ───────────────────────────────────── */}
            <div className="rounded-xl p-5"
                style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <p className="text-sm font-medium mb-3" style={{ color: 'var(--jet)' }}>
                    Enviar mensaje de prueba
                </p>
                <div className="flex flex-col md:flex-row gap-3">
                    <select value={testForm.canal}
                        onChange={e => setTestForm(prev => ({ ...prev, canal: e.target.value }))}
                        className="px-3 py-2 rounded-lg text-sm outline-none appearance-none"
                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', minWidth: 140 }}>
                        <option value="email">Email</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="ambos">Ambos</option>
                    </select>
                    <input type="text"
                        placeholder={testForm.canal === 'email' ? 'correo@ejemplo.com' : '+584120000000'}
                        value={testForm.destino}
                        onChange={e => setTestForm(prev => ({ ...prev, destino: e.target.value }))}
                        className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                    <button type="button" onClick={sendTest} disabled={testLoading}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        style={{ background: 'var(--pb)' }}>
                        {testLoading ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                        Enviar prueba
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NotificacionesTab;
