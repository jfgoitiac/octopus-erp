import { useState } from 'react';
import { Search, AlertTriangle, Loader2, RefreshCcw, Download } from 'lucide-react';
import { useTasaBCV } from '../hooks/useTasaBCV';
import { useMorosos } from '../hooks/useMorosos';
import MorososSummary from '../components/morosos/MorososSummary';
import MorososSkeleton from '../components/morosos/MorososSkeleton';
import MorososRow from '../components/morosos/MorososRow';

const COL_HEADERS = ['Alumno', 'Cédula escolar', 'Grado', 'Representante', 'Teléfono', 'Deuda (USD)', ''];

const Morosos = () => {
    const [busqueda, setBusqueda] = useState('');
    const { tasa } = useTasaBCV();
    const {
        alumnos,
        loading,
        exportingExcel,
        totalDeudaUSD,
        refetch,
        handleExportExcel,
    } = useMorosos(busqueda);

    return (
        <div className="flex flex-col gap-5 anim-fade-up">

            <MorososSummary
                count={alumnos.length}
                totalDeudaUSD={totalDeudaUSD}
                tasa={tasa}
                loading={loading}
            />

            {/* Toolbar */}
            <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                    <Search
                        size={13}
                        className="absolute left-3 top-1/2 -translate-y-1/2"
                        style={{ color: 'var(--ash)' }}
                    />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, cédula…"
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        className="w-full rounded-lg text-xs"
                        style={{
                            paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
                            background: 'var(--porcelain)',
                            border: '0.5px solid var(--border-md)',
                            color: 'var(--jet)',
                            outline: 'none',
                        }}
                    />
                </div>
                <button
                    onClick={refetch}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-xs disabled:opacity-50"
                    style={{
                        border: '0.5px solid var(--border-md)',
                        color: 'var(--ash)',
                        background: 'var(--porcelain)',
                    }}
                    title="Refrescar"
                >
                    <RefreshCcw size={13} className={loading ? 'animate-spin' : ''} />
                    Refrescar
                </button>
                <button
                    onClick={handleExportExcel}
                    disabled={exportingExcel || loading}
                    className="flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-xs font-medium text-white disabled:opacity-50"
                    style={{ background: 'var(--jet)' }}
                    title="Exportar Excel"
                >
                    {exportingExcel
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Download size={13} />}
                    Excel
                </button>
            </div>

            {/* Tabla con scroll horizontal en móvil */}
            <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[700px]">
                        <thead>
                            <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                                {COL_HEADERS.map(h => (
                                    <th
                                        key={h}
                                        className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                                        style={{ color: 'var(--ash)' }}
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <MorososSkeleton rows={6} />
                            ) : alumnos.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center">
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
                            ) : alumnos.map((alu, idx) => (
                                <MorososRow
                                    key={alu.id}
                                    alu={alu}
                                    animDelay={idx * 30}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Morosos;
