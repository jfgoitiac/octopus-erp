import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { TablaScroll } from '../ui/TablaScroll';
import { TableRowSkeleton } from '../shared/Skeleton';
import Pagination from '../shared/Pagination';
import { fmt, fmtFecha } from '../../utils/format';
import { ESTATUS_STYLE } from '../../constants/reportes';
import { useEstadoCuentaRepresentante } from '../../hooks/useEstadoCuentaRepresentante';

const ESTADO_ITEM_BADGE = {
    pagado:    { bg: '#dcfce7', color: '#16a34a', label: 'Pagado' },
    parcial:   { bg: '#fef3c7', color: '#d97706', label: 'Parcial' },
    pendiente: { bg: 'var(--red-light, #fee2e2)', color: 'var(--red, #dc2626)', label: 'Pendiente' },
};

const EstadoItemBadge = ({ estado }) => {
    const cfg = ESTADO_ITEM_BADGE[estado] || { bg: 'var(--ash-light)', color: 'var(--ash)', label: estado || '—' };
    return (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap" style={{ background: cfg.bg, color: cfg.color }}>
            {cfg.label}
        </span>
    );
};

const EstatusBadge = ({ estatus }) => {
    const cfg = ESTATUS_STYLE[estatus] || { label: estatus || '—', color: 'var(--ash)', bg: 'var(--ash-light)' };
    return (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap" style={{ background: cfg.bg, color: cfg.color }}>
            {cfg.label}
        </span>
    );
};

const CargosSkeleton = () => (
    <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: 'var(--ash-light)' }} />
        ))}
    </div>
);

/**
 * Estado de cuenta completo de un representante: cargos agrupados por
 * concepto (colapsables) + historial de pagos paginado. Solo lectura —
 * sin generación de PDF ni acciones de pago.
 */
