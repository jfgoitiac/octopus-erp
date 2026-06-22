import {
  GraduationCap, Users, ArrowDownUp,
  FileSpreadsheet, FileText, ChevronRight, Loader2, Search,
} from 'lucide-react';
import { useMatriculaGrado, nombreGradoCompleto } from '../hooks/useMatriculaGrado';

const ORDEN_OPTS = [
  { value: 'apellido', label: 'Alfabético' },
  { value: 'cedula',   label: 'Por Cédula' },
];

// ── Skeleton Loaders ──────────────────────────────────────────────────────────

function SkeletonGrados() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Cargando grados">
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className="h-10 rounded-lg animate-pulse"
          style={{ background: 'var(--border-md)', opacity: 1 - i * 0.08 }}
        />
      ))}
    </div>
  );
}

function SkeletonTabla() {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '0.5px solid var(--border-md)' }}
      aria-busy="true"
      aria-label="Cargando alumnos"
    >
      <div className="h-10 animate-pulse" style={{ background: 'var(--porcelain)' }} />
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 px-4 py-3 animate-pulse"
          style={{ borderTop: '0.5px solid var(--border-md)' }}
        >
          <div className="h-4 w-6 rounded"  style={{ background: 'var(--border-md)' }} />
          <div className="h-4 w-28 rounded" style={{ background: 'var(--border-md)' }} />
          <div className="h-4 flex-1 rounded" style={{ background: 'var(--border-md)' }} />
          <div className="h-4 flex-1 rounded" style={{ background: 'var(--border-md)' }} />
        </div>
      ))}
    </div>
  );
}

// ── GradoCard ─────────────────────────────────────────────────────────────────

function GradoCard({ grado, activo, onSelect }) {
  return (
    <button
      aria-pressed={activo}
      onClick={() => onSelect(grado.grado_seccion)}
      className={[
        'flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all',
        activo
          ? 'bg-[var(--pb)] text-white font-semibold'
          : 'bg-[var(--porcelain)] text-[var(--jet)] font-normal hover:bg-[var(--ash-light)]',
      ].join(' ')}
      style={{ border: activo ? 'none' : '0.5px solid var(--border-md)' }}
    >
      <div className="flex items-center gap-2.5">
        <GraduationCap size={14} />
        <span className="text-sm">{nombreGradoCompleto(grado.grado_seccion)}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
          style={{
            background: activo ? 'rgba(255,255,255,0.25)' : 'var(--pb-light)',
            color:      activo ? '#fff'                   : 'var(--pb-mid)',
          }}
        >
          {grado.total_alumnos}
        </span>
        <ChevronRight size={12} className="opacity-60" />
      </div>
    </button>
  );
}

// ── PanelGrados ───────────────────────────────────────────────────────────────

function PanelGrados({ gradosOrdenados, loadingGrados, gradoSeleccionado, onSelect }) {
  return (
    <nav
      aria-label="Lista de grados"
      className="flex flex-col gap-2 rounded-xl p-3 w-full lg:w-60 lg:flex-shrink-0"
      style={{
        background: 'var(--porcelain)',
        border:     '0.5px solid var(--border-md)',
        boxShadow:  'var(--shadow-sm)',
      }}
    >
      <p
        className="text-xs font-semibold uppercase tracking-widest px-1 mb-1"
        style={{ color: 'var(--ash)' }}
      >
        Seleccionar Grado
      </p>

      {loadingGrados ? (
        <SkeletonGrados />
      ) : gradosOrdenados.length === 0 ? (
        <div
          className="text-center py-8 rounded-xl"
          style={{ border: '1px dashed var(--border-md)', color: 'var(--ash)' }}
        >
          <GraduationCap size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Sin grados activos</p>
        </div>
      ) : (
        gradosOrdenados.map(g => (
          <GradoCard
            key={g.grado_seccion}
            grado={g}
            activo={gradoSeleccionado === g.grado_seccion}
            onSelect={onSelect}
          />
        ))
      )}
    </nav>
  );
}

// ── BarraControles ────────────────────────────────────────────────────────────

