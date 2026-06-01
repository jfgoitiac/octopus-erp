import { useState } from 'react';
import { MessageCircle, Eye, EyeOff, ChevronDown, ChevronUp, Save, AlertTriangle } from 'lucide-react';

const PROVIDERS = [
  { value: 'twilio',    label: 'Twilio' },
  { value: 'meta',      label: 'Meta Business API' },
  { value: '360dialog', label: '360dialog' },
];

export function WhatsAppConfigCard({ config, onSave, saving }) {
  const [form, setForm] = useState(config);
  const [open, setOpen] = useState(true);

  // Toggle visibility state per sensitive field
  const [showAuthToken,   setShowAuthToken]   = useState(false);
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [showApiKey360,   setShowApiKey360]   = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
            <MessageCircle size={18} className="text-green-600" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-gray-800 text-sm">Configuración de WhatsApp</p>
            <p className="text-xs text-gray-400">
              {PROVIDERS.find((p) => p.value === form.provider)?.label ?? 'Twilio'}
            </p>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-50 pt-4">
          {/* Selector de proveedor */}
          <div>
            <label className="label">Proveedor</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
              {PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, provider: p.value }))}
                  className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                    form.provider === p.value
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 text-gray-600 hover:border-green-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Campos Twilio */}
          {form.provider === 'twilio' && (
            <div className="space-y-3">
              <Field
                label="Account SID"
                value={form.accountSid}
                onChange={set('accountSid')}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
              <PasswordField
                label="Auth Token"
                value={form.authToken}
                onChange={set('authToken')}
                show={showAuthToken}
                toggle={() => setShowAuthToken((v) => !v)}
              />
              <Field
                label="From Number"
                value={form.fromNumber}
                onChange={set('fromNumber')}
                placeholder="+12345678900"
              />
            </div>
          )}

          {/* Campos Meta Business API */}
          {form.provider === 'meta' && (
            <div className="space-y-3">
              <Field
                label="Phone Number ID"
                value={form.phoneNumberId}
                onChange={set('phoneNumberId')}
                placeholder="1234567890"
              />
              <PasswordField
                label="Access Token"
                value={form.accessToken}
                onChange={set('accessToken')}
                show={showAccessToken}
                toggle={() => setShowAccessToken((v) => !v)}
              />
            </div>
          )}

          {/* Campos 360dialog */}
          {form.provider === '360dialog' && (
            <div className="space-y-3">
              <PasswordField
                label="API Key"
                value={form.apiKey360}
                onChange={set('apiKey360')}
                show={showApiKey360}
                toggle={() => setShowApiKey360((v) => !v)}
                placeholder="••••••••"
              />
              <Field
                label="Channel ID"
                value={form.channelId}
                onChange={set('channelId')}
                placeholder="channel_xxxxxxxx"
              />
            </div>
          )}

          {/* Botón guardar */}
          <div className="flex justify-end pt-1">
            <button
              onClick={() => onSave(form)}
              disabled={saving}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Save size={14} />
              {saving ? 'Guardando…' : 'Guardar WhatsApp'}
            </button>
          </div>

          {/* Nota informativa */}
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
            <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 leading-relaxed">
              La integración de WhatsApp requiere una cuenta activa con el proveedor seleccionado.
              Los mensajes se activarán una vez configurado el backend.
            </p>
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
