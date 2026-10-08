import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { ListChecks, Undo2, Users } from 'lucide-react';
import { ESTADO, CONFIGS_ESTADO, TECLA_A_ESTADO } from '../../constants/asistencia';
import TarjetaAlumno, { BotonesEstado } from './TarjetaAlumno';
import BarraProgresoLista from './BarraProgresoLista';
import InicioPaseLista from './InicioPaseLista';
import ResumenAsistencia from './ResumenAsistencia';
import SkeletonTarjeta from './SkeletonTarjeta';
import { useSwipeTarjeta } from './useSwipeTarjeta';
import { SALIDA_POR_ESTADO, primerSinMarcar, requiereObservacion, prefiereMenosMovimiento, vibrar } from './paseLista.utils';

const TOAST_DESHACER = 'pase-lista-deshacer';
const MS_CONFIRMACION = 150;

// Destino de la tarjeta saliente según la dirección (ver @keyframes plSalir).
const DESTINO_SALIDA = {
  der:    { '--pl-x1': '115%',  '--pl-y1': '0px',  '--pl-r1': '10deg' },
  izq:    { '--pl-x1': '-115%', '--pl-y1': '0px',  '--pl-r1': '-10deg' },
  arriba: { '--pl-x1': '0px',   '--pl-y1': '-35%', '--pl-r1': '0deg' },
};

// Origen abajo: al escalar, la tarjeta de atrás conserva el borde inferior y
// asoma por debajo de la actual (10px y 20px), como un mazo.
const MAZO_STYLE = { border: '0.5px solid var(--border-md)', boxShadow: '0 8px 24px -10px rgba(43,48,58,0.18)', transformOrigin: '50% 100%' };

const AvisoDeshacer = ({ nombre, estado, onDeshacer }) => (
  <div className="flex items-center justify-between gap-3">
    <p className="min-w-0 truncate text-sm" style={{ color: 'var(--jet)' }}>
      <span className="font-semibold">{nombre || 'Alumno'}</span>
      <span style={{ color: 'var(--jet-mid)' }}> · {CONFIGS_ESTADO[estado]?.label}</span>
    </p>
    <button
      type="button"
      onClick={onDeshacer}
      className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-transform active:scale-[0.97]"
      style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
    >
      <Undo2 size={14} aria-hidden="true" /> Deshacer
    </button>
  </div>
);

/**
 * Modo "Pasar lista": inicio → una tarjeta por alumno → resumen.
 * No tiene estado de asistencia propio: lee `registros` y escribe a través de
 * los callbacks de useAsistenciaClase. Solo maneja índice, fase y animación.
 */
