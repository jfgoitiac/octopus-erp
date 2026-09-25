import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'react-toastify';
import { Modal } from '../ui/Modal';
import WhatsAppIcon from '../ui/WhatsAppIcon';
import {
    listarPlantillasWhatsApp,
    previsualizarCobroWhatsApp,
    registrarEnvioManualCobroWhatsApp,
} from '../../api/notificaciones.service';

const ModalCobroWhatsApp = ({ open, onClose, representante }) => {
    const [plantillas, setPlantillas] = useState([]);
    const [plantillaId, setPlantillaId] = useState('');
    const [preview, setPreview] = useState(null);
    const [mensaje, setMensaje] = useState('');
    const [cargando, setCargando] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [confirmarDuplicado, setConfirmarDuplicado] = useState(false);

    const cargarPreview = async (id) => {
        if (!id || !representante?.cedula) return;
        setCargando(true);
        setConfirmarDuplicado(false);
        try {
            const { data } = await previsualizarCobroWhatsApp({
                representante_cedula: representante.cedula,
                plantilla_id: Number(id),
            });
            setPreview(data);
            setMensaje(data.mensaje || '');
        } catch (error) {
            toast.error(error?.response?.data?.error || 'No se pudo preparar el mensaje.');
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        if (!open || !representante?.cedula) return;

        const iniciar = async () => {
            setCargando(true);
            setPreview(null);
            setMensaje('');
            setConfirmarDuplicado(false);
            try {
                const { data } = await listarPlantillasWhatsApp();
                const activas = data.filter((p) => p.activa);
                const predeterminada = activas.find((p) => p.predeterminada) || activas[0];
                setPlantillas(activas);
                setPlantillaId(predeterminada ? String(predeterminada.id) : '');
                if (predeterminada) {
                    const { data: vista } = await previsualizarCobroWhatsApp({
                        representante_cedula: representante.cedula,
                        plantilla_id: predeterminada.id,
                    });
                    setPreview(vista);
                    setMensaje(vista.mensaje || '');
                }
            } catch (error) {
                toast.error(error?.response?.data?.error || 'No se pudieron cargar las plantillas.');
            } finally {
                setCargando(false);
            }
        };

        iniciar();
    }, [open, representante?.cedula]);

    const cambiarPlantilla = (event) => {
        const id = event.target.value;
        setPlantillaId(id);
        cargarPreview(id);
    };

    const enviar = async () => {
        if (!preview?.telefono_valido || !preview.telefono) {
            toast.error('El representante no tiene un teléfono válido.');
            return;
        }
        if (preview.envio_reciente && !confirmarDuplicado) {
            toast.error('Confirma que deseas enviar nuevamente este cobro.');
            return;
        }
        setEnviando(true);
        try {
            const telefono = preview.telefono.replace(/\+/g, '');
            const url = `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;
            window.open(url, '_blank', 'noopener,noreferrer');

            await registrarEnvioManualCobroWhatsApp({
                representante_cedula: representante.cedula,
                plantilla_id: Number(plantillaId),
                mensaje,
                confirmar: Boolean(confirmarDuplicado),
            });
            toast.success('Se abrió WhatsApp y se registró el aviso.');
            onClose();
        } catch (error) {
            if (error?.response?.status === 409) {
                setConfirmarDuplicado(false);
                toast.warning('Este representante ya recibió un aviso recientemente. Confirma el reenvío.');
            } else {
                toast.error(error?.response?.data?.error || 'No se pudo registrar el envío.');
            }
        } finally {
            setEnviando(false);
        }
    };

    const sinTelefono = preview && !preview.telefono_valido;
    const noHayPlantillas = !cargando && plantillas.length === 0;
    const puedeEnviar = Boolean(
        preview?.telefono_valido && mensaje.trim() && plantillaId
        && (!preview.envio_reciente || confirmarDuplicado)
    );

    const inputStyle = {
        border: '0.5px solid var(--border-md)',
        background: 'var(--porcelain)',
        color: 'var(--jet)',
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="lg"
            titulo="Enviar cobro por WhatsApp"
            footer={
                <button
                    type="button"
                    disabled={!puedeEnviar || enviando}
                    onClick={enviar}
                    className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: 'var(--pb)' }}
                >
                    <WhatsAppIcon size={18} />
                    {enviando ? 'Registrando…' : 'Enviar por WhatsApp'}
                </button>
            }
        >
            <div className="flex flex-col gap-3">
                <p className="text-sm" style={{ color: 'var(--jet)' }}>
                    Representante: <strong>{representante?.nombre} {representante?.apellido}</strong>
                </p>

                <label className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                    Plantilla de mensaje
                    <select
                        className="mt-1 min-h-[40px] w-full rounded-lg px-3 text-sm"
                        style={inputStyle}
                        disabled={cargando || noHayPlantillas}
                        onChange={cambiarPlantilla}
                        value={plantillaId}
                    >
                        {noHayPlantillas && <option>No hay plantillas activas</option>}
                        {plantillas.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.nombre}{p.predeterminada ? ' (predeterminada)' : ''}
                            </option>
                        ))}
                    </select>
                </label>

                {cargando && <p className="text-sm" style={{ color: 'var(--ash)' }}>Preparando mensaje…</p>}

                {sinTelefono && (
                    <div className="rounded-lg p-3 text-sm font-medium" style={{ background: '#fffbeb', border: '0.5px solid #fcd34d', color: '#92400e' }}>
                        Sin teléfono registrado. Actualice los datos del representante antes de enviar.
                    </div>
                )}

                {preview?.envio_reciente && (
                    <div className="rounded-lg p-3 text-sm" style={{ background: '#fffbeb', border: '0.5px solid #fcd34d', color: '#92400e' }}>
                        <div className="flex gap-2 font-semibold">
                            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                            Ya se envió un cobro a este representante en las últimas 24 horas.
                        </div>
                        <label className="mt-3 flex min-h-[40px] items-center gap-3">
                            <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={confirmarDuplicado}
                                onChange={(e) => setConfirmarDuplicado(e.target.checked)}
                            />
                            Enviar de todas formas
                        </label>
                    </div>
                )}

                <label className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                    Mensaje
                    <textarea
                        className="mt-1 min-h-[14rem] w-full rounded-lg px-3 py-2 text-sm leading-relaxed"
                        style={inputStyle}
                        disabled={cargando || !preview}
                        onChange={(e) => setMensaje(e.target.value)}
                        value={mensaje}
                    />
                </label>

                {preview?.telefono_valido && (
                    <p className="text-sm" style={{ color: 'var(--ash)' }}>
                        Se abrirá WhatsApp para el número <strong>{preview.telefono}</strong>.
                    </p>
                )}
            </div>
        </Modal>
    );
};

export default ModalCobroWhatsApp;
