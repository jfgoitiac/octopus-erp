import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { SSO_TOPE, SSO_PCT, SPF_PCT, FAOV_PCT } from '../constants/avec';

// [DEUDA] El nombre del colegio debe venir de GET /configuracion/ (perfil de la institución).
// Mientras no exista ese endpoint, se usa este valor por defecto hardcodeado.
// Impacto SaaS: si otro colegio usa el módulo, sus recibos mostrarán este nombre.
const NOMBRE_COLEGIO_DEFAULT = 'U.E. COLEGIO LOS HIJOS DE MARÍA AUXILIADORA';

export const fmtBs = (n) =>
    (parseFloat(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Recibo AVEC (docentes) ────────────────────────────────────────────────────
export function generarReciboAVECPDF(emp, data, calc, cesta, nombreColegio = NOMBRE_COLEGIO_DEFAULT) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const W   = doc.internal.pageSize.getWidth();
    const H   = doc.internal.pageSize.getHeight();
    const LM  = 14;
    const RM  = W - LM;

    const sueldoBase = parseFloat(data.sueldo_base) || 0;
    const { primaAnt, primaDoc, primaGeo, primaPos, primaAsis, primaHijos,
            otrasAsig, totalAsig, sso, spf, faov, totalRet, neto: netoMensual, quincena } = calc;
    const { tarifaHora, costoDiario, totalBs: totalAlim,
            hsInasistencia, descuento: descAlim, totalRecibir: totalAlimRecibir } = cesta;

    const cell = (text, x, y, w, h, opts = {}) => {
        const { bold = false, align = 'left', bg, fontSize = 8, textColor = [0, 0, 0] } = opts;
        if (bg) { doc.setFillColor(...bg); doc.rect(x, y, w, h, 'F'); }
        doc.setDrawColor(180, 180, 180);
        doc.rect(x, y, w, h);
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setTextColor(...textColor);
        const pad = 1.5;
        if (align === 'center')     doc.text(String(text), x + w / 2, y + h / 2 + fontSize * 0.18, { align: 'center' });
        else if (align === 'right') doc.text(String(text), x + w - pad, y + h / 2 + fontSize * 0.18, { align: 'right' });
        else                        doc.text(String(text), x + pad, y + h / 2 + fontSize * 0.18);
    };

    let y = 10;
    const hdrBg = [220, 230, 245];

    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
    doc.text(nombreColegio.toUpperCase(), W / 2, y, { align: 'center' });
    y += 5;
    doc.setFontSize(9);
    doc.text('RECIBO DE PAGO I, II QUINCENA Y BONO DE ALIMENTACIÓN', W / 2, y, { align: 'center' });
    y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(`Mes:  ${(data.mes || '').toUpperCase()}`, W / 2, y, { align: 'center' });
    y += 3;

    const cW = (RM - LM) / 4;
    const rH = 7;

    cell('Apellidos y Nombres', LM,          y, cW * 1.6, rH, { bold: true, bg: hdrBg, fontSize: 7 });
    cell('C.I Nº',             LM + cW*1.6,  y, cW * 0.8, rH, { bold: true, bg: hdrBg, fontSize: 7 });
    cell('Nº H /Sem',          LM + cW*2.4,  y, cW * 0.6, rH, { bold: true, bg: hdrBg, fontSize: 7 });
    cell('Cargo',              LM + cW*3.0,  y, cW * 1.0, rH, { bold: true, bg: hdrBg, fontSize: 7 });
    y += rH;

    cell(`${emp.apellido?.toUpperCase()} ${emp.nombre?.toUpperCase()}`, LM, y, cW*1.6, rH, { fontSize: 7 });
    cell(emp.cedula || '',                       LM + cW*1.6, y, cW*0.8, rH, { fontSize: 7 });
    cell(String(emp.horas_semanales || ''),       LM + cW*2.4, y, cW*0.6, rH, { align: 'center', fontSize: 7 });
    cell((emp.cargo || '').toUpperCase(),         LM + cW*3.0, y, cW*1.0, rH, { fontSize: 7 });
    y += rH;

    cell('Fecha de Ingreso',   LM,          y, cW*0.8, rH, { bold: true, bg: hdrBg, fontSize: 7 });
    cell('Título',             LM+cW*0.8,   y, cW*0.6, rH, { bold: true, bg: hdrBg, fontSize: 7 });
    cell('Categoría Docente',  LM+cW*1.4,   y, cW*0.8, rH, { bold: true, bg: hdrBg, fontSize: 7 });
    cell('NIVEL',              LM+cW*2.2,   y, cW*0.8, rH, { bold: true, bg: hdrBg, fontSize: 7 });
    doc.setDrawColor(180, 180, 180); doc.rect(LM+cW*3.0, y, cW*1.0, rH);
    y += rH;

    cell(emp.fecha_ingreso || '',     LM,         y, cW*0.8, rH, { fontSize: 7, align: 'center' });
    cell(emp.titulo || '',            LM+cW*0.8,  y, cW*0.6, rH, { fontSize: 7, align: 'center' });
    cell(emp.categoria_docente || '', LM+cW*1.4,  y, cW*0.8, rH, { fontSize: 7, align: 'center' });
    cell(emp.nivel || '',             LM+cW*2.2,  y, cW*0.8, rH, { fontSize: 7, align: 'center' });
    doc.rect(LM+cW*3.0, y, cW*1.0, rH);
    y += rH + 2;

    const half   = (RM - LM) / 2 - 1;
    const xLeft  = LM;
    const xRight = LM + half + 2;
    const dH     = 6.5;

    cell('ASIGNACIONES MENSUALES', xLeft,  y, half, dH, { bold: true, bg: [200, 215, 240], align: 'center', fontSize: 8 });
    cell('RETENCIONES',            xRight, y, half, dH, { bold: true, bg: [200, 215, 240], align: 'center', fontSize: 8 });
    y += dH;

    const asigRows = [
        ['SUELDO BASE',             fmtBs(sueldoBase)],
        ['',                        ''],
        ['OTRAS ASIGNACIONES',      fmtBs(otrasAsig)],
        ['TOTAL ASIGNACIONES',      fmtBs(totalAsig)],
        ['MONTO PRIMERA QUINCENA',  fmtBs(quincena)],
        ['DEDUCCIONES',             fmtBs(totalRet)],
        ['MONTO SEGUNDA QUINCENA',  fmtBs(quincena)],
    ];
    const retRows = [
        ['F.A.O.V',           fmtBs(faov)],
        ['S.S.O',             fmtBs(sso)],
        ['',                  ''],
        ['S.P.F',             fmtBs(spf)],
        ['',                  ''],
        ['Total Retenciones', fmtBs(totalRet)],
        ['Neto a Depositar',  fmtBs(netoMensual)],
    ];

    const labelW = half * 0.62;
    const valW   = half - labelW;

    asigRows.forEach((row, i) => {
        const retRow = retRows[i] || ['', ''];
        const isBold = [3, 4, 6].includes(i);
        const rBold  = [5, 6].includes(i);
        cell(row[0], xLeft,           y, labelW, dH, { bold: isBold, fontSize: 7 });
        cell(row[1], xLeft + labelW,  y, valW,   dH, { bold: isBold, fontSize: 7, align: 'right' });
        cell(retRow[0], xRight,           y, labelW, dH, { bold: rBold, fontSize: 7 });
        cell(retRow[1], xRight + labelW,  y, valW,   dH, { bold: rBold, fontSize: 7, align: 'right' });
        y += dH;
    });

    y += 2;
    const fullW = RM - LM;
    cell('PRIMA POR DISCAPACIDAD PARA EL PERSONAL E HIJOS', LM, y, fullW, dH, { fontSize: 7, bg: [235, 240, 250] });
    y += dH + 2;

    cell('PROGRAMA ALIMENTARIO', LM, y, fullW, dH, { bold: true, bg: [200, 215, 240], align: 'center', fontSize: 8 });
    y += dH;

    const col1 = fullW * 0.55;
    const col2 = fullW - col1;
    cell('MONTO DEL BENEFICIO DE ALIMENTACIÓN POR HORA:', LM, y, col1, dH, { fontSize: 7 });
    cell(fmtBs(tarifaHora), LM + col1, y, col2, dH, { fontSize: 7, align: 'right' });
    y += dH;
    cell('COSTO DIARIO DEL BENEFICIO DE ALIMENTACIÓN:', LM, y, col1, dH, { fontSize: 7 });
    cell(fmtBs(costoDiario), LM + col1, y, col2, dH, { fontSize: 7, align: 'right' });
    y += dH;
    cell('TOTAL BENEFICIO DE ALIMENTACIÓN:', LM, y, col1, dH, { bold: true, fontSize: 7 });
    cell(fmtBs(totalAlim), LM + col1, y, col2, dH, { bold: true, fontSize: 7, align: 'right' });
    y += dH;

    const qW = fullW / 4;
    cell('Nº H /MENS de inasistencia',               LM,        y, qW,   dH, { bold: true, bg: hdrBg, fontSize: 7 });
    cell('Descuento por inasistencia',                LM + qW,   y, qW,   dH, { bold: true, bg: hdrBg, fontSize: 7 });
    cell('Total Beneficio de Alimentación a Recibir', LM + qW*2, y, qW*2, dH, { bold: true, bg: hdrBg, fontSize: 7 });
    y += dH;
    cell(hsInasistencia > 0 ? String(hsInasistencia) : '0',  LM,        y, qW,   dH, { align: 'center', fontSize: 7 });
    cell(hsInasistencia > 0 ? fmtBs(descAlim) : '0,00',      LM + qW,   y, qW,   dH, { align: 'right',  fontSize: 7 });
    cell(fmtBs(totalAlimRecibir),                             LM + qW*2, y, qW*2, dH, { bold: true, align: 'right', fontSize: 7 });
    y += dH + 8;

    const firmaY = Math.min(y, H - 35);
    doc.setDrawColor(0); doc.setLineWidth(0.4);
    doc.line(W/2 - 30, firmaY, W/2 + 30, firmaY);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
    doc.text('Firma del Empleado', W / 2, firmaY + 4, { align: 'center' });

    doc.setFontSize(6.5); doc.setTextColor(150, 150, 150);
    doc.text('Documento generado automáticamente — Sistema de Gestión Escolar', W / 2, H - 8, { align: 'center' });

    doc.save(`Recibo_${emp.apellido}_${(data.mes || 'SIN_MES').replace(/\s/g, '_').toUpperCase()}.pdf`);
}

// ── Recibo simple (Administrativo / Apoyo) ────────────────────────────────────
export function generarReciboSimplePDF(emp, data, nombreColegio = NOMBRE_COLEGIO_DEFAULT) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const W   = doc.internal.pageSize.getWidth();
    const H   = doc.internal.pageSize.getHeight();
    const LM  = 14;

    let y = 14;
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('RECIBO DE PAGO', W / 2, y, { align: 'center' });
    y += 5;
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`Mes: ${(data.mes || '').toUpperCase()}`, W / 2, y, { align: 'center' });
    y += 5;

    autoTable(doc, {
        startY: y, margin: { left: LM, right: LM },
        body: [
            ['Apellidos y Nombres', `${emp.apellido?.toUpperCase()} ${emp.nombre?.toUpperCase()}`],
            ['Cédula',        emp.cedula || ''],
            ['Cargo',         (emp.cargo || '').toUpperCase()],
            ['Tipo Personal', (emp.tipo_personal || '').toUpperCase()],
        ],
        theme: 'plain', styles: { fontSize: 8 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
    });
    y = doc.lastAutoTable.finalY + 4;

    const sueldo   = parseFloat(data.sueldo_base) || 0;
    const sso      = Math.min(sueldo * SSO_PCT, SSO_TOPE);
    const spf      = sueldo * SPF_PCT;
    const faov     = sueldo * FAOV_PCT;
    const otrasDed = parseFloat(data.otras_deducciones) || 0;
    const totalDed = sso + spf + faov + otrasDed;
    const neto     = sueldo - totalDed;

    autoTable(doc, {
        startY: y, margin: { left: LM, right: LM },
        head: [['Concepto', 'Monto (Bs)']],
        body: [
            ['Sueldo / Salario Bruto', fmtBs(sueldo)],
            ['', ''],
            ['S.S.O. (4%)',    `-${fmtBs(sso)}`],
            ['S.P.F. (0,5%)',  `-${fmtBs(spf)}`],
            ['F.A.O.V. (1%)',  `-${fmtBs(faov)}`],
            otrasDed > 0 ? ['Otras deducciones', `-${fmtBs(otrasDed)}`] : ['', ''],
            ['Total Deducciones', fmtBs(totalDed)],
            ['NETO A DEPOSITAR',  fmtBs(neto)],
        ],
        headStyles:   { fillColor: [0, 79, 163], textColor: 255, fontSize: 8 },
        bodyStyles:   { fontSize: 8 },
        columnStyles: { 1: { halign: 'right' } },
        didParseCell: (d) => {
            if (d.section === 'body' && [6, 7].includes(d.row.index)) {
                d.cell.styles.fontStyle = 'bold';
                if (d.row.index === 7) d.cell.styles.fillColor = [230, 245, 255];
            }
        },
    });

    y = doc.lastAutoTable.finalY + 10;
    doc.setDrawColor(0); doc.setLineWidth(0.4);
    doc.line(W/2 - 30, y, W/2 + 30, y);
    doc.setFontSize(7); doc.setTextColor(80, 80, 80);
    doc.text('Firma del Empleado', W/2, y + 4, { align: 'center' });
    doc.setFontSize(6.5); doc.setTextColor(150, 150, 150);
    doc.text('Documento generado automáticamente — Sistema de Gestión Escolar', W/2, H - 8, { align: 'center' });

    doc.save(`Recibo_${emp.apellido}_${(data.mes || 'SIN_MES').replace(/\s/g, '_').toUpperCase()}.pdf`);
}

