import { useContext, useState } from 'react';
import { Search, ShieldCheck, ShieldOff, Loader2, BadgeCheck, PenLine } from 'lucide-react';
import { toast } from 'react-toastify';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import axiosInstance from '../api/apiClient';
import { AuthContext } from '../context/AuthContext';
import { ROLES } from '../constants/roles';

const ConsultaSolvenciaSkeleton = () => (
    <div className="animate-pulse rounded-xl p-6" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
        <div className="h-5 w-40 rounded mb-3" style={{ background: 'var(--ash-light)' }} />
        <div className="h-4 w-64 rounded" style={{ background: 'var(--ash-light)' }} />
    </div>
);

export default function ConsultaSolvencia() {
    const { user } = useContext(AuthContext);
    const esDirector = user?.rol === ROLES.DIRECTOR;

    const [cedula, setCedula] = useState('');
    const [loading, setLoading] = useState(false);
    const [resultado, setResultado] = useState(null);
    const [buscada, setBuscada] = useState(false);

    const [observaciones, setObservaciones] = useState('');
    const [emitiendo, setEmitiendo] = useState(false);

    const buscar = async (e) => {
        e.preventDefault();
        const ced = cedula.trim();
        if (!ced) {
            toast.error('Ingrese la cédula del representante.');
            return;
        }
        setLoading(true);
        setBuscada(false);
        try {
            const res = await axiosInstance.get('cobranza/solvencia/', { params: { cedula: ced } });
            setResultado(res.data);
        } catch (err) {
            const msg = err.response?.data?.error || 'Error al consultar la solvencia.';
            toast.error(msg);
            setResultado(null);
        } finally {
            setLoading(false);
            setBuscada(true);
        }
    };

    const emitirManual = async () => {
        const ced = cedula.trim();
        if (!ced) return;
        setEmitiendo(true);
        try {
            const res = await axiosInstance.post('cobranza/solvencia/manual/', {
                cedula: ced,
                observaciones,
            });
            toast.success(res.data.ya_existia ? 'El representante ya poseía solvencia.' : 'Solvencia emitida correctamente.');
            setResultado({ ...res.data, tiene_solvencia: true });
        } catch (err) {
            const msg = err.response?.data?.error || 'Error al emitir la solvencia.';
            toast.error(msg);
        } finally {
            setEmitiendo(false);
        }
    };

    return (
        <div className="p-4 md:p-6 max-w-2xl mx-auto">
            <div className="mb-6">
                <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                    <BadgeCheck size={22} style={{ color: 'var(--pb)' }} />
                    Consulta de Solvencia
                </h1>
                <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
                    Verifica si un representante posee número de solvencia vigente, buscando por su cédula.
                </p>
            </div>

            <form onSubmit={buscar} className="flex gap-2 mb-6">
                <input
                    type="text"
                    value={cedula}
                    onChange={(e) => setCedula(e.target.value)}
                    placeholder="Cédula del representante"
                    className="flex-1 px-4 py-2.5 rounded-lg text-sm outline-none"
                    style={{ border: '0.5px solid var(--border-md)' }}
                />
                <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2.5 rounded-lg text-sm font-medium text-white flex items-center gap-2"
                    style={{ background: 'var(--pb)' }}
                >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    Buscar
                </button>
            </form>

            {loading && <ConsultaSolvenciaSkeleton />}

            {!loading && buscada && resultado && (
                <div
                    className="rounded-xl p-5"
                    style={{
                        background: resultado.tiene_solvencia ? '#f0fdf4' : '#fef2f2',
                        border: `0.5px solid ${resultado.tiene_solvencia ? '#bbf7d0' : '#fecaca'}`,
                    }}
                >
                    <div className="flex items-center gap-2 mb-3">
                        {resultado.tiene_solvencia
                            ? <ShieldCheck size={20} style={{ color: '#16a34a' }} />
                            : <ShieldOff size={20} style={{ color: '#dc2626' }} />}
                        <span className="font-semibold" style={{ color: 'var(--jet)' }}>
                            {resultado.tiene_solvencia ? 'Posee solvencia' : 'No posee solvencia'}
                        </span>
                    </div>

                    <div className="text-sm space-y-1" style={{ color: 'var(--jet)' }}>
                        <p><span className="font-medium">Representante:</span> {resultado.representante_nombre} ({resultado.representante_cedula})</p>
                        {resultado.tiene_solvencia && (
                            <>
                                <p><span className="font-medium">N.º de solvencia:</span> {resultado.numero}</p>
                                <p><span className="font-medium">Período:</span> {resultado.periodo_escolar}</p>
                                <p><span className="font-medium">Origen:</span> {resultado.origen_display}</p>
                                {resultado.fecha_generacion && (
                                    <p><span className="font-medium">Fecha de emisión:</span> {format(parseISO(resultado.fecha_generacion), "dd 'de' MMMM 'de' yyyy", { locale: es })}</p>
                                )}
                            </>
                        )}
                    </div>

                    {!resultado.tiene_solvencia && esDirector && (
                        <div className="mt-4 pt-4" style={{ borderTop: '0.5px solid #fecaca' }}>
                            <p className="text-xs font-medium mb-2 flex items-center gap-1.5" style={{ color: 'var(--ash)' }}>
                                <PenLine size={14} />
                                Emisión manual (solo Director)
                            </p>
                            <textarea
                                value={observaciones}
                                onChange={(e) => setObservaciones(e.target.value)}
                                placeholder="Motivo de la emisión manual (opcional)"
                                rows={2}
                                className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-2"
                                style={{ border: '0.5px solid var(--border-md)' }}
                            />
                            <button
                                onClick={emitirManual}
                                disabled={emitiendo}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                                style={{ background: '#dc2626' }}
                            >
                                {emitiendo ? 'Emitiendo...' : 'Emitir solvencia manualmente'}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
