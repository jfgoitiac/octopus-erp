import { useState } from 'react';
import { Building2, Eye, EyeOff, Loader2, Save, Send, Undo2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useWhatsAppSedes, esMascara } from '../../hooks/useWhatsAppSedes';

const estiloInput = {
    border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px',
};

const Etiqueta = ({ htmlFor, children }) => (
    <label htmlFor={htmlFor} className="block text-[11px] uppercase tracking-widest mb-1.5"
        style={{ color: 'var(--ash)' }}>
        {children}
    </label>
);

const Campo = ({ id, etiqueta, ayuda, children }) => (
    <div>
        <Etiqueta htmlFor={id}>{etiqueta}</Etiqueta>
        {children}
        {ayuda && <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>{ayuda}</p>}
    </div>
);

const Texto = ({ id, form, setForm, ...resto }) => (
    <input id={id} type="text" className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={estiloInput} value={form[id] ?? ''}
        onChange={e => setForm(f => ({ ...f, [id]: e.target.value }))} {...resto} />
);

const Secreto = ({ id, form, setForm, placeholder }) => {
    const [ver, setVer] = useState(false);
    const enmascarado = esMascara(form[id]);
    return (
        <div className="relative">
            <input id={id} type={ver ? 'text' : 'password'} autoComplete="off"
                className="w-full px-3 py-2 pr-10 rounded-lg text-sm outline-none" style={estiloInput}
                value={form[id] ?? ''} placeholder={enmascarado ? '••••••••  (sin cambios)' : placeholder}
                onChange={e => setForm(f => ({ ...f, [id]: e.target.value }))} />
            <button type="button" tabIndex={-1} onClick={() => setVer(v => !v)}
                aria-label={ver ? 'Ocultar campo' : 'Mostrar campo'}
                className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }}>
                {ver ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
        </div>
    );
};

function FormularioSede({ fila, saving, onGuardar, onQuitar, onProbar }) {
    const [form, setForm] = useState({ ...fila });
    const [destino, setDestino] = useState('');
    const [confirmando, setConfirmando] = useState(false);
    const usaGeneral = fila.usa_configuracion_general;
    const tieneDatosPropios = !!(fila.meta_whatsapp_phone_id || fila.meta_whatsapp_token || fila.activo);

    return (
        <div className="space-y-4">
            <div role="status" className="px-4 py-3 rounded-lg text-sm"
                style={{
                    background: usaGeneral ? 'var(--bg)' : 'var(--pb-light)',
                    border: '0.5px solid var(--border-md)', color: 'var(--jet)',
                }}>
                {usaGeneral
                    ? <>Esta sede <strong>usa la configuración general</strong> de WhatsApp
                        {fila.efectiva?.phone_id ? ` (Phone Number ID ${fila.efectiva.phone_id})` : ''}.
                        Complete los datos y active el número propio para que escriba por el suyo.</>
                    : <>Esta sede escribe y recibe por <strong>su propio número</strong>
                        {fila.numero_visible ? ` (${fila.numero_visible})` : ''}.</>}
            </div>

            <label className="flex items-center gap-3 text-sm cursor-pointer" style={{ color: 'var(--jet)' }}>
                <input id="wa_sede_activo" type="checkbox" checked={!!form.activo}
                    onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
                Usar un número propio en esta sede
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Campo id="meta_whatsapp_phone_id" etiqueta="Phone Number ID"
                    ayuda="Identifica el número en Meta y enruta los mensajes que llegan.">
                    <Texto id="meta_whatsapp_phone_id" form={form} setForm={setForm} inputMode="numeric"
                        placeholder="ID del número en Meta Business" />
                </Campo>
                <Campo id="numero_visible" etiqueta="Número visible" ayuda="Solo informativo, para reconocerlo.">
                    <Texto id="numero_visible" form={form} setForm={setForm} placeholder="+58 4XX XXXXXXX" />
                </Campo>
                <Campo id="meta_whatsapp_token" etiqueta="Token de acceso (Meta)">
                    <Secreto id="meta_whatsapp_token" form={form} setForm={setForm}
                        placeholder="Token permanente de Meta" />
                </Campo>
                <Campo id="meta_waba_id" etiqueta="WABA ID">
                    <Texto id="meta_waba_id" form={form} setForm={setForm}
                        placeholder="Cuenta de WhatsApp Business" />
                </Campo>
                <Campo id="meta_app_secret" etiqueta="App Secret"
                    ayuda="Vacío: se usa el App Secret general (misma app de Meta).">
                    <Secreto id="meta_app_secret" form={form} setForm={setForm} placeholder="App Secret de Meta" />
                </Campo>
                <Campo id="meta_webhook_verify_token" etiqueta="Token de verificación del webhook"
                    ayuda="Vacío: se usa el general. La URL del webhook es la misma para todas las sedes: /api/notificaciones/whatsapp/webhook/">
                    <Texto id="meta_webhook_verify_token" form={form} setForm={setForm} />
                </Campo>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <button type="button" onClick={() => onGuardar(form)} disabled={saving}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: 'var(--pb)' }}>
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Guardar WhatsApp de la sede
                </button>
                {tieneDatosPropios && (
                    <button type="button" onClick={() => setConfirmando(true)} disabled={saving}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)', background: 'var(--bg)' }}>
                        <Undo2 size={14} />
                        Volver a la configuración general
                    </button>
                )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 pt-2"
                style={{ borderTop: '0.5px solid var(--border-md)' }}>
                <input id="wa_sede_destino" type="text" aria-label="Número destino de la prueba"
                    className="w-full sm:flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={estiloInput}
                    value={destino} placeholder="Número destino de la prueba: +58 4XX XXXXXXX"
                    onChange={e => setDestino(e.target.value)} />
                <button type="button" onClick={() => onProbar(destino.trim())} disabled={!destino.trim()}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)', background: 'var(--bg)' }}>
                    <Send size={14} />
                    Probar con esta sede
                </button>
            </div>

            <Modal open={confirmando} onClose={() => setConfirmando(false)} titulo="Volver a la configuración general"
                footer={
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button type="button" onClick={() => setConfirmando(false)}
                            className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-semibold"
                            style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)', background: 'var(--bg)' }}>
                            Cancelar
                        </button>
                        <button type="button"
                            onClick={async () => { if (await onQuitar()) setConfirmando(false); }}
                            className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-semibold text-white"
                            style={{ background: 'var(--red)' }}>
                            Quitar el número propio
                        </button>
                    </div>
                }>
                <p className="text-sm" style={{ color: 'var(--jet)' }}>
                    Se borran las credenciales propias de esta sede y vuelve a usar el número general.
                    Las conversaciones abiertas por el número de la sede se responderán por el general.
                </p>
            </Modal>
        </div>
    );
}

