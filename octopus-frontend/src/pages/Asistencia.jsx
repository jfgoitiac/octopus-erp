import { useEffect, useMemo, useCallback, useRef } from 'react';
import { Users, Save, Loader2, GraduationCap, ChevronLeft, ChevronRight, CheckCheck } from 'lucide-react';
import { ESTADO, CONFIGS_ESTADO } from '../constants/asistencia';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { datepickerPopperContainer } from '../utils/datepickerPortal';
import { es } from 'date-fns/locale';
import { addDays, format, isSameDay, startOfDay } from 'date-fns';
import { useAsistencia } from '../hooks/useAsistencia';
import GradoSelect from '../components/GradoSelect';
import FilaAlumno from '../components/asistencia/FilaAlumno';
import SkeletonFila from '../components/asistencia/SkeletonFila';
import PaseListaTarjetas from '../components/asistencia/PaseListaTarjetas';
import ResumenGrado from '../components/asistencia/ResumenGrado';
import SelectorVistaAsistencia from '../components/asistencia/SelectorVistaAsistencia';
import { useVistaAsistencia, VISTA } from '../components/asistencia/useVistaAsistencia';
import { PageHeader } from '../components/ui/PageHeader';

const INPUT_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
// Sin `background` inline (a diferencia de INPUT_STYLE): así la clase
// Tailwind `hover:bg-*` puede sobrescribirlo — un `style` inline con
// background siempre gana sobre cualquier variante de Tailwind.
const NAV_BTN_STYLE = { border: '0.5px solid var(--border-md)', color: 'var(--jet)' };

// Nota: los colores de texto sobre fondo se eligieron para cumplir contraste
// >= 4.5:1 en texto pequeño (WCAG AA). #16a34a/var(--ash) originales no
// pasaban sobre sus fondos claros — se oscurecieron a #15803d y var(--jet).
const CONTEO_ITEMS = [
  { key: 'presentes',    label: 'Presentes',    estado: ESTADO.PRESENTE },
  { key: 'ausentes',     label: 'Ausentes',     estado: ESTADO.AUSENTE },
  { key: 'retardados',   label: 'Retardados',   estado: ESTADO.RETARDADO },
  { key: 'justificados', label: 'Justificados', estado: ESTADO.JUSTIFICADO },
  { key: 'sinMarcar',    label: 'Sin marcar',   estado: null },
];

const TARJETA_STYLE = { border: '0.5px solid var(--border-md)' };

// Altura del modo pase dentro de MainLayout: topbar de 56px (64px desde md),
// padding del área de contenido y la fila del selector (44px + 16px) que queda
// anclada arriba. Sin bottom nav: los botones quedan sobre el borde inferior.
const ALTURA_PANEL = 'h-[calc(100dvh-8.75rem)] md:h-[calc(100dvh-9.75rem)]';

