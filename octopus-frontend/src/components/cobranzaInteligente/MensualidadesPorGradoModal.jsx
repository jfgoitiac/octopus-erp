import { useEffect, useMemo, useState } from 'react';
import {
    ArrowDownUp, ChevronRight, FileSpreadsheet, FileText, GraduationCap, Layers, Loader2, Search, Users,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import { Modal } from '../ui/Modal';
import { Card } from '../ui/Card';
import { Tabla } from '../ui/Tabla';
import { getMensualidadesPorGrado } from '../../api/cobranza.service';
import { nombreGradoCompleto } from '../../hooks/useMatriculaGrado';
import { coincideBusqueda } from '../../utils/busqueda';
import { fmt } from '../../utils/format';

// Mismo patrón que el módulo de Grados: panel de grados a la izquierda y
// listado del grado elegido a la derecha. "Todos" muestra el listado general.
const TODOS = '__todos__';
const SIN_GRADO = '__sin_grado__';

const ORDEN_OPTS = [
    { value: 'apellido', label: 'Alfabético' },
    { value: 'monto', label: 'Por monto' },
];

const claveGrado = (grado) => grado.grado_seccion || SIN_GRADO;
const nombreGrado = (gradoSeccion) => (gradoSeccion ? nombreGradoCompleto(gradoSeccion) : 'Sin grado');
const nombreCompleto = (alumno) => [alumno.nombre, alumno.apellido].filter(Boolean).join(' ') || '—';
const porApellido = (a, b) => `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, 'es');

const comparar = {
    apellido: porApellido,
    monto: (a, b) => Number(b.monto_usd) - Number(a.monto_usd) || porApellido(a, b),
};

function SkeletonGrados() {
    return (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Cargando grados">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: 'var(--border-md)', opacity: 1 - i * 0.1 }} />
            ))}
        </div>
    );
}

function SkeletonTabla() {
    return (
        <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }} aria-busy="true" aria-label="Cargando alumnos">
            <div className="h-10 animate-pulse" style={{ background: 'var(--porcelain)' }} />
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-4 px-4 py-3 animate-pulse" style={{ borderTop: '0.5px solid var(--border-md)' }}>
                    <div className="h-4 w-6 rounded" style={{ background: 'var(--border-md)' }} />
                    <div className="h-4 flex-1 rounded" style={{ background: 'var(--border-md)' }} />
                    <div className="h-4 flex-1 rounded" style={{ background: 'var(--border-md)' }} />
                    <div className="h-4 w-16 rounded" style={{ background: 'var(--border-md)' }} />
                </div>
            ))}
        </div>
    );
}

function GradoBoton({ icono: Icono = GraduationCap, etiqueta, cantidad, activo, onClick }) {
    return (
        <button type="button" aria-pressed={activo} onClick={onClick}
            className={[
                'flex w-full items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-left transition-all',
                activo
                    ? 'bg-[var(--pb)] text-white font-semibold'
                    : 'bg-[var(--porcelain)] text-[var(--jet)] font-normal hover:bg-[var(--ash-light)]',
            ].join(' ')}
            style={{ border: activo ? 'none' : '0.5px solid var(--border-md)' }}>
            <span className="flex min-w-0 items-center gap-2.5">
                <Icono size={14} className="shrink-0" />
                <span className="truncate text-sm">{etiqueta}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ background: activo ? 'rgba(255,255,255,0.25)' : 'var(--pb-light)', color: activo ? '#fff' : 'var(--pb-mid)' }}>
                    {cantidad}
                </span>
                <ChevronRight size={12} className="opacity-60" />
            </span>
        </button>
    );
}

export default function MensualidadesPorGradoModal({ open, onClose, mes, sede }) {
    // El contenido solo se monta con el modal abierto: al cerrarlo se descarta el estado.
    return open ? <ContenidoModal onClose={onClose} mes={mes} sede={sede} /> : null;
}

function ContenidoModal({ onClose, mes, sede }) {
    const [datos, setDatos] = useState(null);
    const [seleccion, setSeleccion] = useState(TODOS);
    const [buscar, setBuscar] = useState('');
    const [orden, setOrden] = useState('apellido');
    const [exportando, setExportando] = useState(null);

    useEffect(() => {
        if (!mes) return undefined;
        const controller = new AbortController();
        getMensualidadesPorGrado({ mes: mes.mes, anio: mes.anio, sede }, controller.signal)
            .then(response => setDatos({ resumen: response.data?.resumen || null, grados: response.data?.grados || [] }))
            .catch(error => {
                if (error.code === 'ERR_CANCELED') return;
                toast.error('No se pudo cargar el listado de mensualidades por grado.');
                setDatos({ resumen: null, grados: [] });
            });
        return () => controller.abort();
    }, [mes, sede]);

    const loading = !datos;
    const grados = useMemo(() => datos?.grados || [], [datos]);
    const esTodos = seleccion === TODOS;
    const gradoActivo = esTodos ? null : grados.find(grado => claveGrado(grado) === seleccion);
    const tituloListado = esTodos ? 'Todos los grados' : nombreGrado(gradoActivo?.grado_seccion);

    // Filas del listado visible: el grado elegido o todos (con su grado en cada fila).
    const alumnos = useMemo(() => {
        const origen = esTodos ? grados : grados.filter(grado => claveGrado(grado) === seleccion);
        const filas = origen.flatMap(grado => grado.alumnos.map(alumno => ({ ...alumno, grado_seccion: grado.grado_seccion })));
        const filtradas = buscar.trim()
            ? filas.filter(alumno => coincideBusqueda(`${alumno.nombre} ${alumno.apellido} ${alumno.representante || ''}`, buscar))
            : filas;
        // En "Todos" con orden alfabético se conserva el agrupado por grado que entrega la API.
        return esTodos && orden === 'apellido' ? filtradas : [...filtradas].sort(comparar[orden]);
    }, [grados, seleccion, esTodos, buscar, orden]);

    const totalListado = alumnos.reduce((suma, alumno) => suma + Number(alumno.monto_usd || 0), 0);
    const periodo = mes?.etiqueta || '';
    const sufijoGrado = esTodos ? 'todos_los_grados' : (gradoActivo?.grado_seccion || 'sin_grado').replace(/\s+/g, '_');
    const nombreArchivo = `mensualidades_${sufijoGrado}_${mes?.anio}-${mes?.mes}`;

    const seleccionar = (clave) => { setSeleccion(clave); setBuscar(''); };

    const exportarPdf = () => {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const ancho = doc.internal.pageSize.getWidth();
        const alto = doc.internal.pageSize.getHeight();
        doc.setFontSize(16);
        doc.setTextColor(30);
        doc.text(`Mensualidades · ${tituloListado}`, 14, 16);
        doc.setFontSize(9);
        doc.setTextColor(90);
        doc.text(`Período: ${periodo}${buscar.trim() ? ' · resultados filtrados' : ''}`, 14, 23);
        doc.text(`${alumnos.length} estudiantes · Total: $${fmt(totalListado, 2)}`, 14, 28);
        const head = esTodos ? ['#', 'Grado', 'Alumno', 'Representante', 'Mensualidad'] : ['#', 'Alumno', 'Representante', 'Mensualidad'];
        autoTable(doc, {
            startY: 33,
            head: [head],
            body: alumnos.map((alumno, i) => [
                i + 1,
                ...(esTodos ? [nombreGrado(alumno.grado_seccion)] : []),
                nombreCompleto(alumno), alumno.representante || '—', `$${fmt(alumno.monto_usd, 2)}`,
            ]),
            foot: [[{ content: 'Total', colSpan: head.length - 1 }, `$${fmt(totalListado, 2)}`]],
            showFoot: 'lastPage',
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 1.8, overflow: 'linebreak' },
            headStyles: { fillColor: [31, 78, 121] },
            footStyles: { fillColor: [232, 239, 246], textColor: [30, 30, 30], fontStyle: 'bold' },
            columnStyles: { 0: { cellWidth: 10 }, [head.length - 1]: { halign: 'right', cellWidth: 28 } },
            margin: { left: 14, right: 14, bottom: 14 },
        });
        const paginas = doc.getNumberOfPages();
        for (let pagina = 1; pagina <= paginas; pagina += 1) {
            doc.setPage(pagina);
            doc.setFontSize(7);
            doc.setTextColor(90);
            doc.text(`Página ${pagina} de ${paginas}`, ancho - 14, alto - 7, { align: 'right' });
        }
        doc.save(`${nombreArchivo}.pdf`);
    };

    const exportarExcel = () => {
        const columnaMonto = 'Mensualidad (USD)';
        const filas = alumnos.map((alumno, i) => ({
            '#': i + 1,
            Grado: nombreGrado(alumno.grado_seccion),
            Nombre: alumno.nombre || '',
            Apellido: alumno.apellido || '',
            Representante: alumno.representante || '',
            [columnaMonto]: Number(alumno.monto_usd || 0),
        }));
        filas.push({ '#': '', Grado: '', Nombre: '', Apellido: '', Representante: 'Total', [columnaMonto]: totalListado });
        const hoja = XLSX.utils.json_to_sheet(filas, { header: ['#', 'Grado', 'Nombre', 'Apellido', 'Representante', columnaMonto] });
        for (let fila = 1; fila <= filas.length; fila += 1) {
            const celda = hoja[XLSX.utils.encode_cell({ r: fila, c: 5 })];
            if (celda) celda.z = '#,##0.00';
        }
        hoja['!cols'] = [{ wch: 5 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 30 }, { wch: 18 }];
        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, hoja, 'Mensualidades');
        XLSX.writeFile(libro, `${nombreArchivo}.xlsx`);
    };

    const exportar = (tipo) => {
        setExportando(tipo);
        try {
            if (tipo === 'excel') exportarExcel(); else exportarPdf();
            toast.success(`Archivo ${tipo.toUpperCase()} descargado.`);
        } catch {
            toast.error(`No se pudo exportar el archivo ${tipo.toUpperCase()}.`);
        } finally { setExportando(null); }
    };

    const columnas = [
        { key: 'num', label: '#' },
        ...(esTodos ? [{ key: 'grado', label: 'Grado' }] : []),
        { key: 'alumno', label: 'Alumno' },
        { key: 'representante', label: 'Representante' },
        { key: 'monto', label: 'Mensualidad', align: 'right' },
    ];
    const bloqueado = loading || exportando !== null || alumnos.length === 0;

    return <Modal open onClose={onClose} titulo={`Mensualidades por grado · ${periodo}`} size="xl"
        footer={<button type="button" className="btn btn-primary w-full sm:w-auto" onClick={onClose}>Cerrar</button>}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            {/* Panel de grados */}
            <div className="w-full lg:w-56 lg:shrink-0">
                {/* < lg: selector compacto para no empujar el listado fuera de la pantalla. */}
                <label className="block lg:hidden">
                    <span className="sr-only">Seleccionar grado</span>
                    <select className="input w-full" value={seleccion} disabled={loading} onChange={e => seleccionar(e.target.value)}>
                        <option value={TODOS}>Todos los grados ({datos?.resumen?.estudiantes ?? 0})</option>
                        {grados.map(grado => <option key={claveGrado(grado)} value={claveGrado(grado)}>{nombreGrado(grado.grado_seccion)} ({grado.estudiantes})</option>)}
                    </select>
                </label>
                <nav aria-label="Lista de grados" className="hidden lg:flex lg:flex-col lg:gap-2">
                    {loading ? <SkeletonGrados /> : <>
                        <GradoBoton icono={Layers} etiqueta="Todos los grados" cantidad={datos?.resumen?.estudiantes ?? 0}
                            activo={esTodos} onClick={() => seleccionar(TODOS)} />
                        {grados.map(grado => <GradoBoton key={claveGrado(grado)} etiqueta={nombreGrado(grado.grado_seccion)} cantidad={grado.estudiantes}
                            activo={seleccion === claveGrado(grado)} onClick={() => seleccionar(claveGrado(grado))} />)}
                    </>}
                </nav>
            </div>

            {/* Listado */}
            <div className="flex min-w-0 w-full flex-1 flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                    <GraduationCap size={16} style={{ color: 'var(--pb)' }} />
                    <span className="font-semibold text-base" style={{ color: 'var(--jet)' }}>{tituloListado}</span>
                    {!loading && <>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
                            {alumnos.length} alumno{alumnos.length !== 1 ? 's' : ''}
                        </span>
                        <span className="ml-auto text-sm font-semibold tabular-nums" style={{ color: 'var(--jet)' }}>Total: ${fmt(totalListado, 2)}</span>
                    </>}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                    <label className="relative w-full sm:mr-auto sm:w-64">
                        <span className="sr-only">Buscar alumno o representante</span>
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                        <input type="text" placeholder="Buscar alumno o representante..." value={buscar} onChange={e => setBuscar(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 rounded-lg outline-none"
                            style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)', fontSize: '16px' }} />
                    </label>
                    <div role="group" aria-label="Ordenar alumnos" className="flex items-center gap-1.5 rounded-lg p-1"
                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                        <ArrowDownUp size={13} aria-hidden style={{ color: 'var(--ash)', marginLeft: 4 }} />
                        {ORDEN_OPTS.map(opt => (
                            <button key={opt.value} type="button" aria-pressed={orden === opt.value} onClick={() => setOrden(opt.value)}
                                className="flex-1 px-3 py-1 rounded-md text-xs font-medium transition-all sm:flex-none"
                                style={{ background: orden === opt.value ? 'var(--pb)' : 'transparent', color: orden === opt.value ? '#fff' : 'var(--ash)' }}>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                        <button type="button" onClick={() => exportar('excel')} disabled={bloqueado}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                            style={{ background: '#16A34A', color: '#fff' }}>
                            {exportando === 'excel' ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Excel
                        </button>
                        <button type="button" onClick={() => exportar('pdf')} disabled={bloqueado}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                            style={{ background: '#DC2626', color: '#fff' }}>
                            {exportando === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} PDF
                        </button>
                    </div>
                </div>

                {loading ? <SkeletonTabla /> : alumnos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl py-16" style={{ border: '1px dashed var(--border-md)', color: 'var(--ash)' }}>
                        <Users size={32} className="mb-2 opacity-30" />
                        <p className="text-sm">{buscar ? 'Sin resultados para la búsqueda' : 'Sin mensualidades en este grado'}</p>
                    </div>
                ) : (
                    <Card padding="none">
                        <Tabla columnas={columnas} minWidth={esTodos ? 620 : 480}>
                            {alumnos.map((alumno, idx) => (
                                <tr key={`${claveGrado(alumno)}-${alumno.alumno_id}`}>
                                    <td className="px-3 py-3 sm:px-4 align-middle text-xs w-9" style={{ color: 'var(--ash)' }}>{idx + 1}</td>
                                    {esTodos && <td className="px-3 py-3 sm:px-4 align-middle whitespace-nowrap text-xs" style={{ color: 'var(--ash)' }}>{nombreGrado(alumno.grado_seccion)}</td>}
                                    <td className="px-3 py-3 sm:px-4 align-middle font-medium" style={{ color: 'var(--jet)' }}>{nombreCompleto(alumno)}</td>
                                    <td className="px-3 py-3 sm:px-4 align-middle" style={{ color: alumno.representante ? 'var(--jet)' : 'var(--ash)' }}>{alumno.representante || '—'}</td>
                                    <td className="px-3 py-3 sm:px-4 align-middle text-right tabular-nums whitespace-nowrap font-semibold" style={{ color: 'var(--jet)' }}>${fmt(alumno.monto_usd, 2)}</td>
                                </tr>
                            ))}
                        </Tabla>
                    </Card>
                )}
            </div>
        </div>
    </Modal>;
}
