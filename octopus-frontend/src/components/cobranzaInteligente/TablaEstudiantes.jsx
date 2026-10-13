import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Eye, Download, ChevronLeft, ChevronRight, Loader2, Users } from 'lucide-react';
import GradoSelect from '../GradoSelect';
import InitialsAvatar from '../shared/InitialsAvatar';
import WhatsAppIcon from '../ui/WhatsAppIcon';
import { TablaScroll } from '../ui/TablaScroll';
import ModalCobroWhatsApp from '../whatsapp/ModalCobroWhatsApp';
import { fmt, fmtFecha } from '../../utils/format';

const BADGE = {
    pagado: { label: 'Al día', color: 'var(--green)', fondo: 'var(--green-light)', avatar: '#16a34a' },
    parcial: { label: 'Abono parcial', color: 'var(--amber-ink)', fondo: 'var(--yellow-light)', avatar: '#d97706' },
    pendiente: { label: 'Con deuda', color: 'var(--red)', fondo: 'var(--red-light)', avatar: '#9e2b25' },
};
const FILTRO_ESTADO = [
    { value: 'todos', label: 'Todos los estados' },
    { value: 'pagado', label: 'Al día' },
    { value: 'parcial', label: 'Abono parcial' },
    { value: 'pendiente', label: 'Con deuda' },
];

const separar = (nombre) => {
    const [n = '', ...resto] = (nombre || '').split(' ');
    return { nombre: n, apellido: resto.at(-1) || '' };
};

function Estado({ fila }) {
    const b = BADGE[fila.estado];
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
            style={{ background: b.fondo, color: b.color }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: b.color }} />
            {b.label}{fila.dias_atraso ? ` · ${fila.dias_atraso} d` : ''}
        </span>
    );
}

function Monto({ fila }) {
    const debe = fila.estado !== 'pagado';
    return (
        <div className="tabular-nums text-right whitespace-nowrap">
            <p className="text-sm font-semibold" style={{ color: debe ? 'var(--red)' : 'var(--jet)' }}>
                ${fmt(debe ? fila.saldo_usd : fila.monto_usd, 2)}
            </p>
            {debe && <p className="text-[11px]" style={{ color: 'var(--ash)' }}>de ${fmt(fila.monto_usd, 2)}</p>}
        </div>
    );
}

function Acciones({ fila, onWhatsApp }) {
    const navigate = useNavigate();
    const rep = fila.representante;
    return (
        <div className="flex items-center justify-end gap-1">
            <button type="button" className="btn btn-ghost btn-sm !px-2" title="Ver estado de cuenta y cobrar"
                aria-label={`Ver ${fila.nombre}`} disabled={!rep}
                onClick={() => navigate(`/cobranza?cedula=${rep?.cedula ?? ''}`)}>
                <Eye size={16} />
            </button>
            <button type="button" className="btn btn-ghost btn-sm !px-2" title="Enviar cobro por WhatsApp"
                aria-label={`WhatsApp a ${rep?.nombre ?? 'representante'}`} disabled={!rep?.telefono?.trim()}
                onClick={() => onWhatsApp(rep)}>
                <WhatsAppIcon size={16} />
            </button>
        </div>
    );
}

function Paginacion({ page, setPage, totalPages, total, pageSize }) {
    if (!total) return null;
    const desde = (page - 1) * pageSize + 1;
    const hasta = Math.min(page * pageSize, total);
    return (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-3 text-xs sm:text-sm"
            style={{ color: 'var(--ash)' }}>
            <span>Mostrando {desde}–{hasta} de {total} estudiantes</span>
            <div className="flex items-center gap-1 self-end sm:self-auto">
                <button type="button" className="btn btn-secondary btn-sm !px-2" aria-label="Página anterior"
                    disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button>
                <span className="px-3 tabular-nums" style={{ color: 'var(--jet)' }}>{page} / {totalPages}</span>
                <button type="button" className="btn btn-secondary btn-sm !px-2" aria-label="Página siguiente"
                    disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button>
            </div>
        </div>
    );
}

const FilasSkeleton = () => (
    <div className="space-y-3 py-2" aria-hidden="true">
        {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-3">
                <div className="skeleton w-9 h-9 !rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5"><div className="skeleton h-3 w-1/3" /><div className="skeleton h-2.5 w-1/5" /></div>
                <div className="skeleton h-5 w-16 !rounded-full" />
            </div>
        ))}
    </div>
);

