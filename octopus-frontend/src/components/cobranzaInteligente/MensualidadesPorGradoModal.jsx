import { useEffect, useMemo, useState } from 'react';
import {
    ChevronDown, ChevronsDownUp, ChevronsUpDown, FileSpreadsheet, FileText, GraduationCap, Layers, Loader2, Search, Users, Wallet,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import { Modal } from '../ui/Modal';
import { TablaScroll } from '../ui/TablaScroll';
import GradoSelect from '../GradoSelect';
import { getMensualidadesPorGrado } from '../../api/cobranza.service';
import { fmt } from '../../utils/format';

const SIN_GRADO = 'Sin grado';
const VACIO = { resumen: null, grados: [] };
// Con pocos grados (o filtrando) se muestran abiertos; con muchos, contraídos para no abrumar.
const MAX_GRADOS_ABIERTOS = 3;

const nombreGrado = (grado) => grado.grado_seccion || SIN_GRADO;
const claveGrado = (grado) => grado.grado_seccion || '__sin_grado__';
const nombreCompleto = (alumno) => [alumno.nombre, alumno.apellido].filter(Boolean).join(' ') || '—';

const Chip = ({ icono: Icono, etiqueta, valor }) => (
    <div className="flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 sm:px-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
            <Icono size={17} aria-hidden="true" />
        </span>
        <span className="min-w-0">
            <span className="block text-xs" style={{ color: 'var(--ash)' }}>{etiqueta}</span>
            <span className="block truncate text-sm font-semibold tabular-nums sm:text-base" style={{ color: 'var(--jet)' }}>{valor}</span>
        </span>
    </div>
);

function GradoSeccion({ grado, abierto, onToggle }) {
    const idCuerpo = `grado-${claveGrado(grado).replaceAll(/\s+/g, '-')}`;
    return (
        <div className="overflow-hidden rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <button type="button" onClick={onToggle} aria-expanded={abierto} aria-controls={idCuerpo}
                className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-[var(--pb-light)] sm:px-4">
                <ChevronDown size={18} aria-hidden="true" className={`shrink-0 transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`} style={{ color: 'var(--ash)' }} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold sm:text-base" style={{ color: grado.grado_seccion ? 'var(--jet)' : 'var(--ash)' }}>{nombreGrado(grado)}</span>
                    <span className="block text-xs" style={{ color: 'var(--ash)' }}>{grado.estudiantes} {grado.estudiantes === 1 ? 'estudiante' : 'estudiantes'}</span>
                </span>
                <span className="shrink-0 text-right">
                    <span className="block text-xs" style={{ color: 'var(--ash)' }}>Total</span>
                    <span className="block text-sm font-semibold tabular-nums sm:text-base" style={{ color: 'var(--jet)' }}>${fmt(grado.total_usd, 2)}</span>
                </span>
            </button>
            {abierto && <div id={idCuerpo} style={{ borderTop: '1px solid var(--border)' }}>
                {/* < sm: tarjetas apiladas (tres columnas con nombres largos no caben en 360px). */}
                <ul className="divide-y divide-[var(--border)] sm:hidden">
                    {grado.alumnos.map(alumno => <li key={alumno.alumno_id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                        <span className="min-w-0">
                            <span className="block text-sm font-medium break-words" style={{ color: 'var(--jet)' }}>{nombreCompleto(alumno)}</span>
                            <span className="block text-xs break-words" style={{ color: 'var(--ash)' }}>Rep.: {alumno.representante || '—'}</span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: 'var(--jet)' }}>${fmt(alumno.monto_usd, 2)}</span>
                    </li>)}
                </ul>
                {/* sm+: tabla dentro de TablaScroll, conserva su ancho mínimo. */}
                <div className="hidden px-4 pb-2 sm:block">
                    <TablaScroll>
                        <table className="w-full min-w-[560px] text-sm">
                            <thead><tr className="text-left text-xs uppercase" style={{ color: 'var(--ash)' }}>
                                <th className="p-2 font-medium">Alumno</th>
                                <th className="p-2 font-medium">Representante</th>
                                <th className="p-2 text-right font-medium">Mensualidad</th>
                            </tr></thead>
                            <tbody>{grado.alumnos.map(alumno => <tr key={alumno.alumno_id} style={{ borderTop: '1px solid var(--border)' }}>
                                <td className="p-2 font-medium" style={{ color: 'var(--jet)' }}>{nombreCompleto(alumno)}</td>
                                <td className="p-2" style={{ color: alumno.representante ? 'var(--jet)' : 'var(--ash)' }}>{alumno.representante || '—'}</td>
                                <td className="p-2 text-right tabular-nums whitespace-nowrap">${fmt(alumno.monto_usd, 2)}</td>
                            </tr>)}</tbody>
                        </table>
                    </TablaScroll>
                </div>
            </div>}
        </div>
    );
}

