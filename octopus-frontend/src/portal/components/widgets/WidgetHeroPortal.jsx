import { useState, useEffect, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  GraduationCap, CheckCircle, Megaphone, TrendingDown,
  ChevronLeft, ChevronRight, Play, Pause,
} from 'lucide-react';

const AUTOPLAY_MS = 6000;

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
    <h1 className="text-xl font-bold mt-1">Hola, {nombre || 'Representante'}</h1>
    {loading ? (
      <div className="h-3.5 bg-white/20 rounded-full w-2/3 mt-2.5 animate-pulse" />
    ) : (
      <p className="text-sm text-white/80 mt-2">
        {pendientes.length > 0 ? `Tienes ${pendientes.join(' y ')}.` : 'Estás al día con tus pendientes.'}
      </p>
    )}
  </div>
);

// Slide 2 — resumen financiero
const SlideResumenFinanciero = ({ resumen, loading }) => {
  if (loading) return <SkeletonLineas lineas={2} />;

  const tieneDeuda = resumen && Number(resumen.total_deuda_usd) > 0;

  if (!tieneDeuda) {
    return (
      <div className="relative h-full flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center mb-2">
          <CheckCircle size={22} className="text-white/80" />
        </div>
        <p className="text-sm font-medium text-white/90">Solvente — al día con los pagos</p>
      </div>
    );
  }

  const masVencida = resumen.mensualidades_vencidas?.[0];

  return (
    <div className="relative h-full flex flex-col justify-center">
      <p className="text-xs text-white/70">Deuda pendiente</p>
      <h2 className="text-2xl font-bold mt-1">${Number(resumen.total_deuda_usd).toFixed(2)} USD</h2>
      {masVencida && (
        <div className="mt-3 inline-flex items-center gap-2 bg-white/15 rounded-xl px-3 py-2 text-xs font-medium backdrop-blur-sm self-start">
          {masVencida.mes_nombre} {masVencida.anio} · {masVencida.dias_mora} días de mora
        </div>
      )}
    </div>
  );
};

// Slide 3 — avisos sin leer
const SlideAvisos = ({ avisosSinLeer, loading }) => {
  if (loading) return <SkeletonLineas lineas={2} />;

  if (!avisosSinLeer) {
    return (
      <div className="relative h-full flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center mb-2">
          <Megaphone size={22} className="text-white/80" />
        </div>
        <p className="text-sm font-medium text-white/90">Estás al día con las comunicaciones del colegio.</p>
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col justify-center">
      <p className="text-xs text-white/70 flex items-center gap-1.5">
        <Megaphone size={13} /> Avisos sin leer
      </p>
      <p className="text-3xl font-bold mt-1 leading-none">{avisosSinLeer}</p>
      <p className="text-sm text-white/80 mt-2">
        {avisosSinLeer === 1 ? 'Tienes 1 circular sin leer.' : `Tienes ${avisosSinLeer} circulares sin leer.`}
      </p>
    </div>
  );
};

// Slide 4 — alerta de rendimiento académico
const SlideAlertaRendimiento = ({ alertaRendimiento, loading }) => {
  if (loading) return <SkeletonLineas lineas={3} />;

  if (!alertaRendimiento?.length) {
    return (
      <div className="relative h-full flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center mb-2">
          <TrendingDown size={22} className="text-white/80" />
        </div>
        <p className="text-sm font-medium text-white/90">Ningún hijo con materias por debajo del mínimo aprobatorio.</p>
      </div>
    );
  }

  // Agrupar por alumno, el que tiene más alertas primero
  const porAlumno = alertaRendimiento.reduce((acc, a) => {
    acc[a.alumno_nombre] = (acc[a.alumno_nombre] || 0) + 1;
    return acc;
  }, {});
  const alumnosOrdenados = Object.entries(porAlumno).sort((a, b) => b[1] - a[1]);
  const [alumnoTop, cantidadTop] = alumnosOrdenados[0];
  const primeraAlerta = alertaRendimiento.find(a => a.alumno_nombre === alumnoTop);

  const frase = alumnosOrdenados.length > 1
    ? `${alumnosOrdenados.length} hijos bajaron de nota, ${cantidadTop} materia${cantidadTop === 1 ? '' : 's'} en ${alumnoTop}`
    : `${alumnoTop} bajó de nota en ${primeraAlerta.materia_nombre} (${primeraAlerta.promedio})`;

  return (
    <div className="relative h-full flex flex-col justify-center">
      <p className="text-xs text-white/70 flex items-center gap-1.5">
        <TrendingDown size={13} /> Rendimiento académico
      </p>
      <p className="text-sm font-semibold mt-1 leading-snug">{frase}</p>
      <div className="mt-2 space-y-1.5">
        {alertaRendimiento.slice(0, 3).map((a, i) => (
          <div
            key={a.alumno_id ? `${a.alumno_id}-${a.materia_nombre}` : i}
            className="flex items-center gap-2 bg-white/15 rounded-xl px-3 py-1.5 backdrop-blur-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{a.alumno_nombre}</p>
              <p className="text-[10px] text-white/60 truncate">{a.materia_nombre} · {a.promedio}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const WidgetHeroPortal = ({
  nombre, resumen, avisosSinLeer = 0, alertaRendimiento = [], logoColegio = null,
  loadingResumen = false, loadingAvisos = false, loadingRendimiento = false,
}) => {
  const hoy = format(new Date(), "EEEE d 'de' MMMM", { locale: es });

  const pendientes = [];
  const tieneDeuda = resumen && Number(resumen.total_deuda_usd) > 0;
  if (tieneDeuda) {
    pendientes.push('deuda pendiente');
  }
  if (avisosSinLeer > 0) {
    pendientes.push(`${avisosSinLeer} aviso${avisosSinLeer === 1 ? '' : 's'} sin leer`);
  }

  const slides = [
    <SlideSaludo key="saludo" nombre={nombre} hoy={hoy} pendientes={pendientes} loading={loadingResumen || loadingAvisos} />,
    <SlideResumenFinanciero key="resumen-financiero" resumen={resumen} loading={loadingResumen} />,
    <SlideAvisos key="avisos" avisosSinLeer={avisosSinLeer} loading={loadingAvisos} />,
    <SlideAlertaRendimiento key="alerta-rendimiento" alertaRendimiento={alertaRendimiento} loading={loadingRendimiento} />,
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
      style={{ background: 'linear-gradient(135deg, var(--portal-primary) 0%, var(--portal-secondary) 100%)' }}
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
    </div>
  );
};

export default WidgetHeroPortal;