const PaseListaTarjetas = ({
  registros,
  loading,
  materia,
  fecha,
  dirty,
  saving,
  onMarcar,
  onObservacion,
  onRestaurar,
  onGuardar,
}) => {
  const [fase, setFase] = useState('inicio');          // 'inicio' | 'pase' | 'resumen'
  const [indice, setIndice] = useState(0);
  const [entrada, setEntrada] = useState('adelante');  // de dónde entra la tarjeta actual
  const [saliente, setSaliente] = useState(null);      // única tarjeta saliente: nunca se acumulan
  const [expandido, setExpandido] = useState(null);    // alumno_id con la observación abierta
  const [confirmando, setConfirmando] = useState(null);

  const rootRef = useRef(null);
  const primerBotonRef = useRef(null);
  const timerRef = useRef(null);
  const ultimoCambioRef = useRef(null);
  const salidaSeqRef = useRef(0);
  const deshacerRef = useRef(null);
  const teclaRef = useRef(null);
  const faseAnteriorRef = useRef(fase);

  const total = registros.length;
  const i = Math.min(indice, Math.max(total - 1, 0));
  const actual = registros[i];
  const marcados = registros.reduce((n, r) => n + (r.estado ? 1 : 0), 0);
  const restantesMazo = Math.min(2, Math.max(0, total - i - 1));

  const cancelarPendiente = () => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    setConfirmando(null);
  };

  /**
   * Lleva a la tarjeta `destino` (o al resumen si se pasa del final).
   * `registroSaliente` permite animar la tarjeta con el estado recién marcado
   * cuando se llama desde un timeout (el render de ese momento aún no lo tiene).
   */
  const irA = (destino, { dir, x0 = 0, registroSaliente } = {}) => {
    cancelarPendiente();
    setExpandido(null);
    if (destino < 0) return;
    if (destino >= total) { setFase('resumen'); return; }
    if (destino === i && fase === 'pase') return;

    if (fase === 'pase' && actual) {
      salidaSeqRef.current += 1;
      setSaliente({
        registro: registroSaliente || actual,
        numero: i + 1,
        dir: dir || (destino > i ? 'izq' : 'der'),
        x0,
        seq: salidaSeqRef.current,
      });
    }
    setEntrada(destino > i || fase !== 'pase' ? 'adelante' : 'atras');
    setIndice(destino);
    setFase('pase');
  };

  const siguiente = (x0) => irA(i + 1, { dir: 'izq', x0 });
  const anterior = (x0) => { if (i > 0) irA(i - 1, { dir: 'der', x0 }); };

  const avisarDeshacer = (previo, idx, estado) => {
    ultimoCambioRef.current = { previo, idx };
    const render = (
      <AvisoDeshacer nombre={previo.alumno_nombre} estado={estado} onDeshacer={() => deshacerRef.current?.()} />
    );
    // Arriba: abajo taparía los botones de la zona del pulgar en móvil.
    const opciones = { position: 'top-center', autoClose: 4000, closeOnClick: false, hideProgressBar: true };
    if (toast.isActive(TOAST_DESHACER)) toast.update(TOAST_DESHACER, { render, ...opciones });
    else toast(render, { toastId: TOAST_DESHACER, ...opciones });
  };

  const marcarActual = (estado) => {
    if (fase !== 'pase' || !actual) return;
    cancelarPendiente();
    vibrar();

    const previo = actual;
    const idx = i;
    onMarcar(previo.alumno_id, estado);
    avisarDeshacer(previo, idx, estado);

    if (requiereObservacion(estado)) {
      setExpandido(previo.alumno_id);
      return;
    }
    setExpandido(null);
    setConfirmando(estado);
    const registroSaliente = { ...previo, estado, observacion: estado === ESTADO.PRESENTE ? '' : previo.observacion };
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setConfirmando(null);
      irA(idx + 1, { dir: SALIDA_POR_ESTADO[estado], registroSaliente });
    }, MS_CONFIRMACION);
  };

  const deshacer = () => {
    const cambio = ultimoCambioRef.current;
    if (!cambio) return;
    ultimoCambioRef.current = null;
    toast.dismiss(TOAST_DESHACER);
    onRestaurar(cambio.previo);
    irA(cambio.idx, { dir: 'der' });
  };

  const comenzar = () => {
    const pendiente = primerSinMarcar(registros);
    cancelarPendiente();
    setSaliente(null);
    setExpandido(null);
    setEntrada('adelante');
    setIndice(pendiente === -1 ? 0 : pendiente);
    setFase('pase');
  };

  const abrirResumen = () => {
    cancelarPendiente();
    setExpandido(null);
    setFase('resumen');
  };

  const marcarRestantes = () => {
    registros.forEach(r => { if (!r.estado) onMarcar(r.alumno_id, ESTADO.PRESENTE); });
  };

  const swipe = useSwipeTarjeta({ onSiguiente: siguiente, onAnterior: anterior, hayAnterior: i > 0 });

  // Los listeners externos (toast, teclado) llaman siempre a la versión del
  // último render, para no operar con un índice viejo.
  useEffect(() => {
    deshacerRef.current = deshacer;
    teclaRef.current = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('[role="dialog"]')) return;

      if (e.key === 'ArrowRight') { e.preventDefault(); siguiente(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); anterior(); return; }
      const estado = TECLA_A_ESTADO[e.key.toLowerCase()];
      if (estado) { e.preventDefault(); marcarActual(estado); }
    };
  });

  useEffect(() => {
    if (fase !== 'pase') return undefined;
    const onKey = (e) => teclaRef.current?.(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fase]);

  // Al cambiar de fase, la sección queda alineada bajo el header fijo: en
  // 360×640 así la tarjeta y los botones entran sin scroll.
  useEffect(() => {
    if (faseAnteriorRef.current !== fase) {
      rootRef.current?.scrollIntoView?.({ block: 'start', behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth' });
    }
    faseAnteriorRef.current = fase;
  }, [fase]);

  // Foco al primer botón de cada tarjeta nueva (accesibilidad y teclado).
  useEffect(() => {
    if (fase === 'pase' && !expandido) primerBotonRef.current?.focus({ preventScroll: true });
  }, [fase, i, expandido]);

  // Precarga la foto del siguiente alumno para que la tarjeta entre sin parpadeo.
  const fotoSiguiente = registros[i + 1]?.alumno_foto;
  useEffect(() => {
    if (!fotoSiguiente) return;
    const img = new Image();
    img.src = fotoSiguiente;
  }, [fotoSiguiente]);

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    toast.dismiss(TOAST_DESHACER);
  }, []);

  const anuncio = fase === 'pase' && actual ? `Alumno ${i + 1} de ${total}: ${actual.alumno_nombre || 'sin nombre'}` : '';

  let contenido;
  if (loading) {
    contenido = <SkeletonTarjeta />;
  } else if (total === 0) {
    contenido = (
      <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-8 text-center sm:p-10" style={{ border: '0.5px solid var(--border-md)' }}>
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}>
          <Users size={26} aria-hidden="true" />
        </span>
        <p className="mt-4 text-sm font-medium" style={{ color: 'var(--jet)' }}>No hay alumnos registrados en esta sección.</p>
        <p className="mt-1 text-xs" style={{ color: 'var(--jet-mid)' }}>Cuando se inscriban aparecerán aquí para pasar lista.</p>
      </div>
    );
  } else if (fase === 'inicio') {
    contenido = (
      <InicioPaseLista
        materia={materia}
        fecha={fecha}
        total={total}
        marcados={marcados}
        onComenzar={comenzar}
        onResumen={abrirResumen}
      />
    );
  } else if (fase === 'resumen') {
    contenido = (
      <ResumenAsistencia
        registros={registros}
        dirty={dirty}
        saving={saving}
        onGuardar={onGuardar}
        onEditar={(idx) => irA(idx)}
        onMarcarRestantes={marcarRestantes}
        onVolver={() => irA(i)}
      />
    );
  } else {
    contenido = (
      <div className="flex h-[calc(100dvh-8rem)] min-h-[30rem] flex-col gap-3 sm:h-[calc(100dvh-6rem)] sm:max-h-[50rem]">
        <div className="mx-auto flex w-full max-w-md items-center gap-2">
          <div className="min-w-0 flex-1">
            <BarraProgresoLista registros={registros} indice={i} onIr={(idx) => irA(idx)} />
          </div>
          <button
            type="button"
            onClick={abrirResumen}
            aria-label="Ver resumen"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white transition-transform active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
            style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet-mid)' }}
          >
            <ListChecks size={18} aria-hidden="true" />
          </button>
        </div>

        {/* El desborde horizontal de las tarjetas que salen se recorta aquí,
            a ras del viewport en móvil: el <body> nunca scrollea en horizontal. */}
        <div className="relative -mx-4 min-h-0 flex-1 overflow-x-clip px-4 sm:mx-0 sm:px-0">
          <div className="relative mx-auto h-full w-full max-w-md">
            <div className="absolute inset-x-0 bottom-5 top-0">
              {restantesMazo >= 2 && (
                <div aria-hidden="true" className="absolute inset-0 rounded-2xl bg-white" style={{ ...MAZO_STYLE, transform: 'translate3d(0, 20px, 0) scale(0.9)', opacity: 0.5 }} />
              )}
              {restantesMazo >= 1 && (
                <div aria-hidden="true" className="absolute inset-0 rounded-2xl bg-white" style={{ ...MAZO_STYLE, transform: 'translate3d(0, 10px, 0) scale(0.95)', opacity: 0.8 }} />
              )}

              {actual && (
                <TarjetaAlumno
                  key={actual.alumno_id}
                  registro={actual}
                  numero={i + 1}
                  expandido={expandido === actual.alumno_id}
                  onObservacion={onObservacion}
                  onSiguiente={() => irA(i + 1, { dir: SALIDA_POR_ESTADO[actual.estado] || 'izq' })}
                  cardRef={swipe.ref}
                  className={entrada === 'atras' ? 'pl-entrar-atras' : 'pl-entrar-adelante'}
                  style={{ touchAction: 'pan-y' }}
                  {...swipe.handlers}
                />
              )}

              {saliente && (
                <TarjetaAlumno
                  key={`saliente-${saliente.seq}`}
                  registro={saliente.registro}
                  numero={saliente.numero}
                  aria-hidden="true"
                  inert
                  className="pl-salir pointer-events-none"
                  style={{
                    '--pl-x0': `${saliente.x0}px`,
                    '--pl-r0': `${saliente.x0 / 24}deg`,
                    ...DESTINO_SALIDA[saliente.dir],
                  }}
                  onAnimationEnd={(e) => {
                    if (e.target !== e.currentTarget) return;
                    setSaliente(s => (s?.seq === saliente.seq ? null : s));
                  }}
                />
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md">
          <BotonesEstado
            estado={actual?.estado}
            confirmando={confirmando}
            onMarcar={marcarActual}
            onAnterior={() => anterior()}
            onSiguiente={() => siguiente()}
            puedeAnterior={i > 0}
            primerBotonRef={primerBotonRef}
          />
          <p className="mt-2 hidden text-center text-[11px] lg:block" style={{ color: 'var(--ash)' }}>
            Atajos: <kbd className="font-semibold">P</kbd> presente · <kbd className="font-semibold">A</kbd> ausente ·{' '}
            <kbd className="font-semibold">J</kbd> justificado · <kbd className="font-semibold">T</kbd> tarde · <kbd className="font-semibold">← →</kbd> moverse
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="scroll-mt-16">
      <p className="sr-only" aria-live="polite">{anuncio}</p>
      {contenido}
    </div>
  );
};

export default PaseListaTarjetas;
