import { useEffect, useState } from 'react';
import { Edit3, Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import EditorPlantillaWhatsApp from '../components/whatsapp/EditorPlantillaWhatsApp';
import VistaPreviaWhatsApp from '../components/whatsapp/VistaPreviaWhatsApp';
import {
    actualizarPlantillaWhatsApp,
    crearPlantillaWhatsApp,
    eliminarPlantillaWhatsApp,
    listarPlantillasWhatsApp,
    previsualizarCobroWhatsApp,
} from '../api/notificaciones.service';

const PlantillasWhatsApp = () => {
    const [plantillas, setPlantillas] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [seleccionada, setSeleccionada] = useState(null);
    const [abierto, setAbierto] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [borrando, setBorrando] = useState(null);
    const [borrador, setBorrador] = useState(null);
    const [cedula, setCedula] = useState('');
    const [preview, setPreview] = useState(null);
    const [probando, setProbando] = useState(false);

    const cargar = async () => {
        setCargando(true);
        try {
            const { data } = await listarPlantillasWhatsApp();
            setPlantillas(data);
        } catch {
            toast.error('No se pudieron cargar las plantillas.');
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => { cargar(); }, []);

    const abrirNueva = () => {
        setSeleccionada(null);
        setBorrador(null);
        setPreview(null);
        setCedula('');
        setAbierto(true);
    };

    const abrirEdicion = (plantilla) => {
        setSeleccionada(plantilla);
        setBorrador(plantilla);
        setPreview(null);
        setCedula('');
        setAbierto(true);
    };

    const guardar = async (data) => {
        setGuardando(true);
        try {
            if (seleccionada) await actualizarPlantillaWhatsApp(seleccionada.id, data);
            else await crearPlantillaWhatsApp(data);
            toast.success('Plantilla guardada correctamente.');
            setAbierto(false);
            await cargar();
        } catch {
            toast.error('No se pudo guardar la plantilla.');
        } finally {
            setGuardando(false);
        }
    };

    const eliminar = async (plantilla) => {
        if (!window.confirm(`¿Eliminar la plantilla "${plantilla.nombre}"?`)) return;
        setBorrando(plantilla.id);
        try {
            await eliminarPlantillaWhatsApp(plantilla.id);
            toast.success('Plantilla eliminada.');
            await cargar();
        } catch {
            toast.error('No se pudo eliminar la plantilla.');
        } finally {
            setBorrando(null);
        }
    };

    const probar = async () => {
        if (!cedula.trim()) {
            toast.error('Escribe la cédula de un representante moroso.');
            return;
        }
        if (!seleccionada?.id) {
            toast.info('Guarda primero la plantilla para probarla con datos reales.');
            return;
        }
        setProbando(true);
        try {
            const { data } = await previsualizarCobroWhatsApp({
                representante_cedula: cedula.trim(),
                plantilla_id: seleccionada.id,
            });
            setPreview(data);
        } catch (error) {
            toast.error(error?.response?.data?.error || 'No se encontró un moroso para esa cédula.');
        } finally {
            setProbando(false);
        }
    };

    const mensaje = preview?.mensaje ?? borrador?.cuerpo ?? seleccionada?.cuerpo ?? '';

    return (
        <div>
            <PageHeader
                titulo="Cobros por WhatsApp"
                descripcion="Crea los mensajes que se envían a los representantes con deuda pendiente."
                acciones={
                    <button
                        onClick={abrirNueva}
                        className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white min-h-[40px]"
                        style={{ background: 'var(--pb)' }}
                    >
                        <Plus size={16} /> Nueva plantilla
                    </button>
                }
            />

            {cargando ? (
                <p className="text-sm" style={{ color: 'var(--ash)' }}>Cargando plantillas…</p>
            ) : plantillas.length === 0 ? (
                <Card>
                    <p className="text-sm" style={{ color: 'var(--ash)' }}>
                        Aún no hay plantillas. Crea la primera para comenzar.
                    </p>
                </Card>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {plantillas.map((plantilla) => (
                        <Card key={plantilla.id}>
                            <div className="flex flex-wrap items-start gap-2">
                                <h3 className="mr-auto text-sm font-semibold" style={{ color: 'var(--jet)' }}>
                                    {plantilla.nombre}
                                </h3>
                                {plantilla.predeterminada && (
                                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700">
                                        Predeterminada
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 text-xs capitalize" style={{ color: 'var(--ash)' }}>
                                {plantilla.tipo.replace('_', ' ')}
                            </p>
                            <p className="mt-3 text-xs line-clamp-3" style={{ color: 'var(--jet)' }}>
                                {plantilla.cuerpo}
                            </p>
                            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                                <button
                                    onClick={() => abrirEdicion(plantilla)}
                                    className="inline-flex flex-1 min-h-[40px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
                                >
                                    <Edit3 size={14} /> Editar
                                </button>
                                <button
                                    onClick={() => eliminar(plantilla)}
                                    disabled={borrando === plantilla.id}
                                    className="inline-flex flex-1 min-h-[40px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-red-700 disabled:opacity-60"
                                    style={{ border: '0.5px solid #fca5a5' }}
                                >
                                    <Trash2 size={14} /> Eliminar
                                </button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <Modal
                open={abierto}
                onClose={() => !guardando && setAbierto(false)}
                size="lg"
                titulo={seleccionada ? 'Editar plantilla de WhatsApp' : 'Nueva plantilla de WhatsApp'}
            >
                <div className="flex flex-col gap-5 lg:flex-row">
                    <div className="min-w-0 flex-1">
                        <EditorPlantillaWhatsApp
                            plantilla={seleccionada}
                            guardando={guardando}
                            onCambio={setBorrador}
                            onGuardar={guardar}
                        />
                        <div className="mt-5 pt-4" style={{ borderTop: '0.5px solid var(--border)' }}>
                            <label className="block text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                Probar con un moroso real
                                <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                                    <input
                                        value={cedula}
                                        onChange={(e) => setCedula(e.target.value)}
                                        placeholder="Cédula del representante"
                                        className="min-h-[40px] flex-1 rounded-lg px-3 text-sm"
                                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={probar}
                                        disabled={probando}
                                        className="min-h-[40px] w-full sm:w-auto rounded-lg px-4 text-sm font-semibold disabled:opacity-60"
                                        style={{ border: '0.5px solid var(--pb)', color: 'var(--pb-mid)' }}
                                    >
                                        {probando ? 'Probando…' : 'Probar mensaje'}
                                    </button>
                                </div>
                            </label>
                            {!seleccionada && (
                                <p className="mt-2 text-xs" style={{ color: 'var(--ash)' }}>
                                    Las plantillas nuevas deben guardarse antes de probarlas con datos reales.
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="min-w-0 flex-1">
                        <VistaPreviaWhatsApp mensaje={mensaje} />
                        {preview && (
                            <p className="mt-2 text-xs" style={{ color: 'var(--ash)' }}>
                                Monto: ${preview.monto_total} · {preview.meses_total} mes(es) pendientes
                            </p>
                        )}
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default PlantillasWhatsApp;