// ── Planilla PDF Bancaribe ────────────────────────────────────────────────────
// opts.titulo    — título del documento (default: "PLANILLA DE PAGO DE NÓMINA — BANCARIBE")
// opts.colMonto  — etiqueta de la columna de monto (default: "Monto USD")
// opts.filename  — nombre del PDF sin extensión (default: "Planilla_Bancaribe_YYYYMMDD")
export function generarPlanillaBancaribePDF(pagos, tasa, concepto, opts = {}) {
    const {
        titulo   = 'PLANILLA DE PAGO DE NÓMINA — BANCARIBE',
        colMonto = 'Monto USD',
        filename = null,
    } = opts;

    const doc      = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    const hoy      = new Date();
    const fechaStr = format(hoy, "dd 'de' MMMM 'de' yyyy", { locale: es });
    const W        = doc.internal.pageSize.getWidth();
    const H        = doc.internal.pageSize.getHeight();

    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text(titulo, W / 2, 18, { align: 'center' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${fechaStr}`, 14, 26);
    if (tasa !== 1)
        doc.text(`Tasa del día: ${tasa.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs/USD`, 14, 31);
    doc.text(`Concepto: ${concepto || '—'}`, 14, tasa !== 1 ? 36 : 31);
    doc.text(`Total empleados: ${pagos.length}`, 14, tasa !== 1 ? 41 : 36);

    const totalVes = pagos.reduce((acc, r) => acc + parseFloat(r.monto_usd) * tasa, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total transferido: ${totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs`, 14, tasa !== 1 ? 46 : 41);

    const startY = tasa !== 1 ? 52 : 48;

    // Cuando tasa=1 (nómina/cesta en Bs), se omite la columna de monto USD
    const soloBS = tasa === 1;
    const headers = soloBS
        ? ['N°', 'Cédula', 'Nombre', 'Apellido', 'Monto (Bs)', 'Firma']
        : ['N°', 'Cédula', 'Nombre', 'Apellido', colMonto, 'Monto Bs', 'Firma'];

    const rows = pagos.map((r, i) => {
        const montoBS = (parseFloat(r.monto_usd) * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2 });
        if (soloBS) return [i + 1, `V-${r.cedula}`, r.nombre, r.apellido, `${montoBS} Bs`, ''];
        return [
            i + 1,
            `V-${r.cedula}`,
            r.nombre,
            r.apellido,
            `$ ${parseFloat(r.monto_usd).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
            `${montoBS} Bs`,
            '',
        ];
    });

    const colStyles = soloBS
        ? { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 28 }, 2: { cellWidth: 45 }, 3: { cellWidth: 45 }, 4: { cellWidth: 40, halign: 'right' }, 5: { cellWidth: 70 } }
        : { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 28 }, 2: { cellWidth: 40 }, 3: { cellWidth: 40 }, 4: { cellWidth: 28, halign: 'right' }, 5: { cellWidth: 35, halign: 'right' }, 6: { cellWidth: 60 } };

    autoTable(doc, {
        startY,
        head:               [headers],
        body:               rows,
        columnStyles:       colStyles,
        headStyles:         { fillColor: [0, 79, 163], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        bodyStyles:         { fontSize: 8, minCellHeight: 14 },
        alternateRowStyles: { fillColor: [240, 245, 255] },
        styles:             { overflow: 'linebreak', cellPadding: 3 },
        didDrawCell: (data) => {
            const firmaCol = soloBS ? 5 : 6;
            if (data.section === 'body' && data.column.index === firmaCol) {
                const x1 = data.cell.x + 6, x2 = data.cell.x + data.cell.width - 6;
                const yL = data.cell.y + data.cell.height - 4;
                doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.3);
                doc.line(x1, yL, x2, yL);
            }
        },
    });

    doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.setTextColor(120, 120, 120);
    doc.text('Documento generado automáticamente — Sistema de Gestión Escolar', W / 2, H - 8, { align: 'center' });
    doc.save(`${filename || `Planilla_Bancaribe_${format(hoy, 'yyyyMMdd')}`}.pdf`);
}

// ── TXT Bancaribe ─────────────────────────────────────────────────────────────
// filename: nombre del archivo descargado sin extensión. Por defecto: "Pagos PAP-YYYYMMDD"
// Para nómina/cesta en Bs: pasar tasa=1 y monto_usd=monto_bs.
export function generarTXTBancaribe(pagos, tasa, filename = null) {
    const lines = pagos.map(r => {
        const cuenta   = r.numero_cuenta.trim();
        const codBanco = cuenta.slice(0, 4);
        const montoVes = (parseFloat(r.monto_usd) * tasa).toFixed(2);
        const cedula   = r.cedula.replace(/^[Vv]-?/, '');
        const nombre   = `${r.nombre.toUpperCase()} ${r.apellido.toUpperCase()}`;
        return `PAP//0/${codBanco}/${cuenta}/${r.tipo_cuenta}/0/${montoVes}/V${cedula}/${nombre}//${r.correo || ''}/${(r.telefono || '').replace(/[-\s]/g, '')}//`;
    });
    const blob  = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
    const url   = URL.createObjectURL(blob);
    const link  = document.createElement('a');
    link.href   = url;
    link.download = `${filename || `Pagos PAP-${format(new Date(), 'yyyyMMdd')}`}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
