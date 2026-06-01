import { useState } from 'react';
import { Mail, Eye, EyeOff, ChevronDown, ChevronUp, Save } from 'lucide-react';

const PROVIDERS = [
  { value: 'smtp',      label: 'SMTP propio' },
  { value: 'sendgrid',  label: 'SendGrid' },
  { value: 'resend',    label: 'Resend' },
  { value: 'mailgun',   label: 'Mailgun' },
];

export function EmailConfigCard({ config, onSave, saving }) {
  const [form, setForm] = useState(config);
  const [showPass, setShowPass] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [open, setOpen] = useState(true);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const setCheck = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.checked }));

  const isApiProvider = form.provider !== 'smtp';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <Mail size={18} className="text-blue-600" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-gray-800 text-sm">Configuración de Email</p>
            <p className="text-xs text-gray-400">{PROVIDERS.find(p => p.value === form.provider)?.label ?? 'SMTP'}</p>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-50 pt-4">
          {/* Proveedor */}
          <div>
            <label className="label">Proveedor</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
              {PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, provider: p.value }))}
                  className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                    form.provider === p.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-blue-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* SMTP fields */}
          {!isApiProvider && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Host SMTP" value={form.host} onChange={set('host')} placeholder="smtp.gmail.com" />
              <div className="flex gap-2">
                <Field label="Puerto" value={form.port} onChange={set('port')} type="number" className="w-28" />
                <div className="flex flex-col justify-end pb-0.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.secure} onChange={setCheck('secure')} className="rounded" />
                    <span className="text-xs text-gray-600">SSL/TLS</span>
                  </label>
                </div>
              </div>
              <Field label="Usuario" value={form.user} onChange={set('user')} placeholder="no-reply@colegio.com" />
              <PasswordField label="Contraseña" value={form.password} onChange={set('password')} show={showPass} toggle={() => setShowPass(v => !v)} />
            </div>
          )}

          {/* API key providers */}
          {isApiProvider && (
            <div className="space-y-3">
              <PasswordField label="API Key" value={form.apiKey} onChange={set('apiKey')} show={showKey} toggle={() => setShowKey(v => !v)} placeholder="sk-..." />
              {form.provider === 'mailgun' && (
                <Field label="Dominio Mailgun" value={form.domain} onChange={set('domain')} placeholder="mg.tudominio.com" />
              )}
            </div>
          )}

          {/* From */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-gray-50">
            <Field label="Nombre remitente" value={form.fromName} onChange={set('fromName')} placeholder="Colegio XYZ" />
            <Field label="Email remitente" value={form.fromEmail} onChange={set('fromEmail')} placeholder="cobros@colegio.com" />
          </div>

          <div className="flex justify-end pt-1">
            <button
              onClick={() => onSave(form)}
              disabled={saving}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Save size={14} />
              {saving ? 'Guardando…' : 'Guardar email'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', className = '' }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="input mt-1"
      />
    </div>
  );
}

function PasswordField({ label, value, onChange, show, toggle, placeholder }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative mt-1">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder ?? '••••••••'}
          className="input pr-10"
        />
        <button
          type="button"
          onClick={toggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}