export default function TablaEstudiantes({ filtros, setFiltros, listado }) {
    const [whatsApp, setWhatsApp] = useState(null);
    const { filas, exportingExcel, handleExportExcel } = listado;
    // Sin resumen todavía no llegó la primera respuesta: skeleton, no "vacío".
    const loading = listado.loading || !listado.resumen;
    const cambiar = (k) => (e) => setFiltros(f => ({ ...f, [k]: e.target.value }));

    return (
        <section className="rounded-[var(--radius-card)] p-3 sm:p-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3 mb-4">
                <label className="relative flex-1 min-w-0">
                    <span className="sr-only">Buscar estudiante o representante</span>
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                    <input type="search" value={filtros.buscar} onChange={cambiar('buscar')}
                        placeholder="Buscar estudiante, cédula o representante…" className="input w-full !pl-9" />
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 lg:flex lg:gap-3">
                    <GradoSelect value={filtros.grado} onChange={cambiar('grado')} incluirVacio
                        etiquetaVacio="Todos los grados" aria-label="Filtrar por grado" className="input w-full lg:w-44" />
                    <select value={filtros.estado} onChange={cambiar('estado')} aria-label="Filtrar por estado de pago"
                        className="input w-full lg:w-44">
                        {FILTRO_ESTADO.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button type="button" className="btn btn-secondary w-full lg:w-auto" onClick={handleExportExcel}
                        disabled={exportingExcel || !filas.length}>
                        {exportingExcel ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}Exportar
                    </button>
                </div>
            </div>

            {loading && !filas.length && <FilasSkeleton />}
            {!loading && !filas.length && (
                <div className="flex flex-col items-center gap-2 py-10 text-sm" style={{ color: 'var(--ash)' }}>
                    <Users size={28} />Ningún estudiante coincide con los filtros.
                </div>
            )}

            {filas.length > 0 && (
                <div className={`transition-opacity ${loading ? 'opacity-50' : ''}`}>
                    {/* Móvil y tablet: tarjetas */}
                    <ul className="lg:hidden divide-y divide-[var(--border)]">
                        {filas.map(f => {
                            const p = separar(f.nombre);
                            return (
                                <li key={`${f.alumno_id}-${f.monto_usd}`} className="py-3 flex gap-3">
                                    <InitialsAvatar nombre={p.nombre} apellido={p.apellido} color={BADGE[f.estado].avatar} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="text-sm font-medium truncate" style={{ color: 'var(--jet)' }}>{f.nombre}</p>
                                            <Monto fila={f} />
                                        </div>
                                        <p className="text-xs truncate" style={{ color: 'var(--ash)' }}>
                                            {f.grado_seccion || 'Sin grado'} · {f.representante?.nombre ?? 'Sin representante'}
                                        </p>
                                        <div className="flex items-center justify-between gap-2 mt-1.5">
                                            <Estado fila={f} />
                                            <Acciones fila={f} onWhatsApp={setWhatsApp} />
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>

                    {/* Escritorio: tabla */}
                    <TablaScroll className="hidden lg:block">
                        <table className="w-full min-w-[760px] text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>
                                    <th className="py-2.5 pr-3 font-medium">Estudiante</th>
                                    <th className="pr-3 font-medium">Grado</th>
                                    <th className="pr-3 font-medium">Representante</th>
                                    <th className="pr-3 font-medium text-right">Monto</th>
                                    <th className="pr-3 font-medium">Estado</th>
                                    <th className="pr-3 font-medium">Fecha de pago</th>
                                    <th className="text-right font-medium">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filas.map(f => {
                                    const p = separar(f.nombre);
                                    return (
                                        <tr key={`${f.alumno_id}-${f.monto_usd}`} className="transition-colors hover:bg-[var(--pb-light)]"
                                            style={{ borderTop: '1px solid var(--border)' }}>
                                            <td className="py-2.5 pr-3">
                                                <div className="flex items-center gap-2.5">
                                                    <InitialsAvatar nombre={p.nombre} apellido={p.apellido} color={BADGE[f.estado].avatar} />
                                                    <div className="min-w-0">
                                                        <p className="font-medium truncate" style={{ color: 'var(--jet)' }}>{f.nombre}</p>
                                                        <p className="text-[11px]" style={{ color: 'var(--ash)' }}>{f.cedula_escolar}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="pr-3 whitespace-nowrap" style={{ color: 'var(--jet-mid)' }}>{f.grado_seccion || '—'}</td>
                                            <td className="pr-3">
                                                <p style={{ color: 'var(--jet-mid)' }}>{f.representante?.nombre ?? '—'}</p>
                                                {f.representante?.telefono && (
                                                    <p className="text-[11px]" style={{ color: 'var(--ash)' }}>{f.representante.telefono}</p>
                                                )}
                                            </td>
                                            <td className="pr-3"><Monto fila={f} /></td>
                                            <td className="pr-3"><Estado fila={f} /></td>
                                            <td className="pr-3 whitespace-nowrap" style={{ color: 'var(--jet-mid)' }}>
                                                {f.fecha_pago ? fmtFecha(f.fecha_pago) : '—'}
                                            </td>
                                            <td><Acciones fila={f} onWhatsApp={setWhatsApp} /></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </TablaScroll>
                    <Paginacion {...listado} />
                </div>
            )}

            <ModalCobroWhatsApp open={Boolean(whatsApp)} onClose={() => setWhatsApp(null)} representante={whatsApp} />
        </section>
    );
}