const Esqueleto = () => (
    <div className="p-5 space-y-4 animate-pulse" aria-hidden="true">
        <div className="w-full h-9 rounded-lg" style={{ background: 'var(--ash-light)' }} />
        <div className="w-full h-16 rounded-lg" style={{ background: 'var(--ash-light)' }} />
    </div>
);

/** Card "WhatsApp por sede" de Configuración → Notificaciones. Con una sola sede no se muestra. */
export default function WhatsAppPorSede() {
    const { sedes, loading, saving, version, guardar, quitar, probar } = useWhatsAppSedes();
    const [elegida, setElegida] = useState(null);

    if (!loading && sedes.length < 2) return null;

    const actual = sedes.find(s => s.sede.id === elegida) || sedes[0];

    return (
        <div className="rounded-xl overflow-hidden"
            style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
            <div className="px-4 sm:px-5 py-3.5 flex items-center gap-3"
                style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                <Building2 size={17} style={{ color: 'var(--pb)' }} />
                <span className="font-semibold text-sm" style={{ color: 'var(--jet)' }}>WhatsApp por sede</span>
            </div>
            {loading || !actual ? <Esqueleto /> : (
                <div className="p-4 sm:p-5 space-y-4">
                    <p className="text-sm" style={{ color: 'var(--ash)' }}>
                        Cada sede puede escribir por su propio número de WhatsApp (Meta). Las sedes sin número
                        propio usan la configuración general de arriba.
                    </p>
                    <div className="max-w-sm">
                        <Etiqueta htmlFor="wa_sede">Sede</Etiqueta>
                        <select id="wa_sede" className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                            style={estiloInput} value={actual.sede.id}
                            onChange={e => setElegida(Number(e.target.value))}>
                            {sedes.map(s => (
                                <option key={s.sede.id} value={s.sede.id}>
                                    {s.sede.nombre}{s.usa_configuracion_general ? ' (configuración general)' : ' (número propio)'}
                                </option>
                            ))}
                        </select>
                    </div>
                    <FormularioSede key={`${actual.sede.id}-${version}`} fila={actual} saving={saving}
                        onGuardar={form => guardar(actual.sede.id, form)}
                        onQuitar={() => quitar(actual.sede.id)}
                        onProbar={destino => probar(actual.sede.id, destino)} />
                </div>
            )}
        </div>
    );
}