const EstadoCuentaModal = ({ open, onClose, representanteId }) => {
    const [colapsados, setColapsados] = useState(() => new Set());

    const {
        representante, alumnos, cargos, totales, historialPagos,
        loading, error,
        page, setPage, total, totalPages, pageSize,
    } = useEstadoCuentaRepresentante(representanteId, { enabled: open });

    const toggleConcepto = (concepto) => {
        setColapsados(prev => {
            const next = new Set(prev);
            if (next.has(concepto)) next.delete(concepto);
            else next.add(concepto);
            return next;
        });
    };

    const alumnosTexto = (alumnos || []).map(a => a.nombre).join(', ') || 'Sin alumnos';
    const deudaTotal = Number(totales?.deuda_total_usd ?? 0);

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="xl"
            titulo={
                <div className="flex flex-col gap-1 w-full pr-2 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="truncate">{representante?.nombre || '—'}</span>
                        <span className="text-xs font-mono font-normal opacity-80">{representante?.cedula || ''}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-normal opacity-90">
                        <span>{representante?.telefono || 'Sin teléfono'}</span>
                        <span className="truncate max-w-[220px]">{alumnosTexto}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs font-semibold mt-0.5">
                        <span style={{ color: deudaTotal > 0 ? '#fecaca' : '#fff' }}>Deuda: ${fmt(deudaTotal, 2)}</span>
                        <span className="opacity-90 font-normal">Pagado: ${fmt(totales?.pagado_total_usd, 2)}</span>
                    </div>
                </div>
            }
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
            <div className="flex flex-col gap-6">
                {/* Cargos por concepto */}
                <div className="flex flex-col gap-3">
                    <p className="text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>
                        Cargos
                    </p>

                    {loading ? (
                        <CargosSkeleton />
                    ) : error ? (
                        <p className="text-xs py-2" style={{ color: 'var(--ash)' }}>No se pudo cargar el estado de cuenta.</p>
                    ) : cargos.length === 0 ? (
                        <p className="text-xs py-2" style={{ color: 'var(--ash)' }}>Sin cargos registrados.</p>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {cargos.map(grupo => {
                                const abierto = !colapsados.has(grupo.concepto);
                                const nivel = grupo.items?.[0]?.nivel;
                                return (
                                    <div key={grupo.concepto} className="rounded-lg overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
                                        <button
                                            onClick={() => toggleConcepto(grupo.concepto)}
                                            aria-expanded={abierto}
                                            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
                                            style={{ background: 'var(--bg)' }}
                                        >
                                            <span className="flex items-center gap-1.5 text-sm font-medium min-w-0" style={{ color: 'var(--jet)' }}>
                                                {abierto ? <ChevronDown size={14} className="flex-shrink-0" /> : <ChevronRight size={14} className="flex-shrink-0" />}
                                                <span className="truncate">{grupo.concepto_nombre}</span>
                                            </span>
                                            <span className="flex items-center gap-3 text-xs flex-shrink-0" style={{ color: 'var(--ash)' }}>
                                                <span>{grupo.pendientes} pendiente{grupo.pendientes === 1 ? '' : 's'}</span>
                                                <span className="font-semibold" style={{ color: Number(grupo.saldo_usd || 0) > 0 ? 'var(--red)' : 'var(--jet)' }}>
                                                    ${fmt(grupo.saldo_usd, 2)}
                                                </span>
                                            </span>
                                        </button>

                                        {abierto && (
                                            <TablaScroll>
                                                <table className="w-full text-sm border-collapse" style={{ minWidth: 640 }}>
                                                    <thead>
                                                        <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                                                            <th className="px-3 py-2 text-left text-[10px] uppercase" style={{ color: 'var(--ash)' }}>Descripción</th>
                                                            {nivel === 'alumno' && (
                                                                <th className="px-3 py-2 text-left text-[10px] uppercase" style={{ color: 'var(--ash)' }}>Alumno</th>
                                                            )}
                                                            <th className="px-3 py-2 text-right text-[10px] uppercase" style={{ color: 'var(--ash)' }}>Monto</th>
                                                            <th className="px-3 py-2 text-right text-[10px] uppercase" style={{ color: 'var(--ash)' }}>Pagado</th>
                                                            <th className="px-3 py-2 text-right text-[10px] uppercase" style={{ color: 'var(--ash)' }}>Saldo</th>
                                                            <th className="px-3 py-2 text-center text-[10px] uppercase" style={{ color: 'var(--ash)' }}>Estado</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {(grupo.items || []).map((item, idx) => {
                                                            const saldo = Number(item.saldo_usd || 0);
                                                            return (
                                                                <tr key={idx} style={{ borderBottom: '0.5px solid var(--border)' }}>
                                                                    <td className="px-3 py-2 text-xs" style={{ color: 'var(--jet)' }}>{item.descripcion}</td>
                                                                    {nivel === 'alumno' && (
                                                                        <td className="px-3 py-2 text-xs truncate max-w-[140px]" style={{ color: 'var(--ash)' }}>{item.alumno || '—'}</td>
                                                                    )}
                                                                    <td className="px-3 py-2 text-right text-xs tabular-nums" style={{ color: 'var(--ash)' }}>${fmt(item.monto_usd, 2)}</td>
                                                                    <td className="px-3 py-2 text-right text-xs tabular-nums" style={{ color: 'var(--ash)' }}>${fmt(item.monto_pagado_usd, 2)}</td>
                                                                    <td className="px-3 py-2 text-right text-xs tabular-nums font-semibold" style={{ color: saldo > 0 ? 'var(--red)' : 'var(--jet)' }}>${fmt(item.saldo_usd, 2)}</td>
                                                                    <td className="px-3 py-2 text-center"><EstadoItemBadge estado={item.estado} /></td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </TablaScroll>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Historial de pagos */}
                <div className="flex flex-col gap-3">
                    <p className="text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>
                        Historial de pagos
                    </p>

                    <TablaScroll>
                        <table className="w-full text-sm border-collapse" style={{ minWidth: 720 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    <th className="px-3 py-3 text-left text-xs uppercase whitespace-nowrap" style={{ color: 'var(--ash)' }}>Fecha</th>
                                    <th className="px-3 py-3 text-left text-xs uppercase" style={{ color: 'var(--ash)' }}>Factura</th>
                                    <th className="px-3 py-3 text-left text-xs uppercase" style={{ color: 'var(--ash)' }}>Concepto</th>
                                    <th className="px-3 py-3 text-left text-xs uppercase" style={{ color: 'var(--ash)' }}>Método</th>
                                    <th className="px-3 py-3 text-right text-xs uppercase" style={{ color: 'var(--ash)' }}>Monto USD</th>
                                    <th className="px-3 py-3 text-center text-xs uppercase" style={{ color: 'var(--ash)' }}>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <TableRowSkeleton cols={6} rows={5} />
                                ) : error ? (
                                    <tr>
                                        <td colSpan={6} className="text-center py-10 text-sm" style={{ color: 'var(--ash)' }}>
                                            No se pudo cargar el historial de pagos.
                                        </td>
                                    </tr>
                                ) : historialPagos.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="text-center py-10 text-sm" style={{ color: 'var(--ash)' }}>
                                            Sin pagos registrados.
                                        </td>
                                    </tr>
                                ) : historialPagos.map(p => {
                                    const anulado = p.estatus === 'anulado';
                                    const rowStyle = { borderBottom: '0.5px solid var(--border)', ...(anulado ? { color: 'var(--ash)', textDecoration: 'line-through', opacity: 0.7 } : {}) };
                                    return (
                                        <tr key={p.id} style={rowStyle}>
                                            <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: 'inherit' }}>{fmtFecha(p.fecha_pago)}</td>
                                            <td className="px-3 py-3 text-xs" style={{ color: 'inherit' }}>{p.factura_id ?? '—'}</td>
                                            <td className="px-3 py-3 text-xs" style={{ color: 'inherit' }}>{p.concepto_display || p.concepto || '—'}</td>
                                            <td className="px-3 py-3 text-xs" style={{ color: 'inherit' }}>{p.metodo_pago_display || p.metodo_pago || '—'}</td>
                                            <td className="px-3 py-3 text-right text-xs tabular-nums" style={{ color: 'inherit' }}>${fmt(p.monto_usd, 2)}</td>
                                            <td className="px-3 py-3 text-center">
                                                {anulado ? (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap" style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}>
                                                        Anulado
                                                    </span>
                                                ) : (
                                                    <EstatusBadge estatus={p.estatus} />
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </TablaScroll>

                    {!loading && !error && (
                        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={total} pageSize={pageSize} />
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default EstadoCuentaModal;
