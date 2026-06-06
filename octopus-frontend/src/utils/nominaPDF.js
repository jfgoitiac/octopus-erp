import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { SSO_TOPE, SSO_PCT, SPF_PCT, FAOV_PCT } from '../constants/avec';

// Fallback usado solo si el llamador no pasa un objeto institucion.
// El valor real viene de GET /api/secretaria/configuracion/ vía useInstitucionPDF.
const INST_DEFAULT = { nombre: 'U.E. COLEGIO LOS HIJOS DE MARÍA AUXILIADORA', logoColegio: null, logoAvec: null };

export const fmtBs = (n) =>
    (parseFloat(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Lógica interna compartida para el recibo AVEC ────────────────────────────
function _buildReciboAVECDoc(emp, data, calc, cesta, institucion) {
    const { nombre: nombreColegio, logoColegio, logoAvec } = { ...INST_DEFAULT, ...institucion };
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const W   = doc.internal.pageSize.getWidth();
    const H   = doc.internal.pageSize.getHeight();
    const LM  = 14;
    const RM  = W - LM;

    const sueldoBase = parseFloat(data.sueldo_base) || 0;
    const { otrasAsig, totalAsig, sso, spf, faov, totalRet, neto: netoMensual, quincena } = calc;
    const primaDiscapacidad = parseFloat(calc.primaDiscapacidad) || 0;
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

    // ── Cabecera institucional ──────────────────────────────────────────────
    const LOGO_SIZE  = 28;   // mm — alto/ancho del escudo del colegio
    const AVEC_W     = 22;   // mm — ancho logo AVEC
    const AVEC_H     = 22;   // mm — alto logo AVEC
    const HDR_TOP    = 8;    // mm — margen superior de la cabecera

    // Logos (base64 provenientes de useInstitucionPDF — omitidos si null)
    if (logoColegio) try { doc.addImage(logoColegio, 'PNG', LM,           HDR_TOP,     LOGO_SIZE, LOGO_SIZE); } catch (_) {}
    if (logoAvec)    try { doc.addImage(logoAvec,    'PNG', RM - AVEC_W,  HDR_TOP + 2, AVEC_W,    AVEC_H);   } catch (_) {}

    // Texto centrado entre logos
    const txtX = LM + LOGO_SIZE + 2;
    const txtW = RM - AVEC_W - 2 - txtX;
    const cx   = txtX + txtW / 2;

    let y = HDR_TOP + 2;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0);

    doc.setFontSize(6.5);
    doc.text('REPÚBLICA BOLIVARIANA DE VENEZUELA', cx, y, { align: 'center' }); y += 3.2;
    doc.text('MINISTERIO DEL PODER POPULAR PARA LA EDUCACIÓN', cx, y, { align: 'center' }); y += 3.2;

    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    doc.text(nombreColegio.toUpperCase(), cx, y, { align: 'center' }); y += 3.2;

    doc.setFontSize(6); doc.setFont('helvetica', 'normal');
    doc.text('AFILIADO A LA ASOCIACIÓN VENEZOLANA DE EDUCACIÓN CATÓLICA', cx, y, { align: 'center' }); y += 3;
    doc.text('YARACAL ESTADO FALCÓN', cx, y, { align: 'center' }); y += 3;
    doc.text('TELÉFONO 0259 938 1347  -  0426 563 1569', cx, y, { align: 'center' }); y += 3;
    doc.text('CÓDIGO DEA PD00131104', cx, y, { align: 'center' }); y += 3;
    doc.text('RIF-J-085222910', cx, y, { align: 'center' });

    // Separador debajo de logos
    y = HDR_TOP + LOGO_SIZE + 4;
    doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
    doc.line(LM, y, RM, y); y += 7;

    // ── Título ──────────────────────────────────────────────────────────────
    doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 51, 102);
    doc.text('RECIBO DE PAGO I, II QUINCENA Y BONO DE ALIMENTACION', W / 2, y, { align: 'center' }); y += 7;

    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
    doc.text(`Mes: ${(data.mes || '').toUpperCase()}`, W / 2, y, { align: 'center' }); y += 8;

    // ── Datos del empleado ──────────────────────────────────────────────────
    const hdrBg = [235, 235, 235];
    const BLUE  = [0, 51, 102];
    const RED   = [204, 0, 0];
    const fullW = RM - LM;
    const cW    = fullW / 4;
    const rH    = 7;

    // Fila 1 encabezados
    cell('APELLIDOS Y NOMBRES', LM,           y, cW * 1.6, rH, { bold: true, bg: hdrBg, fontSize: 7, align: 'center', textColor: BLUE });
    cell('C.I Nº',              LM + cW*1.6,  y, cW * 0.8, rH, { bold: true, bg: hdrBg, fontSize: 7, align: 'center', textColor: BLUE });
    cell('Nº H /Sem',           LM + cW*2.4,  y, cW * 0.6, rH, { bold: true, bg: hdrBg, fontSize: 7, align: 'center', textColor: BLUE });
    cell('Cargo',               LM + cW*3.0,  y, cW * 1.0, rH, { bold: true, bg: hdrBg, fontSize: 7, align: 'center', textColor: BLUE });
    y += rH;

    cell(`${emp.apellido?.toUpperCase() ?? ''} ${emp.nombre?.toUpperCase() ?? ''}`, LM, y, cW*1.6, rH, { fontSize: 7 });
    cell(emp.cedula || '',                    LM + cW*1.6, y, cW*0.8, rH, { fontSize: 7, align: 'center' });
    cell(String(emp.horas_semanales || ''),   LM + cW*2.4, y, cW*0.6, rH, { align: 'center', fontSize: 7 });
    cell((emp.cargo || '').toUpperCase(),     LM + cW*3.0, y, cW*1.0, rH, { fontSize: 7 });
    y += rH;

    // Fila 2 encabezados
    cell('FECHA DE INGRESO',   LM,           y, cW*0.8, rH, { bold: true, bg: hdrBg, fontSize: 7, align: 'center', textColor: BLUE });
    cell('TÍTULO',             LM + cW*0.8,  y, cW*0.6, rH, { bold: true, bg: hdrBg, fontSize: 7, align: 'center', textColor: BLUE });
    cell('CATEGORÍA DOCENTE',  LM + cW*1.4,  y, cW*1.0, rH, { bold: true, bg: hdrBg, fontSize: 7, align: 'center', textColor: BLUE });
    cell('NIVEL',              LM + cW*2.4,  y, cW*1.6, rH, { bold: true, bg: hdrBg, fontSize: 7, align: 'center', textColor: BLUE });
    y += rH;

    cell(emp.fecha_ingreso || '',     LM,           y, cW*0.8, rH, { fontSize: 7, align: 'center' });
    cell(emp.titulo || '',            LM + cW*0.8,  y, cW*0.6, rH, { fontSize: 7, align: 'center' });
    cell(emp.categoria_docente || '', LM + cW*1.4,  y, cW*1.0, rH, { fontSize: 7, align: 'center' });
    cell(emp.nivel || '',             LM + cW*2.4,  y, cW*1.6, rH, { fontSize: 7, align: 'center' });
    y += rH + 3;

    // ── Asignaciones / Retenciones ──────────────────────────────────────────
    const half   = fullW / 2 - 1;
    const xLeft  = LM;
    const xRight = LM + half + 2;
    const dH     = 6.5;
    const labelW = half * 0.65;
    const valW   = half - labelW;

    cell('ASIGNACIONES MENSUALES', xLeft,  y, half, dH, { bold: true, bg: hdrBg, align: 'center', fontSize: 8, textColor: BLUE });
    cell('RETENCIONES',            xRight, y, half, dH, { bold: true, bg: hdrBg, align: 'center', fontSize: 8, textColor: BLUE });
    y += dH;

    // 5 filas paralelas asignaciones | retenciones
    const asigRows = [
        { label: 'SUELDO BASE',            val: fmtBs(sueldoBase), bold: false },
        { label: 'OTRAS ASIGNACIONES',     val: fmtBs(otrasAsig),  bold: false },
        { label: 'TOTAL ASIGNACIONES',     val: fmtBs(totalAsig),  bold: true  },
        { label: 'MONTO PRIMERA QUINCENA', val: fmtBs(quincena),   bold: true, color: BLUE },
        { label: 'MONTO SEGUNDA QUINCENA', val: fmtBs(quincena),   bold: true, color: BLUE },
    ];
    const retRows = [
        { label: 'F.A.O.V',           val: fmtBs(faov),    bold: false },
        { label: 'S.S.O',             val: fmtBs(sso),     bold: true  },
        { label: 'S.P.F',             val: fmtBs(spf),     bold: false },
        { label: 'DEDUCCIONES',       val: '',              bold: false },
        { label: 'TOTAL RETENCIONES', val: fmtBs(totalRet),bold: true, color: RED },
    ];

    asigRows.forEach((ar, i) => {
        const rr = retRows[i];
        const aColor = ar.color ?? [0, 0, 0];
        const rColor = rr.color ?? [0, 0, 0];
        cell(ar.label, xLeft,          y, labelW, dH, { bold: ar.bold, fontSize: 7, textColor: aColor });
        cell(ar.val,   xLeft + labelW, y, valW,   dH, { bold: ar.bold, fontSize: 7, align: 'right', textColor: aColor });
        cell(rr.label, xRight,          y, labelW, dH, { bold: rr.bold, fontSize: 7, textColor: rColor });
        cell(rr.val,   xRight + labelW, y, valW,   dH, { bold: rr.bold, fontSize: 7, align: 'right', textColor: rColor });
        y += dH;
    });

    y += 1;
    // Prima por discapacidad
    const primaLabelW = fullW * 0.78;
    const primaValW   = fullW - primaLabelW;
    cell('PRIMA POR DISCAPACIDAD PARA EL PERSONAL E HIJOS', LM, y, primaLabelW, dH, { fontSize: 7 });
    cell(fmtBs(primaDiscapacidad), LM + primaLabelW, y, primaValW, dH, { fontSize: 7, align: 'right' });
    y += dH;

    // NETO A DEPOSITAR — fila completa destacada
    const netoLabelW = fullW * 0.78;
    const netoValW   = fullW - netoLabelW;
    cell('NETO A DEPOSITAR', LM, y, netoLabelW, dH, { bold: true, fontSize: 8, textColor: RED });
    cell(fmtBs(netoMensual), LM + netoLabelW, y, netoValW, dH, { bold: true, fontSize: 8, align: 'right', textColor: RED });
    y += dH + 3;

    // ── Programa Alimentario ────────────────────────────────────────────────
    cell('PROGRAMA ALIMENTARIO', LM, y, fullW, dH, { bold: true, bg: hdrBg, align: 'center', fontSize: 8, textColor: BLUE });
    y += dH;

    const col1 = fullW * 0.78;
    const col2 = fullW - col1;
    cell('MONTO DEL BENEFICIO DE ALIMENTACIÓN POR HORA:',  LM, y, col1, dH, { fontSize: 7 });
    cell(fmtBs(tarifaHora), LM + col1, y, col2, dH, { fontSize: 7, align: 'right' });
    y += dH;
    cell('COSTO DIARIO DEL BENEFICIO DE ALIMENTACIÓN:', LM, y, col1, dH, { fontSize: 7 });
    cell(fmtBs(costoDiario), LM + col1, y, col2, dH, { fontSize: 7, align: 'right' });
    y += dH;
    cell('TOTAL BENEFICIO DE ALIMENTACIÓN', LM, y, col1, dH, { bold: true, fontSize: 7 });
    cell(fmtBs(totalAlim), LM + col1, y, col2, dH, { bold: true, fontSize: 7, align: 'right' });
    y += dH;

    const qW = fullW / 3;
    cell('Nº H /MENS DE INASISTENCIA',               LM,        y, qW,   dH, { bold: true, bg: hdrBg, align: 'center', fontSize: 7 });
    cell('DESCUENTO POR INASISTENCIA',                LM + qW,   y, qW,   dH, { bold: true, bg: hdrBg, align: 'center', fontSize: 7 });
    cell('TOTAL BENEFICIO DE ALIMENTACIÓN A RECIBIR', LM + qW*2, y, qW,   dH, { bold: true, bg: hdrBg, align: 'center', fontSize: 7 });
    y += dH;
    cell(hsInasistencia > 0 ? String(hsInasistencia) : '0', LM,        y, qW, dH, { align: 'center', fontSize: 7 });
    cell(hsInasistencia > 0 ? fmtBs(descAlim) : '0,00',     LM + qW,   y, qW, dH, { align: 'right',  fontSize: 7 });
    cell(fmtBs(totalAlimRecibir),                            LM + qW*2, y, qW, dH, { bold: true, align: 'right', fontSize: 7, textColor: RED });
    y += dH + 10;

    // ── Firma ───────────────────────────────────────────────────────────────
    const firmaY = Math.min(y, H - 30);
    doc.setDrawColor(0); doc.setLineWidth(0.4);
    doc.line(W/2 - 30, firmaY, W/2 + 30, firmaY);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
    doc.text('Firma del Empleado', W / 2, firmaY + 4, { align: 'center' });

    // ── Pie de página con dirección ─────────────────────────────────────────
    doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
    doc.line(LM, H - 14, RM, H - 14);
    doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
    doc.text(
        'Calle el Samán, detrás de la Guardia Nacional en el Municipio Cacique Manaure, Yaracal, Estado Falcón.',
        W / 2, H - 9, { align: 'center' }
    );

    return doc;
}

