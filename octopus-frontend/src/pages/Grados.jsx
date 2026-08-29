import {
  GraduationCap, Users, ArrowDownUp,
  FileSpreadsheet, FileText, ChevronRight, Loader2, Search,
} from 'lucide-react';
import { useMatriculaGrado, nombreGradoCompleto } from '../hooks/useMatriculaGrado';
import { mostrarCedula } from '../utils/cedulaEscolar';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Tabla } from '../components/ui/Tabla';

const COLUMNAS_ALUMNOS = [
  { key: 'num', label: '#' },
  { key: 'cedula', label: 'Cédula Escolar' },
  { key: 'nombres', label: 'Nombres' },
  { key: 'apellidos', label: 'Apellidos' },
];

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
    <div className="w-full lg:w-60 lg:flex-shrink-0">
      <Card titulo="Seleccionar Grado">
        <nav aria-label="Lista de grados" className="flex flex-col gap-2">
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
      </Card>
    </div>
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
            fontSize:   '16px',
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
    <Card padding="none">
      <Tabla columnas={COLUMNAS_ALUMNOS} minWidth={480}>
        {alumnos.map((alumno, idx) => (
          <tr key={alumno.id}>
            <td className="px-3 py-3 sm:px-4 sm:py-4 align-middle text-xs w-9" style={{ color: 'var(--ash)' }}>
              {idx + 1}
            </td>
            <td className="px-3 py-3 sm:px-4 sm:py-4 align-middle font-mono text-xs" style={{ color: 'var(--ash)' }}>
              {mostrarCedula(alumno.cedula_escolar)}
            </td>
            <td className="px-3 py-3 sm:px-4 sm:py-4 align-middle" style={{ color: 'var(--jet)' }}>
              {alumno.nombre}
            </td>
            <td className="px-3 py-3 sm:px-4 sm:py-4 align-middle font-medium" style={{ color: 'var(--jet)' }}>
              {alumno.apellido}
            </td>
          </tr>
        ))}
      </Tabla>
    </Card>
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
    <div>
      <PageHeader
        titulo="Matrículas por Grado"
        descripcion={
          loadingGrados
            ? 'Cargando grados...'
            : `${grados.length} grado${grados.length !== 1 ? 's' : ''} activo${grados.length !== 1 ? 's' : ''} · ${totalAlumnos} alumnos en total`
        }
      />

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
