import { FileEdit, Send, Mail, MessageCircle } from 'lucide-react';

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function ToggleSwitch({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={[
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
        'transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2',
        'focus-visible:ring-green-500 focus-visible:ring-offset-2',
        checked ? 'bg-green-500' : 'bg-gray-200',
        disabled ? 'opacity-40 cursor-not-allowed' : '',
      ].join(' ')}
    >
      <span
        className={[
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow',
          'transition-transform duration-200 ease-in-out',
          checked ? 'translate-x-4' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  );
}

// ─── Director badge ───────────────────────────────────────────────────────────

function DirectorBadge() {
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 whitespace-nowrap">
      → Director
    </span>
  );
}

// ─── Desktop Table Row ────────────────────────────────────────────────────────

function TableRow({ rule, onUpdateRule, onOpenTemplate, onOpenTest }) {
  const inactive = !rule.active;

  const handleEmailToggle = () =>
    onUpdateRule(rule.id, { channels: { ...rule.channels, email: !rule.channels.email } });

  const handleWhatsappToggle = () =>
    onUpdateRule(rule.id, { channels: { ...rule.channels, whatsapp: !rule.channels.whatsapp } });

  const handleActiveToggle = () =>
    onUpdateRule(rule.id, { active: !rule.active });

  return (
    <tr className={inactive ? 'opacity-50' : ''}>
      {/* Evento */}
      <td className="px-4 py-3 text-sm font-medium text-gray-800 whitespace-nowrap">
        {rule.label}
        {rule.directorAlert && <DirectorBadge />}
      </td>

      {/* Canal Email */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Mail size={14} className="text-gray-400 shrink-0" />
          <ToggleSwitch checked={rule.channels.email} onChange={handleEmailToggle} />
        </div>
      </td>

      {/* Canal WhatsApp */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageCircle size={14} className="text-gray-400 shrink-0" />
          <ToggleSwitch checked={rule.channels.whatsapp} onChange={handleWhatsappToggle} />
        </div>
      </td>

      {/* Estado */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <ToggleSwitch checked={rule.active} onChange={handleActiveToggle} />
          <span className={`text-xs font-medium ${rule.active ? 'text-green-600' : 'text-gray-400'}`}>
            {rule.active ? 'Activa' : 'Inactiva'}
          </span>
        </div>
      </td>

      {/* Acciones */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onOpenTemplate(rule)}
            title="Editar plantilla"
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <FileEdit size={15} />
          </button>
          <button
            type="button"
            onClick={() => onOpenTest(rule)}
            title="Enviar prueba"
            className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
          >
            <Send size={15} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Mobile Card ──────────────────────────────────────────────────────────────

function MobileCard({ rule, onUpdateRule, onOpenTemplate, onOpenTest }) {
  const inactive = !rule.active;

  const handleEmailToggle = () =>
    onUpdateRule(rule.id, { channels: { ...rule.channels, email: !rule.channels.email } });

  const handleWhatsappToggle = () =>
    onUpdateRule(rule.id, { channels: { ...rule.channels, whatsapp: !rule.channels.whatsapp } });

  const handleActiveToggle = () =>
    onUpdateRule(rule.id, { active: !rule.active });

  return (
    <div
      className={[
        'bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3',
        inactive ? 'opacity-50' : '',
      ].join(' ')}
    >
      {/* Nombre + badge */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-800 leading-snug">
          {rule.label}
          {rule.directorAlert && <DirectorBadge />}
        </p>
        {/* Acciones */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onOpenTemplate(rule)}
            title="Editar plantilla"
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <FileEdit size={15} />
          </button>
          <button
            type="button"
            onClick={() => onOpenTest(rule)}
            title="Enviar prueba"
            className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
          >
            <Send size={15} />
          </button>
        </div>
      </div>

      {/* Toggles en fila */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Email */}
        <div className="flex items-center gap-1.5">
          <Mail size={13} className="text-gray-400" />
          <span className="text-xs text-gray-500">Email</span>
          <ToggleSwitch checked={rule.channels.email} onChange={handleEmailToggle} />
        </div>

        {/* WhatsApp */}
        <div className="flex items-center gap-1.5">
          <MessageCircle size={13} className="text-gray-400" />
          <span className="text-xs text-gray-500">WhatsApp</span>
          <ToggleSwitch checked={rule.channels.whatsapp} onChange={handleWhatsappToggle} />
        </div>

        {/* Estado */}
        <div className="flex items-center gap-1.5 ml-auto">
          <ToggleSwitch checked={rule.active} onChange={handleActiveToggle} />
          <span className={`text-xs font-medium ${rule.active ? 'text-green-600' : 'text-gray-400'}`}>
            {rule.active ? 'Activa' : 'Inactiva'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function NotificationRulesTable({ rules, onUpdateRule, onOpenTemplate, onOpenTest }) {
  return (
    <div className="space-y-3">
      {/* Encabezado de sección */}
      <div>
        <h2 className="text-base font-semibold text-gray-800">Reglas de cobranza automática</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Configura cuándo y cómo se envían los recordatorios
        </p>
      </div>

      {/* Desktop: tabla */}
      <div className="hidden sm:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Evento
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Canal Email
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Canal WhatsApp
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Estado
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rules.map((rule) => (
              <TableRow
                key={rule.id}
                rule={rule}
                onUpdateRule={onUpdateRule}
                onOpenTemplate={onOpenTemplate}
                onOpenTest={onOpenTest}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards */}
      <div className="flex flex-col gap-3 sm:hidden">
        {rules.map((rule) => (
          <MobileCard
            key={rule.id}
            rule={rule}
            onUpdateRule={onUpdateRule}
            onOpenTemplate={onOpenTemplate}
            onOpenTest={onOpenTest}
          />
        ))}
      </div>
    </div>
  );
}
