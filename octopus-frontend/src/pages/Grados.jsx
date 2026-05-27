import { useState, useEffect, useCallback } from 'react';
import { GraduationCap, Users, ArrowDownUp, FileSpreadsheet, FileText, ChevronRight, Loader2, Search } from 'lucide-react';
import apiClient from '../api/apiClient';
import { toast } from 'react-toastify';

const ORDEN_OPTS = [
  { value: 'apellido', label: 'Alfabético' },
  { value: 'cedula',   label: 'Por Cédula' },
];

const NOMBRES_GRADO = {
  '1er Grado': 'Primer Grado',
  '2do Grado': 'Segundo Grado',
  '3er Grado': 'Tercer Grado',
  '4to Grado': 'Cuarto Grado',
  '5to Grado': 'Quinto Grado',
  '6to Grado': 'Sexto Grado',
  '1er Año':   'Primer Año',
  '2do Año':   'Segundo Año',
  '3er Año':   'Tercer Año',
  '4to Año':   'Cuarto Año',
  '5to Año':   'Quinto Año',
};

function nombreGradoCompleto(gradoSeccion) {
  const partes = gradoSeccion.split(' - ');
  const nombre = NOMBRES_GRADO[partes[0].trim()] ?? partes[0].trim();
  return partes.length > 1 ? `${nombre} - ${partes[1].trim()}` : nombre;
}

