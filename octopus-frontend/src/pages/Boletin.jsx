import { useState, useEffect } from 'react';
import { FileText, Download, Search, User, Loader2, GraduationCap } from 'lucide-react';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getLapsos, getBoletin } from '../api/academico.service';
import apiClient from '../api/apiClient';

const inputStyle = {
  border: '0.5px solid var(--border-md)',
  background: '#fff',
  color: 'var(--jet)',
};

const SkeletonCard = () => (
  <div className="rounded-xl p-6 space-y-4 animate-pulse" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
    {[...Array(5)].map((_, i) => (
      <div key={i} className="h-4 rounded" style={{ background: 'var(--border-md)', width: `${60 + i * 8}%` }} />
    ))}
  </div>
);

const Boletin = () => {
  const [busqueda, setBusqueda] = useState('');
  const [alumnos, setAlumnos] = useState([]);
  const [busquedaLoading, setBusquedaLoading] = useState(false);
  const [alumnoSeleccionado, setAlumnoSeleccionado] = useState(null);
  const [lapsos, setLapsos] = useState([]);
  const [lapsoId, setLapsoId] = useState('');
  const [boletin, setBoletin] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    getLapsos()
      .then(res => setLapsos(res.data || []))
      .catch(() => toast.error('No se pudieron cargar los lapsos.'));
  }, []);

  // Búsqueda de alumnos con debounce
  useEffect(() => {
    if (busqueda.length < 2) { setAlumnos([]); setShowDropdown(false); return; }
    const timer = setTimeout(async () => {
      setBusquedaLoading(true);
      try {
        const res = await apiClient.get(`secretaria/alumnos/?buscar=${encodeURIComponent(busqueda)}`);
        setAlumnos(res.data || []);
        setShowDropdown(true);
      } catch {
        toast.error('Error al buscar alumnos.');
      } finally {
        setBusquedaLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [busqueda]);

  const handleSelectAlumno = (alumno) => {
    setAlumnoSeleccionado(alumno);
    setBusqueda(`${alumno.nombre} ${alumno.apellido}`);
    setShowDropdown(false);
    setBoletin(null);
  };

  const handleVistaPrev = async () => {
    if (!alumnoSeleccionado) { toast.warning('Selecciona un alumno.'); return; }
    if (!lapsoId) { toast.warning('Selecciona un lapso.'); return; }
    setLoading(true);
    try {
      const res = await getBoletin(alumnoSeleccionado.id, lapsoId);
      setBoletin(res.data);
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'No se pudo cargar el boletín.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!boletin) return;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const BRAND = '#0fa3b1';
    const pageW = doc.internal.pageSize.getWidth();

    // ── Header ──
    doc.setFillColor(BRAND);
    doc.rect(0, 0, pageW, 28, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(boletin.colegio?.nombre_colegio || 'Institución Educativa', pageW / 2, 10, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('BOLETÍN DE CALIFICACIONES', pageW / 2, 17, { align: 'center' });

    if (boletin.colegio?.direccion_colegio) {
      doc.setFontSize(7);
      doc.text(boletin.colegio.direccion_colegio, pageW / 2, 23, { align: 'center' });
    }

    // ── Datos del alumno ──
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const infoY = 36;
    const col1 = 14, col2 = pageW / 2 + 4;

    doc.setFont('helvetica', 'bold');
    doc.text('Alumno:', col1, infoY);
    doc.setFont('helvetica', 'normal');
    doc.text(`${boletin.alumno?.nombre} ${boletin.alumno?.apellido}`, col1 + 18, infoY);

    doc.setFont('helvetica', 'bold');
    doc.text('Cédula:', col2, infoY);
    doc.setFont('helvetica', 'normal');
    doc.text(boletin.alumno?.cedula_escolar || 'N/A', col2 + 16, infoY);

    doc.setFont('helvetica', 'bold');
    doc.text('Grado:', col1, infoY + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(boletin.alumno?.grado_seccion || 'N/A', col1 + 15, infoY + 6);

    doc.setFont('helvetica', 'bold');
    doc.text('Lapso:', col2, infoY + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(`${boletin.lapso?.nombre} — ${boletin.lapso?.periodo_escolar}`, col2 + 14, infoY + 6);

    // Separador
    doc.setDrawColor(BRAND);
    doc.setLineWidth(0.5);
    doc.line(14, infoY + 10, pageW - 14, infoY + 10);

    // ── Tabla de materias ──
    const materiaRows = (boletin.materias || []).map(m => [
      m.materia_nombre,
      m.evaluacion_1 ?? '—',
      m.evaluacion_2 ?? '—',
      m.evaluacion_3 ?? '—',
      m.evaluacion_4 ?? '—',
      m.definitiva ?? '—',
      m.aprobado === true ? 'Aprobado' : m.aprobado === false ? 'Reprobado' : '—',
    ]);

    // Fila de promedio
    const notas = (boletin.materias || [])
      .map(m => parseFloat(m.definitiva))
      .filter(v => !isNaN(v));
    const promedio = notas.length ? (notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(2) : '—';

    materiaRows.push([
      { content: 'Promedio General', styles: { fontStyle: 'bold' } },
      '', '', '', '',
      { content: String(promedio), styles: { fontStyle: 'bold' } },
      '',
    ]);

    autoTable(doc, {
      startY: infoY + 14,
      head: [['Materia', 'Eval 1', 'Eval 2', 'Eval 3', 'Eval 4', 'Definitiva', 'Aprobado']],
      body: materiaRows,
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [245, 253, 254] },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'center' },
        5: { halign: 'center', fontStyle: 'bold' },
        6: { halign: 'center' },
      },
      margin: { left: 14, right: 14 },
    });

    // ── Asistencia ──
    const afterTableY = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(BRAND);
    doc.text('Resumen de Asistencia', 14, afterTableY);
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'normal');

    const ast = boletin.asistencia || {};
    const astY = afterTableY + 5;
    doc.text(`Días presentes: ${ast.dias_presentes ?? '—'}`, 14, astY);
    doc.text(`Total de días: ${ast.total_dias ?? '—'}`, 70, astY);
    doc.text(`Ausencias: ${ast.ausencias ?? '—'}`, 126, astY);

    // ── Footer firma ──
    const sigY = astY + 18;
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.3);
    doc.line(14, sigY, 80, sigY);
    doc.line(pageW - 80, sigY, pageW - 14, sigY);

    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Firma del Representante', 47, sigY + 4, { align: 'center' });
    doc.text('Director(a)', pageW - 47, sigY + 4, { align: 'center' });

    // ── Pie de página ──
    const totalPages = doc.internal.getNumberOfPages();
    doc.setPage(1);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(
      `Generado el ${format(new Date(), "dd 'de' MMMM yyyy", { locale: es })} — Octopus ERP`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 6,
      { align: 'center' }
    );

    const nombreArchivo = `boletin_${boletin.alumno?.apellido || 'alumno'}_${boletin.lapso?.nombre || 'lapso'}.pdf`
      .replace(/\s+/g, '_').toLowerCase();
    doc.save(nombreArchivo);
    toast.success('PDF generado correctamente.');
  };

  const lapsoSeleccionado = lapsos.find(l => String(l.id) === String(lapsoId));

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--jet)' }}>
          <FileText size={20} style={{ color: 'var(--pb)' }} />
          Boletines de Calificaciones
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
          Genera y descarga el boletín académico de cada alumno
        </p>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Buscador alumno */}
        <div className="md:col-span-2 relative">
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Buscar Alumno
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5" size={16} style={{ color: 'var(--ash)' }} />
            <input
              type="text"
              placeholder="Nombre o cédula escolar..."
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
              style={inputStyle}
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setAlumnoSeleccionado(null); setBoletin(null); }}
            />
            {busquedaLoading && <Loader2 size={14} className="absolute right-3 top-2.5 animate-spin" style={{ color: 'var(--pb)' }} />}
          </div>
          {showDropdown && alumnos.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl shadow-xl overflow-hidden" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
              {alumnos.slice(0, 8).map(a => (
                <button
                  key={a.id}
                  className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors"
                  style={{ color: 'var(--jet)', borderBottom: '0.5px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--pb-light)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => handleSelectAlumno(a)}
                >
                  <User size={15} style={{ color: 'var(--ash)' }} />
                  <span>{a.nombre} {a.apellido}</span>
                  <span className="text-xs ml-auto" style={{ color: 'var(--ash)' }}>{a.grado_seccion || 'Sin grado'}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selector lapso */}
        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Lapso
          </label>
          <select
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
            value={lapsoId}
            onChange={e => { setLapsoId(e.target.value); setBoletin(null); }}
          >
            <option value="">Seleccionar lapso...</option>
            {lapsos.map(l => (
              <option key={l.id} value={l.id}>{l.nombre} — {l.periodo_escolar}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Botón vista previa */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={handleVistaPrev}
          disabled={loading || !alumnoSeleccionado || !lapsoId}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
          style={{ background: 'var(--pb)' }}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          {loading ? 'Cargando...' : 'Vista previa'}
        </button>
        {boletin && (
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all"
            style={{ background: '#16a34a' }}
          >
            <Download size={16} />
            Descargar PDF
          </button>
        )}
      </div>

      {/* Vista previa del boletín */}
      {loading && <SkeletonCard />}

      {!loading && boletin && (
        <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
          {/* Header del colegio */}
          <div className="px-6 py-5 text-white text-center" style={{ background: 'var(--pb)' }}>
            <p className="font-bold text-lg">{boletin.colegio?.nombre_colegio || 'Institución Educativa'}</p>
            {boletin.colegio?.direccion_colegio && (
              <p className="text-xs opacity-80 mt-0.5">{boletin.colegio.direccion_colegio}</p>
            )}
            <p className="text-sm font-medium mt-1 opacity-90">BOLETÍN DE CALIFICACIONES</p>
          </div>

          {/* Datos del alumno */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 py-4" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
            {[
              { label: 'Alumno', val: `${boletin.alumno?.nombre} ${boletin.alumno?.apellido}` },
              { label: 'Cédula Escolar', val: boletin.alumno?.cedula_escolar || 'N/A' },
              { label: 'Grado', val: boletin.alumno?.grado_seccion || 'N/A' },
              { label: 'Lapso', val: `${boletin.lapso?.nombre} — ${boletin.lapso?.periodo_escolar}` },
            ].map(item => (
              <div key={item.label}>
                <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--ash)' }}>{item.label}</p>
                <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--jet)' }}>{item.val}</p>
              </div>
            ))}
          </div>

          {/* Tabla de materias */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  {['Materia', 'Eval 1', 'Eval 2', 'Eval 3', 'Eval 4', 'Definitiva', 'Aprobado'].map(h => (
                    <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-widest"
                      style={{ color: 'var(--ash)', background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(boletin.materias || []).map((m, i) => (
                  <tr key={i} style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                    <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--jet)' }}>{m.materia_nombre}</td>
                    {[m.evaluacion_1, m.evaluacion_2, m.evaluacion_3, m.evaluacion_4].map((v, j) => (
                      <td key={j} className="px-4 py-3 text-sm text-center" style={{ color: 'var(--ash)' }}>{v ?? '—'}</td>
                    ))}
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-bold" style={{ color: m.definitiva != null ? (parseFloat(m.definitiva) >= 10 ? '#16a34a' : 'var(--red)') : 'var(--ash)' }}>
                        {m.definitiva ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {m.aprobado === true && <span className="text-xs font-bold text-green-600">Aprobado</span>}
                      {m.aprobado === false && <span className="text-xs font-bold" style={{ color: 'var(--red)' }}>Reprobado</span>}
                      {m.aprobado == null && <span className="text-xs" style={{ color: 'var(--ash)' }}>—</span>}
                    </td>
                  </tr>
                ))}
                {/* Fila promedio */}
                {(() => {
                  const vals = (boletin.materias || []).map(m => parseFloat(m.definitiva)).filter(v => !isNaN(v));
                  const prom = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
                  return prom ? (
                    <tr style={{ background: 'var(--pb-light)' }}>
                      <td className="px-4 py-3 text-sm font-bold" style={{ color: 'var(--pb)' }}>Promedio General</td>
                      <td colSpan={4} />
                      <td className="px-4 py-3 text-center text-sm font-bold" style={{ color: 'var(--pb)' }}>{prom}</td>
                      <td />
                    </tr>
                  ) : null;
                })()}
              </tbody>
            </table>
          </div>

          {/* Asistencia */}
          {boletin.asistencia && (
            <div className="px-6 py-4 flex flex-wrap gap-6" style={{ borderTop: '0.5px solid var(--border-md)' }}>
              <p className="text-[11px] uppercase tracking-widest font-bold w-full" style={{ color: 'var(--ash)' }}>Asistencia</p>
              {[
                { label: 'Días presentes', val: boletin.asistencia.dias_presentes },
                { label: 'Total de días', val: boletin.asistencia.total_dias },
                { label: 'Ausencias', val: boletin.asistencia.ausencias ?? '—' },
              ].map(item => (
                <div key={item.label} className="text-center">
                  <p className="text-xl font-bold" style={{ color: 'var(--jet)' }}>{item.val ?? '—'}</p>
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>{item.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Firma */}
          <div className="px-6 py-6 flex justify-between items-end" style={{ borderTop: '0.5px solid var(--border-md)' }}>
            <div className="text-center">
              <div className="w-40 border-t pt-2" style={{ borderColor: 'var(--ash)' }}>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>Firma del Representante</p>
              </div>
            </div>
            <div className="text-center">
              <div className="w-40 border-t pt-2" style={{ borderColor: 'var(--ash)' }}>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>Director(a)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && !boletin && (
        <div className="rounded-xl p-16 text-center" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
          <GraduationCap size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Busca un alumno y selecciona un lapso para generar el boletín.</p>
        </div>
      )}
    </div>
  );
};

export default Boletin;
