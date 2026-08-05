import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  GraduationCap, Clock, MessageCircle, AlertTriangle,
  ChevronLeft, ChevronRight, CalendarCheck, ClipboardList,
  TrendingDown, ClipboardCheck, LineChart, Play, Pause,
} from 'lucide-react';
import ModalEvolucionAlumno from './ModalEvolucionAlumno';
import { useConfigColegio } from '../../hooks/useConfigColegio';

const formatHora = (horaStr) => (horaStr ? horaStr.slice(0, 5) : '');

const AUTOPLAY_MS = 6000;

// Ejecuta `handler` al presionar Enter o Space, para elementos con role="button"
const activarConTeclado = (handler) => (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    if (e.key === ' ') e.preventDefault();
    handler();
  }
};

const SkeletonLineas = ({ lineas = 2 }) => (
  <div className="relative h-full flex flex-col justify-center gap-2 animate-pulse">
    {[...Array(lineas)].map((_, i) => (
      <div key={i} className="h-3 bg-white/20 rounded-full" style={{ width: i === 0 ? '40%' : '75%' }} />
    ))}
  </div>
);

// Slide 1 — saludo del día
const SlideSaludo = ({ nombre, hoy, pendientes, loading }) => (
  <div className="relative h-full flex flex-col justify-center">
    <p className="text-xs text-white/70 capitalize">{hoy}</p>
    <h1 className="text-xl font-bold mt-1">Hola, {nombre || 'Docente'}</h1>
    {loading ? (
      <div className="h-3.5 bg-white/20 rounded-full w-2/3 mt-2.5 animate-pulse" />
    ) : (
      <p className="text-sm text-white/80 mt-2">
        {pendientes.length > 0 ? `Tienes ${pendientes.join(' y ')}.` : 'Estás al día con tus pendientes.'}
      </p>
    )}
  </div>
);

// Slide 2 — resumen de pendientes (mensajes sin leer + incidentes recientes)
const SlidePendientes = ({ mensajesNoLeidos, incidentesRecientes, loading }) => {
  if (loading) return <SkeletonLineas lineas={2} />;

  return (
    <div className="relative h-full flex flex-col justify-center">
      <p className="text-xs text-white/70">Resumen de pendientes</p>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div className="bg-white/15 rounded-xl px-3 py-2.5 backdrop-blur-sm">
          <div className="flex items-center gap-1.5 text-white/70">
            <MessageCircle size={14} />
            <span className="text-[10px] font-medium">Sin leer</span>
          </div>
          <p className="text-2xl font-bold mt-1 leading-none">{mensajesNoLeidos}</p>
        </div>
        <div className="bg-white/15 rounded-xl px-3 py-2.5 backdrop-blur-sm">
          <div className="flex items-center gap-1.5 text-white/70">
            <AlertTriangle size={14} />
            <span className="text-[10px] font-medium">Incidentes</span>
          </div>
          <p className="text-2xl font-bold mt-1 leading-none">{incidentesRecientes}</p>
        </div>
      </div>
    </div>
  );
};

// Slide 3 — próxima clase según el horario semanal
const SlideProximaClase = ({ proximaClase }) => (
  <div className="relative h-full flex flex-col justify-center">
    <p className="text-xs text-white/70">Próxima clase</p>
    {proximaClase ? (
      <>
        <h2 className="text-lg font-bold mt-1 truncate">{proximaClase.materia?.nombre}</h2>
        <div className="mt-3 inline-flex items-center gap-2 bg-white/15 rounded-xl px-3 py-2 text-xs font-medium backdrop-blur-sm self-start">
          <Clock size={14} />
          {proximaClase.dia_semana_label ? `${proximaClase.dia_semana_label} · ` : ''}
          {formatHora(proximaClase.hora_inicio)}
          {proximaClase.hora_fin ? `–${formatHora(proximaClase.hora_fin)}` : ''}
        </div>
      </>
    ) : (
      <div className="flex items-center gap-2 mt-3 text-white/80 text-sm">
        <CalendarCheck size={16} />
        No tienes clases próximas en tu horario.
      </div>
    )}
  </div>
);

