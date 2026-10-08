import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Sparkles, ShieldAlert, Building2, PowerOff, Power, Loader2 } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { useCobranzaInteligente, ETAPAS_ENVIO } from '../hooks/useCobranzaInteligente';

// Switch accesible: botón con role="switch".
const Switch = ({ checked, onChange, disabled, label, id }) => (
    <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onChange}
        className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: checked ? 'var(--pb)' : 'var(--ash-light)', border: '1px solid var(--border-md)' }}
    >
        <span
            className="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
            style={{ transform: checked ? 'translateX(24px)' : 'translateX(3px)' }}
        />
    </button>
);

const Skeleton = () => (
    <div className="space-y-4 animate-pulse" aria-hidden="true">
        {[1, 2].map(i => (
            <div key={i} className="rounded-xl p-5 space-y-3" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div className="h-4 w-40 rounded" style={{ background: 'var(--ash-light)' }} />
                <div className="h-10 w-full rounded-lg" style={{ background: 'var(--ash-light)' }} />
            </div>
        ))}
    </div>
);

const Aviso = ({ tono, icono: Icono, children }) => (
    <div
        className="flex items-start gap-3 rounded-xl p-3 sm:p-4 text-sm"
        style={tono === 'rojo'
            ? { background: 'var(--red-light)', color: 'var(--red)' }
            : { background: 'var(--yellow-light)', color: 'var(--jet)' }}
        role="note"
    >
        <Icono size={18} className="shrink-0 mt-0.5" />
        <div className="min-w-0">{children}</div>
    </div>
);

