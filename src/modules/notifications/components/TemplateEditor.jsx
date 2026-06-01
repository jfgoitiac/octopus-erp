import { useState, useRef } from 'react';

const VARIABLES = [
  '{{nombre}}',
  '{{factura}}',
  '{{monto}}',
  '{{vencimiento}}',
  '{{cedula}}',
  '{{estudiante}}',
];

const EXAMPLE_VALUES = {
  '{{nombre}}': 'María García',
  '{{factura}}': '#2024-001',
  '{{monto}}': 'Bs. 1.500,00',
  '{{vencimiento}}': '15/02/2024',
  '{{cedula}}': 'V-12.345.678',
  '{{estudiante}}': 'Carlos García',
};

function applyPreview(text) {
  if (!text) return '';
  return VARIABLES.reduce(
    (acc, variable) => acc.replaceAll(variable, EXAMPLE_VALUES[variable]),
    text
  );
}

export function TemplateEditor({ rule, onSave }) {
  const [emailTemplate, setEmailTemplate] = useState(rule.emailTemplate ?? '');
  const [whatsappTemplate, setWhatsappTemplate] = useState(rule.whatsappTemplate ?? '');
  const [activeField, setActiveField] = useState('email');

  const emailRef = useRef(null);
  const whatsappRef = useRef(null);

  const showWhatsapp = rule.channels?.whatsapp === true;

  function insertVariable(variable) {
    if (activeField === 'email') {
      const el = emailRef.current;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = emailTemplate.slice(0, start) + variable + emailTemplate.slice(end);
      setEmailTemplate(next);
      requestAnimationFrame(() => {
        el.focus();
        el.selectionStart = el.selectionEnd = start + variable.length;
      });
    } else if (activeField === 'whatsapp' && showWhatsapp) {
      const el = whatsappRef.current;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = whatsappTemplate.slice(0, start) + variable + whatsappTemplate.slice(end);
      setWhatsappTemplate(next);
      requestAnimationFrame(() => {
        el.focus();
        el.selectionStart = el.selectionEnd = start + variable.length;
      });
    }
  }

  function handleSave() {
    onSave({ emailTemplate, whatsappTemplate: showWhatsapp ? whatsappTemplate : undefined });
  }

  return (
    <div className="space-y-6">
      {/* Variable chips */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Variables disponibles — click para insertar en el campo activo
        </p>
        <div className="flex flex-wrap gap-2">
          {VARIABLES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => insertVariable(v)}
              className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-mono hover:bg-indigo-200 transition-colors"
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Textareas — side by side on md+, stacked on mobile */}
      <div className={`grid gap-6 ${showWhatsapp ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
        {/* Email template */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-gray-700">
            Plantilla de correo electrónico
          </label>
          <textarea
            ref={emailRef}
            rows={8}
            value={emailTemplate}
            onChange={(e) => setEmailTemplate(e.target.value)}
            onFocus={() => setActiveField('email')}
            placeholder="Escribe el cuerpo del correo. Usa las variables de arriba."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
          />
          {emailTemplate && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Vista previa</p>
              <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700 italic whitespace-pre-wrap">
                {applyPreview(emailTemplate)}
              </div>
            </div>
          )}
        </div>

        {/* WhatsApp template — only if channel enabled */}
        {showWhatsapp && (
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">
              Plantilla de WhatsApp
            </label>
            <textarea
              ref={whatsappRef}
              rows={8}
              value={whatsappTemplate}
              onChange={(e) => setWhatsappTemplate(e.target.value)}
              onFocus={() => setActiveField('whatsapp')}
              placeholder="Escribe el mensaje de WhatsApp. Usa las variables de arriba."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            />
            {whatsappTemplate && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Vista previa</p>
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700 italic whitespace-pre-wrap">
                  {applyPreview(whatsappTemplate)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          Guardar plantillas
        </button>
      </div>
    </div>
  );
}