// El contenido solo se monta con el modal abierto: al cerrarlo, filtros y datos se descartan
// y la siguiente apertura empieza de cero sin efectos de "reset".
export default function MensualidadesPorGradoModal({ open, onClose, mes, sede }) {
    return open ? <ContenidoModal onClose={onClose} mes={mes} sede={sede} /> : null;
}

function ContenidoModal({ onClose, mes, sede }) {
    const [filtros, setFiltros] = useState({ buscar: '', grado_seccion: '' });
    // `datos.clave` identifica los parámetros con los que se obtuvo la respuesta;
    // mientras no coincida con los actuales, la vista está cargando.
    const [datos, setDatos] = useState({ ...VACIO, clave: null });
    const [abiertos, setAbiertos] = useState(() => new Set());
    const [generandoPdf, setGenerandoPdf] = useState(false);
    const [generandoExcel, setGenerandoExcel] = useState(false);

    const params = useMemo(() => {
        const base = { mes: mes?.mes, anio: mes?.anio, sede };
        if (filtros.buscar.trim()) base.buscar = filtros.buscar.trim();
        if (filtros.grado_seccion) base.grado_seccion = filtros.grado_seccion;
        return base;
    }, [mes, sede, filtros]);

    const claveParams = JSON.stringify(params);

    useEffect(() => {
        if (!mes) return undefined;
        const controller = new AbortController();
        const clave = JSON.stringify(params);
        const timer = setTimeout(async () => {
            try {
                const response = await getMensualidadesPorGrado(params, controller.signal);
                const grados = response.data?.grados || [];
                setDatos({ resumen: response.data?.resumen || null, grados, clave });
                const expandir = grados.length <= MAX_GRADOS_ABIERTOS || Boolean(params.buscar) || Boolean(params.grado_seccion);
                setAbiertos(new Set(expandir ? grados.map(claveGrado) : []));
            } catch (error) {
                if (error.code === 'ERR_CANCELED') return;
                toast.error('No se pudo cargar el detalle de mensualidades por grado.');
                setDatos({ ...VACIO, clave });
            }
        }, 250);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [mes, params]);

    const loading = Boolean(mes) && datos.clave !== claveParams;

    const grados = datos.grados;
    const resumen = datos.resumen;
    const hayDatos = grados.length > 0;
    const todosAbiertos = hayDatos && grados.every(grado => abiertos.has(claveGrado(grado)));
    const filtrando = Boolean(filtros.buscar.trim() || filtros.grado_seccion);
    const periodo = mes?.etiqueta || '';
    const nombreArchivo = `mensualidades_por_grado_${mes?.anio}-${mes?.mes}`;

    const alternar = (clave) => setAbiertos(actual => {
        const siguiente = new Set(actual);
        if (siguiente.has(clave)) siguiente.delete(clave); else siguiente.add(clave);
        return siguiente;
    });
    const alternarTodos = () => setAbiertos(todosAbiertos ? new Set() : new Set(grados.map(claveGrado)));
    const cambiar = (campo) => (evento) => setFiltros(actual => ({ ...actual, [campo]: evento.target.value }));

    const exportarPdf = async () => {
        setGenerandoPdf(true);
        try {
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const ancho = doc.internal.pageSize.getWidth();
            const alto = doc.internal.pageSize.getHeight();
            doc.setFontSize(16);
            doc.setTextColor(30);
            doc.text('Mensualidades por grado', 14, 16);
            doc.setFontSize(9);
            doc.setTextColor(90);
            doc.text(`Período: ${periodo}${filtrando ? ' · resultados filtrados' : ''}`, 14, 23);
            doc.text(`${resumen?.estudiantes ?? 0} estudiantes · ${resumen?.grados ?? grados.length} grados · Total: $${fmt(resumen?.total_usd, 2)}`, 14, 28);
            let y = 36;
            grados.forEach(grado => {
                if (y > alto - 40) { doc.addPage(); y = 18; }
                doc.setFontSize(11);
                doc.setTextColor(31, 78, 121);
                doc.text(`${nombreGrado(grado)} · ${grado.estudiantes} estudiantes`, 14, y);
                autoTable(doc, {
                    startY: y + 2,
                    head: [['Alumno', 'Representante', 'Mensualidad']],
                    body: grado.alumnos.map(alumno => [nombreCompleto(alumno), alumno.representante || '—', `$${fmt(alumno.monto_usd, 2)}`]),
                    foot: [[{ content: `Total ${nombreGrado(grado)}`, colSpan: 2 }, `$${fmt(grado.total_usd, 2)}`]],
                    showFoot: 'lastPage',
                    theme: 'grid',
                    styles: { fontSize: 8, cellPadding: 1.8, overflow: 'linebreak' },
                    headStyles: { fillColor: [31, 78, 121] },
                    footStyles: { fillColor: [232, 239, 246], textColor: [30, 30, 30], fontStyle: 'bold' },
                    columnStyles: { 0: { cellWidth: 72 }, 1: { cellWidth: 72 }, 2: { cellWidth: 38, halign: 'right' } },
                    margin: { left: 14, right: 14, bottom: 14 },
                });
                y = doc.lastAutoTable.finalY + 10;
            });
            const paginas = doc.getNumberOfPages();
            for (let pagina = 1; pagina <= paginas; pagina += 1) {
                doc.setPage(pagina);
                doc.setFontSize(7);
                doc.setTextColor(90);
                doc.text(`Página ${pagina} de ${paginas}`, ancho - 14, alto - 7, { align: 'right' });
            }
            doc.save(`${nombreArchivo}.pdf`);
        } catch { toast.error('No se pudo generar el PDF.'); }
        finally { setGenerandoPdf(false); }
    };

    const exportarExcel = () => {
        setGenerandoExcel(true);
        try {
            const columnaMonto = 'Mensualidad (USD)';
            const filas = grados.flatMap(grado => grado.alumnos.map(alumno => ({
                Grado: nombreGrado(grado),
                Nombre: alumno.nombre || '',
                Apellido: alumno.apellido || '',
                Representante: alumno.representante || '',
                [columnaMonto]: Number(alumno.monto_usd || 0),
            })));
            const hoja = XLSX.utils.json_to_sheet(filas, { header: ['Grado', 'Nombre', 'Apellido', 'Representante', columnaMonto] });
            for (let fila = 1; fila <= filas.length; fila += 1) {
                const celda = hoja[XLSX.utils.encode_cell({ r: fila, c: 4 })];
                if (celda) celda.z = '#,##0.00';
            }
            hoja['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 30 }, { wch: 18 }];

            const filasResumen = grados.map(grado => ({ Grado: nombreGrado(grado), Estudiantes: grado.estudiantes, 'Total (USD)': Number(grado.total_usd || 0) }));
            filasResumen.push({ Grado: 'Total', Estudiantes: resumen?.estudiantes ?? 0, 'Total (USD)': Number(resumen?.total_usd || 0) });
            const hojaResumen = XLSX.utils.json_to_sheet(filasResumen);
            for (let fila = 1; fila <= filasResumen.length; fila += 1) {
                const celda = hojaResumen[XLSX.utils.encode_cell({ r: fila, c: 2 })];
                if (celda) celda.z = '#,##0.00';
            }
            hojaResumen['!cols'] = [{ wch: 18 }, { wch: 13 }, { wch: 16 }];

            const libro = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(libro, hoja, 'Detalle');
            XLSX.utils.book_append_sheet(libro, hojaResumen, 'Resumen por grado');
            XLSX.writeFile(libro, `${nombreArchivo}.xlsx`);
        } catch { toast.error('No se pudo generar el Excel.'); }
        finally { setGenerandoExcel(false); }
    };

    return <Modal open onClose={onClose} titulo={`Mensualidades por grado · ${periodo}`} size="xl"
        footer={<button type="button" className="btn btn-primary w-full sm:w-auto" onClick={onClose}>Cerrar</button>}>
        <div className="space-y-4">
            {/* Resumen */}
            {loading && !resumen
                ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
                : <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <Chip icono={Users} etiqueta="Estudiantes" valor={fmt(resumen?.estudiantes)} />
                    <Chip icono={Wallet} etiqueta="Total mensual" valor={`$${fmt(resumen?.total_usd, 2)}`} />
                    <Chip icono={Layers} etiqueta="Grados" valor={fmt(resumen?.grados ?? grados.length)} />
                </div>}

            {/* Filtros */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="relative">
                    <span className="sr-only">Buscar alumno o representante</span>
                    <Search size={15} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                    <input className="input w-full !pl-9" value={filtros.buscar} onChange={cambiar('buscar')} placeholder="Buscar alumno o representante…" />
                </label>
                <GradoSelect value={filtros.grado_seccion} onChange={cambiar('grado_seccion')} incluirVacio etiquetaVacio="Todos los grados" className="input w-full" />
            </div>

            {/* Acciones */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <button type="button" className="btn btn-secondary btn-sm w-full sm:w-auto" disabled={loading || !hayDatos} onClick={alternarTodos}>
                    {todosAbiertos ? <ChevronsDownUp size={16} aria-hidden="true" /> : <ChevronsUpDown size={16} aria-hidden="true" />}
                    {todosAbiertos ? 'Contraer todo' : 'Expandir todo'}
                </button>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <button type="button" className="btn btn-secondary btn-sm w-full sm:w-auto" disabled={loading || !hayDatos || generandoPdf} onClick={exportarPdf}>
                        {generandoPdf ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />} PDF
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm w-full sm:w-auto" disabled={loading || !hayDatos || generandoExcel} onClick={exportarExcel}>
                        {generandoExcel ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <FileSpreadsheet size={16} aria-hidden="true" />} Excel
                    </button>
                </div>
            </div>

            {/* Grados */}
            {loading
                ? <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
                : !hayDatos
                    ? <div className="flex flex-col items-center gap-2 rounded-xl px-4 py-10 text-center" style={{ border: '1px dashed var(--border)', color: 'var(--ash)' }}>
                        <GraduationCap size={28} aria-hidden="true" />
                        <p className="text-sm">{filtrando ? 'No hay alumnos que coincidan con estos filtros.' : 'No hay mensualidades registradas para este período.'}</p>
                    </div>
                    : <div className="space-y-2">
                        {grados.map(grado => <GradoSeccion key={claveGrado(grado)} grado={grado}
                            abierto={abiertos.has(claveGrado(grado))} onToggle={() => alternar(claveGrado(grado))} />)}
                    </div>}
        </div>
    </Modal>;
}
