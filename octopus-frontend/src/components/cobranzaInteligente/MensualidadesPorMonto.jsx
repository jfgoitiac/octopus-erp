import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileText, LayoutList, Loader2, Search, Users } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-toastify';
import { Modal } from '../ui/Modal';
import { TablaScroll } from '../ui/TablaScroll';
import Pagination from '../shared/Pagination';
import GradoSelect from '../GradoSelect';
import MensualidadesPorGradoModal from './MensualidadesPorGradoModal';
import {
    exportarMensualidadesPorMontoExcel,
    getDetalleMensualidadesPorMonto,
    getMensualidadesPorMonto,
} from '../../api/cobranza.service';
import { fmt, fmtFecha } from '../../utils/format';

const PAGE_SIZE = 20;
const ESTADO = [
    { value: 'todos', label: 'Todos los estados' },
    { value: 'pagado', label: 'Pagados' },
    { value: 'pendiente', label: 'Pendientes' },
];

const descargar = (blob, nombre) => {
    const url = URL.createObjectURL(blob);
    const enlace = Object.assign(document.createElement('a'), { href: url, download: nombre });
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
};

const Estado = ({ estado }) => (
    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
        style={estado === 'pagado'
            ? { background: 'var(--green-light)', color: 'var(--green)' }
            : { background: 'var(--red-light)', color: 'var(--red)' }}>
        {estado === 'pagado' ? 'Pagado' : 'Pendiente'}
    </span>
);

