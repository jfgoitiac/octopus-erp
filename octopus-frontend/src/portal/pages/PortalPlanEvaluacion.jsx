import { useEffect, useRef, useState } from 'react';
import { ClipboardList, CalendarDays } from 'lucide-react';
import { toast } from 'react-toastify';
import { getDashboard } from '../api/portal.service';
import { getPlanesEvaluacionAlumnoPortal } from '../api/academico.service';
import { useAlumnoActivo } from '../context/AlumnoActivoContext';
import EstudianteSelector from '../components/EstudianteSelector';
import SkeletonCard from '../components/SkeletonCard';

const fecha = (value) => value
  ? new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
  : 'Sin fecha definida';

export default function PortalPlanEvaluacion() {
  const [alumnos, setAlumnos] = useState([]);
  const { alumnoActivo, setAlumnoActivo, sincronizarConLista } = useAlumnoActivo();
  const [planes, setPlanes] = useState([]);
  const [loadingAlumnos, setLoadingAlumnos] = useState(true);
  const [loadingPlanes, setLoadingPlanes] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingAlumnos(true);
    getDashboard(controller.signal)
      .then(({ data }) => {
        const lista = data?.alumnos || [];
        setAlumnos(lista);
        sincronizarConLista(lista);
      })
      .catch((err) => {
        if (err.code !== 'ERR_CANCELED') toast.error('No se pudo cargar la lista de estudiantes.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingAlumnos(false); });
    return () => controller.abort();
  }, [sincronizarConLista]);

  useEffect(() => {
    if (!alumnoActivo?.id) { setPlanes([]); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingPlanes(true);
    getPlanesEvaluacionAlumnoPortal(alumnoActivo.id, controller.signal)
      .then(({ data }) => { if (!controller.signal.aborted) setPlanes(data?.planes || []); })
      .catch((err) => {
        if (err.code !== 'ERR_CANCELED' && !controller.signal.aborted) toast.error('No se pudo cargar el plan de evaluación.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingPlanes(false); });
    return () => controller.abort();
  }, [alumnoActivo?.id]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <ClipboardList size={20} style={{ color: 'var(--portal-primary, #0fa3b1)' }} />
          Plan de evaluación
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">Actividades, fechas y calificaciones registradas</p>
      </div>

      {loadingAlumnos ? <SkeletonCard lines={1} /> : (
        <EstudianteSelector alumnos={alumnos} alumnoActivo={alumnoActivo} onSelect={setAlumnoActivo} />
      )}

      {loadingPlanes ? <><SkeletonCard lines={3} /><SkeletonCard lines={3} /></> : plansContent(planes)}
    </div>
  );
}

function plansContent(planes) {
  if (!planes.length) {
    return <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-400">Aún no hay planes de evaluación publicados para este estudiante.</div>;
  }
  return planes.map((plan) => (
    <section key={plan.plan_id} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-800">{plan.materia}</h2>
          <p className="text-xs text-gray-400">{plan.lapso}</p>
        </div>
        <span className="text-[11px] rounded-full bg-slate-100 px-2 py-1 text-slate-600">{plan.tipo_evaluacion === 'literal' ? 'Literal' : 'Numérica'}</span>
      </div>
      {plan.bloques.map((bloque) => (
        <div key={bloque.id} className="rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-medium text-gray-700">{bloque.nombre}</p>
          <ul className="mt-2 divide-y divide-slate-200">
            {bloque.items.map((item) => {
              const nota = plan.tipo_evaluacion === 'literal' ? item.valor_letra : item.valor_numerico;
              return <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                <div><p className="text-gray-700">{item.nombre}</p><p className="text-gray-400 flex items-center gap-1"><CalendarDays size={11} />{fecha(item.fecha)}</p></div>
                <span className="font-semibold text-gray-700 whitespace-nowrap">{nota ?? 'Pendiente'}{plan.tipo_evaluacion !== 'literal' && nota != null && item.valor_maximo != null ? ` / ${item.valor_maximo}` : ''}</span>
              </li>;
            })}
          </ul>
        </div>
      ))}
    </section>
  ));
}
