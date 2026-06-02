import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Download, FileText, Loader2, AlertCircle, RefreshCcw, Users, Plus, X,
    FileSpreadsheet, Building2, Pencil, GraduationCap, Briefcase, Wrench,
    Receipt, Settings2, DollarSign,
} from 'lucide-react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/* ─────────────────────────────────────────────────────────
   Tablas AVEC / MPPE
───────────────────────────────────────────────────────── */
const SSO_TOPE  = 26.00;
const SSO_PCT   = 0.04;
const SPF_PCT   = 0.005;
const FAOV_PCT  = 0.01;
const PRIMA_ASISTENCIAL_FIJA = 17.50;   // 4E — monto fijo
const PRIMA_HIJO_FIJA        = 12.50;   // 4F — por hijo

// 4A Antigüedad: 1% del sueldo base por cada año de servicio
const calcPrimaAntiguedad = (sueldoBase, anosServicio) =>
    sueldoBase * (Math.min(parseInt(anosServicio) || 0, 100) / 100);

// 4B Prima Docente (% sobre sueldo base por categoría)
const PRIMA_DOCENTE_PCT = {
    'D-I S/C': 0.00,
    'D-I':     0.025,
    'D-II':    0.04,
    'D-III':   0.055,
    'D-IV':    0.07,
    'D-V':     0.085,
    'D-VI':    0.10,
};

// 4D Postgrado / Comp. Académica (% sobre sueldo base por título)
const POSTGRADO_PCT = {
    'DR':   0.40,   // Doctor
    'PHD':  0.40,
    'MSC':  0.35,   // Magíster
    'ESP':  0.30,   // Especialista
    'LEM':  0.30,   // Licenciado en Educación Mención (conv. AVEC)
    'LIC':  0.25,
    'PROF': 0.20,
    'TSU':  0.10,
    'BACH': 0.00,
    'NONE': 0.00,
};

const calcPrimaPostgrado = (sueldoBase, titulo) => {
    const key = (titulo || '').toUpperCase().trim();
    // Busca coincidencia exacta primero, luego incluye
    const pct = POSTGRADO_PCT[key]
        ?? Object.entries(POSTGRADO_PCT).find(([k]) => key.includes(k))?.[1]
        ?? 0;
    return sueldoBase * pct;
};

// Calcula el bloque completo de asignaciones + retenciones AVEC
function calcAVEC(sueldoBase, categoria, anosServicio, numeroHijos, titulo) {
    const sb         = parseFloat(sueldoBase)   || 0;
    const anos       = parseInt(anosServicio)    || 0;
    const hijos      = parseInt(numeroHijos)     || 0;
    const primaAnt   = calcPrimaAntiguedad(sb, anos);
    const pctDoc     = PRIMA_DOCENTE_PCT[categoria] ?? 0;
    const primaDoc   = sb * pctDoc;
    const primaGeo   = primaDoc;                        // 4C = igual a 4B
    const primaPos   = calcPrimaPostgrado(sb, titulo);
    const primaAsis  = sb > 0 ? PRIMA_ASISTENCIAL_FIJA : 0;
    const primaHijos = hijos * PRIMA_HIJO_FIJA;
    const otrasAsig  = primaAnt + primaDoc + primaGeo + primaPos + primaAsis + primaHijos;
    const totalAsig  = sb + otrasAsig;
    const sso        = Math.min(totalAsig * SSO_PCT, SSO_TOPE);
    const spf        = totalAsig * SPF_PCT;
    const faov       = totalAsig * FAOV_PCT;
    const totalRet   = sso + spf + faov;
    const neto       = totalAsig - totalRet;
    const quincena   = neto / 2;
    return { primaAnt, primaDoc, primaGeo, primaPos, primaAsis, primaHijos,
             otrasAsig, totalAsig, sso, spf, faov, totalRet, neto, quincena };
}

const CATEGORIAS_DOCENTE = ['D-I S/C', 'D-I', 'D-II', 'D-III', 'D-IV', 'D-V', 'D-VI'];

/* ─────────────────────────────────────────────────────────
   Configuración del período — localStorage
   Costo/hora diferente por categoría AVEC (tabla MPPE).
   Sueldo Base = costo_hora[categoría] × H/Sem del docente
───────────────────────────────────────────────────────── */
const CESTA_LS_KEY  = 'nomina_cesta_config';

// Genera la estructura de categorías con costo_hora vacío
const buildCategoriasDefault = () =>
    Object.fromEntries(CATEGORIAS_DOCENTE.map(c => [c, { costo_hora: '' }]));

const CESTA_DEFAULT = {
    // ── Tabla AVEC: costo/hora por categoría ──
    categorias:  buildCategoriasDefault(),
    // ── Cesta Ticket ──
    tasa_bcv:    '',       // Bs/USD — tasa BCV del período
    tarifa_hora: '0.20',   // Bs/hora — para descuento por inasistencia
    docente:         { monto_usd: '' },
    administrativo:  { monto_usd: '' },
    apoyo:           { monto_usd: '' },
};

function loadCestaConfig() {
    try {
        const raw  = localStorage.getItem(CESTA_LS_KEY);
        if (!raw) return structuredClone(CESTA_DEFAULT);
        const saved = JSON.parse(raw);
        // Garantiza que cualquier categoría nueva tenga su entrada
        const categorias = { ...buildCategoriasDefault(), ...(saved.categorias || {}) };
        return { ...CESTA_DEFAULT, ...saved, categorias };
    } catch { return structuredClone(CESTA_DEFAULT); }
}
function saveCestaConfig(cfg) { localStorage.setItem(CESTA_LS_KEY, JSON.stringify(cfg)); }

/** Devuelve el sueldo base calculado para un docente dado el config actual */
function calcSueldoBase(config, categoriaDocente, horasSemanales) {
    const costoHora = parseFloat(config.categorias?.[categoriaDocente]?.costo_hora) || 0;
    const hSem      = parseFloat(horasSemanales) || 0;
    return costoHora * hSem;
}

// El recibo solo necesita 3 datos variables por período.
// sueldo_base = cestaConfig.costo_hora × emp.horas_semanales  (100 % automático)
const EMPTY_RECIBO = {
    mes:                '',   // período
    horas_inasistencia: '0',  // H/Mens ausentes
    cesta_monto_usd:    '',   // pre-llenado desde config, editable si cambia
    cesta_tasa:         '',   // pre-llenado desde config, editable si cambia
};

const EMPTY_EMP = {
    nombre: '', apellido: '', cedula: '', cargo: '',
    tipo_personal: 'docente',
    // AVEC / docente
    fecha_ingreso: '', titulo: '', categoria_docente: '', anos_servicio: '',
    numero_hijos: '0', nivel: '',
    horas_semanales: '',   // N° H/Sem del docente — se guarda en la ficha
    // banco
    banco: '', numero_cuenta: '', tipo_cuenta: '', telefono: '', correo: '',
};

