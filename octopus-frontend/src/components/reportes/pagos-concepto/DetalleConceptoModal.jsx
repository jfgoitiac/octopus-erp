import { useState } from 'react';
import { Search, Download, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Modal } from '../../ui/Modal';
import { TablaScroll } from '../../ui/TablaScroll';
import { TableRowSkeleton } from '../../shared/Skeleton';
import Pagination from '../../shared/Pagination';
import { useEstadoPorConcepto } from '../../../hooks/useEstadoPorConcepto';

const ESTADOS = [
    { value: 'todos', label: 'Todos' },
    { value: 'pagado', label: 'Pagados' },
    { value: 'parcial', label: 'Parciales' },
    { value: 'pendiente', label: 'Pendientes' },
];

const fmtMonto = (v) => Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtFechaPago = (str) => {
    if (!str) return '—';
    try { return format(parseISO(str), 'dd MMM yyyy', { locale: es }); }
    catch { return str; }
};

const ESTADO_BADGE = {
    pagado:    { bg: '#dcfce7', color: '#16a34a', label: 'Pagado' },
    parcial:   { bg: '#fef3c7', color: '#d97706', label: 'Parcial' },
    pendiente: { bg: 'var(--red-light, #fee2e2)', color: 'var(--red, #dc2626)', label: 'Pendiente' },
};

const EstadoBadge = ({ estado }) => {
    const cfg = ESTADO_BADGE[estado] || { bg: 'var(--ash-light)', color: 'var(--ash)', label: estado };
    return (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: cfg.bg, color: cfg.color }}>
            {cfg.label}
        </span>
    );
};

/**
 * Modal de detalle por nombre de un concepto (o de una línea/mes/grado
 * específica). Cambia de columnas según el `nivel` de las filas devueltas
 * (alumno vs representante — cargos especiales).
 */
