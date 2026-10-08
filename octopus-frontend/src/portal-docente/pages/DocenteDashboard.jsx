import { useContext, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, MessageCircle, AlertTriangle } from 'lucide-react';

import { AuthContext } from '../../context/AuthContext';
import { useDocenteMisMaterias } from '../hooks/useDocenteMisMaterias';
import { useDocenteConversaciones } from '../hooks/useDocenteConversaciones';
import { useDocenteIncidentes } from '../hooks/useDocenteIncidentes';
import { useDocenteHorarioSemana } from '../hooks/useDocenteHorarioSemana';
import { useDocenteProgresoNotas } from '../hooks/useDocenteProgresoNotas';
import { useDocenteAlertasRiesgo } from '../hooks/useDocenteAlertasRiesgo';
import { useDocenteRadarCierreLapso } from '../hooks/useDocenteRadarCierreLapso';
import SkeletonCard from '../../portal/components/SkeletonCard';

import WidgetHero from '../components/widgets/WidgetHero';
import WidgetPerfilDocente from '../components/widgets/WidgetPerfilDocente';
import WidgetAccionesRapidas from '../components/widgets/WidgetAccionesRapidas';
import WidgetActividadSemana from '../components/widgets/WidgetActividadSemana';
import WidgetCalendario from '../components/widgets/WidgetCalendario';
import WidgetMensajes from '../components/widgets/WidgetMensajes';
import WidgetMateriasTabla from '../components/widgets/WidgetMateriasTabla';
import WidgetProximasClases from '../components/widgets/WidgetProximasClases';
import WidgetProgresoNotas from '../components/widgets/WidgetProgresoNotas';
import WidgetIncidentes from '../components/widgets/WidgetIncidentes';
import WidgetPendientesHoy from '../components/widgets/WidgetPendientesHoy';

