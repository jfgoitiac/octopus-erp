import { useRef, useEffect } from 'react';
import { FileText, Download, Eye, Search, User, Loader2, GraduationCap } from 'lucide-react';
import { useBoletin } from '../hooks/useBoletin';
import { generarBoletinPDF } from '../utils/boletinPdf';

const NOTA_MINIMA = 10;

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
  const {
    busqueda, alumnos, busquedaLoading, alumnoSeleccionado,
    lapsos, lapsoId, boletin, loading, showDropdown, promedioGeneral,
    setShowDropdown, handleChangeBusqueda, handleChangeLapso,
    handleSelectAlumno, handleVistaPrev,
  } = useBoletin();

  const searchRef = useRef(null);

  // Cerrar dropdown al hacer click fuera del buscador
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown, setShowDropdown]);

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
        <div className="md:col-span-2 relative" ref={searchRef}>
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
              onChange={e => handleChangeBusqueda(e.target.value)}
            />
            {busquedaLoading && (
              <Loader2 size={14} className="absolute right-3 top-2.5 animate-spin" style={{ color: 'var(--pb)' }} />
            )}
          </div>

          {showDropdown && (
            <div
              className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl shadow-xl overflow-hidden"
              style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
            >
              {alumnos.length > 0 ? (
                alumnos.slice(0, 8).map(a => (
                  <button
                    key={a.id}
                    type="button"
                    className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors"
                    style={{ color: 'var(--jet)', borderBottom: '0.5px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--pb-light)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    onClick={() => handleSelectAlumno(a)}
                  >
                    <User size={15} style={{ color: 'var(--ash)' }} />
                    <span>{a.nombre} {a.apellido}</span>
                    <span className="text-xs ml-auto" style={{ color: 'var(--ash)' }}>
                      {a.grado_seccion || 'Sin grado'}
                    </span>
                  </button>
                ))
              ) : (
                !busquedaLoading && (
                  <p className="px-4 py-3 text-sm" style={{ color: 'var(--ash)' }}>
                    Sin resultados para &quot;{busqueda}&quot;
                  </p>
                )
              )}
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
            onChange={e => handleChangeLapso(e.target.value)}
          >
            <option value="">Seleccionar lapso...</option>
            {lapsos.map(l => (
              <option key={l.id} value={l.id}>{l.nombre} — {l.periodo_escolar}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex gap-3 mb-6">
        <button
          type="button"
          onClick={handleVistaPrev}
          disabled={loading || !alumnoSeleccionado || !lapsoId}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
          style={{ background: 'var(--pb)' }}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
          {loading ? 'Cargando...' : 'Vista previa'}
        </button>

        {boletin && (
          <button
            type="button"
            onClick={() => generarBoletinPDF(boletin)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all"
            style={{ background: 'var(--success, #16a34a)' }}
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
          <div
            className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 py-4"
            style={{ borderBottom: '0.5px solid var(--border-md)' }}
          >
            {[
              { label: 'Alumno', val: `${boletin.alumno?.nombre} ${boletin.alumno?.apellido}` },
              { label: 'Cédula Escolar', val: boletin.alumno?.cedula_escolar || 'N/A' },
              { label: 'Grado', val: boletin.alumno?.grado_seccion || 'N/A' },
              { label: 'Lapso', val: `${boletin.lapso?.nombre} — ${boletin.lapso?.periodo_escolar}` },
            ].map(item => (
              <div key={item.label}>
                <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--ash)' }}>
                  {item.label}
                </p>
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
                    <th
                      key={h}
                      className="px-4 py-3 text-[11px] uppercase tracking-widest"
                      style={{ color: 'var(--ash)', background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(boletin.materias || []).map(m => (
                  <tr key={m.materia_nombre} style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                    <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--jet)' }}>
                      {m.materia_nombre}
                    </td>
                    {[m.evaluacion_1, m.evaluacion_2, m.evaluacion_3, m.evaluacion_4].map((v, j) => (
                      <td key={j} className="px-4 py-3 text-sm text-center" style={{ color: 'var(--ash)' }}>
                        {v ?? '—'}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center">
                      <span
                        className="text-sm font-bold"
                        style={{
                          color: m.definitiva != null
                            ? (parseFloat(m.definitiva) >= NOTA_MINIMA ? '#16a34a' : 'var(--red)')
                            : 'var(--ash)',
                        }}
                      >
                        {m.definitiva ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {m.aprobado === true && (
                        <span className="text-xs font-bold text-green-600" aria-label="Aprobado">Aprobado</span>
                      )}
                      {m.aprobado === false && (
                        <span className="text-xs font-bold" style={{ color: 'var(--red)' }} aria-label="Reprobado">Reprobado</span>
                      )}
                      {m.aprobado == null && (
                        <span className="text-xs" style={{ color: 'var(--ash)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}

                {promedioGeneral && (
                  <tr style={{ background: 'var(--pb-light)' }}>
                    <td className="px-4 py-3 text-sm font-bold" style={{ color: 'var(--pb)' }}>
                      Promedio General
                    </td>
                    <td colSpan={4} />
                    <td className="px-4 py-3 text-center text-sm font-bold" style={{ color: 'var(--pb)' }}>
                      {promedioGeneral}
                    </td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Asistencia */}
          {boletin.asistencia && (
            <div className="px-6 py-4 flex flex-wrap gap-6" style={{ borderTop: '0.5px solid var(--border-md)' }}>
              <p className="text-[11px] uppercase tracking-widest font-bold w-full" style={{ color: 'var(--ash)' }}>
                Asistencia
              </p>
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

          {/* Firmas */}
          <div
            className="px-6 py-6 flex justify-between items-end"
            style={{ borderTop: '0.5px solid var(--border-md)' }}
          >
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
        <div
          className="rounded-xl p-16 text-center"
          style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}
        >
          <GraduationCap size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Busca un alumno y selecciona un lapso para generar el boletín.</p>
        </div>
      )}
    </div>
  );
};

export default Boletin;
