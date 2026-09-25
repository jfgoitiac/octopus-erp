import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Tabla } from '../components/ui/Tabla';
import { listarLogsCobroWhatsApp } from '../api/notificaciones.service';

const HistorialMensajesWhatsApp = () => {
    const [datos, setDatos] = useState({ results: [], total: 0, page: 1, page_size: 20 });
    const [cargando, setCargando] = useState(true);

    const cargar = async (page) => {
        setCargando(true);
        try {
            const { data } = await listarLogsCobroWhatsApp({ page, pageSize: 20 });
            setDatos(data);
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => { cargar(1); }, []);

    const pagina = datos.page || 1;
    const totalPaginas = Math.max(1, Math.ceil((datos.total || 0) / (datos.page_size || 20)));

    const columnas = [
        { key: 'fecha', label: 'Fecha' },
        { key: 'representante', label: 'Representante' },
        { key: 'estado', label: 'Estado' },
        { key: 'mensaje', label: 'Mensaje' },
    ];

    return (
        <div>
            <PageHeader
                titulo="Historial de mensajes WhatsApp"
                descripcion="Registro de los avisos de cobro enviados a representantes."
            />

            <Card padding="none">
                <Tabla columnas={columnas} minWidth={640}>
                    {cargando ? (
                        <tr><td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--ash)' }}>Cargando historial…</td></tr>
                    ) : datos.results.length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--ash)' }}>No hay avisos de cobro registrados.</td></tr>
                    ) : datos.results.map((log) => (
                        <tr key={log.id}>
                            <td className="px-3 py-3 sm:px-4 text-xs whitespace-nowrap" style={{ color: 'var(--jet)' }}>
                                {log.fecha_envio ? format(new Date(log.fecha_envio), "d 'de' MMMM, HH:mm", { locale: es }) : '—'}
                            </td>
                            <td className="px-3 py-3 sm:px-4 text-xs" style={{ color: 'var(--jet)' }}>
                                <div>{log.alumno_nombre || 'Representante'}</div>
                                <div className="text-[10px]" style={{ color: 'var(--ash)' }}>C.I. {log.representante_cedula || '—'}</div>
                            </td>
                            <td className="px-3 py-3 sm:px-4">
                                <span
                                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                    style={log.estado === 'enviado'
                                        ? { background: '#dcfce7', color: '#15803d' }
                                        : { background: '#fee2e2', color: '#b91c1c' }}
                                >
                                    {log.estado === 'enviado' ? 'Enviado' : 'Fallido'}
                                </span>
                            </td>
                            <td className="max-w-96 truncate px-3 py-3 sm:px-4 text-xs" style={{ color: 'var(--ash)' }} title={log.mensaje}>
                                {log.mensaje}
                            </td>
                        </tr>
                    ))}
                </Tabla>
            </Card>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm" style={{ color: 'var(--ash)' }}>Página {pagina} de {totalPaginas}</p>
                <div className="flex gap-2">
                    <button
                        disabled={pagina <= 1 || cargando}
                        onClick={() => cargar(pagina - 1)}
                        className="inline-flex min-h-[40px] items-center gap-2 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
                    >
                        <ChevronLeft size={16} /> Anterior
                    </button>
                    <button
                        disabled={pagina >= totalPaginas || cargando}
                        onClick={() => cargar(pagina + 1)}
                        className="inline-flex min-h-[40px] items-center gap-2 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
                    >
                        Siguiente <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default HistorialMensajesWhatsApp;
