import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search, AlertTriangle, Loader2, RefreshCcw, Download } from 'lucide-react';
import { useTasaBCV } from '../hooks/useTasaBCV';
import { useMorosos } from '../hooks/useMorosos';
import MorososSummary from '../components/morosos/MorososSummary';
import MorososSkeleton from '../components/morosos/MorososSkeleton';
import MorososRow from '../components/morosos/MorososRow';
import Pagination from '../components/shared/Pagination';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Tabla } from '../components/ui/Tabla';

const Morosos = () => {
    const [busqueda, setBusqueda] = useState('');
    const [ordenDiasAtraso, setOrdenDiasAtraso] = useState(null); // null | 'asc' | 'desc'
    const { tasa } = useTasaBCV();
    const {
        alumnos,
        loading,
        exportingExcel,
        totalDeudaUSD,
        totalSolvenciaUSD,
        refetch,
        handleExportExcel,
        page,
        setPage,
        total,
        totalPages,
        pageSize,
    } = useMorosos(busqueda);

    const alumnosOrdenados = useMemo(() => {
        if (!ordenDiasAtraso) return alumnos;
        const factor = ordenDiasAtraso === 'desc' ? -1 : 1;
        return [...alumnos].sort(
            (a, b) => factor * ((a.dias_atraso ?? 0) - (b.dias_atraso ?? 0))
        );
    }, [alumnos, ordenDiasAtraso]);

    const toggleOrdenDiasAtraso = () =>
        setOrdenDiasAtraso(prev => (prev === 'desc' ? 'asc' : 'desc'));

    const columnas = [
        { key: 'alumno',      label: 'Alumno' },
        { key: 'cedula',      label: 'Cédula escolar' },
        { key: 'grado',       label: 'Grado' },
        { key: 'representante', label: 'Representante' },
        { key: 'telefono',    label: 'Teléfono' },
        { key: 'deuda',       label: 'Deuda (USD)' },
        { key: 'solvencia',   label: 'Solvencia (USD)' },
        {
            key: 'dias_atraso',
            label: (
                <button
                    onClick={toggleOrdenDiasAtraso}
                    aria-label="Ordenar por días de atraso"
                    className="inline-flex items-center gap-1 uppercase tracking-wider"
                >
                    Días de atraso
                    {ordenDiasAtraso === 'desc'
                        ? <ArrowDown size={11} />
                        : ordenDiasAtraso === 'asc'
                            ? <ArrowUp size={11} />
                            : <ArrowUpDown size={11} />}
                </button>
            ),
        },
        { key: 'accion', label: '' },
    ];

    return (
        <div>
            <PageHeader titulo="Alumnos en mora" />

            <div className="flex flex-col gap-5 anim-fade-up">

            <MorososSummary
                count={total}
                totalDeudaUSD={totalDeudaUSD}
                totalSolvenciaUSD={totalSolvenciaUSD}
                tasa={tasa}
                loading={loading}
            />

            {/* Toolbar */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1 sm:max-w-sm">
                    <Search
                        size={13}
                        className="absolute left-3 top-1/2 -translate-y-1/2"
                        style={{ color: 'var(--ash)' }}
                    />
                    <input
                        type="search"
                        aria-label="Buscar moroso por nombre o cédula"
                        placeholder="Buscar por nombre, cédula…"
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        className="w-full rounded-lg"
                        style={{
                            paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
                            background: 'var(--porcelain)',
                            border: '0.5px solid var(--border-md)',
                            color: 'var(--jet)',
                            outline: 'none',
                            fontSize: '16px',
                        }}
                    />
                </div>
                <div className="flex gap-2">
                <button
                    onClick={refetch}
                    disabled={loading}
                    aria-label="Refrescar lista de morosos"
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-[7px] rounded-lg text-xs disabled:opacity-50 min-h-[44px]"
                    style={{
                        border: '0.5px solid var(--border-md)',
                        color: 'var(--ash)',
                        background: 'var(--porcelain)',
                    }}
                >
                    <RefreshCcw size={13} className={loading ? 'animate-spin' : ''} />
                    Refrescar
                </button>
                <button
                    onClick={handleExportExcel}
                    disabled={exportingExcel || loading}
                    aria-label="Exportar morosos a Excel"
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-[7px] rounded-lg text-xs font-medium text-white disabled:opacity-50 min-h-[44px]"
                    style={{ background: 'var(--jet)' }}
                >
                    {exportingExcel
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Download size={13} />}
                    Excel
                </button>
                </div>
            </div>

            {/* Tabla con scroll horizontal en móvil */}
            <Card padding="none">
                <Tabla columnas={columnas} minWidth={700}>
                    {loading ? (
                        <MorososSkeleton rows={6} />
                    ) : alumnosOrdenados.length === 0 ? (
                        <tr>
                            <td colSpan={9} className="px-4 py-12 text-center">
                                <div className="flex flex-col items-center gap-2">
                                    <AlertTriangle size={28} style={{ color: 'var(--ash)' }} />
                                    <p className="text-xs" style={{ color: 'var(--ash)' }}>
                                        {busqueda
                                            ? 'No se encontraron resultados.'
                                            : 'No hay alumnos en mora. ¡Buenas noticias!'}
                                    </p>
                                </div>
                            </td>
                        </tr>
                    ) : alumnosOrdenados.map((alu, idx) => (
                        <MorososRow
                            key={alu.id}
                            alu={alu}
                            animDelay={idx * 30}
                        />
                    ))}
                </Tabla>
                {!loading && (
                    <Pagination
                        page={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                        total={total}
                        pageSize={pageSize}
                    />
                )}
            </Card>
            </div>
        </div>
    );
};

export default Morosos;
