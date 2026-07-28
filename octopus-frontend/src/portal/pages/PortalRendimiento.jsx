import { TrendingUp } from 'lucide-react';
import { useRendimientoPortal } from '../hooks/useRendimientoPortal';
import EstudianteSelector from '../components/EstudianteSelector';
import SkeletonCard from '../components/SkeletonCard';
import GraficaPromedioLapsos from '../components/rendimiento/GraficaPromedioLapsos';
import GraficaPorMateria from '../components/rendimiento/GraficaPorMateria';
import IndicadorAsistencia from '../components/rendimiento/IndicadorAsistencia';

const PortalRendimiento = () => {
  const {
    alumnos, alumnoActivo, setAlumnoActivo, loadingAlumnos,
    rendimiento, loadingRendimiento,
  } = useRendimientoPortal();

  const loading = loadingAlumnos || loadingRendimiento;
  const ultimoLapsoConNotas = [...(rendimiento?.por_lapso || [])]
    .reverse()
    .find(l => l.por_materia.length > 0) || rendimiento?.por_lapso?.[rendimiento.por_lapso.length - 1];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <TrendingUp size={20} style={{ color: 'var(--portal-primary, #0fa3b1)' }} />
          Rendimiento Académico
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">Notas y asistencia por lapso</p>
      </div>

      {loadingAlumnos ? (
        <div className="flex gap-2">
          <div className="h-10 w-28 bg-gray-200 rounded-full animate-pulse" />
          <div className="h-10 w-28 bg-gray-200 rounded-full animate-pulse" />
        </div>
      ) : (
        <EstudianteSelector alumnos={alumnos} alumnoActivo={alumnoActivo} onSelect={setAlumnoActivo} />
      )}

      {alumnoActivo && alumnos.length > 1 && (
        <p className="text-sm text-gray-500">
          Mostrando información de{' '}
          <span className="font-medium text-gray-700">
            {alumnoActivo.nombre} {alumnoActivo.apellido}
          </span>
          {' '}· {alumnoActivo.grado_seccion}
        </p>
      )}

      {loading ? (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </>
      ) : !rendimiento ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-gray-100">
          <p className="text-sm text-gray-400">No se pudo cargar la información de rendimiento.</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Promedio General por Lapso</h2>
            <GraficaPromedioLapsos porLapso={rendimiento.por_lapso} />
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Por Materia {ultimoLapsoConNotas ? `— ${ultimoLapsoConNotas.lapso}` : ''}
            </h2>
            <GraficaPorMateria porMateria={ultimoLapsoConNotas?.por_materia || []} />
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Asistencia</h2>
            <IndicadorAsistencia asistencia={rendimiento.asistencia} />
          </div>
        </>
      )}
    </div>
  );
};

export default PortalRendimiento;
