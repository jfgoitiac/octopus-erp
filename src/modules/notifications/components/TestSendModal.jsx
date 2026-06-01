import { useState } from 'react';
import { X, Send, Mail, MessageCircle } from 'lucide-react';

export function TestSendModal({ rule, onSend, sending, onClose }) {
  const hasEmail = rule.channels?.email === true;
  const hasWhatsapp = rule.channels?.whatsapp === true;

  const defaultChannel = hasEmail ? 'email' : 'whatsapp';
  const [channel, setChannel] = useState(defaultChannel);
  const [to, setTo] = useState('');

  function handleSend() {
    if (!to.trim() || sending) return;
    onSend({ channel, to: to.trim(), ruleId: rule.id });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">
            Enviar prueba &mdash; <span className="text-indigo-600">{rule.label}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-5">
          {/* Channel selector */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Canal</p>
            <div className="flex gap-3">
              {hasEmail && (
                <button
                  type="button"
                  onClick={() => { setChannel('email'); setTo(''); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    channel === 'email'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Mail size={16} />
                  Email
                </button>
              )}
              {hasWhatsapp && (
                <button
                  type="button"
                  onClick={() => { setChannel('whatsapp'); setTo(''); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    channel === 'whatsapp'
                      ? 'border-green-600 bg-green-50 text-green-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <MessageCircle size={16} />
                  WhatsApp
                </button>
              )}
            </div>
          </div>

          {/* Recipient field */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Destinatario
            </label>
            {channel === 'email' ? (
              <input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            ) : (
              <input
                type="tel"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="+58 412 0000000"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!to.trim() || sending}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Enviando…
              </>
            ) : (
              <>
                <Send size={16} />
                Enviar prueba
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
