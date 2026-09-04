import { useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCopy } from 'lucide-react';
import { toast } from 'react-toastify';
import { AuthContext } from '../../context/AuthContext';
import { ROLE_GROUPS } from '../../constants/roles';
import { useSolvenciaMensual } from '../../hooks/useSolvenciaMensual';
import { copiarResumen } from '../../utils/copiarResumen';
import { Card } from '../ui/Card';
import SolvenciaGradoSkeleton from './SolvenciaGradoSkeleton';

const colorPorcentaje = (pct) => {
    if (pct >= 80) return '#16a34a';
    if (pct >= 50) return '#d97706';
    return '#dc2626';
};

const SelectStyle = {
    background: 'var(--bg)', border: '0.5px solid var(--border-md)',
    borderRadius: '8px', color: 'var(--jet)', fontSize: '13px',
    padding: '7px 10px', outline: 'none',
};

const SolvenciaGradoBlock = () => {
    const { user } = useContext(AuthContext);
    const rol = (user?.rol || '').toLowerCase().trim();
    const navigate = useNavigate();

    const { periodoEscolar, meses, porGrado, loading, error, retry } = useSolvenciaMensual();

    const hoy = useMemo(() => new Date(), []);
    const [mesSeleccionado, setMesSeleccionado] = useState(null);

    const mesActivo = useMemo(() => {
        if (mesSeleccionado != null) {
            const match = meses.find(m => `${m.mes}-${m.anio}` === mesSeleccionado);
            if (match) return match;
        }
        const actual = meses.find(m => m.mes === hoy.getMonth() + 1 && m.anio === hoy.getFullYear());
        return actual || meses[0] || null;
    }, [mesSeleccionado, meses, hoy]);

    const visible = ROLE_GROUPS.SOLVENCIA_DASHBOARD.includes(rol);
    if (!visible) return null;

    if (loading) return <SolvenciaGradoSkeleton />;

    if (error) return (
        <Card titulo="Solvencia por grado" className="anim-scale-in card-lift">
            <div className="flex flex-col items-center gap-3 py-8">
                <p className="text-sm text-center" style={{ color: 'var(--ash)' }}>
                    No se pudo cargar la solvencia por grado.
                </p>
                <button
                    onClick={retry}
                    className="px-4 py-2 rounded-lg text-sm font-medium min-h-[44px]"
                    style={{ background: 'var(--pb)', color: '#fff' }}
                >
                    Reintentar
                </button>
            </div>
        </Card>
    );

    const gradosDelMes = mesActivo
        ? porGrado
            .map(g => ({
                grado_seccion: g.grado_seccion,
                mesData: g.meses.find(m => m.mes === mesActivo.mes && m.anio === mesActivo.anio),
            }))
            .filter(g => g.mesData && g.mesData.total_alumnos > 0)
        : [];

    const handleCopiarResumen = async () => {
        if (!mesActivo) return;
        const titulo = `Solvencia — ${mesActivo.etiqueta}`;
        const lineas = [
            `Total: ${mesActivo.solventes} de ${mesActivo.total_alumnos} al día (${mesActivo.porcentaje.toFixed(1)}%)`,
            '',
            ...gradosDelMes.map(g =>
                `${g.grado_seccion} — ${g.mesData.solventes}/${g.mesData.total_alumnos} (${g.mesData.porcentaje.toFixed(1)}%)`
            ),
        ];
        const ok = await copiarResumen(titulo, lineas);
        if (ok) toast.success('Resumen copiado al portapapeles.');
        else toast.error('No se pudo copiar el resumen.');
    };

    const handleClickGrado = (gradoSeccion) => {
        if (!mesActivo) return;
        navigate(
            `/reportes?tab=concepto&concepto=mensualidad&mes=${mesActivo.mes}&anio=${mesActivo.anio}&grado=${encodeURIComponent(gradoSeccion)}`
        );
    };

    return (
        <Card
            className="anim-scale-in card-lift"
            titulo="Solvencia por grado"
            subtitulo={periodoEscolar ? `Período ${periodoEscolar}` : undefined}
            accion={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {meses.length > 0 && (
                        <select
                            aria-label="Mes a mostrar"
                            value={mesActivo ? `${mesActivo.mes}-${mesActivo.anio}` : ''}
                            onChange={e => setMesSeleccionado(e.target.value)}
                            style={SelectStyle}
                            className="w-full sm:w-auto"
                        >
                            {meses.map(m => (
                                <option key={`${m.mes}-${m.anio}`} value={`${m.mes}-${m.anio}`}>
                                    {m.etiqueta}
                                </option>
                            ))}
                        </select>
                    )}
                    <button
                        onClick={handleCopiarResumen}
                        disabled={!mesActivo}
                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium min-h-[36px] disabled:opacity-50 w-full sm:w-auto"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                    >
                        <ClipboardCopy size={13} />
                        Copiar resumen
                    </button>
                </div>
            }
        >
            {gradosDelMes.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--ash)' }}>
                    Sin mensualidades generadas para este mes
                </p>
            ) : (
                <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                    {gradosDelMes.map(g => {
                        const color = colorPorcentaje(g.mesData.porcentaje);
                        return (
                            <button
                                key={g.grado_seccion}
                                type="button"
                                onClick={() => handleClickGrado(g.grado_seccion)}
                                aria-label={`Ver detalle de ${g.grado_seccion}, ${mesActivo.etiqueta.toLowerCase()}`}
                                className="snap-start shrink-0 w-40 sm:w-44 rounded-xl p-4 flex flex-col justify-between gap-2 text-left transition-transform hover:-translate-y-0.5"
                                style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', height: 112 }}
                            >
                                <p className="text-xs font-medium truncate" style={{ color: 'var(--jet)' }}>
                                    {g.grado_seccion}
                                </p>
                                <div>
                                    <p className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>
                                        {g.mesData.solventes} de {g.mesData.total_alumnos} solventes
                                    </p>
                                    <p className="text-xs font-semibold mt-0.5" style={{ color }}>
                                        {g.mesData.porcentaje.toFixed(1)}%
                                    </p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </Card>
    );
};

export default SolvenciaGradoBlock;
