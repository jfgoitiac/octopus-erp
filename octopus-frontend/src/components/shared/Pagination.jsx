import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Paginación reutilizable para listados server-side paginados con DRF
 * (PageNumberPagination: {count, next, previous, results}).
 *
 * No se renderiza si hay una sola página.
 */
const Pagination = ({ page, totalPages, onPageChange, total, pageSize }) => {
    if (!totalPages || totalPages <= 1) return null;

    const desde = total ? (page - 1) * pageSize + 1 : null;
    const hasta = total ? Math.min(page * pageSize, total) : null;

    return (
        <div
            className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5"
            style={{ borderTop: '0.5px solid var(--border)', background: 'var(--porcelain)' }}
        >
            {total != null && (
                <span className="text-xs" style={{ color: 'var(--ash)' }}>
                    Mostrando {desde}–{hasta} de {total}
                </span>
            )}

            <div className="flex items-center gap-3">
                <button
                    onClick={() => onPageChange(page - 1)}
                    disabled={page <= 1}
                    aria-label="Página anterior"
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
                    style={{
                        background: page <= 1 ? 'transparent' : 'var(--ash-light)',
                        color: 'var(--ash)',
                        opacity: page <= 1 ? 0.35 : 1,
                        border: '1px solid var(--border-md)',
                        cursor: page <= 1 ? 'not-allowed' : 'pointer',
                    }}
                >
                    <ChevronLeft size={13} /> Anterior
                </button>

                <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                        .reduce((acc, p, idx, arr) => {
                            if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                            acc.push(p);
                            return acc;
                        }, [])
                        .map((p, idx) =>
                            p === '...' ? (
                                <span key={`e-${idx}`} className="px-1.5 text-xs" style={{ color: 'var(--ash)' }}>…</span>
                            ) : (
                                <button
                                    key={p}
                                    onClick={() => onPageChange(p)}
                                    aria-label={`Ir a la página ${p}`}
                                    aria-current={p === page ? 'page' : undefined}
                                    className="w-8 h-8 rounded-lg text-xs font-semibold transition-all duration-150"
                                    style={{
                                        background: p === page
                                            ? 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)'
                                            : 'transparent',
                                        color: p === page ? '#fff' : 'var(--ash)',
                                        boxShadow: p === page ? 'var(--glow-pb)' : 'none',
                                        border: p === page ? 'none' : '1px solid var(--border)',
                                    }}
                                >
                                    {p}
                                </button>
                            )
                        )
                    }
                </div>

                <button
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= totalPages}
                    aria-label="Página siguiente"
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
                    style={{
                        background: page >= totalPages ? 'transparent' : 'var(--ash-light)',
                        color: 'var(--ash)',
                        opacity: page >= totalPages ? 0.35 : 1,
                        border: '1px solid var(--border-md)',
                        cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                    }}
                >
                    Siguiente <ChevronRight size={13} />
                </button>
            </div>
        </div>
    );
};

export default Pagination;