const Asistencia = () => {
  const {
    fecha, setFecha,
    grado, setGrado,
    registros,
    loading,
    saving,
    dirty,
    conteos,
    marcar,
    marcarTodosPresentes,
    actualizarObservacion,
    restaurarRegistro,
    guardar,
    sinMarcar,
  } = useAsistencia();

  const [vista, cambiarVista] = useVistaAsistencia('admin_asistencia_vista', { conResumen: true });
  const enTarjetas = vista === VISTA.TARJETAS;
  const enResumen = vista === VISTA.RESUMEN;
  const enLista = vista === VISTA.LISTA;
  const barraVistaRef = useRef(null);

  const hoy = useMemo(() => startOfDay(new Date()), []);
  const esHoy = isSameDay(fecha, hoy);

  const irADiaAnterior = useCallback(() => {
    setFecha(prev => addDays(prev, -1));
  }, [setFecha]);

  const irADiaSiguiente = useCallback(() => {
    setFecha(prev => (isSameDay(prev, hoy) ? prev : addDays(prev, 1)));
  }, [setFecha, hoy]);

  // Bloquear cierre/recarga de pestaña con cambios sin guardar
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  return (
    <div className="animate-fadeIn pb-24 sm:pb-0">
      <PageHeader
        titulo="Control de Asistencia"
        descripcion="Registro diario de presencia por grado"
        acciones={enLista && (
          <button
            onClick={guardar}
            disabled={saving || !dirty || !registros.length || sinMarcar > 0}
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50 min-h-[44px]"
            style={{ background: 'var(--pb)' }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Guardando...' : 'Guardar asistencia'}
          </button>
        )}
      />

      {/* Filtros */}
      <div className="mb-4 grid grid-cols-1 gap-4 rounded-2xl bg-white p-4 sm:grid-cols-2 sm:p-5" style={TARJETA_STYLE}>
        <div>
          <label
            htmlFor="filtro-fecha"
            className="mb-1.5 block text-xs font-medium"
            style={{ color: 'var(--jet-mid)' }}
          >
            Fecha
          </label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={irADiaAnterior}
              aria-label="Día anterior"
              className="flex-shrink-0 flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 rounded-lg bg-white transition-colors hover:bg-[var(--ash-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
              style={NAV_BTN_STYLE}
            >
              <ChevronLeft size={16} />
            </button>

            <DatePicker
              id="filtro-fecha"
              selected={fecha}
              onChange={setFecha}
              locale={es}
              dateFormat="dd/MM/yyyy"
              maxDate={new Date()}
              wrapperClassName="w-full"
              popperContainer={datepickerPopperContainer}
              customInput={
                <input
                  className="w-full px-3 py-2.5 sm:py-2 rounded-lg text-sm outline-none cursor-pointer text-center focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
                  style={INPUT_STYLE}
                />
              }
            />

            <button
              type="button"
              onClick={irADiaSiguiente}
              disabled={esHoy}
              aria-label="Día siguiente"
              className="flex-shrink-0 flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 rounded-lg bg-white transition-colors hover:enabled:bg-[var(--ash-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 disabled:opacity-40 disabled:cursor-not-allowed"
              style={NAV_BTN_STYLE}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="filtro-grado"
            className="mb-1.5 block text-xs font-medium"
            style={{ color: 'var(--jet-mid)' }}
          >
            Grado / Año
          </label>
          <GradoSelect
            id="filtro-grado"
            value={grado}
            onChange={e => setGrado(e.target.value)}
            incluirVacio
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={INPUT_STYLE}
          />
        </div>
      </div>

      {grado && (
        <div
          ref={barraVistaRef}
          className={`mb-4 flex scroll-mt-4 items-center md:scroll-mt-6 ${enTarjetas ? 'mx-auto w-full max-w-md' : 'justify-end'}`}
        >
          <SelectorVistaAsistencia vista={vista} onCambiar={cambiarVista} conResumen />
        </div>
      )}

      {grado && enTarjetas ? (
        <PaseListaTarjetas
          key={`${grado}-${format(fecha, 'yyyy-MM-dd')}`}
          titulo={grado}
          subtitulo="Control de asistencia"
          fecha={fecha}
          registros={registros}
          loading={loading}
          dirty={dirty}
          saving={saving}
          onMarcar={marcar}
          onObservacion={actualizarObservacion}
          onRestaurar={restaurarRegistro}
          onGuardar={guardar}
          anclaScrollRef={barraVistaRef}
          claseAltura={ALTURA_PANEL}
        />
      ) : grado && enResumen ? (
        loading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <SkeletonFila key={i} />)}</div>
        ) : registros.length === 0 ? (
          <div className="rounded-2xl p-10 text-center sm:p-16" style={{ ...TARJETA_STYLE, background: 'var(--porcelain)', color: 'var(--jet-mid)' }}>
            <p className="text-sm">No hay alumnos registrados en este grado.</p>
          </div>
        ) : (
          <ResumenGrado grado={grado} fecha={fecha} registros={registros} dirty={dirty} />
        )
      ) : (
      <>
      {/* Contadores */}
      {grado && !loading && registros.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
          {CONTEO_ITEMS.map(({ key, label, estado }) => {
            const cfg = estado ? CONFIGS_ESTADO[estado] : null;
            const { color, background } = cfg ? cfg.activeStyle : { color: 'var(--jet)', background: 'var(--ash-light)' };
            const Icon = cfg ? cfg.Icon : Users;
            return (
              <div key={key} className="flex items-center gap-3 rounded-xl p-3" style={{ background }}>
                <Icon size={18} aria-hidden="true" style={{ color }} />
                <div>
                  <p className="text-xl font-bold leading-none tabular-nums" style={{ color }}>{conteos[key]}</p>
                  <p className="mt-1 text-xs font-medium" style={{ color }}>{label}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Marcar todos presentes */}
      {grado && !loading && registros.length > 0 && (
        <div className="flex justify-end mb-3">
          <button
            type="button"
            onClick={marcarTodosPresentes}
            className="flex items-center gap-2 px-3 py-2 min-h-[44px] sm:min-h-0 sm:py-1.5 rounded-lg text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 focus-visible:ring-offset-1"
            style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
          >
            <CheckCheck size={14} />
            Marcar todos presentes
          </button>
        </div>
      )}

      {/* Lista */}
      {!grado ? (
        <div
          className="rounded-2xl p-10 text-center sm:p-16"
          style={{ ...TARJETA_STYLE, background: 'var(--porcelain)', color: 'var(--jet-mid)' }}
        >
          <GraduationCap size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Selecciona grado y fecha para cargar la lista.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {loading ? (
            [...Array(8)].map((_, i) => <SkeletonFila key={i} />)
          ) : registros.length === 0 ? (
            <div
              className="rounded-xl p-16 text-center"
              style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}
            >
              <p className="text-sm">No hay alumnos registrados en este grado.</p>
            </div>
          ) : (
            registros.map((r, i) => (
              <FilaAlumno
                key={`${r.alumno_id}-${r.estado || i}`}
                registro={r}
                onMarcar={marcar}
                onObservacion={actualizarObservacion}
              />
            ))
          )}
        </div>
      )}

      {dirty && sinMarcar > 0 && registros.length > 0 && (
        <p className="mt-3 text-center text-xs" style={{ color: 'var(--ash)' }}>
          Falta{sinMarcar === 1 ? '' : 'n'} {sinMarcar} alumno{sinMarcar === 1 ? '' : 's'} por marcar para poder guardar.
        </p>
      )}

      {/* Botón guardar sticky — solo mobile y vista Lista, visible cuando hay cambios */}
      {dirty && registros.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 p-4 sm:hidden z-40"
          style={{ background: 'var(--porcelain)', borderTop: '1px solid var(--border-md)' }}
        >
          <button
            onClick={guardar}
            disabled={saving || sinMarcar > 0}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--pb)' }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Guardando...' : 'Guardar asistencia'}
          </button>
        </div>
      )}
      </>
      )}
    </div>
  );
};

export default Asistencia;