function DetalleModal({ grupo, mes, sede, onClose }) {
    const [filtros, setFiltros] = useState({ buscar: '', grado_seccion: '', estado: 'todos' });
    const [page, setPage] = useState(1);
    const [datos, setDatos] = useState({ results: [], count: 0, resumen: null });
    const [loading, setLoading] = useState(true);
    const [exportando, setExportando] = useState(false);
    const [generandoPdf, setGenerandoPdf] = useState(false);
    const params = useMemo(() => ({
        mes: mes?.mes, anio: mes?.anio, sede, monto: grupo?.monto_usd, page, page_size: PAGE_SIZE,
        ...filtros,
    }), [mes, sede, grupo, page, filtros]);

    useEffect(() => { setPage(1); }, [grupo, filtros.buscar, filtros.grado_seccion, filtros.estado]);
    useEffect(() => {
        if (!grupo || !mes) return undefined;
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const response = await getDetalleMensualidadesPorMonto(params, controller.signal);
                setDatos(response.data);
            } catch (error) {
                if (error.code !== 'ERR_CANCELED') toast.error('No se pudo cargar el detalle de mensualidades.');
            } finally { setLoading(false); }
        }, 250);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [grupo, mes, params]);

    const exportarExcel = async () => {
        setExportando(true);
        try {
            const { page: _page, page_size: _pageSize, ...filtrosExportacion } = params;
            const response = await exportarMensualidadesPorMontoExcel(filtrosExportacion);
            descargar(new Blob([response.data], { type: response.headers['content-type'] }), `mensualidades_${grupo.monto_usd}_${mes.anio}-${mes.mes}.xlsx`);
        } catch { toast.error('No se pudo generar el Excel.'); }
        finally { setExportando(false); }
    };

    const exportarPdf = async () => {
        setGenerandoPdf(true);
        try {
            const base = { ...params, page_size: 100 };
            delete base.page;
            let pagina = 1;
            let filas = [];
            let response;
            do {
                response = await getDetalleMensualidadesPorMonto({ ...base, page: pagina });
                filas = filas.concat(response.data.results || []);
                pagina += 1;
            } while (response.data.next);
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const ancho = doc.internal.pageSize.getWidth();
            doc.setFontSize(16);
            doc.text('Detalle de mensualidades por monto', 14, 16);
            doc.setFontSize(9);
            doc.setTextColor(90);
            doc.text(`Mensualidad: $${fmt(grupo.monto_usd, 2)} · ${mes.etiqueta} · ${filas.length} estudiantes`, 14, 23);
            autoTable(doc, {
                startY: 29,
                head: [['Alumno', 'Cédula', 'Grado / sección', 'Representante', 'Mensualidad', 'Pagado', 'Saldo', 'Estado']],
                body: filas.map(f => [f.nombre, f.cedula_escolar || '—', f.grado_seccion || '—', f.representante?.nombre || '—',
                    `$${fmt(f.monto_usd, 2)}`, `$${fmt(f.monto_pagado_usd, 2)}`, `$${fmt(f.saldo_usd, 2)}`,
                    f.estado === 'pagado' ? 'Pagado' : 'Pendiente']),
                theme: 'grid',
                styles: { fontSize: 7, cellPadding: 1.8, overflow: 'linebreak' },
                headStyles: { fillColor: [31, 78, 121] },
                columnStyles: { 0: { cellWidth: 36 }, 1: { cellWidth: 24 }, 2: { cellWidth: 30 }, 3: { cellWidth: 40 }, 4: { cellWidth: 24 }, 5: { cellWidth: 22 }, 6: { cellWidth: 22 }, 7: { cellWidth: 22 } },
                margin: { left: 14, right: 14, bottom: 14 },
                didDrawPage: () => {
                    doc.setFontSize(7); doc.setTextColor(90);
                    doc.text(`Página ${doc.getNumberOfPages()}`, ancho - 14, doc.internal.pageSize.getHeight() - 7, { align: 'right' });
                },
            });
            doc.save(`mensualidades_${grupo.monto_usd}_${mes.anio}-${mes.mes}.pdf`);
        } catch { toast.error('No se pudo generar el PDF.'); }
        finally { setGenerandoPdf(false); }
    };

    const totalPages = Math.max(1, Math.ceil((datos.count || 0) / PAGE_SIZE));
    const cambiar = (campo) => (evento) => setFiltros(actual => ({ ...actual, [campo]: evento.target.value }));
    return <Modal open={Boolean(grupo)} onClose={onClose} titulo={`Alumnos con mensualidad de $${fmt(grupo?.monto_usd, 2)}`} size="xl"
        footer={<button type="button" className="btn btn-primary w-full sm:w-auto" onClick={onClose}>Cerrar</button>}>
        <div className="space-y-4">
            {datos.resumen && <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm" style={{ color: 'var(--ash)' }}>
                <span><b style={{ color: 'var(--jet)' }}>{datos.resumen.estudiantes}</b> estudiantes</span>
                <span>Facturado: <b style={{ color: 'var(--jet)' }}>${fmt(datos.resumen.total_facturado_usd, 2)}</b></span>
                <span>Pagados: <b style={{ color: 'var(--green)' }}>{datos.resumen.pagados}</b></span>
                <span>Pendientes: <b style={{ color: 'var(--red)' }}>{datos.resumen.pendientes}</b></span>
            </div>}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className="relative sm:col-span-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                    <input className="input w-full !pl-9" value={filtros.buscar} onChange={cambiar('buscar')} placeholder="Buscar alumno…" /></label>
                <GradoSelect value={filtros.grado_seccion} onChange={cambiar('grado_seccion')} incluirVacio etiquetaVacio="Todos los grados" className="input w-full" />
                <select value={filtros.estado} onChange={cambiar('estado')} className="input w-full">{ESTADO.map(opcion => <option key={opcion.value} value={opcion.value}>{opcion.label}</option>)}</select>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" className="btn btn-secondary" disabled={exportando} onClick={exportarExcel}>{exportando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Excel</button>
                <button type="button" className="btn btn-secondary" disabled={generandoPdf} onClick={exportarPdf}>{generandoPdf ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />} PDF</button>
            </div>
            <TablaScroll><table className="w-full min-w-[800px] text-sm"><thead><tr className="text-left text-xs uppercase" style={{ color: 'var(--ash)' }}>
                <th className="p-2">Alumno</th><th className="p-2">Grado / sección</th><th className="p-2">Representante</th><th className="p-2 text-right">Mensualidad</th><th className="p-2 text-right">Pagado</th><th className="p-2 text-right">Saldo</th><th className="p-2">Estado</th><th className="p-2">Fecha pago</th>
            </tr></thead><tbody>{loading ? <tr><td colSpan="8" className="p-8 text-center" style={{ color: 'var(--ash)' }}>Cargando…</td></tr> : datos.results?.length ? datos.results.map(fila => <tr key={fila.alumno_id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="p-2"><p className="font-medium">{fila.nombre}</p><p className="text-xs" style={{ color: 'var(--ash)' }}>{fila.cedula_escolar || '—'}</p></td><td className="p-2">{fila.grado_seccion || '—'}</td><td className="p-2">{fila.representante?.nombre || '—'}</td><td className="p-2 text-right tabular-nums">${fmt(fila.monto_usd, 2)}</td><td className="p-2 text-right tabular-nums">${fmt(fila.monto_pagado_usd, 2)}</td><td className="p-2 text-right tabular-nums font-medium">${fmt(fila.saldo_usd, 2)}</td><td className="p-2"><Estado estado={fila.estado} /></td><td className="p-2 whitespace-nowrap">{fila.fecha_pago ? fmtFecha(fila.fecha_pago) : '—'}</td>
            </tr>) : <tr><td colSpan="8" className="p-8 text-center" style={{ color: 'var(--ash)' }}>No hay alumnos con estos filtros.</td></tr>}</tbody></table></TablaScroll>
            {!loading && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={datos.count} pageSize={PAGE_SIZE} />}
        </div>
    </Modal>;
}