export default function Grados() {
  const [grados,          setGrados]         = useState([]);
  const [loadingGrados,   setLoadingGrados]  = useState(true);
  const [gradoSeleccionado, setGradoSeleccionado] = useState(null);
  const [alumnos,         setAlumnos]        = useState([]);
  const [loadingAlumnos,  setLoadingAlumnos] = useState(false);
  const [orden,           setOrden]          = useState('apellido');
  const [buscar,          setBuscar]         = useState('');
  const [exportando,      setExportando]     = useState(null); // 'excel' | 'pdf'

  // ── Cargar lista de grados ───────────────────────────────────────────────
  const cargarGrados = useCallback(async () => {
    try {
      setLoadingGrados(true);
      const { data } = await apiClient.get('secretaria/grados/');
      setGrados(data);
    } catch {
      toast.error('No se pudo cargar la lista de grados.');
    } finally {
      setLoadingGrados(false);
    }
  }, []);

  useEffect(() => { cargarGrados(); }, [cargarGrados]);

  // ── Cargar alumnos del grado seleccionado ───────────────────────────────
  const cargarAlumnos = useCallback(async (grado, ord) => {
    if (!grado) return;
    try {
      setLoadingAlumnos(true);
      const { data } = await apiClient.get('secretaria/matricula-grado/', {
        params: { grado, orden: ord },
      });
      setAlumnos(data.alumnos || []);
    } catch {
      toast.error('No se pudo cargar la matrícula del grado.');
    } finally {
      setLoadingAlumnos(false);
    }
  }, []);

  const seleccionarGrado = (grado) => {
    setGradoSeleccionado(grado);
    setBuscar('');
    cargarAlumnos(grado, orden);
  };

  const cambiarOrden = (nuevoOrden) => {
    setOrden(nuevoOrden);
    if (gradoSeleccionado) cargarAlumnos(gradoSeleccionado, nuevoOrden);
  };

  // ── Exportaciones ────────────────────────────────────────────────────────
  const exportar = async (tipo) => {
    if (!gradoSeleccionado) return;
    try {
      setExportando(tipo);
      const url      = tipo === 'excel'
        ? 'secretaria/matricula-grado/exportar-excel/'
        : 'secretaria/matricula-grado/exportar-pdf/';
      const response = await apiClient.get(url, {
        params:       { grado: gradoSeleccionado, orden },
        responseType: 'blob',
      });
      const ext    = tipo === 'excel' ? 'xlsx' : 'pdf';
      const mime   = tipo === 'excel'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf';
      const blob   = new Blob([response.data], { type: mime });
      const link   = document.createElement('a');
      link.href    = URL.createObjectURL(blob);
      link.download = tipo === 'excel'
        ? `matricula_${gradoSeleccionado.replace(/ /g, '_')}.xlsx`
        : `matricula_${gradoSeleccionado.replace(/ /g, '_')}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      toast.error(`No se pudo exportar el archivo ${tipo.toUpperCase()}.`);
    } finally {
      setExportando(null);
    }
  };

  // ── Filtro local por nombre / cédula ─────────────────────────────────────
  const alumnosFiltrados = buscar.trim()
    ? alumnos.filter(a =>
        a.nombre.toLowerCase().includes(buscar.toLowerCase()) ||
        a.apellido.toLowerCase().includes(buscar.toLowerCase()) ||
        (a.cedula_escolar || '').toLowerCase().includes(buscar.toLowerCase())
      )
    : alumnos;

  // ── Ordenar grados visualmente (primaria → media) ────────────────────────
  const ORDEN_GRADO = [
    '1er Grado','2do Grado','3er Grado','4to Grado','5to Grado','6to Grado',
    '1er Año','2do Año','3er Año','4to Año','5to Año',
  ];
  const gradosOrdenados = [...grados].sort((a, b) => {
    const ai = ORDEN_GRADO.findIndex(g => a.grado_seccion.startsWith(g));
    const bi = ORDEN_GRADO.findIndex(g => b.grado_seccion.startsWith(g));
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.grado_seccion.localeCompare(b.grado_seccion);
  });

  const totalAlumnos = grados.reduce((s, g) => s + g.total_alumnos, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--jet)' }}>Matrículas por Grado</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
            {loadingGrados
              ? 'Cargando grados...'
              : `${grados.length} grado${grados.length !== 1 ? 's' : ''} activo${grados.length !== 1 ? 's' : ''} · ${totalAlumnos} alumnos en total`
            }
          </p>
        </div>
      </div>

      <div className="flex gap-5 items-start">
        {/* ── Panel izquierdo: tarjetas de grados ─────────────────────── */}
        <div
          className="flex flex-col gap-2 rounded-xl p-3"
          style={{
            width: 240,
            flexShrink: 0,
            background: 'var(--porcelain)',
            border: '0.5px solid var(--border-md)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest px-1 mb-1" style={{ color: 'var(--ash)' }}>
            Seleccionar Grado
          </p>

          {loadingGrados ? (
            <div className="flex justify-center py-10">
              <Loader2 size={22} className="animate-spin" style={{ color: 'var(--pb)' }} />
            </div>
          ) : grados.length === 0 ? (
            <div className="text-center py-8 rounded-xl" style={{ border: '1px dashed var(--border-md)', color: 'var(--ash)' }}>
              <GraduationCap size={28} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Sin grados activos</p>
            </div>
          ) : (
            gradosOrdenados.map(g => {
              const activo = gradoSeleccionado === g.grado_seccion;
              return (
                <button
                  key={g.grado_seccion}
                  onClick={() => seleccionarGrado(g.grado_seccion)}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all"
                  style={{
                    background:  activo ? 'var(--pb)'        : 'var(--porcelain)',
                    color:       activo ? '#fff'             : 'var(--jet)',
                    border:      activo ? 'none'             : '0.5px solid var(--border-md)',
                    fontWeight:  activo ? 600                : 400,
                  }}
                  onMouseEnter={e => { if (!activo) { e.currentTarget.style.background = 'var(--ash-light)'; } }}
                  onMouseLeave={e => { if (!activo) { e.currentTarget.style.background = 'var(--porcelain)'; } }}
                >
                  <div className="flex items-center gap-2.5">
                    <GraduationCap size={14} />
                    <span className="text-sm">{nombreGradoCompleto(g.grado_seccion)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                      style={{
                        background: activo ? 'rgba(255,255,255,0.25)' : 'var(--pb-light)',
                        color:      activo ? '#fff'                   : 'var(--pb-mid)',
                      }}
                    >
                      {g.total_alumnos}
                    </span>
                    <ChevronRight size={12} style={{ opacity: 0.6 }} />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* ── Panel derecho: tabla de alumnos ─────────────────────────── */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {!gradoSeleccionado ? (
            <div
              className="flex flex-col items-center justify-center rounded-2xl py-20"
              style={{ border: '1px dashed var(--border-md)', color: 'var(--ash)' }}
            >
              <GraduationCap size={40} className="mb-3 opacity-30" />
              <p className="text-base font-medium">Selecciona un grado</p>
              <p className="text-sm mt-1 opacity-70">El listado de matrícula aparecerá aquí</p>
            </div>
          ) : (
            <>
              {/* Barra de controles — fila 1: título */}
              <div className="flex items-center gap-2">
                <GraduationCap size={16} style={{ color: 'var(--pb)' }} />
                <span className="font-semibold text-base" style={{ color: 'var(--jet)' }}>
                  {nombreGradoCompleto(gradoSeleccionado)}
                </span>
                {!loadingAlumnos && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
                    {alumnosFiltrados.length} alumno{alumnosFiltrados.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Barra de controles — fila 2: acciones */}
              <div className="flex items-center gap-3">
                {/* Búsqueda rápida */}
                <div className="relative mr-auto">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                  <input
                    type="text"
                    placeholder="Buscar alumno..."
                    value={buscar}
                    onChange={e => setBuscar(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-sm rounded-lg outline-none"
                    style={{
                      border: '0.5px solid var(--border-md)',
                      background: 'var(--porcelain)',
                      color: 'var(--jet)',
                      width: 180,
                    }}
                  />
                </div>

                {/* Orden */}
                <div className="flex items-center gap-1.5 rounded-lg p-1" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                  <ArrowDownUp size={13} style={{ color: 'var(--ash)', marginLeft: 4 }} />
                  {ORDEN_OPTS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => cambiarOrden(opt.value)}
                      className="px-3 py-1 rounded-md text-xs font-medium transition-all"
                      style={{
                        background: orden === opt.value ? 'var(--pb)'  : 'transparent',
                        color:      orden === opt.value ? '#fff'        : 'var(--ash)',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Exportar Excel */}
                <button
                  onClick={() => exportar('excel')}
                  disabled={exportando === 'excel' || loadingAlumnos}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                  style={{ background: '#16A34A', color: '#fff', opacity: exportando === 'excel' ? 0.7 : 1 }}
                >
                  {exportando === 'excel'
                    ? <Loader2 size={14} className="animate-spin" />
                    : <FileSpreadsheet size={14} />
                  }
                  Excel
                </button>

                {/* Exportar PDF */}
                <button
                  onClick={() => exportar('pdf')}
                  disabled={exportando === 'pdf' || loadingAlumnos}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                  style={{ background: '#DC2626', color: '#fff', opacity: exportando === 'pdf' ? 0.7 : 1 }}
                >
                  {exportando === 'pdf'
                    ? <Loader2 size={14} className="animate-spin" />
                    : <FileText size={14} />
                  }
                  PDF
                </button>
              </div>

              {/* Tabla */}
              {loadingAlumnos ? (
                <div className="flex justify-center py-16">
                  <Loader2 size={26} className="animate-spin" style={{ color: 'var(--pb)' }} />
                </div>
              ) : alumnosFiltrados.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center rounded-xl py-16"
                  style={{ border: '1px dashed var(--border-md)', color: 'var(--ash)' }}
                >
                  <Users size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">{buscar ? 'Sin resultados para la búsqueda' : 'Sin alumnos en este grado'}</p>
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                        {['#', 'Cédula Escolar', 'Nombres', 'Apellidos'].map(h => (
                          <th
                            key={h}
                            className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                            style={{ color: 'var(--ash)', whiteSpace: 'nowrap' }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {alumnosFiltrados.map((alumno, idx) => (
                        <tr
                          key={alumno.id}
                          style={{ borderBottom: idx < alumnosFiltrados.length - 1 ? '0.5px solid var(--border-md)' : 'none' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--ash-light)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--ash)', width: 36 }}>{idx + 1}</td>
                          <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--ash)' }}>{alumno.cedula_escolar || '—'}</td>
                          <td className="px-4 py-3" style={{ color: 'var(--jet)' }}>{alumno.nombre}</td>
                          <td className="px-4 py-3 font-medium" style={{ color: 'var(--jet)' }}>{alumno.apellido}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
