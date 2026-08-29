import { useState, useEffect, useCallback } from 'react';
import {
    Download, DollarSign, Wallet, Hash, Loader2,
    Search, FileSpreadsheet, Printer,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import DatePickerES from '../DatePickerES';
import axiosInstance from '../../api/apiClient';
import { toast } from 'react-toastify';
import { CardSkeleton } from '../shared/Skeleton';
import { today, fmt, fmtInt, getErrorMessage, METODO_LABELS, ESTATUS_STYLE, inputStyle } from '../../constants/reportes';
import { Card } from '../ui/Card';

const CierreCajaTab = () => {
    const [caja, setCaja] = useState({
        efectivo: 0, zelle: 0,
        transferencia: 0, transf_bancaria: 0, pago_movil: 0, punto_venta: 0, efectivo_bs: 0,
        total_usd: 0, total_ves: 0, conteo_pagos: 0,
    });
    const [loadingCierre, setLoadingCierre] = useState(true);
    const [fechaInicio, setFechaInicio] = useState(today);
    const [fechaFin, setFechaFin] = useState(today);
    const [exportingExcel, setExportingExcel] = useState(false);
    const [printingDetalle, setPrintingDetalle] = useState(false);

    const fetchCierre = useCallback(async (fi, ff) => {
        if (fi > ff) {
            toast.warning('La fecha de inicio no puede ser mayor a la fecha fin.');
            return;
        }
        setLoadingCierre(true);
        try {
            const res = await axiosInstance.get('cobranza/auditoria-diaria/', {
                params: { fecha_inicio: fi, fecha_fin: ff },
            });
            setCaja({
                efectivo:       res.data.efectivo_usd           || 0,
                zelle:          res.data.zelle_usd              || 0,
                transferencia:  res.data.transferencia_ves      || 0,
                transf_bancaria: res.data.transf_bancaria_ves   || 0,
                pago_movil:     res.data.pago_movil_ves         || 0,
                punto_venta:    res.data.punto_venta_ves        || 0,
                efectivo_bs:    res.data.efectivo_bolivares_ves || 0,
                total_usd:      res.data.total_usd              || 0,
                total_ves:      res.data.total_ves              || 0,
                conteo_pagos:   res.data.conteo_pagos           || 0,
            });
        } catch (err) {
            toast.error(getErrorMessage(err, 'No se pudo cargar el resumen de caja.'));
        } finally {
            setLoadingCierre(false);
        }
    }, []);

    useEffect(() => { fetchCierre(today(), today()); }, [fetchCierre]);

    const handleExportExcel = async () => {
        setExportingExcel(true);
        try {
            const res = await axiosInstance.get('cobranza/exportar-excel/', {
                params: { fecha_inicio: fechaInicio, fecha_fin: fechaFin },
                responseType: 'blob',
            });
            const url = URL.createObjectURL(new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }));
            const a = Object.assign(document.createElement('a'), {
                href: url,
                download: `reporte_cobranza_${fechaInicio}_${fechaFin}.xlsx`,
            });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Archivo Excel descargado.');
        } catch (err) {
            toast.error(getErrorMessage(err, 'No se pudo generar el Excel.'));
        } finally {
            setExportingExcel(false);
        }
    };

    const handleExportCSV = () => {
        const rows = [
            ['Concepto', 'Valor'],
            ['Total USD', caja.total_usd],
            ['Efectivo USD', caja.efectivo],
            ['Transferencias VES', caja.transferencia],
            ['Total VES', caja.total_ves],
            ['Cantidad de Pagos', caja.conteo_pagos],
            ['Fecha Inicio', fechaInicio],
            ['Fecha Fin', fechaFin],
        ];
        const csv = rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const a = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(blob),
            download: `reporte_${fechaInicio}_${fechaFin}.csv`,
        });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        toast.success('Archivo CSV descargado.');
    };

    const handlePrintDetalle = async () => {
        setPrintingDetalle(true);
        try {
            const res = await axiosInstance.get('cobranza/pagos/lista/', {
                params: { fecha_desde: fechaInicio, fecha_hasta: fechaFin, page_size: 5000 },
            });
            const pagos = res.data?.results || res.data || [];

            if (!pagos.length) {
                toast.info('No hay transacciones en el período seleccionado.');
                return;
            }

            const labelMetodo = (p) =>
                p.metodo_pago_display || METODO_LABELS[p.metodo_pago] || p.metodo_pago || '—';

            // Agrupa por representante (mismo criterio que la conciliación en
            // pantalla) para mostrar, junto a sus pagos, su situación financiera.
            const representantesMap = new Map();
            pagos.forEach(p => {
                const key = p.representante_id ?? p.representante_documento ?? p.representante_nombre;
                if (!representantesMap.has(key)) {
                    representantesMap.set(key, {
                        representante_id: p.representante_id,
                        nombre: p.representante_nombre || '—',
                        cedula: p.representante_documento || '—',
                        pagos: [],
                    });
                }
                representantesMap.get(key).pagos.push(p);
            });
            const representantes = Array.from(representantesMap.values());

            // Deuda pendiente, meses adeudados y teléfono actuales de cada
            // representante, consultados en vivo al backend.
            const idsUnicos = [...new Set(representantes.map(r => r.representante_id).filter(Boolean))];
            let resumenFinanciero = {};
            if (idsUnicos.length) {
                try {
                    const resFin = await axiosInstance.get('cobranza/representantes/resumen-financiero/', {
                        params: { representante_ids: idsUnicos.join(',') },
                    });
                    resumenFinanciero = resFin.data || {};
                } catch {
                    toast.warning('No se pudo cargar la deuda pendiente de los representantes.');
                }
            }

            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pageHeight = doc.internal.pageSize.getHeight();

            // Encabezado
            doc.setFontSize(15);
            doc.setFont('helvetica', 'bold');
            doc.text('Resumen de Transacciones Detalladas', 14, 18);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100);
            doc.text(`Período: ${fechaInicio}  —  ${fechaFin}`, 14, 25);
            doc.text(
                `Generado: ${new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })}`,
                14, 30,
            );
            doc.setTextColor(0);

            let cursorY = 38;
            representantes.forEach((rep) => {
                if (cursorY > pageHeight - 30) {
                    doc.addPage();
                    cursorY = 18;
                }

                const fin = resumenFinanciero[String(rep.representante_id)];
                const deuda = fin ? parseFloat(fin.monto_adeudado || 0) : null;
                const meses = fin ? fin.meses_adeudados || 0 : null;
                const telefono = fin?.telefono || '—';
                const alumnos = fin?.alumnos?.length ? fin.alumnos.join(', ') : '—';

                doc.setFontSize(10.5);
                doc.setFont('helvetica', 'bold');
                doc.text(rep.nombre, 14, cursorY);
                doc.setFontSize(8.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(90);
                doc.text(
                    `Cédula: ${rep.cedula}   ·   Teléfono: ${telefono}`,
                    14, cursorY + 4.5,
                );
                const deudaTexto = deuda === null
                    ? 'Deuda pendiente: no disponible'
                    : `Deuda pendiente: $${deuda.toFixed(2)}${meses ? ` (${meses} mensualidad${meses === 1 ? '' : 'es'})` : ''}`;
                if (deuda === null) doc.setTextColor(140);
                else if (deuda > 0) doc.setTextColor(185, 28, 28);
                else doc.setTextColor(22, 132, 65);
                doc.setFont('helvetica', 'bold');
                doc.text(deudaTexto, 14, cursorY + 9);
                doc.setTextColor(90);
                doc.setFont('helvetica', 'normal');
                const alumnosLineas = doc.splitTextToSize(`Representados: ${alumnos}`, 260);
                doc.text(alumnosLineas, 14, cursorY + 13.5);
                doc.setTextColor(0);
                cursorY += 13.5 + alumnosLineas.length * 4;

                autoTable(doc, {
                    head: [['#', 'Fecha', 'Alumno', 'Concepto', 'Método', 'Banco', 'Monto USD', 'Tasa', 'Monto Bs.', 'Cajero', 'N° Comprobante', 'Estatus']],
                    body: rep.pagos.map((p, i) => {
                        const fecha = p.fecha_pago
                            ? new Date(p.fecha_pago).toLocaleDateString('es-VE', {
                                  day: '2-digit', month: '2-digit', year: 'numeric',
                              })
                            : '—';
                        const alumno = `${p.nombre_alumno || ''} ${p.apellido_alumno || ''}`.trim() || '—';
                        const concepto = p.concepto_display || p.concepto || '—';
                        const banco = p.banco_nombre || '—';
                        const montoUsd = parseFloat(p.monto_usd || 0).toFixed(2);
                        const tasa = p.tasa_aplicada ? parseFloat(p.tasa_aplicada).toFixed(2) : '—';
                        const montoBs = parseFloat(p.monto_ves || 0).toFixed(2);
                        const cajero = p.cajero || '—';
                        const ref = p.referencia || '—';
                        const estatus = ESTATUS_STYLE[p.estatus]?.label || p.estatus || '—';
                        return [i + 1, fecha, alumno, concepto, labelMetodo(p), banco, `$${montoUsd}`, tasa, `Bs. ${montoBs}`, cajero, ref, estatus];
                    }),
                    startY: cursorY,
                    styles: { fontSize: 6.5, cellPadding: 1.5, overflow: 'linebreak' },
                    headStyles: { fillColor: [30, 64, 175], fontStyle: 'bold', fontSize: 7 },
                    alternateRowStyles: { fillColor: [248, 250, 252] },
                    columnStyles: {
                        0: { halign: 'center', cellWidth: 7 },
                        1: { cellWidth: 17 },
                        2: { cellWidth: 32 },
                        3: { cellWidth: 24 },
                        4: { cellWidth: 22 },
                        5: { cellWidth: 20 },
                        6: { halign: 'right', cellWidth: 17 },
                        7: { halign: 'right', cellWidth: 13 },
                        8: { halign: 'right', cellWidth: 20 },
                        9: { cellWidth: 20 },
                        10: { cellWidth: 'auto' },
                        11: { cellWidth: 18 },
                    },
                });

                cursorY = doc.lastAutoTable.finalY + 8;
            });

            // Distribución por método de pago + banco (p.ej. "Punto de Venta —
            // Bancaribe" y "Punto de Venta — Tesoro" se muestran por separado,
            // en vez de sumarse en un solo renglón de "Punto de Venta").
            const byMethod = {};
            pagos.forEach(p => {
                const metodo = labelMetodo(p);
                const key = p.banco_nombre ? `${metodo} — ${p.banco_nombre}` : metodo;
                if (!byMethod[key]) byMethod[key] = { count: 0, total: 0 };
                byMethod[key].count += 1;
                byMethod[key].total += parseFloat(p.monto_ves || 0);
            });

            const grandTotal = Object.values(byMethod).reduce((s, v) => s + v.total, 0);
            if (cursorY > pageHeight - 40) {
                doc.addPage();
                cursorY = 18;
            }
            const distY = cursorY + 4;

            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('Distribución por Método de Pago y Banco', 14, distY);

            autoTable(doc, {
                head: [['Método de Pago / Banco', 'Cantidad', 'Total (Bs.)', '% del Total']],
                body: [
                    ...Object.entries(byMethod)
                        .sort((a, b) => b[1].total - a[1].total)
                        .map(([method, d]) => [
                            method,
                            d.count,
                            `Bs. ${d.total.toFixed(2)}`,
                            grandTotal > 0 ? `${((d.total / grandTotal) * 100).toFixed(1)}%` : '0%',
                        ]),
                    ['TOTAL', pagos.length, `Bs. ${grandTotal.toFixed(2)}`, '100%'],
                ],
                startY: distY + 5,
                styles: { fontSize: 8.5, cellPadding: 2.5 },
                headStyles: { fillColor: [30, 64, 175], fontStyle: 'bold' },
                columnStyles: {
                    1: { halign: 'center' },
                    2: { halign: 'right' },
                    3: { halign: 'center' },
                },
                didParseCell: (data) => {
                    if (data.row.index === Object.keys(byMethod).length) {
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.fillColor = [230, 236, 255];
                    }
                },
            });

            doc.save(`transacciones_${fechaInicio}_${fechaFin}.pdf`);
            toast.success('Reporte PDF generado correctamente.');
        } catch (err) {
            toast.error(getErrorMessage(err, 'No se pudo generar el reporte de transacciones.'));
        } finally {
            setPrintingDetalle(false);
        }
    };

    return (
        <section>
            <div className="mb-5">
                <h2 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>Cierre de Caja</h2>
                <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
                    Resumen de ingresos por período · viendo {fechaInicio === fechaFin ? fechaInicio : `${fechaInicio} — ${fechaFin}`}.
                </p>
            </div>

            {/* Filtro */}
            <div className="flex flex-wrap items-end gap-3 mb-6">
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Desde</label>
                    <DatePickerES
                        value={fechaInicio}
                        onChange={e => setFechaInicio(e.target.value)}
                        className="px-3 py-2 rounded-lg text-sm outline-none"
                        style={inputStyle}
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Hasta</label>
                    <DatePickerES
                        value={fechaFin}
                        onChange={e => setFechaFin(e.target.value)}
                        className="px-3 py-2 rounded-lg text-sm outline-none"
                        style={inputStyle}
                    />
                </div>
                <button
                    onClick={() => fetchCierre(fechaInicio, fechaFin)}
                    disabled={loadingCierre}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 min-h-[44px]"
                    style={{ background: 'var(--pb)' }}
                >
                    {loadingCierre ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    Buscar
                </button>
            </div>

            {/* Cards */}
            {loadingCierre ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <CardSkeleton /><CardSkeleton /><CardSkeleton />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 rounded-lg" style={{ background: '#dcfce7', color: '#16a34a' }}>
                                <DollarSign size={20} />
                            </div>
                            <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>
                                Total Recaudado (USD)
                            </label>
                        </div>
                        <p className="text-3xl font-bold font-mono" style={{ color: 'var(--pb)' }}>
                            ${fmt(caja.total_usd)}
                        </p>
                    </Card>

                    <Card>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 rounded-lg" style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
                                <Wallet size={20} />
                            </div>
                            <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Distribución por Método</h3>
                        </div>
                        {/* USD */}
                        <p className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: 'var(--pb)' }}>Divisas (USD)</p>
                        <div className="space-y-2 mb-4">
                            {[
                                { label: 'Efectivo Divisas', value: `$${fmt(caja.efectivo)}` },
                                { label: 'Zelle',            value: `$${fmt(caja.zelle)}` },
                            ].map(({ label, value }) => (
                                <div key={label} className="flex justify-between items-center">
                                    <span className="text-xs" style={{ color: 'var(--ash)' }}>{label}</span>
                                    <span className="text-xs font-bold font-mono" style={{ color: 'var(--jet)' }}>{value}</span>
                                </div>
                            ))}
                        </div>
                        {/* VES */}
                        <p className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: 'var(--pb)' }}>Bolívares (VES)</p>
                        <div className="space-y-2">
                            {[
                                { label: 'Transferencia Bancaria', value: `Bs. ${fmt(caja.transf_bancaria)}` },
                                { label: 'Pago Móvil',            value: `Bs. ${fmt(caja.pago_movil)}` },
                                { label: 'Punto de Venta',        value: `Bs. ${fmt(caja.punto_venta)}` },
                                { label: 'Efectivo Bolívares',    value: `Bs. ${fmt(caja.efectivo_bs)}` },
                            ].map(({ label, value }) => (
                                <div key={label} className="flex justify-between items-center">
                                    <span className="text-xs" style={{ color: 'var(--ash)' }}>{label}</span>
                                    <span className="text-xs font-bold font-mono" style={{ color: 'var(--jet)' }}>{value}</span>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <Card>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 rounded-lg" style={{ background: '#fef9c3', color: '#ca8a04' }}>
                                <Hash size={20} />
                            </div>
                            <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Total de Pagos</h3>
                        </div>
                        <p className="text-3xl font-bold font-mono" style={{ color: 'var(--jet)' }}>
                            {fmtInt(caja.conteo_pagos)}
                        </p>
                        <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>transacciones completadas</p>
                    </Card>
                </div>
            )}

            {/* Botones exportar */}
            <div className="mt-6 flex flex-wrap gap-3">
                <button
                    onClick={handleExportExcel}
                    disabled={loadingCierre || exportingExcel}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50 min-h-[44px]"
                    style={{ background: 'var(--jet)' }}
                >
                    {exportingExcel ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                    Exportar Excel
                </button>
                <button
                    onClick={handleExportCSV}
                    disabled={loadingCierre}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 min-h-[44px]"
                    style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                >
                    <Download size={16} />
                    Exportar CSV
                </button>
                <button
                    onClick={handlePrintDetalle}
                    disabled={loadingCierre || printingDetalle}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 min-h-[44px]"
                    style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
                >
                    {printingDetalle
                        ? <Loader2 size={16} className="animate-spin" />
                        : <Printer size={16} />}
                    Imprimir Transacciones
                </button>
            </div>
        </section>
    );
};

export default CierreCajaTab;