/* ─────────────────────────────────────────────────────────
   PDF: Recibo AVEC
   Recibe `calc` (resultado de calcAVEC) + `cesta` (objeto alimentación)
───────────────────────────────────────────────────────── */
function generarReciboAVECPDF(emp, data, calc, cesta, nombreColegio = 'U.E. COLEGIO LOS HIJOS DE MARÍA AUXILIADORA') {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const W   = doc.internal.pageSize.getWidth();
    const H   = doc.internal.pageSize.getHeight();
    const LM  = 14;
    const RM  = W - LM;

    const sueldoBase      = parseFloat(data.sueldo_base) || 0;
    const { primaAnt, primaDoc, primaGeo, primaPos, primaAsis, primaHijos,
            otrasAsig, totalAsig, sso, spf, faov, totalRet, neto: netoMensual, quincena } = calc;

    const tarifaHora       = cesta.tarifaHora;
    const costoDiario      = cesta.costoDiario;
    const totalAlim        = cesta.totalBs;
    const hsInasistencia   = cesta.hsInasistencia;
    const descAlim         = cesta.descuento;
    const totalAlimRecibir = cesta.totalRecibir;

    const fmt  = (n) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const cell = (text, x, y, w, h, opts = {}) => {
        const { bold = false, align = 'left', bg, fontSize = 8, textColor = [0,0,0] } = opts;
        if (bg) {
            doc.setFillColor(...bg);
            doc.rect(x, y, w, h, 'F');
        }
        doc.setDrawColor(180, 180, 180);
        doc.rect(x, y, w, h);
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setTextColor(...textColor);
        const pad = 1.5;
        if (align === 'center') doc.text(String(text), x + w / 2, y + h / 2 + fontSize * 0.18, { align: 'center' });
        else if (align === 'right') doc.text(String(text), x + w - pad, y + h / 2 + fontSize * 0.18, { align: 'right' });
        else doc.text(String(text), x + pad, y + h / 2 + fontSize * 0.18);
    };

    let y = 10;

    // ── Título ──
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(nombreColegio.toUpperCase(), W / 2, y, { align: 'center' });
    y += 5;
    doc.setFontSize(9);
    doc.text('RECIBO DE PAGO I, II QUINCENA Y BONO DE ALIMENTACIÓN', W / 2, y, { align: 'center' });
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Mes:  ${(data.mes || '').toUpperCase()}`, W / 2, y, { align: 'center' });
    y += 3;

    // ── Fila 1 encabezado empleado ──
    const cW = (RM - LM) / 4;
    const rH = 7;
    const hdrBg = [220, 230, 245];

    cell('Apellidos y Nombres', LM,           y, cW * 1.6, rH, { bold: true, bg: hdrBg, fontSize: 7 });
    cell('C.I Nº',              LM + cW*1.6,  y, cW * 0.8, rH, { bold: true, bg: hdrBg, fontSize: 7 });
    cell('Nº H /Sem',           LM + cW*2.4,  y, cW * 0.6, rH, { bold: true, bg: hdrBg, fontSize: 7 });
    cell('Cargo',               LM + cW*3.0,  y, cW * 1.0, rH, { bold: true, bg: hdrBg, fontSize: 7 });
    y += rH;

    cell(`${emp.apellido?.toUpperCase()} ${emp.nombre?.toUpperCase()}`, LM, y, cW*1.6, rH, { fontSize: 7 });
    cell(emp.cedula || '',                   LM + cW*1.6, y, cW*0.8, rH, { fontSize: 7 });
    cell(data.horas_semanales || '',         LM + cW*2.4, y, cW*0.6, rH, { align: 'center', fontSize: 7 });
    cell((emp.cargo || '').toUpperCase(),    LM + cW*3.0, y, cW*1.0, rH, { fontSize: 7 });
    y += rH;

    // ── Fila 2 encabezado empleado ──
    cell('Fecha de Ingreso',    LM,          y, cW*0.8, rH, { bold: true, bg: hdrBg, fontSize: 7 });
    cell('Título',              LM+cW*0.8,   y, cW*0.6, rH, { bold: true, bg: hdrBg, fontSize: 7 });
    cell('Categoría Docente',   LM+cW*1.4,   y, cW*0.8, rH, { bold: true, bg: hdrBg, fontSize: 7 });
    cell('NIVEL',               LM+cW*2.2,   y, cW*0.8, rH, { bold: true, bg: hdrBg, fontSize: 7 });
    doc.setDrawColor(180,180,180);
    doc.rect(LM+cW*3.0, y, cW*1.0, rH); // espacio vacío
    y += rH;

    cell(emp.fecha_ingreso || '',      LM,         y, cW*0.8, rH, { fontSize: 7, align: 'center' });
    cell(emp.titulo || '',             LM+cW*0.8,  y, cW*0.6, rH, { fontSize: 7, align: 'center' });
    cell(emp.categoria_docente || '',  LM+cW*1.4,  y, cW*0.8, rH, { fontSize: 7, align: 'center' });
    cell(emp.nivel || '',              LM+cW*2.2,  y, cW*0.8, rH, { fontSize: 7, align: 'center' });
    doc.rect(LM+cW*3.0, y, cW*1.0, rH);
    y += rH + 2;

    // ── Bloque ASIGNACIONES + RETENCIONES en paralelo ──
    const half     = (RM - LM) / 2 - 1;
    const xLeft    = LM;
    const xRight   = LM + half + 2;
    const dH       = 6.5;

    // Encabezados de sección
    cell('ASIGNACIONES MENSUALES', xLeft,  y, half, dH, { bold: true, bg: [200, 215, 240], align: 'center', fontSize: 8 });
    cell('RETENCIONES',            xRight, y, half, dH, { bold: true, bg: [200, 215, 240], align: 'center', fontSize: 8 });
    y += dH;

    // Filas asignaciones + retenciones en paralelo
    const asigRows = [
        ['SUELDO BASE',       fmt(sueldoBase)],
        ['',                  ''],
        ['OTRAS ASIGNACIONES',fmt(otrasAsig)],
        ['TOTAL ASIGNACIONES',fmt(totalAsig)],
        ['MONTO PRIMERA QUINCENA', fmt(quincena)],
        ['DEDUCCIONES',       ''],
        ['MONTO SEGUNDA QUINCENA', fmt(quincena)],
    ];
    const retRows = [
        ['F.A.O.V',     fmt(faov)],
        ['S.S.O',       fmt(sso)],
        ['',            ''],
        ['S.P.F',       fmt(spf)],
        ['',            ''],
        ['Total Retenciones', fmt(totalRet)],
        ['Neto a Depositar',  fmt(netoMensual)],
    ];

    const labelW = half * 0.62;
    const valW   = half - labelW;

    asigRows.forEach((row, i) => {
        const retRow = retRows[i] || ['',''];
        const isBold = [3,4,6].includes(i);

        cell(row[0], xLeft,           y, labelW, dH, { bold: isBold, fontSize: 7 });
        cell(row[1], xLeft + labelW,  y, valW,   dH, { bold: isBold, fontSize: 7, align: 'right' });

        const rBold = [5,6].includes(i);
        cell(retRow[0], xRight,             y, labelW, dH, { bold: rBold, fontSize: 7 });
        cell(retRow[1], xRight + labelW,    y, valW,   dH, { bold: rBold, fontSize: 7, align: 'right' });
        y += dH;
    });

    y += 2;

    // ── Prima por discapacidad (fila) ──
    const fullW = RM - LM;
    cell('PRIMA POR DISCAPACIDAD PARA EL PERSONAL E HIJOS', LM, y, fullW, dH, { fontSize: 7, bg: [235, 240, 250] });
    y += dH + 2;

    // ── Programa alimentario ──
    cell('PROGRAMA ALIMENTARIO', LM, y, fullW, dH, { bold: true, bg: [200, 215, 240], align: 'center', fontSize: 8 });
    y += dH;

    const col1 = fullW * 0.55;
    const col2 = fullW - col1;
    cell('MONTO DEL BENEFICIO DE ALIMENTACIÓN POR HORA:', LM,        y, col1, dH, { fontSize: 7 });
    cell(fmt(tarifaHora),                                  LM + col1, y, col2, dH, { fontSize: 7, align: 'right' });
    y += dH;

    cell('COSTO DIARIO DEL BENEFICIO DE ALIMENTACIÓN:', LM,        y, col1, dH, { fontSize: 7 });
    cell(fmt(costoDiario),                               LM + col1, y, col2, dH, { fontSize: 7, align: 'right' });
    y += dH;

    cell('TOTAL BENEFICIO DE ALIMENTACIÓN:', LM,        y, col1, dH, { bold: true, fontSize: 7 });
    cell(fmt(totalAlim),                     LM + col1, y, col2, dH, { bold: true, fontSize: 7, align: 'right' });
    y += dH;

    // Tabla inasistencia
    const qW  = fullW / 4;
    cell('Nº H /MENS de inasistencia', LM,        y, qW, dH, { bold: true, bg: hdrBg, fontSize: 7 });
    cell('Descuento por inasistencia', LM + qW,   y, qW, dH, { bold: true, bg: hdrBg, fontSize: 7 });
    cell('Total Beneficio de Alimentación a Recibir', LM + qW*2, y, qW*2, dH, { bold: true, bg: hdrBg, fontSize: 7 });
    y += dH;

    cell(hsInasistencia > 0 ? String(hsInasistencia) : '0', LM,       y, qW, dH, { align: 'center', fontSize: 7 });
    cell(hsInasistencia > 0 ? fmt(descAlim) : '0,00',       LM + qW,  y, qW, dH, { align: 'right', fontSize: 7 });
    cell(fmt(totalAlimRecibir), LM + qW*2, y, qW*2, dH, { bold: true, align: 'right', fontSize: 7 });
    y += dH + 8;

    // ── Firma ──
    const firmaY = Math.min(y, H - 35);
    const firmaX = W / 2 - 30;
    doc.setDrawColor(0);
    doc.setLineWidth(0.4);
    doc.line(firmaX, firmaY, firmaX + 60, firmaY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text('Firma del Empleado', W / 2, firmaY + 4, { align: 'center' });

    // ── Pie ──
    doc.setFontSize(6.5);
    doc.setTextColor(150, 150, 150);
    doc.text('Documento generado automáticamente — Sistema de Gestión Escolar', W / 2, H - 8, { align: 'center' });

    const nombreArchivo = `Recibo_${emp.apellido}_${(data.mes || 'SIN_MES').replace(/\s/g,'_').toUpperCase()}.pdf`;
    doc.save(nombreArchivo);
}

/* ─────────────────────────────────────────────────────────
   PDF: Recibo simple (Admin / Apoyo)
───────────────────────────────────────────────────────── */
function generarReciboSimplePDF(emp, data) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const W   = doc.internal.pageSize.getWidth();
    const H   = doc.internal.pageSize.getHeight();
    const LM  = 14;
    const RM  = W - LM;
    const fmt = (n) => (parseFloat(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 });

    let y = 14;

    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('RECIBO DE PAGO', W / 2, y, { align: 'center' });
    y += 5;
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`Mes: ${(data.mes || '').toUpperCase()}`, W / 2, y, { align: 'center' });
    y += 5;

    autoTable(doc, {
        startY: y,
        margin: { left: LM, right: LM },
        body: [
            ['Apellidos y Nombres', `${emp.apellido?.toUpperCase()} ${emp.nombre?.toUpperCase()}`],
            ['Cédula',   emp.cedula || ''],
            ['Cargo',    (emp.cargo || '').toUpperCase()],
            ['Tipo Personal', (emp.tipo_personal || '').toUpperCase()],
        ],
        theme: 'plain',
        styles: { fontSize: 8 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
    });

    y = doc.lastAutoTable.finalY + 4;

    const sueldo = parseFloat(data.sueldo_base) || 0;
    const sso    = Math.min(sueldo * SSO_PCT, SSO_TOPE);
    const spf    = sueldo * SPF_PCT;
    const faov   = sueldo * FAOV_PCT;
    const otrasDed = parseFloat(data.otras_deducciones) || 0;
    const totalDed = sso + spf + faov + otrasDed;
    const neto   = sueldo - totalDed;

    autoTable(doc, {
        startY: y,
        margin: { left: LM, right: LM },
        head: [['Concepto', 'Monto (Bs)']],
        body: [
            ['Sueldo / Salario Bruto',   fmt(sueldo)],
            ['', ''],
            ['S.S.O. (4%)',              `-${fmt(sso)}`],
            ['S.P.F. (0,5%)',            `-${fmt(spf)}`],
            ['F.A.O.V. (1%)',            `-${fmt(faov)}`],
            otrasDed > 0 ? ['Otras deducciones', `-${fmt(otrasDed)}`] : ['',''],
            ['Total Deducciones',        fmt(totalDed)],
            ['NETO A DEPOSITAR',         fmt(neto)],
        ],
        headStyles: { fillColor: [0, 79, 163], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 1: { halign: 'right' } },
        didParseCell: (d) => {
            if (d.section === 'body' && [6,7].includes(d.row.index)) {
                d.cell.styles.fontStyle = 'bold';
                if (d.row.index === 7) d.cell.styles.fillColor = [230, 245, 255];
            }
        },
    });

    y = doc.lastAutoTable.finalY + 10;
    doc.setDrawColor(0); doc.setLineWidth(0.4);
    doc.line(W/2 - 30, y, W/2 + 30, y);
    doc.setFontSize(7); doc.setTextColor(80,80,80);
    doc.text('Firma del Empleado', W/2, y + 4, { align: 'center' });

    doc.setFontSize(6.5); doc.setTextColor(150,150,150);
    doc.text('Documento generado automáticamente — Sistema de Gestión Escolar', W/2, H - 8, { align: 'center' });

    doc.save(`Recibo_${emp.apellido}_${(data.mes||'SIN_MES').replace(/\s/g,'_').toUpperCase()}.pdf`);
}

/* ─────────────────────────────────────────────────────────
   Componente principal
───────────────────────────────────────────────────────── */
const TABS = [
    { key: 'docente',        label: 'Docente',           icon: GraduationCap },
    { key: 'administrativo', label: 'Administrativo',    icon: Briefcase },
    { key: 'apoyo',          label: 'Personal de Apoyo', icon: Wrench },
];

const Nomina = () => {
    const [empleados, setEmpleados]       = useState([]);
    const [bancosNomina, setBancosNomina] = useState([]);
    const [loading, setLoading]           = useState(true);
    const [error, setError]               = useState(null);
    const [activeTab, setActiveTab]       = useState('docente');

    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [newEmployeeData, setNewEmployeeData]     = useState(EMPTY_EMP);

    const [showEditModal, setShowEditModal]       = useState(false);
    const [editEmployeeData, setEditEmployeeData] = useState(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [exporting, setExporting]       = useState(false);
    const [exportingExcel, setExportingExcel] = useState(false);

    // Cesta ticket config
    const [cestaConfig, setCestaConfig]         = useState(loadCestaConfig);
    const [showCestaModal, setShowCestaModal]   = useState(false);
    const [cestaForm, setCestaForm]             = useState(loadCestaConfig);

    // Recibo modal
    const [showReciboModal, setShowReciboModal] = useState(false);
    const [reciboEmp, setReciboEmp]             = useState(null);
    const [reciboData, setReciboData]           = useState(EMPTY_RECIBO);

    // Bancaribe
    const [showBancaribeModal, setShowBancaribeModal] = useState(false);
    const [loadingBancaribe, setLoadingBancaribe]     = useState(false);
    const [bancaribeRows, setBancaribeRows]           = useState([]);
    const [tasaDia, setTasaDia]                       = useState(0);
    const [showConceptoModal, setShowConceptoModal]   = useState(false);
    const [conceptoPago, setConceptoPago]             = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const [resEmp, resBancos] = await Promise.all([
                axiosInstance.get('rrhh/empleados/'),
                axiosInstance.get('rrhh/bancos-nomina/?activos=1'),
            ]);
            setEmpleados(resEmp.data || []);
            setBancosNomina(resBancos.data || []);
        } catch (err) {
            const code = err.response?.status;
            if (code === 403)      setError('No tienes permisos para ver la nómina.');
            else if (code === 500) setError('Error interno del servidor. Contacta al administrador.');
            else                   setError('Error de conexión. Verifica que el servidor esté activo.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // ── Empleados por tab ──
    const empleadosPorTab = useMemo(() => {
        const result = { docente: [], administrativo: [], apoyo: [] };
        empleados.forEach(e => {
            const t = e.tipo_personal || 'docente';
            if (result[t]) result[t].push(e);
            else result.docente.push(e);
        });
        return result;
    }, [empleados]);

    // ── Handlers registro / edición ──
    const handleNewChange = (e) => {
        const { name, value } = e.target;
        setNewEmployeeData(prev => ({ ...prev, [name]: value }));
    };

    const handleRegisterEmployee = async (e) => {
        e.preventDefault();
        const { nombre, apellido, cedula, cargo } = newEmployeeData;
        if (!nombre || !apellido || !cedula || !cargo) {
            setError('Nombre, apellido, cédula y cargo son obligatorios.'); return;
        }
        setIsSubmitting(true); setError(null);
        try {
            const payload = { ...newEmployeeData };
            if (!payload.banco) payload.banco = null;
            await axiosInstance.post('rrhh/empleados/', payload);
            toast.success('Empleado registrado exitosamente.');
            setShowRegisterModal(false);
            setNewEmployeeData(EMPTY_EMP);
            fetchData();
        } catch (err) {
            setError(err.response?.data?.detail || err.response?.data?.error || JSON.stringify(err.response?.data) || 'Error al registrar.');
        } finally { setIsSubmitting(false); }
    };

    const handleOpenEditModal = (emp) => {
        setEditEmployeeData({
            id: emp.id,
            nombre: emp.nombre || '',
            apellido: emp.apellido || '',
            cedula: emp.cedula || '',
            cargo: emp.cargo || '',
            tipo_personal: emp.tipo_personal || 'docente',
            fecha_ingreso: emp.fecha_ingreso || '',
            titulo: emp.titulo || '',
            categoria_docente: emp.categoria_docente || '',
            anos_servicio: emp.anos_servicio || '',
            numero_hijos: emp.numero_hijos ?? '0',
            nivel: emp.nivel || '',
            horas_semanales: emp.horas_semanales || '',
            banco: emp.banco ?? '',
            numero_cuenta: emp.numero_cuenta || '',
            tipo_cuenta: emp.tipo_cuenta || '',
            telefono: emp.telefono || '',
            correo: emp.correo || '',
        });
        setShowEditModal(true);
    };

    const handleEditChange = (e) => {
        const { name, value } = e.target;
        setEditEmployeeData(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveEmployee = async (e) => {
        e.preventDefault();
        const { nombre, apellido, cedula, cargo } = editEmployeeData;
        if (!nombre || !apellido || !cedula || !cargo) {
            setError('Nombre, apellido, cédula y cargo son obligatorios.'); return;
        }
        setIsSubmitting(true); setError(null);
        try {
            const payload = { ...editEmployeeData };
            delete payload.id;
            if (!payload.banco) payload.banco = null;
            await axiosInstance.patch(`rrhh/empleados/${editEmployeeData.id}/`, payload);
            toast.success('Empleado actualizado exitosamente.');
            setShowEditModal(false); setEditEmployeeData(null);
            fetchData();
        } catch (err) {
            setError(err.response?.data?.detail || err.response?.data?.error || JSON.stringify(err.response?.data) || 'Error al actualizar.');
        } finally { setIsSubmitting(false); }
    };

    // ── Recibo modal ──
    const handleOpenRecibo = (emp) => {
        setReciboEmp(emp);
        const mesActual = new Date().toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
        const tipo      = emp.tipo_personal || 'docente';
        setReciboData({
            ...EMPTY_RECIBO,
            mes:             mesActual.toUpperCase(),
            cesta_monto_usd: cestaConfig[tipo]?.monto_usd || '',
            cesta_tasa:      cestaConfig.tasa_bcv          || '',
        });
        setShowReciboModal(true);
    };

    // ── Handlers cesta config ──
    const handleCestaFormChange = (path, value) => {
        setCestaForm(prev => {
            // Campos planos
            if (['tasa_bcv', 'tarifa_hora'].includes(path))
                return { ...prev, [path]: value };
            // Rutas de dos niveles: "categorias.D-VI.costo_hora" o "docente.monto_usd"
            const parts = path.split('.');
            if (parts.length === 2) {
                const [k1, k2] = parts;
                return { ...prev, [k1]: { ...prev[k1], [k2]: value } };
            }
            if (parts.length === 3) {
                const [k1, k2, k3] = parts;
                return {
                    ...prev,
                    [k1]: {
                        ...prev[k1],
                        [k2]: { ...(prev[k1]?.[k2] || {}), [k3]: value },
                    },
                };
            }
            return prev;
        });
    };

    const handleSaveCestaConfig = () => {
        saveCestaConfig(cestaForm);
        setCestaConfig({ ...cestaForm });
        setShowCestaModal(false);
        toast.success('Configuración de cesta ticket guardada.');
    };

    const handleReciboChange = (e) => {
        const { name, value } = e.target;
        setReciboData(prev => ({ ...prev, [name]: value }));
    };

    // Cálculo 100 % automático — el usuario solo escribe período, inasistencias y cesta
    const reciboCalc = useMemo(() => {
        if (!reciboData || !reciboEmp) return null;
        const fmt = (n) => (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 });

        // ── Sueldo Base = Costo/Hora[categoría] × H/Sem (ambos de la ficha/config) ──
        const sueldoBase = calcSueldoBase(cestaConfig, reciboEmp.categoria_docente, reciboEmp.horas_semanales);
        const costoHora  = parseFloat(cestaConfig.categorias?.[reciboEmp.categoria_docente]?.costo_hora) || 0;
        const horasSem   = parseFloat(reciboEmp.horas_semanales) || 0;

        // ── Asignaciones y retenciones AVEC ──
        const avec = calcAVEC(
            sueldoBase,
            reciboEmp.categoria_docente,
            reciboEmp.anos_servicio,
            reciboEmp.numero_hijos,
            reciboEmp.titulo,
        );

        // ── Cesta Ticket ──
        const cestaUsd     = parseFloat(reciboData.cesta_monto_usd)  || 0;
        const cestaTasa    = parseFloat(reciboData.cesta_tasa)        || 0;
        const totalBs      = cestaUsd * cestaTasa;
        const tarifaHora   = parseFloat(cestaConfig.tarifa_hora)      || 0.20;
        const costoDiario  = tarifaHora * 7;                         // estimado: 7 h/día promedio
        const hsInasist    = parseFloat(reciboData.horas_inasistencia) || 0;
        const descuento    = hsInasist * tarifaHora;
        const totalRecibir = Math.max(totalBs - descuento, 0);

        const cesta = { tarifaHora, costoDiario, totalBs, hsInasistencia: hsInasist, descuento, totalRecibir };

        return { ...avec, sueldoBase, fmt, cesta };
    }, [reciboData, reciboEmp, cestaConfig]);

    const handleGenerarRecibo = () => {
        if (!reciboData.mes) { toast.warning('Ingresa el período (mes).'); return; }
        const costoHoraCat = parseFloat(cestaConfig.categorias?.[reciboEmp.categoria_docente]?.costo_hora) || 0;
        if (!reciboEmp.categoria_docente) {
            toast.warning('El docente no tiene categoría registrada. Edita su ficha primero.'); return;
        }
        if (!costoHoraCat) {
            toast.warning(`Configura el Costo/Hora para la categoría ${reciboEmp.categoria_docente} en "Cesta Ticket".`); return;
        }
        if (!reciboEmp.horas_semanales) {
            toast.warning(`${reciboEmp.nombre} no tiene N° H/Sem registradas. Edita su ficha primero.`); return;
        }
        if (!reciboCalc || reciboCalc.sueldoBase <= 0) {
            toast.error('Sueldo base resultó en 0. Verifica el costo/hora y las H/Sem del docente.'); return;
        }

        const dataParaPDF = { ...reciboData, sueldo_base: String(reciboCalc.sueldoBase) };

        if (reciboEmp.tipo_personal === 'docente' || !reciboEmp.tipo_personal) {
            generarReciboAVECPDF(reciboEmp, dataParaPDF, reciboCalc, reciboCalc.cesta);
        } else {
            generarReciboSimplePDF(reciboEmp, dataParaPDF);
        }
        toast.success('Recibo generado correctamente.');
        setShowReciboModal(false);
    };

    // ── Exportaciones ──
    const handleExportTXT = async () => {
        setExporting(true);
        try {
            const response = await axiosInstance.get('rrhh/empleados/exportar_txt/', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `NOMINA_${new Date().toISOString().split('T')[0]}.txt`);
            document.body.appendChild(link);
            link.click(); link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Archivo bancario generado exitosamente.');
        } catch { toast.error('Error al generar el archivo.'); }
        finally { setExporting(false); }
    };

    const handleExportExcel = async () => {
        setExportingExcel(true);
        try {
            const res = await axiosInstance.get('rrhh/empleados/exportar_excel/', { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }));
            const a = Object.assign(document.createElement('a'), {
                href: url, download: `nomina_${new Date().toISOString().split('T')[0]}.xlsx`,
            });
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Archivo Excel descargado.');
        } catch { toast.error('No se pudo generar el Excel de nómina.'); }
        finally { setExportingExcel(false); }
    };

    // ── Bancaribe ──
    const handleOpenBancaribeModal = async () => {
        setLoadingBancaribe(true);
        try {
            const res = await axiosInstance.get('rrhh/empleados/preview_bancaribe/');
            const { empleados: emps, tasa } = res.data;
            setTasaDia(tasa || 0);
            setBancaribeRows(emps.map(e => ({ ...e, monto_usd: '' })));
            setShowBancaribeModal(true);
        } catch { toast.error('No se pudo cargar la vista previa de Bancaribe.'); }
        finally { setLoadingBancaribe(false); }
    };

    const generarPlanillaPDF = (pagos, tasa, concepto) => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
        const fecha    = new Date();
        const fechaStr = fecha.toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });

        doc.setFontSize(14); doc.setFont('helvetica', 'bold');
        doc.text('PLANILLA DE PAGO DE NÓMINA — BANCARIBE', doc.internal.pageSize.getWidth() / 2, 18, { align: 'center' });
        doc.setFontSize(9); doc.setFont('helvetica', 'normal');
        doc.text(`Fecha: ${fechaStr}`, 14, 26);
        doc.text(`Tasa del día: ${tasa.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs/USD`, 14, 31);
        doc.text(`Concepto: ${concepto || '—'}`, 14, 36);
        doc.text(`Total empleados: ${pagos.length}`, 14, 41);

        const totalVes = pagos.reduce((acc, r) => acc + parseFloat(r.monto_usd) * tasa, 0);
        doc.setFont('helvetica', 'bold');
        doc.text(`Total transferido: ${totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs`, 14, 46);

        autoTable(doc, {
            startY: 52,
            head: [['N°', 'Cédula', 'Nombre', 'Apellido', 'Monto USD', 'Monto Bs', 'Firma']],
            body: pagos.map((r, i) => [
                i + 1, `V-${r.cedula}`, r.nombre, r.apellido,
                `$ ${parseFloat(r.monto_usd).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
                `${(parseFloat(r.monto_usd) * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs`,
                '',
            ]),
            columnStyles: {
                0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 28 },
                2: { cellWidth: 40 }, 3: { cellWidth: 40 },
                4: { cellWidth: 28, halign: 'right' }, 5: { cellWidth: 35, halign: 'right' }, 6: { cellWidth: 60 },
            },
            headStyles: { fillColor: [0, 79, 163], textColor: 255, fontStyle: 'bold', fontSize: 8 },
            bodyStyles: { fontSize: 8, minCellHeight: 14 },
            alternateRowStyles: { fillColor: [240, 245, 255] },
            styles: { overflow: 'linebreak', cellPadding: 3 },
            didDrawCell: (data) => {
                if (data.section === 'body' && data.column.index === 6) {
                    const x1 = data.cell.x + 6, x2 = data.cell.x + data.cell.width - 6;
                    const y  = data.cell.y + data.cell.height - 4;
                    doc.setDrawColor(150,150,150); doc.setLineWidth(0.3);
                    doc.line(x1, y, x2, y);
                }
            },
        });

        const pageH = doc.internal.pageSize.getHeight();
        doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.setTextColor(120,120,120);
        doc.text('Documento generado automáticamente — Sistema de Gestión Escolar', doc.internal.pageSize.getWidth() / 2, pageH - 8, { align: 'center' });
        doc.save(`Planilla_Bancaribe_${fecha.toISOString().slice(0,10).replace(/-/g,'')}.pdf`);
    };

    const handleAbrirConceptoModal = () => {
        if (bancaribeRows.filter(r => parseFloat(r.monto_usd) > 0).length === 0) {
            toast.warning('Ingresa al menos un monto mayor a 0.'); return;
        }
        setShowConceptoModal(true);
    };

    const handleConfirmarGeneracion = () => {
        if (!conceptoPago.trim()) { toast.warning('Escribe el concepto de pago.'); return; }
        const pagos  = bancaribeRows.filter(r => parseFloat(r.monto_usd) > 0);
        const lines  = pagos.map(r => {
            const cuenta = r.numero_cuenta.trim(), codBanco = cuenta.slice(0,4);
            const montoVes = (parseFloat(r.monto_usd) * tasaDia).toFixed(2);
            const cedula   = r.cedula.replace(/^[Vv]-?/,'');
            const nombre   = `${r.nombre.toUpperCase()} ${r.apellido.toUpperCase()}`;
            return `PAP//0/${codBanco}/${cuenta}/${r.tipo_cuenta}/0/${montoVes}/V${cedula}/${nombre}//${r.correo||''}/${(r.telefono||'').replace(/[-\s]/g,'')}//`;
        });
        const blob   = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
        const url    = URL.createObjectURL(blob);
        const fecha  = new Date().toISOString().slice(0,10).replace(/-/g,'');
        const link   = document.createElement('a');
        link.href = url; link.download = `Pagos PAP-${fecha}.txt`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        URL.revokeObjectURL(url);
        generarPlanillaPDF(pagos, tasaDia, conceptoPago.trim());
        toast.success(`TXT y planilla PDF generados con ${pagos.length} empleado(s).`);
        setShowConceptoModal(false); setConceptoPago('');
        setShowBancaribeModal(false); setBancaribeRows([]); setTasaDia(0);
    };

    // ── Estilos reutilizables ──
    const inputCls   = "w-full px-3 py-2 rounded-lg text-sm outline-none";
    const inputStyle = { border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' };
    const labelCls   = "block text-[11px] uppercase tracking-widest mb-1.5";
    const labelStyle = { color: 'var(--ash)' };
    const sectionLabel = (text) => (
        <p className="text-[10px] uppercase tracking-widest font-medium pt-1" style={{ color: 'var(--ash)', opacity: 0.6 }}>{text}</p>
    );

    // ── Formulario de empleado (register / edit) ──
    const renderEmpleadoForm = (data, onChange, isEdit = false) => {
        const isDocente = data.tipo_personal === 'docente' || !data.tipo_personal;
        return (
            <div className="space-y-3">
                {/* Tipo de personal */}
                <div>
                    <label className={labelCls} style={labelStyle}>Tipo de personal <span style={{ color: 'var(--red)' }}>*</span></label>
                    <select name="tipo_personal" value={data.tipo_personal} onChange={onChange} className={inputCls} style={inputStyle}>
                        <option value="docente">Docente</option>
                        <option value="administrativo">Administrativo</option>
                        <option value="apoyo">Personal de Apoyo</option>
                    </select>
                </div>

                {/* Nombre + Apellido */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={labelCls} style={labelStyle}>Nombre <span style={{ color: 'var(--red)' }}>*</span></label>
                        <input name="nombre" value={data.nombre} onChange={onChange} placeholder="Juan" className={inputCls} style={inputStyle} required />
                    </div>
                    <div>
                        <label className={labelCls} style={labelStyle}>Apellido <span style={{ color: 'var(--red)' }}>*</span></label>
                        <input name="apellido" value={data.apellido} onChange={onChange} placeholder="Pérez" className={inputCls} style={inputStyle} required />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={labelCls} style={labelStyle}>Cédula <span style={{ color: 'var(--red)' }}>*</span></label>
                        <input name="cedula" value={data.cedula} onChange={onChange} placeholder="V-12345678" className={inputCls} style={inputStyle} required />
                    </div>
                    <div>
                        <label className={labelCls} style={labelStyle}>Cargo <span style={{ color: 'var(--red)' }}>*</span></label>
                        <input name="cargo" value={data.cargo} onChange={onChange} placeholder="Profesor / Director" className={inputCls} style={inputStyle} required />
                    </div>
                </div>

                {/* Campos AVEC solo para docentes */}
                {isDocente && (
                    <>
                        {sectionLabel('Datos AVEC / MPPE')}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls} style={labelStyle}>Categoría Docente</label>
                                <select name="categoria_docente" value={data.categoria_docente} onChange={onChange} className={inputCls} style={inputStyle}>
                                    <option value="">— Seleccionar —</option>
                                    {CATEGORIAS_DOCENTE.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={labelCls} style={labelStyle}>Título Académico</label>
                                <input name="titulo" value={data.titulo} onChange={onChange} placeholder="LEM / TSU / Prof." className={inputCls} style={inputStyle} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls} style={labelStyle}>N° H/Sem <span style={{ color: 'var(--red)' }}>*</span></label>
                                <input type="number" name="horas_semanales" value={data.horas_semanales} onChange={onChange}
                                    placeholder="36" className={inputCls} style={inputStyle} min="1" max="40" />
                                <p className="text-[10px] mt-1" style={{ color: 'var(--ash)' }}>Horas semanales asignadas (para cálculo de sueldo base)</p>
                            </div>
                            <div>
                                <label className={labelCls} style={labelStyle}>Fecha de Ingreso</label>
                                <input name="fecha_ingreso" value={data.fecha_ingreso} onChange={onChange} placeholder="15/09/1993" className={inputCls} style={inputStyle} />
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className={labelCls} style={labelStyle}>Años de Servicio</label>
                                <input type="number" name="anos_servicio" value={data.anos_servicio} onChange={onChange} placeholder="30" className={inputCls} style={inputStyle} min="0" />
                            </div>
                            <div>
                                <label className={labelCls} style={labelStyle}>N° Hijos</label>
                                <input type="number" name="numero_hijos" value={data.numero_hijos} onChange={onChange} placeholder="0" className={inputCls} style={inputStyle} min="0" />
                            </div>
                            <div>
                                <label className={labelCls} style={labelStyle}>Nivel que dicta</label>
                                <input name="nivel" value={data.nivel} onChange={onChange} placeholder="TODAS / Primaria" className={inputCls} style={inputStyle} />
                            </div>
                        </div>
                    </>
                )}

                {sectionLabel('Contacto')}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={labelCls} style={labelStyle}>Teléfono</label>
                        <input name="telefono" value={data.telefono} onChange={onChange} placeholder="0414-0000000" className={inputCls} style={inputStyle} />
                    </div>
                    <div>
                        <label className={labelCls} style={labelStyle}>Correo</label>
                        <input type="email" name="correo" value={data.correo} onChange={onChange} placeholder="empleado@correo.com" className={inputCls} style={inputStyle} />
                    </div>
                </div>

                {sectionLabel('Datos bancarios')}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={labelCls} style={labelStyle}>Banco</label>
                        <select name="banco" value={data.banco} onChange={onChange} className={inputCls} style={inputStyle}>
                            <option value="">— Sin banco —</option>
                            {bancosNomina.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls} style={labelStyle}>Tipo de cuenta</label>
                        <select name="tipo_cuenta" value={data.tipo_cuenta} onChange={onChange} className={inputCls} style={inputStyle}>
                            <option value="">— Sin especificar —</option>
                            <option value="CTE">Corriente</option>
                            <option value="AHO">Ahorro</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label className={labelCls} style={labelStyle}>Número de cuenta</label>
                    <input name="numero_cuenta" value={data.numero_cuenta} onChange={onChange} placeholder="01140000000000000000" className={inputCls} style={{ ...inputStyle, fontFamily: 'monospace' }} />
                </div>
            </div>
        );
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-20">
            <Loader2 className="animate-spin mb-3" size={36} style={{ color: 'var(--pb)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--ash)' }}>Cargando nómina...</p>
        </div>
    );

    const tabEmpleados = empleadosPorTab[activeTab] || [];
    const isDocente    = activeTab === 'docente';

    return (
        <div className="animate-fadeIn">
            {/* ── Header ── */}
            <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>Gestión de Nómina</h2>
                    <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>Registro y administración del personal</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={() => setShowRegisterModal(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                        style={{ background: 'var(--pb)' }}>
                        <Plus size={16} /> Nuevo Empleado
                    </button>
                    <button onClick={() => { setCestaForm({ ...cestaConfig }); setShowCestaModal(true); }}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                        title="Configurar cesta ticket por estamento">
                        <DollarSign size={16} /> Cesta Ticket
                        {parseFloat(cestaConfig.tasa_bcv) > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                style={{ background: '#dcfce7', color: '#16a34a' }}>
                                {parseFloat(cestaConfig.tasa_bcv).toLocaleString('es-VE')} Bs
                            </span>
                        )}
                    </button>
                    <button onClick={fetchData}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                        <RefreshCcw size={16} />
                    </button>
                    <button onClick={handleExportExcel} disabled={exportingExcel || empleados.length === 0}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        style={{ background: 'var(--jet)' }}>
                        {exportingExcel ? <Loader2 className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />}
                        {exportingExcel ? 'Exportando...' : 'Excel'}
                    </button>
                    <button onClick={handleExportTXT} disabled={exporting || empleados.length === 0}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                        {exporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                        {exporting ? 'Exportando...' : 'TXT Banco'}
                    </button>
                    <button onClick={handleOpenBancaribeModal} disabled={loadingBancaribe || empleados.length === 0}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        style={{ background: '#004FA3' }}>
                        {loadingBancaribe ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
                        {loadingBancaribe ? 'Cargando...' : 'Bancaribe'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-4 p-3 rounded-xl flex items-start gap-2 text-sm"
                     style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                    <AlertCircle size={15} className="flex-shrink-0 mt-0.5" /><span>{error}</span>
                </div>
            )}

            {/* ── Stat cards ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                {TABS.map(t => {
                    const Icon = t.icon;
                    return (
                        <div key={t.key} className="rounded-xl p-4" style={{ background: 'var(--porcelain)', border: `0.5px solid ${activeTab === t.key ? 'var(--pb)' : 'var(--border-md)'}` }}>
                            <p className="text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--ash)' }}>{t.label}</p>
                            <div className="flex items-center gap-2">
                                <Icon size={18} style={{ color: 'var(--pb)' }} />
                                <p className="text-lg font-medium" style={{ color: 'var(--jet)' }}>{(empleadosPorTab[t.key] || []).length} empleados</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Tabs ── */}
            <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', width: 'fit-content' }}>
                {TABS.map(t => {
                    const Icon = t.icon;
                    const active = activeTab === t.key;
                    return (
                        <button key={t.key} onClick={() => setActiveTab(t.key)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                            style={{
                                background: active ? 'var(--pb)' : 'transparent',
                                color: active ? '#fff' : 'var(--ash)',
                            }}>
                            <Icon size={14} />
                            {t.label}
                            <span className="text-xs px-1.5 py-0.5 rounded-full ml-1"
                                style={{ background: active ? 'rgba(255,255,255,0.2)' : 'var(--border-md)', color: active ? '#fff' : 'var(--ash)' }}>
                                {(empleadosPorTab[t.key] || []).length}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* ── Tabla de empleados ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr>
                                {['Empleado', 'Cargo', isDocente ? 'Categoría / Años' : 'Detalles', 'Banco', 'N° Cuenta', 'Acción'].map(h => (
                                    <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-widest"
                                        style={{ color: 'var(--ash)', background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {tabEmpleados.length > 0 ? tabEmpleados.map(emp => (
                                <tr key={emp.id} style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                                    <td className="px-4 py-3">
                                        <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{emp.nombre} {emp.apellido}</p>
                                        <p className="text-xs font-mono" style={{ color: 'var(--ash)' }}>V-{emp.cedula}</p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs px-2 py-1 rounded-md"
                                            style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
                                            {emp.cargo}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {isDocente ? (
                                            <div>
                                                <p className="text-xs font-medium" style={{ color: 'var(--jet)' }}>{emp.categoria_docente || <span style={{ color: 'var(--ash)' }}>—</span>}</p>
                                                {emp.anos_servicio && <p className="text-[11px]" style={{ color: 'var(--ash)' }}>{emp.anos_servicio} años servicio</p>}
                                            </div>
                                        ) : (
                                            <p className="text-xs" style={{ color: 'var(--ash)' }}>{emp.correo || emp.telefono || '—'}</p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--jet)' }}>
                                        {emp.banco_nombre || <span style={{ color: 'var(--ash)' }}>—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--jet)' }}>
                                        {emp.numero_cuenta || <span style={{ color: 'var(--ash)' }}>—</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => handleOpenEditModal(emp)}
                                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                                                style={{ color: 'var(--jet)', border: '0.5px solid var(--border-md)' }}>
                                                <Pencil size={12} /> Editar
                                            </button>
                                            <button onClick={() => handleOpenRecibo(emp)}
                                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                                                style={{ background: 'var(--pb)' }}>
                                                <Receipt size={12} /> Recibo
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="6" className="px-4 py-16 text-center text-sm" style={{ color: 'var(--ash)' }}>
                                        No hay personal {TABS.find(t => t.key === activeTab)?.label.toLowerCase()} registrado.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ════════════════════════════════════════════════
                MODAL RECIBO DE PAGO
            ════════════════════════════════════════════════ */}
            {showReciboModal && reciboEmp && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(43,48,58,0.65)' }}>
                    <div className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ background: 'var(--porcelain)', maxHeight: '92vh' }}>

                        {/* Header */}
                        <div className="flex justify-between items-center px-6 py-4 flex-shrink-0"
                            style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <div>
                                <div className="flex items-center gap-2">
                                    <Receipt size={16} style={{ color: 'var(--pb)' }} />
                                    <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                        Generar Recibo — {reciboEmp.apellido} {reciboEmp.nombre}
                                    </h3>
                                </div>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                                    {reciboEmp.cedula} · {reciboEmp.cargo} · {TABS.find(t => t.key === (reciboEmp.tipo_personal || 'docente'))?.label}
                                </p>
                            </div>
                            <button onClick={() => setShowReciboModal(false)} style={{ color: 'var(--ash)' }}><X size={18} /></button>
                        </div>

                        <div className="overflow-y-auto flex-1 p-6 space-y-4">

                            {/* ── Sueldo base automático (informativo) ── */}
                            {(() => {
                                const cat       = reciboEmp?.categoria_docente;
                                const costoHora = parseFloat(cestaConfig.categorias?.[cat]?.costo_hora) || 0;
                                const hSem      = parseFloat(reciboEmp?.horas_semanales) || 0;
                                const sb        = costoHora * hSem;
                                const ok        = costoHora > 0 && hSem > 0;
                                const warn      = !cat
                                    ? '⚠ El docente no tiene categoría — edita su ficha'
                                    : !costoHora
                                        ? `⚠ Configura el Costo/Hora para ${cat} en "Cesta Ticket"`
                                        : '⚠ El docente no tiene H/Sem registradas — edita su ficha';
                                return (
                                    <div className="rounded-xl p-3 flex items-center justify-between gap-3"
                                        style={{ background: ok ? 'var(--pb-light)' : '#fef9c3', border: `0.5px solid ${ok ? 'var(--border-md)' : '#fde047'}` }}>
                                        <div className="text-xs space-y-0.5">
                                            <p className="font-medium" style={{ color: ok ? 'var(--pb-mid)' : '#92400e' }}>
                                                Sueldo Base · Categoría {cat || '—'} · {hSem} H/Sem
                                            </p>
                                            <p style={{ color: 'var(--ash)' }}>
                                                {ok
                                                    ? `${costoHora.toLocaleString('es-VE', {minimumFractionDigits:2})} Bs/h (${cat}) × ${hSem} h/sem`
                                                    : warn}
                                            </p>
                                        </div>
                                        <span className="font-mono font-bold text-base flex-shrink-0"
                                            style={{ color: ok ? 'var(--pb)' : '#b45309' }}>
                                            {ok ? `${sb.toLocaleString('es-VE', {minimumFractionDigits:2})} Bs` : '—'}
                                        </span>
                                    </div>
                                );
                            })()}

                            {/* ── Período ── */}
                            <div>
                                <label className={labelCls} style={labelStyle}>Período <span style={{ color: 'var(--red)' }}>*</span></label>
                                <input name="mes" value={reciboData.mes} onChange={handleReciboChange}
                                    placeholder="MAYO 2026" autoFocus
                                    className={inputCls} style={inputStyle} />
                            </div>

                            {/* ── Inasistencias ── */}
                            <div>
                                <label className={labelCls} style={labelStyle}>H/Mens de Inasistencia</label>
                                <input name="horas_inasistencia" value={reciboData.horas_inasistencia} onChange={handleReciboChange}
                                    type="number" step="0.5" min="0" placeholder="0"
                                    className={inputCls} style={inputStyle} />
                                <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>
                                    Horas totales no trabajadas en el mes (descuento proporcional de cesta ticket).
                                </p>
                            </div>

                            {/* ── Fila 3: Cesta Ticket ── */}
                            <div className="rounded-xl p-4 space-y-3" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                                <div className="flex items-center gap-2">
                                    <DollarSign size={13} style={{ color: 'var(--pb)' }} />
                                    <span className="text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>
                                        Cesta Ticket (Beneficio Alimentario)
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={labelCls} style={labelStyle}>Monto (USD)</label>
                                        <div className="flex items-center gap-1">
                                            <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--ash)' }}>$</span>
                                            <input name="cesta_monto_usd" value={reciboData.cesta_monto_usd} onChange={handleReciboChange}
                                                type="number" step="0.01" min="0" placeholder="0.00"
                                                className={inputCls} style={inputStyle} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelCls} style={labelStyle}>Tasa BCV (Bs/USD)</label>
                                        <input name="cesta_tasa" value={reciboData.cesta_tasa} onChange={handleReciboChange}
                                            type="number" step="0.01" min="0" placeholder="0.00"
                                            className={inputCls} style={{ ...inputStyle, fontFamily: 'monospace' }} />
                                    </div>
                                </div>
                                {reciboCalc && reciboCalc.cesta.totalBs > 0 && (
                                    <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg"
                                        style={{ background: '#dcfce7', color: '#15803d' }}>
                                        <span>Total beneficio calculado</span>
                                        <span className="font-mono font-bold">
                                            {reciboCalc.fmt(reciboCalc.cesta.totalBs)} Bs
                                            {reciboCalc.cesta.descuento > 0 && (
                                                <span className="ml-2 font-normal" style={{ color: '#b45309' }}>
                                                    − {reciboCalc.fmt(reciboCalc.cesta.descuento)} desc.
                                                    = {reciboCalc.fmt(reciboCalc.cesta.totalRecibir)} Bs neto
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* ── Preview AVEC automático ── */}
                            {reciboCalc && reciboCalc.sueldoBase > 0 && (
                                <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
                                    <div className="px-4 py-2 flex items-center gap-2"
                                        style={{ background: 'var(--pb-light)', borderBottom: '0.5px solid var(--border-md)' }}>
                                        <Receipt size={13} style={{ color: 'var(--pb)' }} />
                                        <span className="text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--pb-mid)' }}>
                                            Desglose calculado automáticamente
                                        </span>
                                        <span className="text-[10px] ml-auto" style={{ color: 'var(--ash)' }}>
                                            {(cestaConfig.categorias?.[reciboEmp.categoria_docente]?.costo_hora || '?')} Bs/h · {reciboEmp.categoria_docente || '—'} · {reciboEmp.horas_semanales} h/sem · {reciboEmp.anos_servicio || 0} años · {reciboEmp.numero_hijos || 0} hijo(s)
                                        </span>
                                    </div>
                                    <div className="p-4 grid grid-cols-2 gap-x-8 gap-y-1 text-xs" style={{ background: 'var(--porcelain)' }}>
                                        {/* Asignaciones */}
                                        <div className="space-y-1">
                                            <p className="text-[10px] uppercase tracking-widest mb-2 font-medium" style={{ color: 'var(--ash)', opacity: 0.7 }}>Asignaciones</p>
                                            {[
                                                ['Sueldo Base',            reciboCalc.sueldoBase],
                                                ['4A · Antigüedad',        reciboCalc.primaAnt],
                                                ['4B · Prima Docente',     reciboCalc.primaDoc],
                                                ['4C · Prima Geográfica',  reciboCalc.primaGeo],
                                                ['4D · Postgrado/Comp.',   reciboCalc.primaPos],
                                                ['4E · Ayuda Asistencial', reciboCalc.primaAsis],
                                                ['4F · Prima Hijos',       reciboCalc.primaHijos],
                                            ].map(([lbl, val]) => (
                                                <div key={lbl} className="flex justify-between">
                                                    <span style={{ color: val > 0 ? 'var(--jet)' : 'var(--ash)' }}>{lbl}</span>
                                                    <span className="font-mono" style={{ color: val > 0 ? 'var(--jet)' : 'var(--ash)' }}>{reciboCalc.fmt(val)}</span>
                                                </div>
                                            ))}
                                            <div className="flex justify-between pt-1 mt-1 font-semibold" style={{ borderTop: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
                                                <span>Otras Asignaciones</span>
                                                <span className="font-mono">{reciboCalc.fmt(reciboCalc.otrasAsig)}</span>
                                            </div>
                                            <div className="flex justify-between font-bold text-[13px]" style={{ color: 'var(--pb)' }}>
                                                <span>Total Asignaciones</span>
                                                <span className="font-mono">{reciboCalc.fmt(reciboCalc.totalAsig)}</span>
                                            </div>
                                        </div>
                                        {/* Retenciones + Neto */}
                                        <div className="space-y-1">
                                            <p className="text-[10px] uppercase tracking-widest mb-2 font-medium" style={{ color: 'var(--ash)', opacity: 0.7 }}>Retenciones</p>
                                            {[
                                                [`SSO (4%, tope ${SSO_TOPE} Bs)`, reciboCalc.sso],
                                                ['SPF (0,5%)',                     reciboCalc.spf],
                                                ['FAOV (1%)',                      reciboCalc.faov],
                                            ].map(([lbl, val]) => (
                                                <div key={lbl} className="flex justify-between">
                                                    <span style={{ color: 'var(--jet)' }}>{lbl}</span>
                                                    <span className="font-mono" style={{ color: '#dc2626' }}>{reciboCalc.fmt(val)}</span>
                                                </div>
                                            ))}
                                            <div className="flex justify-between font-semibold pt-1 mt-1" style={{ borderTop: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
                                                <span>Total Retenciones</span>
                                                <span className="font-mono" style={{ color: '#dc2626' }}>{reciboCalc.fmt(reciboCalc.totalRet)}</span>
                                            </div>
                                            <div className="flex justify-between font-bold text-[13px] mt-2" style={{ color: 'var(--pb)' }}>
                                                <span>Neto a Depositar</span>
                                                <span className="font-mono">{reciboCalc.fmt(reciboCalc.neto)}</span>
                                            </div>
                                            <div className="flex justify-between text-[11px]" style={{ color: 'var(--ash)' }}>
                                                <span>1ra Quincena</span>
                                                <span className="font-mono">{reciboCalc.fmt(reciboCalc.quincena)}</span>
                                            </div>
                                            <div className="flex justify-between text-[11px]" style={{ color: 'var(--ash)' }}>
                                                <span>2da Quincena</span>
                                                <span className="font-mono">{reciboCalc.fmt(reciboCalc.quincena)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 flex justify-end gap-2 flex-shrink-0"
                            style={{ borderTop: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <button onClick={() => setShowReciboModal(false)}
                                className="px-4 py-2 rounded-lg text-sm font-medium"
                                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                Cancelar
                            </button>
                            <button onClick={handleGenerarRecibo}
                                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white"
                                style={{ background: 'var(--pb)' }}>
                                <Download size={15} /> Descargar Recibo PDF
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════
                MODAL BANCARIBE
            ════════════════════════════════════════════════ */}
            {showBancaribeModal && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(43,48,58,0.6)' }}>
                    <div className="w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ background: 'var(--porcelain)', maxHeight: '90vh' }}>
                        <div className="flex justify-between items-center px-6 py-4 flex-shrink-0"
                            style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: '#004FA3' }} />
                                <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Generar pago Bancaribe</h3>
                                <div className="flex items-center gap-2">
                                    <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Tasa Bs/USD</label>
                                    <input type="number" min="0" step="0.0001" value={tasaDia}
                                        onChange={e => setTasaDia(parseFloat(e.target.value) || 0)}
                                        className="w-28 px-2.5 py-1 rounded-lg text-sm font-mono outline-none text-right"
                                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }} />
                                </div>
                            </div>
                            <button onClick={() => { setShowBancaribeModal(false); setBancaribeRows([]); setTasaDia(0); }} style={{ color: 'var(--ash)' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1">
                            {bancaribeRows.length === 0 ? (
                                <div className="py-20 text-center text-sm" style={{ color: 'var(--ash)' }}>
                                    No hay empleados con cuenta Bancaribe (0114) configurada.
                                </div>
                            ) : (
                                <table className="w-full text-left">
                                    <thead className="sticky top-0" style={{ background: 'var(--porcelain)', zIndex: 1 }}>
                                        <tr>
                                            {['Empleado', 'Cédula', 'N° Cuenta', 'Tipo', 'Monto USD', 'Monto Bs'].map(h => (
                                                <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-widest"
                                                    style={{ color: 'var(--ash)', borderBottom: '0.5px solid var(--border-md)' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bancaribeRows.map(row => {
                                            const montoUsd = parseFloat(row.monto_usd) || 0;
                                            const montoVes = tasaDia > 0 ? (montoUsd * tasaDia).toFixed(2) : '—';
                                            const activo   = montoUsd > 0;
                                            return (
                                                <tr key={row.id} style={{ borderBottom: '0.5px solid var(--border)', background: activo ? 'rgba(232,64,28,0.04)' : 'var(--porcelain)' }}>
                                                    <td className="px-4 py-3">
                                                        <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{row.nombre} {row.apellido}</p>
                                                        <p className="text-[11px]" style={{ color: 'var(--ash)' }}>{row.banco_nombre}</p>
                                                    </td>
                                                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--ash)' }}>V-{row.cedula}</td>
                                                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--jet)' }}>{row.numero_cuenta}</td>
                                                    <td className="px-4 py-3">
                                                        <span className="text-xs px-2 py-0.5 rounded-md font-medium"
                                                            style={{ background: row.tipo_cuenta === 'CTE' ? 'var(--pb-light)' : '#f0fdf4', color: row.tipo_cuenta === 'CTE' ? 'var(--pb-mid)' : '#16a34a' }}>
                                                            {row.tipo_cuenta === 'CTE' ? 'Corriente' : 'Ahorro'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-xs" style={{ color: 'var(--ash)' }}>$</span>
                                                            <input type="number" min="0" step="0.01" placeholder="0.00"
                                                                value={row.monto_usd}
                                                                onChange={e => setBancaribeRows(prev => prev.map(r => r.id === row.id ? { ...r, monto_usd: e.target.value } : r))}
                                                                className="w-28 px-2 py-1.5 rounded-lg text-sm font-mono outline-none text-right"
                                                                style={{ border: `0.5px solid ${activo ? '#004FA3' : 'var(--border-md)'}`, background: 'var(--porcelain)', color: 'var(--jet)' }} />
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm font-mono" style={{ color: activo ? 'var(--jet)' : 'var(--ash)' }}>
                                                        {activo && tasaDia > 0 ? `${montoVes} Bs` : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div className="px-6 py-4 flex justify-between items-center flex-shrink-0"
                            style={{ borderTop: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <p className="text-xs" style={{ color: 'var(--ash)' }}>
                                {bancaribeRows.filter(r => parseFloat(r.monto_usd) > 0).length} de {bancaribeRows.length} empleado(s) incluidos
                            </p>
                            <div className="flex gap-2">
                                <button onClick={() => { setShowBancaribeModal(false); setBancaribeRows([]); setTasaDia(0); }}
                                    className="px-4 py-2 rounded-lg text-sm font-medium"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>Cancelar</button>
                                <button onClick={handleAbrirConceptoModal} disabled={bancaribeRows.length === 0}
                                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                                    style={{ background: '#004FA3' }}>
                                    <Download size={15} /> Generar TXT
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════
                MODAL EDITAR EMPLEADO
            ════════════════════════════════════════════════ */}
            {showEditModal && editEmployeeData && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(43,48,58,0.5)' }}>
                    <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ background: 'var(--porcelain)', maxHeight: '92vh' }}>
                        <div className="flex justify-between items-center px-5 py-4 flex-shrink-0"
                            style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                Editar — {editEmployeeData.nombre} {editEmployeeData.apellido}
                            </h3>
                            <button onClick={() => { setShowEditModal(false); setEditEmployeeData(null); setError(null); }} style={{ color: 'var(--ash)' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSaveEmployee} className="p-5 overflow-y-auto flex-1">
                            {error && (
                                <div className="p-3 rounded-lg text-sm flex gap-2 mb-3"
                                    style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                                    <AlertCircle size={15} /> {error}
                                </div>
                            )}
                            {renderEmpleadoForm(editEmployeeData, handleEditChange, true)}
                            <div className="flex gap-2 pt-4">
                                <button type="button" onClick={() => { setShowEditModal(false); setEditEmployeeData(null); setError(null); }}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>Cancelar</button>
                                <button type="submit" disabled={isSubmitting}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                                    style={{ background: 'var(--pb)' }}>
                                    {isSubmitting ? <Loader2 className="animate-spin" size={15} /> : <Pencil size={15} />}
                                    {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════
                MODAL REGISTRAR EMPLEADO
            ════════════════════════════════════════════════ */}
            {showRegisterModal && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(43,48,58,0.5)' }}>
                    <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ background: 'var(--porcelain)', maxHeight: '92vh' }}>
                        <div className="flex justify-between items-center px-5 py-4 flex-shrink-0"
                            style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Registrar empleado</h3>
                            <button onClick={() => { setShowRegisterModal(false); setNewEmployeeData(EMPTY_EMP); setError(null); }} style={{ color: 'var(--ash)' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleRegisterEmployee} className="p-5 overflow-y-auto flex-1">
                            {error && (
                                <div className="p-3 rounded-lg text-sm flex gap-2 mb-3"
                                    style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                                    <AlertCircle size={15} /> {error}
                                </div>
                            )}
                            {renderEmpleadoForm(newEmployeeData, handleNewChange, false)}
                            <div className="flex gap-2 pt-4">
                                <button type="button" onClick={() => { setShowRegisterModal(false); setNewEmployeeData(EMPTY_EMP); setError(null); }}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>Cancelar</button>
                                <button type="submit" disabled={isSubmitting}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                                    style={{ background: 'var(--pb)' }}>
                                    {isSubmitting ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
                                    {isSubmitting ? 'Registrando...' : 'Registrar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════
                MODAL CONFIGURACIÓN CESTA TICKET
            ════════════════════════════════════════════════ */}
            {showCestaModal && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(43,48,58,0.65)' }}>
                    <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ background: 'var(--porcelain)', maxHeight: '92vh' }}>

                        {/* Header */}
                        <div className="flex justify-between items-center px-6 py-4 flex-shrink-0"
                            style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <div className="flex items-center gap-2">
                                <DollarSign size={16} style={{ color: 'var(--pb)' }} />
                                <div>
                                    <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Configuración de Cesta Ticket</h3>
                                    <p className="text-[11px]" style={{ color: 'var(--ash)' }}>Monto en USD por estamento · Se guarda localmente</p>
                                </div>
                            </div>
                            <button onClick={() => setShowCestaModal(false)} style={{ color: 'var(--ash)' }}><X size={18} /></button>
                        </div>

                        <div className="p-6 space-y-5 overflow-y-auto flex-1">
                            {/* ── Tabla AVEC: Costo/Hora por Categoría ── */}
                            <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
                                <div className="px-4 py-2.5 flex items-center justify-between"
                                    style={{ background: 'var(--pb-light)', borderBottom: '0.5px solid var(--border-md)' }}>
                                    <div>
                                        <p className="text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--pb-mid)' }}>
                                            Tabla AVEC — Costo por Hora según Categoría
                                        </p>
                                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--ash)' }}>
                                            Sueldo Base = Costo/Hora[categoría] × N° H/Sem del docente
                                        </p>
                                    </div>
                                </div>
                                <div className="divide-y" style={{ background: 'var(--porcelain)' }}>
                                    {CATEGORIAS_DOCENTE.map((cat, i) => {
                                        const valor    = cestaForm.categorias?.[cat]?.costo_hora || '';
                                        const ejemplo  = valor ? `Ej: ${parseFloat(valor).toLocaleString('es-VE',{minimumFractionDigits:2})} Bs/h × 36 h = ${(parseFloat(valor)*36).toLocaleString('es-VE',{minimumFractionDigits:2})} Bs` : null;
                                        return (
                                            <div key={cat} className="flex items-center gap-3 px-4 py-2.5">
                                                <span className="text-xs font-medium w-16 flex-shrink-0 px-2 py-0.5 rounded text-center"
                                                    style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
                                                    {cat}
                                                </span>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <input
                                                            type="number" step="0.01" min="0"
                                                            placeholder="Bs/hora"
                                                            autoFocus={i === 0}
                                                            value={valor}
                                                            onChange={e => handleCestaFormChange(`categorias.${cat}.costo_hora`, e.target.value)}
                                                            className="w-32 px-2.5 py-1.5 rounded-lg text-sm font-mono outline-none"
                                                            style={{ border: `0.5px solid ${valor ? 'var(--pb)' : 'var(--border-md)'}`, background: 'var(--porcelain)', color: 'var(--jet)' }}
                                                        />
                                                        <span className="text-[11px]" style={{ color: 'var(--ash)' }}>Bs/hora</span>
                                                    </div>
                                                </div>
                                                {ejemplo && (
                                                    <span className="text-[10px] font-mono text-right" style={{ color: 'var(--ash)' }}>
                                                        {ejemplo}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Tarifa/hora cesta */}
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Tarifa por Hora — Cesta Ticket (Bs)
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number" step="0.01" min="0"
                                        placeholder="0.20"
                                        value={cestaForm.tarifa_hora}
                                        onChange={e => handleCestaFormChange('tarifa_hora', e.target.value)}
                                        className="w-32 px-3 py-2 rounded-lg text-sm font-mono outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                    />
                                    <span className="text-xs" style={{ color: 'var(--ash)' }}>
                                        Descuento inasistencia = Tarifa × H/Mens ausentes
                                    </span>
                                </div>
                            </div>

                            {/* Tasa BCV */}
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5 font-medium" style={{ color: 'var(--ash)' }}>
                                    Tasa BCV del día (Bs/USD) <span style={{ color: 'var(--red)' }}>*</span>
                                </label>
                                <input
                                    type="number" step="0.01" min="0"
                                    placeholder="Ej: 91.50"
                                    value={cestaForm.tasa_bcv}
                                    onChange={e => handleCestaFormChange('tasa_bcv', e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                />
                                <p className="text-[10px] mt-1" style={{ color: 'var(--ash)' }}>
                                    Total Cesta (Bs) = Monto USD × Tasa BCV. Se aplica a todos los estamentos.
                                </p>
                            </div>

                            {/* Monto USD por estamento */}
                            <div className="space-y-3">
                                <p className="text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)', opacity: 0.7 }}>Monto Cesta Ticket (USD) por Estamento</p>

                                {TABS.map(tab => {
                                    const Icon = tab.icon;
                                    const montoUsd = parseFloat(cestaForm[tab.key]?.monto_usd) || 0;
                                    const tasa     = parseFloat(cestaForm.tasa_bcv) || 0;
                                    const totalBs  = montoUsd > 0 && tasa > 0 ? (montoUsd * tasa) : null;
                                    return (
                                        <div key={tab.key} className="rounded-xl p-3 space-y-2"
                                            style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                                            <div className="flex items-center gap-2">
                                                <Icon size={14} style={{ color: 'var(--pb)' }} />
                                                <span className="text-xs font-medium" style={{ color: 'var(--jet)' }}>{tab.label}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono" style={{ color: 'var(--ash)' }}>USD $</span>
                                                <input
                                                    type="number" step="0.01" min="0"
                                                    placeholder="0.00"
                                                    value={cestaForm[tab.key]?.monto_usd || ''}
                                                    onChange={e => handleCestaFormChange(`${tab.key}.monto_usd`, e.target.value)}
                                                    className="flex-1 px-3 py-1.5 rounded-lg text-sm font-mono outline-none"
                                                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                                />
                                                {totalBs !== null && (
                                                    <span className="text-xs font-mono font-medium px-2 py-1 rounded-lg flex-shrink-0"
                                                        style={{ background: '#dcfce7', color: '#15803d' }}>
                                                        = {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Resumen */}
                            {parseFloat(cestaForm.tasa_bcv) > 0 && TABS.some(t => parseFloat(cestaForm[t.key]?.monto_usd) > 0) && (
                                <div className="rounded-xl p-3 text-xs space-y-1"
                                    style={{ background: 'var(--pb-light)', border: '0.5px solid var(--border-md)' }}>
                                    <p className="font-medium text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--pb-mid)' }}>
                                        Al generar el recibo, el Total Beneficio se pre-llenará con:
                                    </p>
                                    {TABS.map(tab => {
                                        const m = parseFloat(cestaForm[tab.key]?.monto_usd) || 0;
                                        const t = parseFloat(cestaForm.tasa_bcv) || 0;
                                        if (!m) return null;
                                        return (
                                            <div key={tab.key} className="flex justify-between" style={{ color: 'var(--jet)' }}>
                                                <span style={{ color: 'var(--ash)' }}>{tab.label}</span>
                                                <span className="font-mono font-medium">{(m * t).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 flex justify-end gap-2 flex-shrink-0"
                            style={{ borderTop: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <button onClick={() => setShowCestaModal(false)}
                                className="px-4 py-2 rounded-lg text-sm font-medium"
                                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                Cancelar
                            </button>
                            <button onClick={handleSaveCestaConfig}
                                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white"
                                style={{ background: 'var(--pb)' }}>
                                <Settings2 size={14} /> Guardar configuración
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════
                MODAL CONCEPTO DE PAGO (Bancaribe)
            ════════════════════════════════════════════════ */}
            {showConceptoModal && (
                <div className="fixed inset-0 flex items-center justify-center z-[60] p-4" style={{ background: 'rgba(43,48,58,0.7)' }}>
                    <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl" style={{ background: 'var(--porcelain)' }}>
                        <div className="flex justify-between items-center px-5 py-4"
                            style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#004FA3' }} />
                                <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Concepto de pago</h3>
                            </div>
                            <button onClick={() => { setShowConceptoModal(false); setConceptoPago(''); }} style={{ color: 'var(--ash)' }}><X size={18} /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <p className="text-xs" style={{ color: 'var(--ash)' }}>Este concepto aparecerá en la planilla PDF de pago.</p>
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Concepto <span style={{ color: 'var(--red)' }}>*</span></label>
                                <input type="text" autoFocus placeholder="Ej: Pago de nómina correspondiente a mayo 2026"
                                    value={conceptoPago} onChange={e => setConceptoPago(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleConfirmarGeneracion()}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }} />
                            </div>
                            <div className="flex gap-2 pt-1">
                                <button type="button" onClick={() => { setShowConceptoModal(false); setConceptoPago(''); }}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>Cancelar</button>
                                <button type="button" onClick={handleConfirmarGeneracion}
                                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-white"
                                    style={{ background: '#004FA3' }}>
                                    <Download size={14} /> Descargar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Nomina;