// ── Recibo AVEC (docentes) ────────────────────────────────────────────────────
export function generarReciboAVECPDF(emp, data, calc, cesta, institucion = {}) {
    const doc = _buildReciboAVECDoc(emp, data, calc, cesta, institucion);
    doc.save(`Recibo_${emp.apellido}_${(data.mes || 'SIN_MES').replace(/\s/g, '_').toUpperCase()}.pdf`);
}

// ── Recibo simple (Administrativo / Apoyo) ────────────────────────────────────
export function generarReciboSimplePDF(emp, data, institucion = {}) {
    const { nombre: nombreColegio, logoColegio } = { ...INST_DEFAULT, ...institucion };
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const W   = doc.internal.pageSize.getWidth();
    const H   = doc.internal.pageSize.getHeight();
    const LM  = 14;
    const RM  = W - LM;

    let y = 10;
    if (logoColegio) try { doc.addImage(logoColegio, 'PNG', LM, y, 22, 22); } catch (_) {}

    y = 14;
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0);
    doc.text('REPÚBLICA BOLIVARIANA DE VENEZUELA', W / 2, y, { align: 'center' }); y += 3.5;
    doc.setFontSize(6.5);
    doc.text('MINISTERIO DEL PODER POPULAR PARA LA EDUCACIÓN', W / 2, y, { align: 'center' }); y += 3.5;
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text(nombreColegio.toUpperCase(), W / 2, y, { align: 'center' }); y += 3.5;
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
    doc.text('AFILIADO A LA ASOCIACIÓN VENEZOLANA DE EDUCACIÓN CATÓLICA', W / 2, y, { align: 'center' }); y += 3.5;
    doc.text('YARACAL ESTADO FALCÓN  ·  TELÉFONOS 0259 938 1347  ·  CÓDIGO DEA PD00131104  ·  RIF-J-085222910', W / 2, y, { align: 'center' }); y += 5;
    doc.setDrawColor(204, 204, 204); doc.setLineWidth(0.3); doc.line(LM, y, W - LM, y); y += 4;
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(204, 0, 0);
    doc.text('RECIBO DE PAGO', W / 2, y, { align: 'center' });
    doc.setTextColor(0, 0, 0);
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
        headStyles:   { fillColor: [245, 245, 245], textColor: [102, 102, 102], fontSize: 8 },
        bodyStyles:   { fontSize: 8 },
        columnStyles: { 1: { halign: 'right' } },
        didParseCell: (d) => {
            if (d.section === 'body' && [6, 7].includes(d.row.index)) {
                d.cell.styles.fontStyle = 'bold';
                if (d.row.index === 7) { d.cell.styles.fillColor = [255, 245, 245]; d.cell.styles.textColor = [204, 0, 0]; }
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

    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 51, 102);
    doc.text(titulo, W / 2, 18, { align: 'center' });
    doc.setTextColor(0, 0, 0);
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
        headStyles:         { fillColor: [245, 245, 245], textColor: [102, 102, 102], fontStyle: 'bold', fontSize: 8, lineColor: [204, 204, 204], lineWidth: 0.3 },
        bodyStyles:         { fontSize: 8, minCellHeight: 14 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
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

// ── Variantes que devuelven bytes (para empaquetar en ZIP) ────────────────────

/**
 * Igual que generarReciboAVECPDF pero retorna ArrayBuffer en vez de auto-descargar.
 */
export function reciboAVECBytes(emp, data, calc, cesta, institucion = {}) {
    const doc = _buildReciboAVECDoc(emp, data, calc, cesta, institucion);
    return doc.output('arraybuffer');
}

/**
 * Igual que generarReciboSimplePDF pero retorna Uint8Array en vez de auto-descargar.
 */
export function reciboSimpleBytes(emp, data, institucion = {}) {
    const { nombre: nombreColegio, logoColegio } = { ...INST_DEFAULT, ...institucion };
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const W   = doc.internal.pageSize.getWidth();
    const H   = doc.internal.pageSize.getHeight();
    const LM  = 14;

    let y = 10;
    if (logoColegio) try { doc.addImage(logoColegio, 'PNG', LM, y, 22, 22); } catch (_) {}

    y = 14;
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0);
    doc.text('REPÚBLICA BOLIVARIANA DE VENEZUELA', W / 2, y, { align: 'center' }); y += 3.5;
    doc.setFontSize(6.5);
    doc.text('MINISTERIO DEL PODER POPULAR PARA LA EDUCACIÓN', W / 2, y, { align: 'center' }); y += 3.5;
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text(nombreColegio.toUpperCase(), W / 2, y, { align: 'center' }); y += 3.5;
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
    doc.text('AFILIADO A LA ASOCIACIÓN VENEZOLANA DE EDUCACIÓN CATÓLICA', W / 2, y, { align: 'center' }); y += 3.5;
    doc.text('YARACAL ESTADO FALCÓN  ·  TELÉFONOS 0259 938 1347  ·  CÓDIGO DEA PD00131104  ·  RIF-J-085222910', W / 2, y, { align: 'center' }); y += 5;
    doc.setDrawColor(204, 204, 204); doc.setLineWidth(0.3); doc.line(LM, y, W - LM, y); y += 4;
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(204, 0, 0);
    doc.text('RECIBO DE PAGO', W / 2, y, { align: 'center' });
    doc.setTextColor(0, 0, 0);
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
        headStyles:   { fillColor: [245, 245, 245], textColor: [102, 102, 102], fontSize: 8 },
        bodyStyles:   { fontSize: 8 },
        columnStyles: { 1: { halign: 'right' } },
        didParseCell: (d) => {
            if (d.section === 'body' && [6, 7].includes(d.row.index)) {
                d.cell.styles.fontStyle = 'bold';
                if (d.row.index === 7) { d.cell.styles.fillColor = [255, 245, 245]; d.cell.styles.textColor = [204, 0, 0]; }
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

    return doc.output('arraybuffer');
}

/**
 * Igual que generarTXTBancaribe pero retorna el string en vez de descargarlo.
 */
export function txtBancaribe(pagos, tasa) {
    const lines = pagos.map(r => {
        const cuenta   = r.numero_cuenta.trim();
        const codBanco = cuenta.slice(0, 4);
        const montoVes = (parseFloat(r.monto_usd) * tasa).toFixed(2);
        const cedula   = r.cedula.replace(/^[Vv]-?/, '');
        const nombre   = `${r.nombre.toUpperCase()} ${r.apellido.toUpperCase()}`;
        return `PAP//0/${codBanco}/${cuenta}/${r.tipo_cuenta}/0/${montoVes}/V${cedula}/${nombre}//${r.correo || ''}/${(r.telefono || '').replace(/[-\s]/g, '')}//`;
    });
    return lines.join('\r\n');
}

/**
 * Igual que generarPlanillaBancaribePDF pero retorna ArrayBuffer en vez de auto-descargar.
 */
export function planillaBancaribePDFBytes(pagos, tasa, concepto, opts = {}) {
    const {
        titulo   = 'PLANILLA DE PAGO DE NÓMINA — BANCARIBE',
        colMonto = 'Monto USD',
    } = opts;

    const doc      = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    const hoy      = new Date();
    const fechaStr = format(hoy, "dd 'de' MMMM 'de' yyyy", { locale: es });
    const W        = doc.internal.pageSize.getWidth();
    const H        = doc.internal.pageSize.getHeight();

    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 51, 102);
    doc.text(titulo, W / 2, 18, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`Concepto: ${concepto}`, W / 2, 26, { align: 'center' });
    doc.text(`Fecha: ${fechaStr}`, W / 2, 32, { align: 'center' });

    const tableData = pagos.map((r, i) => {
        const monto    = parseFloat(r.monto_usd) || 0;
        const montoVes = (monto * tasa).toFixed(2);
        return [
            i + 1,
            `${r.apellido?.toUpperCase()} ${r.nombre?.toUpperCase()}`,
            r.cedula,
            r.banco_nombre || r.banco || '',
            r.numero_cuenta,
            r.tipo_cuenta,
            tasa !== 1 ? monto.toFixed(2) : montoVes,
            tasa !== 1 ? montoVes : '',
        ].map(String);
    });

    const totalUsd = pagos.reduce((s, r) => s + (parseFloat(r.monto_usd) || 0), 0);
    const totalVes = (totalUsd * tasa).toFixed(2);

    autoTable(doc, {
        startY: 38,
        head: [['#', 'Apellidos y Nombres', 'Cédula', 'Banco', 'Cuenta', 'Tipo', colMonto, tasa !== 1 ? 'Monto Bs' : '']],
        body: [
            ...tableData,
            ['', 'TOTAL', '', '', '', '',
             tasa !== 1 ? totalUsd.toFixed(2) : totalVes,
             tasa !== 1 ? totalVes : ''],
        ],
        headStyles:   { fillColor: [0, 51, 102], textColor: 255, fontSize: 8 },
        bodyStyles:   { fontSize: 8 },
        columnStyles: { 0: { cellWidth: 10 }, 6: { halign: 'right' }, 7: { halign: 'right' } },
        didParseCell: (d) => {
            if (d.section === 'body' && d.row.index === tableData.length) {
                d.cell.styles.fontStyle = 'bold';
                d.cell.styles.fillColor = [245, 245, 245];
            }
        },
        didDrawPage: (d) => {
            const yL = d.cursor?.y ?? H - 15;
            const x1 = d.settings.margin.left;
            const x2 = W - d.settings.margin.right;
            if (yL < H - 10) { doc.setDrawColor(200); doc.line(x1, yL, x2, yL); }
        },
    });

    doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.setTextColor(120, 120, 120);
    doc.text('Documento generado automáticamente — Sistema de Gestión Escolar', W / 2, H - 8, { align: 'center' });
    return doc.output('arraybuffer');
}