const ConfiguracionCobranzaInteligente = () => {
    const { estado, loading, guardando, guardar, requiereSede, sedeActiva } = useCobranzaInteligente();
    const [confirmando, setConfirmando] = useState(null); // 'encender' | 'apagar'
    const [motivo, setMotivo] = useState('');

    const encendido = !!estado?.activo;
    const nombreSede = sedeActiva?.nombre;

    const cerrarModal = () => {
        if (guardando) return;
        setConfirmando(null);
        setMotivo('');
    };

    const confirmar = async () => {
        const encender = confirmando === 'encender';
        const ok = await guardar(
            { activo: encender, ...(encender ? {} : { motivo: motivo.trim() }) },
            encender ? 'Cobranza Inteligente encendida' : 'Cobranza Inteligente apagada',
        );
        if (ok) {
            setConfirmando(null);
            setMotivo('');
        }
    };

    const alternarEtapa = (valor) => {
        const actuales = estado.etapas_envio_activas || [];
        const nuevas = actuales.includes(valor)
            ? actuales.filter(e => e !== valor)
            : [...actuales, valor];
        guardar({ etapas_envio_activas: nuevas }, 'Etapas de envío actualizadas');
    };

    return (
        <div className="w-full max-w-3xl mx-auto space-y-4 sm:space-y-6 pb-20">
            <PageHeader
                titulo="Cobranza Inteligente"
                descripcion={nombreSede
                    ? `Seguimiento automático de cobranza · ${nombreSede}`
                    : 'Seguimiento automático de cobranza'}
            />

            {loading && <Skeleton />}

            {!loading && requiereSede && (
                <Aviso tono="amarillo" icono={Building2}>
                    Selecciona una sede en el menú lateral para ver o cambiar el estado de Cobranza Inteligente.
                </Aviso>
            )}

            {!loading && !requiereSede && !estado && (
                <Aviso tono="rojo" icono={ShieldAlert}>
                    No se pudo cargar la configuración. Recarga la página o intenta de nuevo más tarde.
                </Aviso>
            )}

            {!loading && estado && (
                <>
                    {estado.corte_global && (
                        <Aviso tono="rojo" icono={ShieldAlert}>
                            <strong>Corte global activo.</strong> Soporte detuvo Cobranza Inteligente en todas las
                            sedes. No enviará nada aunque esté encendida, y el flujo anterior de avisos sigue activo.
                        </Aviso>
                    )}

                    <Card>
                        <div className="flex items-start gap-3 sm:gap-4">
                            <div className="p-2 rounded-lg shrink-0" style={{ background: 'var(--pb-light)' }}>
                                <Sparkles size={20} style={{ color: 'var(--pb)' }} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <label htmlFor="toggle-cobranza-inteligente" className="block text-sm sm:text-base font-semibold" style={{ color: 'var(--jet)' }}>
                                    Cobranza Inteligente
                                </label>
                                <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
                                    Acompaña cada deuda desde la prevención hasta el pago, sin escribirle a quien ya pagó.
                                </p>
                                <p
                                    className="text-xs sm:text-sm mt-2 font-medium"
                                    style={{ color: encendido ? 'var(--green)' : 'var(--ash)' }}
                                    aria-live="polite"
                                >
                                    {encendido ? 'Encendida' : 'Apagada'}
                                    {estado.activado_en && encendido && (
                                        <span className="font-normal" style={{ color: 'var(--ash)' }}>
                                            {' · desde '}
                                            {format(new Date(estado.activado_en), "d 'de' MMMM yyyy", { locale: es })}
                                            {estado.activado_por ? ` por ${estado.activado_por}` : ''}
                                        </span>
                                    )}
                                </p>
                            </div>
                            <Switch
                                id="toggle-cobranza-inteligente"
                                checked={encendido}
                                disabled={guardando}
                                label="Cobranza Inteligente"
                                onChange={() => setConfirmando(encendido ? 'apagar' : 'encender')}
                            />
                        </div>
                    </Card>

                    {encendido && (
                        <>
                            <Card
                                titulo="Modo sombra"
                                subtitulo="Evalúa y registra lo que enviaría, pero no envía mensajes reales. Úsalo para validar antes de salir en vivo."
                                accion={
                                    <Switch
                                        checked={!!estado.modo_sombra}
                                        disabled={guardando}
                                        label="Modo sombra"
                                        onChange={() => guardar(
                                            { modo_sombra: !estado.modo_sombra },
                                            estado.modo_sombra ? 'Modo sombra desactivado' : 'Modo sombra activado',
                                        )}
                                    />
                                }
                            >
                                {!estado.modo_sombra && (
                                    <Aviso tono="amarillo" icono={ShieldAlert}>
                                        Con el modo sombra desactivado, las etapas marcadas abajo enviarán mensajes reales a los representantes.
                                    </Aviso>
                                )}
                            </Card>

                            <Card
                                titulo="Etapas con envío real"
                                subtitulo="Actívalas de una en una, revisando cada etapa antes de pasar a la siguiente. Solo envían cuando el modo sombra está desactivado."
                            >
                                <ul className="space-y-2">
                                    {ETAPAS_ENVIO.map(({ value, label, detalle }) => (
                                        <li key={value}>
                                            <label
                                                className="flex items-center gap-3 rounded-lg p-3 cursor-pointer min-h-11"
                                                style={{ border: '1px solid var(--border)' }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 shrink-0"
                                                    checked={(estado.etapas_envio_activas || []).includes(value)}
                                                    disabled={guardando}
                                                    onChange={() => alternarEtapa(value)}
                                                />
                                                <span className="min-w-0 text-sm" style={{ color: 'var(--jet)' }}>
                                                    <span className="font-medium">{label}</span>
                                                    <span className="block sm:inline sm:ml-2" style={{ color: 'var(--ash)' }}>{detalle}</span>
                                                </span>
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                            </Card>
                        </>
                    )}
                </>
            )}

            <Modal
                open={!!confirmando}
                onClose={cerrarModal}
                titulo={confirmando === 'encender' ? 'Encender Cobranza Inteligente' : 'Apagar Cobranza Inteligente'}
                footer={
                    <>
                        <button
                            type="button"
                            onClick={cerrarModal}
                            disabled={guardando}
                            className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
                            style={{ border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' }}
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={confirmar}
                            disabled={guardando}
                            className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
                            style={{ background: confirmando === 'encender' ? 'var(--pb)' : 'var(--red)' }}
                        >
                            {guardando
                                ? <Loader2 size={16} className="animate-spin" />
                                : confirmando === 'encender' ? <Power size={16} /> : <PowerOff size={16} />}
                            {confirmando === 'encender' ? 'Encender' : 'Apagar'}
                        </button>
                    </>
                }
            >
                {confirmando === 'encender' ? (
                    <div className="space-y-3 text-sm" style={{ color: 'var(--jet)' }}>
                        <p>
                            Al encenderla{nombreSede ? ` en ${nombreSede}` : ''}, el flujo anterior de avisos
                            deja de enviar y lo reemplaza Cobranza Inteligente.
                        </p>
                        <ul className="list-disc pl-5 space-y-1" style={{ color: 'var(--ash)' }}>
                            <li>Arranca en <strong>modo sombra</strong>: no envía mensajes reales hasta que lo desactives.</li>
                            <li>No se envían avisos atrasados: solo los que correspondan exactamente a hoy.</li>
                            <li>Puedes apagarla cuando quieras; no se borra ningún dato.</li>
                        </ul>
                    </div>
                ) : (
                    <div className="space-y-3 text-sm" style={{ color: 'var(--jet)' }}>
                        <p>
                            Al apagarla{nombreSede ? ` en ${nombreSede}` : ''}, se cancelan los envíos pendientes y
                            se ocultan sus pantallas. No se borra ningún dato.
                        </p>
                        <Aviso tono="amarillo" icono={ShieldAlert}>
                            Mientras exista el flujo anterior de avisos, volverá a regir. Si ya fue retirado, la cobranza
                            quedará manual.
                        </Aviso>
                        <div>
                            <label htmlFor="motivo-apagado" className="block text-xs mb-1" style={{ color: 'var(--ash)' }}>
                                Motivo (opcional)
                            </label>
                            <textarea
                                id="motivo-apagado"
                                rows={3}
                                maxLength={500}
                                value={motivo}
                                onChange={e => setMotivo(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg outline-none"
                                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
                            />
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default ConfiguracionCobranzaInteligente;