function BarraControles({ buscar, onBuscar, orden, onCambiarOrden, exportando, onExportar, loadingAlumnos }) {
  const bloqueado = exportando !== null || loadingAlumnos;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative mr-auto">
        <label htmlFor="buscar-alumno" className="sr-only">
          Buscar alumno por nombre o cédula
        </label>
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
        <input
          id="buscar-alumno"
          type="text"
          placeholder="Buscar alumno..."
          value={buscar}
          onChange={e => onBuscar(e.target.value)}
          className="pl-8 pr-3 py-1.5 text-sm rounded-lg outline-none w-44 sm:w-52"
          style={{
            border:     '0.5px solid var(--border-md)',
            background: 'var(--porcelain)',
            color:      'var(--jet)',
          }}
        />
      </div>

      <div
        role="group"
        aria-label="Ordenar alumnos"
        className="flex items-center gap-1.5 rounded-lg p-1"
        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}
      >
        <ArrowDownUp size={13} aria-hidden style={{ color: 'var(--ash)', marginLeft: 4 }} />
        {ORDEN_OPTS.map(opt => (
          <button
            key={opt.value}
            aria-pressed={orden === opt.value}
            onClick={() => onCambiarOrden(opt.value)}
            className="px-3 py-1 rounded-md text-xs font-medium transition-all"
            style={{
              background: orden === opt.value ? 'var(--pb)' : 'transparent',
              color:      orden === opt.value ? '#fff'       : 'var(--ash)',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <button
        onClick={() => onExportar('excel')}
        disabled={bloqueado}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ background: '#16A34A', color: '#fff' }}
      >
        {exportando === 'excel'
          ? <Loader2 size={14} className="animate-spin" />
          : <FileSpreadsheet size={14} />
        }
        Excel
      </button>

      <button
        onClick={() => onExportar('pdf')}
        disabled={bloqueado}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ background: '#DC2626', color: '#fff' }}
      >
        {exportando === 'pdf'
          ? <Loader2 size={14} className="animate-spin" />
          : <FileText size={14} />
        }
        PDF
      </button>
    </div>
  );
}

// Las cédulas generadas automáticamente tienen formato 99YYYYMMDDHHMMSSRRRR (20 chars)
const esCedulaTemporal = (cedula) => cedula?.startsWith('99') && cedula.length >= 18;
const mostrarCedula = (cedula) => (cedula && !esCedulaTemporal(cedula)) ? cedula : '—';

// ── TablaAlumnos ──────────────────────────────────────────────────────────────

function TablaAlumnos({ alumnos, buscar }) {
  if (alumnos.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl py-16"
        style={{ border: '1px dashed var(--border-md)', color: 'var(--ash)' }}
      >
        <Users size={32} className="mb-2 opacity-30" />
        <p className="text-sm">
          {buscar ? 'Sin resultados para la búsqueda' : 'Sin alumnos en este grado'}
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-x-auto"
      style={{ border: '0.5px solid var(--border-md)' }}
    >
      <table className="w-full text-sm border-collapse min-w-[480px]">
        <thead>
          <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
            {['#', 'Cédula Escolar', 'Nombres', 'Apellidos'].map(h => (
              <th
                key={h}
                scope="col"
                className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--ash)', whiteSpace: 'nowrap' }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {alumnos.map((alumno, idx) => (
            <tr
              key={alumno.id}
              className="bg-transparent hover:bg-[var(--ash-light)] transition-colors"
              style={{ borderBottom: idx < alumnos.length - 1 ? '0.5px solid var(--border-md)' : 'none' }}
            >
              <td className="px-4 py-3 text-xs w-9" style={{ color: 'var(--ash)' }}>{idx + 1}</td>
              <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--ash)' }}>
                {mostrarCedula(alumno.cedula_escolar)}
              </td>
              <td className="px-4 py-3" style={{ color: 'var(--jet)' }}>{alumno.nombre}</td>
              <td className="px-4 py-3 font-medium" style={{ color: 'var(--jet)' }}>{alumno.apellido}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Grados (página) ───────────────────────────────────────────────────────────

export default function Grados() {
  const {
    grados,
    gradosOrdenados,
    loadingGrados,
    gradoSeleccionado,
    alumnosFiltrados,
    loadingAlumnos,
    orden,
    buscar,
    setBuscar,
    exportando,
    totalAlumnos,
    seleccionarGrado,
    cambiarOrden,
    exportar,
  } = useMatriculaGrado();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--jet)' }}>
          Matrículas por Grado
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
          {loadingGrados
            ? 'Cargando grados...'
            : `${grados.length} grado${grados.length !== 1 ? 's' : ''} activo${grados.length !== 1 ? 's' : ''} · ${totalAlumnos} alumnos en total`
          }
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <PanelGrados
          gradosOrdenados={gradosOrdenados}
          loadingGrados={loadingGrados}
          gradoSeleccionado={gradoSeleccionado}
          onSelect={seleccionarGrado}
        />

        <div className="flex-1 flex flex-col gap-4 min-w-0 w-full">
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
              <div className="flex items-center gap-2">
                <GraduationCap size={16} style={{ color: 'var(--pb)' }} />
                <span className="font-semibold text-base" style={{ color: 'var(--jet)' }}>
                  {nombreGradoCompleto(gradoSeleccionado)}
                </span>
                {!loadingAlumnos && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
                  >
                    {alumnosFiltrados.length} alumno{alumnosFiltrados.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <BarraControles
                buscar={buscar}
                onBuscar={setBuscar}
                orden={orden}
                onCambiarOrden={cambiarOrden}
                exportando={exportando}
                onExportar={exportar}
                loadingAlumnos={loadingAlumnos}
              />

              {loadingAlumnos
                ? <SkeletonTabla />
                : <TablaAlumnos alumnos={alumnosFiltrados} buscar={buscar} />
              }
            </>
          )}
        </div>
      </div>
    </div>
  );
}