const DocenteDashboard = () => {
  const { user } = useContext(AuthContext);
  const { materias, loading: loadingMaterias } = useDocenteMisMaterias();
  const { conversaciones, mensajes, loading: loadingConversaciones } = useDocenteConversaciones();
  const { incidentes, loading: loadingIncidentes } = useDocenteIncidentes();
  const { proximasClases, loading: loadingHorario } = useDocenteHorarioSemana(4);
  const { progreso, lapsoActivo, loading: loadingNotas } = useDocenteProgresoNotas(materias);
  const { alertasRiesgo, loading: loadingAlertas } = useDocenteAlertasRiesgo();
  const { radar, loading: loadingRadar } = useDocenteRadarCierreLapso();

  const mensajesNoLeidos = conversaciones.reduce((acc, c) => acc + (c.noLeidos || 0), 0);
  const cantidadAlumnos = materias.reduce((acc, m) => acc + (m.cantidad_alumnos || 0), 0);
  const cargando = loadingMaterias || loadingConversaciones || loadingIncidentes;
  const pendientes = useMemo(() => {
    const items = [];
    (radar?.items_vencidos || []).forEach((item) => items.push({
      id: `vencido-${item.id || item.materia_id}`, level: 'urgente', title: 'Hay notas vencidas por cargar',
      detail: `${item.materia_nombre || 'Materia'} · abre el plan de evaluación`,
      to: `/portal-docente/materias/${item.materia_id}?tab=plan-evaluacion${radar?.lapso?.id ? `&lapso=${radar.lapso.id}` : ''}`,
    }));
    (radar?.materias_sin_plan || []).forEach((item) => items.push({
      id: `plan-${item.materia_id}`, level: 'urgente', title: 'Falta un plan de evaluación',
      detail: `${item.materia_nombre} · ${item.grado_seccion || 'sección asignada'}`,
      to: `/portal-docente/materias/${item.materia_id}?tab=plan-evaluacion`,
    }));
    (alertasRiesgo || []).slice(0, 2).forEach((alerta) => items.push({
      id: `riesgo-${alerta.id}`, level: 'pronto', title: `${alerta.alumno_nombre} requiere seguimiento`,
      detail: `${alerta.materia_nombre} · promedio actual ${alerta.promedio_actual}`,
      to: `/portal-docente/materias/${alerta.materia_id}?tab=notas${alerta.lapso_id ? `&lapso=${alerta.lapso_id}` : ''}`,
    }));
    if (mensajesNoLeidos > 0) items.push({ id: 'mensajes', level: 'normal', title: `${mensajesNoLeidos} mensaje${mensajesNoLeidos === 1 ? '' : 's'} sin leer`, detail: 'Responde a representantes o revisa la conversación.', to: '/portal-docente/mensajes' });
    return items;
  }, [radar, alertasRiesgo, mensajesNoLeidos]);

  return (
    <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-12 md:gap-4 md:items-stretch">
      <div className="md:col-span-12">
        <WidgetHero
          nombre={user?.nombre}
          proximaClase={proximasClases[0]}
          radar={radar}
          pendientes={pendientes.length}
          loadingPendientes={loadingConversaciones || loadingIncidentes || loadingAlertas || loadingRadar}
        />
      </div>

      <div className="md:col-span-12">
        {loadingAlertas || loadingRadar || loadingConversaciones ? <SkeletonCard lines={4} /> : <WidgetPendientesHoy items={pendientes} updatedAt="ahora" />}
      </div>

      <div className="md:col-span-12">
        {cargando ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => <SkeletonCard key={i} lines={1} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { icon: BookOpen, label: 'Materias', value: materias.length, to: '/portal-docente/materias' },
              { icon: MessageCircle, label: 'Sin leer', value: mensajesNoLeidos, to: '/portal-docente/mensajes' },
              { icon: AlertTriangle, label: 'Incidentes', value: incidentes.length, to: '/portal-docente/incidentes' },
            ].map(({ icon: Icon, label, value, to }) => (
              <Link
                key={label}
                to={to}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 flex flex-col items-center gap-1.5 text-center hover:shadow-md hover:-translate-y-0.5 transition-shadow"
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--docente-primary)]/10 text-[var(--docente-primary)]">
                  <Icon size={16} />
                </div>
                <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{label}</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Acciones rápidas */}
      <div className="md:col-span-12">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-0.5">Acciones frecuentes</p>
        <WidgetAccionesRapidas />
      </div>

      <div className="md:col-span-5 h-full">
        {loadingHorario ? <SkeletonCard lines={3} /> : (
          <WidgetProximasClases proximasClases={proximasClases} />
        )}
      </div>

      <div className="md:col-span-7 h-full">
        <WidgetCalendario />
      </div>

      <div className="md:col-span-12">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-0.5">Seguimiento académico</p>
        {loadingNotas ? <SkeletonCard lines={3} /> : (
          <WidgetProgresoNotas progreso={progreso} lapsoActivo={lapsoActivo} />
        )}
      </div>

      <div className="md:col-span-7 h-full">
        {loadingMaterias ? <SkeletonCard lines={3} /> : (
          <WidgetMateriasTabla materias={materias.slice(0, 5)} />
        )}
      </div>

      <div className="md:col-span-5 h-full">
        {loadingConversaciones ? <SkeletonCard lines={3} /> : (
          <WidgetMensajes conversaciones={conversaciones} className="h-full" />
        )}
      </div>

      <div className="md:col-span-6 h-full">
        {loadingIncidentes ? <SkeletonCard lines={3} /> : (
          <WidgetIncidentes incidentes={incidentes} />
        )}
      </div>

      <div className="md:col-span-3 h-full">
        {loadingConversaciones || loadingIncidentes ? <SkeletonCard lines={3} /> : <WidgetActividadSemana mensajes={mensajes} incidentes={incidentes} />}
      </div>

      <div className="md:col-span-3 h-full">
        {loadingMaterias ? <SkeletonCard lines={2} /> : <WidgetPerfilDocente nombre={user?.nombre} cantidadMaterias={materias.length} cantidadAlumnos={cantidadAlumnos} />}
      </div>
    </div>
  );
};

export default DocenteDashboard;
