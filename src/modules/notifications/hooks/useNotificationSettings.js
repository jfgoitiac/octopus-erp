import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

const API = import.meta.env.VITE_API_BASE_URL;

const defaultEmailConfig = {
  provider: 'smtp', // 'smtp' | 'sendgrid' | 'resend' | 'mailgun'
  host: '',
  port: 587,
  secure: false,
  user: '',
  password: '',
  fromName: '',
  fromEmail: '',
  // SendGrid / Resend / Mailgun
  apiKey: '',
  domain: '',
};

const defaultWhatsAppConfig = {
  provider: 'twilio', // 'twilio' | 'meta' | '360dialog'
  // Twilio
  accountSid: '',
  authToken: '',
  fromNumber: '',
  // Meta Business API
  phoneNumberId: '',
  accessToken: '',
  // 360dialog
  apiKey360: '',
  channelId: '',
};

const defaultRules = [
  {
    id: 'day_0',
    label: 'Día 0 — Factura generada',
    offsetDays: 0,
    channels: { email: true, whatsapp: false },
    emailTemplate: 'Hola {{nombre}}, te informamos que se generó la factura #{{factura}} por {{monto}} con vencimiento el {{vencimiento}}.',
    whatsappTemplate: 'Hola {{nombre}} 👋, tu factura #{{factura}} por *{{monto}}* vence el {{vencimiento}}.',
    active: true,
  },
  {
    id: 'day_5',
    label: 'Día +5 — Recordatorio',
    offsetDays: 5,
    channels: { email: true, whatsapp: false },
    emailTemplate: 'Hola {{nombre}}, te recordamos que tu factura #{{factura}} por {{monto}} vence en 5 días ({{vencimiento}}). Por favor, realiza tu pago a tiempo.',
    whatsappTemplate: 'Hola {{nombre}} ⏰, tu factura #{{factura}} por *{{monto}}* vence en 5 días. Evita recargos pagando antes del {{vencimiento}}.',
    active: true,
  },
  {
    id: 'day_10',
    label: 'Día +10 — Segundo aviso',
    offsetDays: 10,
    channels: { email: true, whatsapp: true },
    emailTemplate: 'Estimado {{nombre}}, tu factura #{{factura}} por {{monto}} está próxima a vencer el {{vencimiento}}. Este es tu segundo aviso. Contáctanos si tienes alguna consulta.',
    whatsappTemplate: '⚠️ {{nombre}}, tu factura #{{factura}} por *{{monto}}* vence el {{vencimiento}}. Este es tu segundo aviso. Responde si necesitas ayuda.',
    active: true,
  },
  {
    id: 'day_15',
    label: 'Día +15 — Alerta al director',
    offsetDays: 15,
    channels: { email: true, whatsapp: false },
    emailTemplate: '[ALERTA DIRECTOR] El representante {{nombre}} ({{cedula}}) tiene la factura #{{factura}} por {{monto}} vencida desde {{vencimiento}}. Estudiante: {{estudiante}}.',
    whatsappTemplate: '',
    active: true,
    directorAlert: true, // este aviso va al director, no al representante
  },
];

export function useNotificationSettings() {
  const [emailConfig, setEmailConfig] = useState(defaultEmailConfig);
  const [whatsappConfig, setWhatsappConfig] = useState(defaultWhatsAppConfig);
  const [rules, setRules] = useState(defaultRules);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);

  // ─── Cargar configuración ───────────────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: notif }, { data: rulesData }] = await Promise.all([
        axios.get(`${API}/api/settings/notifications`),
        axios.get(`${API}/api/settings/notifications/rules`),
      ]);
      if (notif.email) setEmailConfig((prev) => ({ ...prev, ...notif.email }));
      if (notif.whatsapp) setWhatsappConfig((prev) => ({ ...prev, ...notif.whatsapp }));
      if (rulesData?.length) setRules(rulesData);
    } catch (err) {
      // Si la API aún no existe, trabajamos con defaults en memoria
      if (err.response?.status !== 404) {
        toast.error('No se pudo cargar la configuración de notificaciones');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // ─── Guardar email ──────────────────────────────────────────────────────────
  const saveEmailConfig = async (config) => {
    setSaving(true);
    try {
      await axios.put(`${API}/api/settings/notifications/email`, config);
      setEmailConfig(config);
      toast.success('Configuración de email guardada');
    } catch {
      toast.error('Error al guardar configuración de email');
    } finally {
      setSaving(false);
    }
  };

  // ─── Guardar WhatsApp ───────────────────────────────────────────────────────
  const saveWhatsAppConfig = async (config) => {
    setSaving(true);
    try {
      await axios.put(`${API}/api/settings/notifications/whatsapp`, config);
      setWhatsappConfig(config);
      toast.success('Configuración de WhatsApp guardada');
    } catch {
      toast.error('Error al guardar configuración de WhatsApp');
    } finally {
      setSaving(false);
    }
  };

  // ─── Actualizar regla ───────────────────────────────────────────────────────
  const updateRule = async (ruleId, patch) => {
    const updated = rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r));
    setRules(updated); // optimistic
    try {
      await axios.put(`${API}/api/settings/notifications/rules/${ruleId}`, patch);
    } catch {
      toast.error('Error al guardar la regla');
      setRules(rules); // revert
    }
  };

  // ─── Envío de prueba ────────────────────────────────────────────────────────
  const sendTest = async ({ channel, to, ruleId }) => {
    setTestSending(true);
    try {
      await axios.post(`${API}/api/settings/notifications/test`, { channel, to, ruleId });
      toast.success(`Mensaje de prueba enviado por ${channel === 'email' ? 'email' : 'WhatsApp'}`);
    } catch {
      toast.error('Error al enviar el mensaje de prueba');
    } finally {
      setTestSending(false);
    }
  };

  return {
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
  };
}
