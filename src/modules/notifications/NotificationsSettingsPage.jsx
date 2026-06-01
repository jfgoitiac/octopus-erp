import { useState } from 'react';
import { Bell, X } from 'lucide-react';

import { useNotificationSettings } from './hooks/useNotificationSettings';
import { EmailConfigCard } from './components/EmailConfigCard';
import { WhatsAppConfigCard } from './components/WhatsAppConfigCard';
import { NotificationRulesTable } from './components/NotificationRulesTable';
import { TemplateEditor } from './components/TemplateEditor';
import { TestSendModal } from './components/TestSendModal';

function SkeletonBlock({ className = '' }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded-2xl ${className}`} />
  );
}

export default function NotificationsSettingsPage() {
  const {
    emailConfig,
    whatsappConfig,
    rules,
    loading,
    saving,
    testSending,
    saveEmailConfig,
    saveWhatsAppConfig,
    updateRule,
    sendTest,
  } = useNotificationSettings();

  const [selectedRule, setSelectedRule] = useState(null);
  const [modalType, setModalType] = useState(null);

  function openTemplate(rule) {
    setSelectedRule(rule);
    setModalType('template');
  }

  function openTest(rule) {
    setSelectedRule(rule);
    setModalType('test');
  }

  function closeModal() {
    setSelectedRule(null);
    setModalType(null);
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 shrink-0">
          <Bell size={22} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900 leading-tight">
            Notificaciones
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configura los canales y reglas de cobranza automática
          </p>
        </div>
      </div>

      {loading ? (
        /* Skeleton loader */
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SkeletonBlock className="h-56" />
            <SkeletonBlock className="h-56" />
          </div>
          <SkeletonBlock className="h-72" />
        </div>
      ) : (
        <>
          {/* Config cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <EmailConfigCard
              config={emailConfig}
              saving={saving}
              onSave={saveEmailConfig}
            />
            <WhatsAppConfigCard
              config={whatsappConfig}
              saving={saving}
              onSave={saveWhatsAppConfig}
            />
          </div>

          {/* Rules table */}
          <NotificationRulesTable
            rules={rules}
            onUpdateRule={updateRule}
            onOpenTemplate={openTemplate}
            onOpenTest={openTest}
          />
        </>
      )}

      {/* Template editor modal */}
      {modalType === 'template' && selectedRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
            <TemplateEditor
              rule={selectedRule}
              onSave={(patch) => {
                updateRule(selectedRule.id, patch);
                closeModal();
              }}
            />
          </div>
        </div>
      )}

      {/* Test send modal */}
      {modalType === 'test' && selectedRule && (
        <TestSendModal
          rule={selectedRule}
          onSend={sendTest}
          sending={testSending}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