// Slide 4 — evaluaciones próximas (GET /api/academico/docente/proximas-evaluaciones/).
const SlideEvaluaciones = ({ proximasEvaluaciones }) => {
  if (!proximasEvaluaciones?.length) {
    return (
      <div className="relative h-full flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center mb-2">
          <ClipboardList size={22} className="text-white/80" />
        </div>
        <p className="text-sm font-medium text-white/90">No hay evaluaciones próximas registradas.</p>
        <p className="text-xs text-white/60 mt-1">Cuando definas un plan de evaluación, aparecerán aquí.</p>
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col justify-center">
      <p className="text-xs text-white/70">Evaluaciones próximas</p>
      <div className="mt-2 space-y-1.5">
        {proximasEvaluaciones.slice(0, 3).map(ev => (
          <div key={ev.id} className="flex items-center justify-between gap-2 bg-white/15 rounded-xl px-3 py-1.5 backdrop-blur-sm">
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">{ev.nombre}</p>
              <p className="text-[10px] text-white/60 truncate">{ev.materia_nombre}</p>
            </div>
            <span className="text-[10px] font-medium text-white/80 flex-shrink-0">
              {format(new Date(ev.fecha + 'T00:00:00'), "dd MMM", { locale: es })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Slide 5 — alertas de alumnos en riesgo (GET /api/academico/docente/alertas-riesgo/).
const SlideAlertaRiesgo = ({ alertasRiesgo, navigate, onVerEvolucion, loading }) => {
  if (loading) return <SkeletonLineas lineas={3} />;

  if (!alertasRiesgo?.length) {
    return (
      <div className="relative h-full flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center mb-2">
          <TrendingDown size={22} className="text-white/80" />
        </div>
        <p className="text-sm font-medium text-white/90">Ningún alumno en riesgo por ahora.</p>
        <p className="text-xs text-white/60 mt-1">Cuando un promedio baje del umbral, te avisamos aquí.</p>
      </div>
    );
  }

  // Agrupar por grado_seccion, la sección con más alertas primero
  const porSeccion = alertasRiesgo.reduce((acc, a) => {
    acc[a.grado_seccion] = (acc[a.grado_seccion] || 0) + 1;
    return acc;
  }, {});
  const seccionesOrdenadas = Object.entries(porSeccion).sort((a, b) => b[1] - a[1]);
  const [seccionTop, cantidadTop] = seccionesOrdenadas[0];

  const frase = seccionesOrdenadas.length > 1
    ? `${alertasRiesgo.length} alumnos bajaron de nota, ${cantidadTop} en ${seccionTop}`
    : `${cantidadTop} alumno${cantidadTop === 1 ? '' : 's'} bajaron de nota en ${seccionTop}`;

  return (
    <div className="relative h-full flex flex-col justify-center">
      <p className="text-xs text-white/70 flex items-center gap-1.5">
        <TrendingDown size={13} /> Alumnos en riesgo
      </p>
      <p className="text-sm font-semibold mt-1 leading-snug">{frase}</p>
      <div className="mt-2 space-y-1.5">
        {alertasRiesgo.slice(0, 3).map(a => (
          <div
            key={a.id}
            role="button"
            tabIndex={0}
            aria-label={`Ver evolución de notas de ${a.alumno_nombre} en ${a.materia_nombre}`}
            className="flex items-center gap-2 bg-white/15 rounded-xl px-3 py-1.5 backdrop-blur-sm cursor-pointer hover:bg-white/20 transition-colors"
            onClick={() => navigate(`/portal-docente/materias/${a.materia_id}?tab=notas&lapso=${a.lapso_id}`)}
            onKeyDown={activarConTeclado(() => navigate(`/portal-docente/materias/${a.materia_id}?tab=notas&lapso=${a.lapso_id}`))}
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{a.alumno_nombre}</p>
              <p className="text-[10px] text-white/60 truncate">{a.materia_nombre} · {a.promedio_actual}</p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onVerEvolucion(a.alumno_id); }}
              aria-label={`Ver evolución de ${a.alumno_nombre}`}
              className="flex-shrink-0 w-6 h-6 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center transition-colors"
            >
              <LineChart size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// Slide 6 — radar de cierre de lapso (GET /api/academico/docente/radar-cierre-lapso/).
const SlideChecklistPlan = ({ radar, navigate, loading }) => {
  if (loading) return <SkeletonLineas lineas={3} />;

  if (!radar || !radar.lapso) {
    return (
      <div className="relative h-full flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center mb-2">
          <ClipboardCheck size={22} className="text-white/80" />
        </div>
        <p className="text-sm font-medium text-white/90">No hay un lapso activo.</p>
      </div>
    );
  }

  const { materias_sin_plan = [], items_vencidos = [], dias_para_cierre } = radar;

  const diasTexto = dias_para_cierre === null || dias_para_cierre === undefined
    ? ''
    : dias_para_cierre < 0
      ? ` El lapso ya cerró.`
      : dias_para_cierre === 0
        ? ` El lapso cierra hoy.`
        : ` Faltan ${dias_para_cierre} día${dias_para_cierre === 1 ? '' : 's'} para el cierre.`;

  if (materias_sin_plan.length > 0) {
    const [primera, ...resto] = materias_sin_plan;
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={`Ir al plan de evaluación de ${primera.materia_nombre}`}
        className="relative h-full flex flex-col justify-center cursor-pointer"
        onClick={() => navigate(`/portal-docente/materias/${primera.materia_id}?tab=plan-evaluacion`)}
        onKeyDown={activarConTeclado(() => navigate(`/portal-docente/materias/${primera.materia_id}?tab=plan-evaluacion`))}
      >
        <p className="text-xs text-white/70 flex items-center gap-1.5">
          <ClipboardCheck size={13} /> Plan de evaluación
        </p>
        <p className="text-sm font-semibold mt-1 leading-snug">
          ¿Ya armaste el plan de evaluación de {primera.materia_nombre} {primera.grado_seccion}?{diasTexto}
        </p>
        {resto.length > 0 && (
          <p className="text-xs text-white/60 mt-1.5">+{resto.length} materia{resto.length === 1 ? '' : 's'} más</p>
        )}
      </div>
    );
  }

  if (items_vencidos.length > 0) {
    const primero = items_vencidos[0];
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={`Ir al plan de evaluación de ${primero.materia_nombre}`}
        className="relative h-full flex flex-col justify-center cursor-pointer"
        onClick={() => navigate(`/portal-docente/materias/${primero.materia_id}?tab=plan-evaluacion&lapso=${radar.lapso.id}`)}
        onKeyDown={activarConTeclado(() => navigate(`/portal-docente/materias/${primero.materia_id}?tab=plan-evaluacion&lapso=${radar.lapso.id}`))}
      >
        <p className="text-xs text-white/70 flex items-center gap-1.5">
          <ClipboardCheck size={13} /> Ítems vencidos
        </p>
        <p className="text-sm font-semibold mt-1 leading-snug">
          Tienes {items_vencidos.length} ítem{items_vencidos.length === 1 ? '' : 's'} de evaluación vencido{items_vencidos.length === 1 ? '' : 's'} sin notas cargadas.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col items-center justify-center text-center">
      <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center mb-2">
        <ClipboardCheck size={22} className="text-white/80" />
      </div>
      <p className="text-sm font-medium text-white/90">Vas al día con tus planes de evaluación.</p>
    </div>
  );
};

const WidgetHero = ({
  nombre, mensajesNoLeidos, incidentesRecientes, proximaClase, proximasEvaluaciones,
  alertasRiesgo = [], radar = null,
  loadingPendientes = false, loadingAlertas = false, loadingRadar = false,
}) => {
  const hoy = format(new Date(), "EEEE d 'de' MMMM", { locale: es });

  const pendientes = [];
  if (mensajesNoLeidos > 0) {
    pendientes.push(`${mensajesNoLeidos} mensaje${mensajesNoLeidos === 1 ? '' : 's'} sin leer`);
  }
  if (incidentesRecientes > 0) {
    pendientes.push(`${incidentesRecientes} incidente${incidentesRecientes === 1 ? '' : 's'} reciente${incidentesRecientes === 1 ? '' : 's'}`);
  }

  const navigate = useNavigate();
  const [alumnoModalId, setAlumnoModalId] = useState(null);
  const { logo_url: logoColegio } = useConfigColegio();

  const slides = [
    <SlideSaludo key="saludo" nombre={nombre} hoy={hoy} pendientes={pendientes} loading={loadingPendientes} />,
    <SlidePendientes key="pendientes" mensajesNoLeidos={mensajesNoLeidos} incidentesRecientes={incidentesRecientes} loading={loadingPendientes} />,
    <SlideProximaClase key="proxima-clase" proximaClase={proximaClase} />,
    <SlideEvaluaciones key="evaluaciones" proximasEvaluaciones={proximasEvaluaciones} />,
    <SlideAlertaRiesgo key="alerta-riesgo" alertasRiesgo={alertasRiesgo} navigate={navigate} onVerEvolucion={setAlumnoModalId} loading={loadingAlertas} />,
    <SlideChecklistPlan key="checklist-plan" radar={radar} navigate={navigate} loading={loadingRadar} />,
  ];

  const [indice, setIndice] = useState(0);
  const [pausado, setPausado] = useState(false);
  const intervalRef = useRef(null);

  const irA = useCallback((i) => {
    setIndice(((i % slides.length) + slides.length) % slides.length);
  }, [slides.length]);

  const anterior = useCallback(() => irA(indice - 1), [indice, irA]);
  const siguiente = useCallback(() => irA(indice + 1), [indice, irA]);

  // Autoplay — se pausa al interactuar (flechas, puntos, hover) y se limpia al desmontar
  useEffect(() => {
    if (pausado) return undefined;
    intervalRef.current = setInterval(() => {
      setIndice((i) => (i + 1) % slides.length);
    }, AUTOPLAY_MS);
    return () => clearInterval(intervalRef.current);
  }, [pausado, slides.length]);

  const handleInteraccion = (fn) => (...args) => {
    setPausado(true);
    fn(...args);
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl text-white h-full shadow-lg"
      style={{ background: 'linear-gradient(135deg, var(--docente-primary) 0%, var(--docente-primary-dark) 100%)' }}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
    >
      {/* Elemento decorativo — logo del colegio de baja opacidad si existe,
          fallback al ícono genérico si el colegio no configuró uno */}
      {logoColegio ? (
        <img
          src={logoColegio}
          alt=""
          aria-hidden="true"
          className="absolute -right-6 -bottom-8 w-36 h-36 object-contain opacity-20 pointer-events-none"
          onError={e => { e.target.style.display = 'none'; }}
        />
      ) : (
        <GraduationCap
          size={140}
          className="absolute -right-6 -bottom-8 text-white/10 pointer-events-none"
          strokeWidth={1.2}
        />
      )}

      <div className="relative flex flex-col h-full p-5 pb-9">
        <div className="overflow-hidden flex-1">
          <div
            className="flex h-full transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${indice * 100}%)` }}
          >
            {slides.map((slide, i) => (
              <div key={i} className="w-full flex-shrink-0">
                {slide}
              </div>
            ))}
          </div>
        </div>

        {/* Flechas */}
        <button
          type="button"
          onClick={handleInteraccion(anterior)}
          aria-label="Slide anterior"
          className="absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          onClick={handleInteraccion(siguiente)}
          aria-label="Slide siguiente"
          className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <ChevronRight size={16} />
        </button>

        {/* Puntos indicadores */}
        <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={handleInteraccion(() => irA(i))}
              aria-label={`Ir al slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === indice ? 'w-4 bg-white' : 'w-1.5 bg-white/40'}`}
            />
          ))}
        </div>

        {/* Pausa/reanuda autoplay */}
        <button
          type="button"
          onClick={() => setPausado((p) => !p)}
          aria-label={pausado ? 'Reanudar carrusel' : 'Pausar carrusel'}
          aria-pressed={pausado}
          className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors before:content-[''] before:absolute before:inset-[-8px]"
        >
          {pausado ? <Play size={14} /> : <Pause size={14} />}
        </button>
      </div>

      {alumnoModalId && (
        <ModalEvolucionAlumno alumnoId={alumnoModalId} onClose={() => setAlumnoModalId(null)} />
      )}
    </div>
  );
};

export default WidgetHero;