const DetalleConceptoModal = ({ open, onClose, concepto, conceptoNombre, admitePartial, filtro }) => {
    const [estado, setEstado] = useState('todos');
    const [buscar, setBuscar] = useState('');

    const {
        filas, resumen, loading, exportingExcel, handleExportExcel,
        page, setPage, total, totalPages, pageSize,
    } = useEstadoPorConcepto({
        concepto,
        estado,
        mes: filtro?.mes,
        anio: filtro?.anio,
        numeroCuota: filtro?.numeroCuota,
        gradoSeccion: filtro?.gradoSeccion,
        buscar,
        enabled: open,
    });

    const nivel = filas[0]?.nivel || 'alumno';
    const estadosVisibles = admitePartial ? ESTADOS : ESTADOS.filter(e => e.value !== 'parcial');

    return (
        <Modal
            open={open}
            onClose={onClose}
            titulo={`${conceptoNombre || ''}${filtro?.etiqueta ? ` — ${filtro.etiqueta}` : ''}`}
            size="lg"
            footer={
                <button
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-lg text-sm font-medium w-full sm:w-auto min-h-[44px]"
                    style={{ background: 'var(--pb)', color: '#fff' }}
                >
                    Cerrar
                </button>
            }
        >
            <div className="flex flex-col gap-4">
                {resumen && (
                    <div className="flex flex-wrap gap-3 text-xs" style={{ color: 'var(--ash)' }}>
                        <span>Total: <strong style={{ color: 'var(--jet)' }}>{resumen.total_filas}</strong></span>
                        <span>Pagados: <strong style={{ color: '#16a34a' }}>{resumen.pagados}</strong></span>
                        {admitePartial && <span>Parciales: <strong style={{ color: '#d97706' }}>{resumen.parciales}</strong></span>}
                        <span>Pendientes: <strong style={{ color: 'var(--red, #dc2626)' }}>{resumen.pendientes}</strong></span>
                        <span>Monto pendiente: <strong style={{ color: 'var(--red, #dc2626)' }}>${fmtMonto(resumen.monto_pendiente_usd)}</strong></span>
                    </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-1 p-1 rounded-lg w-fit overflow-x-auto max-w-full" style={{ background: 'var(--bg)', border: '0.5px solid var(--border-md)' }}>
                        {estadosVisibles.map(e => (
                            <button
                                key={e.value}
                                onClick={() => setEstado(e.value)}
                                aria-current={estado === e.value ? 'true' : undefined}
                                className="px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap min-h-[32px]"
                                style={estado === e.value
                                    ? { background: 'var(--pb)', color: '#fff' }
                                    : { color: 'var(--ash)' }}
                            >
                                {e.label}
                            </button>
                        ))}
                    </div>

                    <div className="relative w-full sm:w-56">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                        <input
                            type="search"
                            aria-label="Buscar por nombre o cédula"
                            placeholder="Buscar…"
                            value={buscar}
                            onChange={e => setBuscar(e.target.value)}
                            style={{
                                background: 'var(--bg)', border: '0.5px solid var(--border-md)',
                                borderRadius: '8px', color: 'var(--jet)', fontSize: '14px',
                                padding: '7px 10px 7px 28px', outline: 'none', width: '100%',
                            }}
                        />
                    </div>
                </div>

                <TablaScroll>
                    <table className="w-full text-sm border-collapse" style={{ minWidth: nivel === 'representante' ? 720 : 780 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                {nivel === 'representante' ? (
                                    <>
                                        <th className="px-3 py-3 text-left text-xs uppercase" style={{ color: 'var(--ash)' }}>Representante</th>
                                        <th className="px-3 py-3 text-left text-xs uppercase" style={{ color: 'var(--ash)' }}>Alumnos</th>
                                        <th className="px-3 py-3 text-right text-xs uppercase" style={{ color: 'var(--ash)' }}>Cuota</th>
                                    </>
                                ) : (
                                    <>
                                        <th className="px-3 py-3 text-left text-xs uppercase" style={{ color: 'var(--ash)' }}>Alumno</th>
                                        <th className="px-3 py-3 text-left text-xs uppercase" style={{ color: 'var(--ash)' }}>Grado/Sección</th>
                                        <th className="px-3 py-3 text-left text-xs uppercase" style={{ color: 'var(--ash)' }}>Representante</th>
                                    </>
                                )}
                                <th className="px-3 py-3 text-right text-xs uppercase" style={{ color: 'var(--ash)' }}>Monto</th>
                                <th className="px-3 py-3 text-right text-xs uppercase" style={{ color: 'var(--ash)' }}>Pagado</th>
                                <th className="px-3 py-3 text-right text-xs uppercase" style={{ color: 'var(--ash)' }}>Saldo</th>
                                <th className="px-3 py-3 text-center text-xs uppercase" style={{ color: 'var(--ash)' }}>Estado</th>
                                <th className="px-3 py-3 text-left text-xs uppercase whitespace-nowrap" style={{ color: 'var(--ash)' }}>Fecha pago</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <TableRowSkeleton cols={8} rows={6} />
                            ) : filas.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-10 text-sm" style={{ color: 'var(--ash)' }}>
                                        Sin resultados para este filtro.
                                    </td>
                                </tr>
                            ) : filas.map((f, idx) => {
                                const saldo = Number(f.saldo_usd || 0);
                                const colorSaldo = saldo > 0 ? 'var(--red, #dc2626)' : 'var(--jet)';
                                return (
                                    <tr key={f.alumno_id ?? `${f.representante_id}-${f.numero_cuota ?? idx}`} style={{ borderBottom: '0.5px solid var(--border)' }}>
                                        {f.nivel === 'representante' ? (
                                            <>
                                                <td className="px-3 py-3">
                                                    <p className="font-medium truncate max-w-[160px]" style={{ color: 'var(--jet)' }}>{f.nombre}</p>
                                                    <p className="text-[10px] font-mono" style={{ color: 'var(--ash)' }}>{f.cedula}</p>
                                                </td>
                                                <td className="px-3 py-3 text-xs truncate max-w-[160px]" style={{ color: 'var(--ash)' }}>
                                                    {(f.alumnos || []).join(', ') || '—'}
                                                </td>
                                                <td className="px-3 py-3 text-right tabular-nums" style={{ color: 'var(--ash)' }}>
                                                    {f.numero_cuota ?? '—'}
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="px-3 py-3">
                                                    <p className="font-medium truncate max-w-[150px]" style={{ color: 'var(--jet)' }}>{f.nombre}</p>
                                                    <p className="text-[10px] font-mono" style={{ color: 'var(--ash)' }}>{f.cedula_escolar || '—'}</p>
                                                </td>
                                                <td className="px-3 py-3 text-xs" style={{ color: 'var(--ash)' }}>{f.grado_seccion || '—'}</td>
                                                <td className="px-3 py-3 text-xs truncate max-w-[150px]" style={{ color: 'var(--ash)' }}>
                                                    {f.representante?.nombre || '—'}
                                                    {f.dias_atraso != null && f.dias_atraso > 0 && (
                                                        <span className="block text-[10px]" style={{ color: 'var(--red, #dc2626)' }}>
                                                            {f.dias_atraso} días de atraso
                                                        </span>
                                                    )}
                                                </td>
                                            </>
                                        )}
                                        <td className="px-3 py-3 text-right tabular-nums" style={{ color: 'var(--ash)' }}>${fmtMonto(f.monto_usd)}</td>
                                        <td className="px-3 py-3 text-right tabular-nums" style={{ color: 'var(--ash)' }}>${fmtMonto(f.monto_pagado_usd)}</td>
                                        <td className="px-3 py-3 text-right tabular-nums font-semibold" style={{ color: colorSaldo }}>${fmtMonto(f.saldo_usd)}</td>
                                        <td className="px-3 py-3 text-center"><EstadoBadge estado={f.estado} /></td>
                                        <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--ash)' }}>{fmtFechaPago(f.fecha_pago)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </TablaScroll>

                {!loading && (
                    <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={total} pageSize={pageSize} />
                )}

                <button
                    onClick={handleExportExcel}
                    disabled={exportingExcel}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60 w-full sm:w-auto min-h-[44px]"
                    style={{ background: 'var(--jet)' }}
                >
                    {exportingExcel ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    Exportar Excel
                </button>
            </div>
        </Modal>
    );
};

export default DetalleConceptoModal;