export default function MensualidadesPorMonto({ mes, sede }) {
    const [grupos, setGrupos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [grupoActivo, setGrupoActivo] = useState(null);
    const [porGradoAbierto, setPorGradoAbierto] = useState(false);
    const cerrarPorGrado = useCallback(() => setPorGradoAbierto(false), []);
    const cargar = useCallback(async (signal) => {
        if (!mes) { setGrupos([]); return; }
        setLoading(true);
        try {
            const response = await getMensualidadesPorMonto({ mes: mes.mes, anio: mes.anio, sede }, signal);
            setGrupos(response.data.grupos || []);
        } catch (error) {
            if (error.code !== 'ERR_CANCELED') toast.error('No se pudo cargar la distribución de mensualidades.');
        } finally { setLoading(false); }
    }, [mes, sede]);
    useEffect(() => { const controller = new AbortController(); cargar(controller.signal); return () => controller.abort(); }, [cargar]);

    const total = grupos.reduce((acumulado, grupo) => acumulado + Number(grupo.total_facturado_usd || 0), 0);
    return <section className="rounded-[var(--radius-card)] p-4 sm:p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4"><div className="min-w-0"><h2 className="flex items-center gap-2 text-base font-semibold" style={{ color: 'var(--jet)' }}><Users size={18} style={{ color: 'var(--pb)' }} />Distribución de mensualidades</h2><p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>Montos registrados para {mes?.etiqueta || 'el período seleccionado'}.</p></div><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"><span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--jet)' }}>Total: ${fmt(total, 2)}</span><button type="button" className="btn btn-secondary btn-sm w-full sm:w-auto" disabled={!mes || loading || !grupos.length} onClick={() => setPorGradoAbierto(true)}><LayoutList size={16} aria-hidden="true" />Ver detalles</button></div></div>
        {loading ? <div className="skeleton h-36" /> : !grupos.length ? <div className="py-10 text-center text-sm" style={{ color: 'var(--ash)' }}>No hay mensualidades registradas para este período.</div> : <TablaScroll><table className="w-full min-w-[580px] text-sm"><thead><tr className="text-left text-xs uppercase" style={{ color: 'var(--ash)' }}><th className="p-3">Mensualidad</th><th className="p-3 text-right">Estudiantes</th><th className="p-3 text-right">Total mensual</th><th className="p-3 text-right"><span className="sr-only">Ver detalle</span></th></tr></thead><tbody>{grupos.map(grupo => <tr key={grupo.monto_usd} className="hover:bg-[var(--pb-light)] cursor-pointer" style={{ borderTop: '1px solid var(--border)' }} onClick={() => setGrupoActivo(grupo)}><td className="p-3 font-semibold tabular-nums" style={{ color: 'var(--jet)' }}>${fmt(grupo.monto_usd, 2)}</td><td className="p-3 text-right tabular-nums">{grupo.estudiantes}</td><td className="p-3 text-right tabular-nums font-medium">${fmt(grupo.total_facturado_usd, 2)}</td><td className="p-3 text-right"><button type="button" className="btn btn-secondary btn-sm" onClick={(evento) => { evento.stopPropagation(); setGrupoActivo(grupo); }}>Ver detalle</button></td></tr>)}</tbody></table></TablaScroll>}
        <DetalleModal grupo={grupoActivo} mes={mes} sede={sede} onClose={() => setGrupoActivo(null)} />
        <MensualidadesPorGradoModal open={porGradoAbierto} onClose={cerrarPorGrado} mes={mes} sede={sede} />
    </section>;
}
