import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { Users, Save, Loader2, GraduationCap, ChevronLeft, ChevronRight, CheckCheck, AlertTriangle } from 'lucide-react';
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
import { PeriodoEscolarSelect } from '../components/academico/PeriodoEscolarSelect';
import { useContextoAcademico } from '../hooks/useContextoAcademico';
import { Modal } from '../components/ui/Modal';
import { useNavigate } from 'react-router-dom';

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
  const navigate = useNavigate();
  const contexto = useContextoAcademico();
  const {
    fecha, setFecha,
    grado, gradoNombre, seleccionarGrado,
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
    jornada,
  } = useAsistencia({ periodoId: contexto.periodoId, sedeId: contexto.sedeId });
  const [cambioPendiente, setCambioPendiente] = useState(null);

  const [vista, cambiarVista] = useVistaAsistencia('admin_asistencia_vista', { conResumen: true });
  const enTarjetas = vista === VISTA.TARJETAS;
  const enResumen = vista === VISTA.RESUMEN;
  const enLista = vista === VISTA.LISTA;
  const barraVistaRef = useRef(null);

  const hoy = useMemo(() => startOfDay(new Date()), []);
  const esHoy = isSameDay(fecha, hoy);

  const solicitarCambio = useCallback((accion) => {
    if (dirty) setCambioPendiente(() => accion);
    else accion();
  }, [dirty]);

  const confirmarCambio = useCallback(() => {
    cambioPendiente?.();
    setCambioPendiente(null);
  }, [cambioPendiente]);

  const irADiaAnterior = useCallback(() => {
    solicitarCambio(() => setFecha(prev => addDays(prev, -1)));
  }, [setFecha, solicitarCambio]);

  const irADiaSiguiente = useCallback(() => {
    solicitarCambio(() => setFecha(prev => (isSameDay(prev, hoy) ? prev : addDays(prev, 1))));
  }, [setFecha, hoy, solicitarCambio]);

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

  // BrowserRouter no expone un blocker estable. La captura temprana evita
  // que los enlaces del rail o la barra móvil desmonten la pantalla antes de
  // que la persona decida qué hacer con el borrador.
  useEffect(() => {
    if (!dirty) return undefined;
    const interceptarNavegacion = (evento) => {
      if (evento.defaultPrevented || evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
      const enlace = evento.target.closest?.('a[href]');
      if (!enlace || enlace.target === '_blank' || enlace.hasAttribute('download')) return;
      const destino = new URL(enlace.href, window.location.href);
      if (destino.origin !== window.location.origin) return;
      evento.preventDefault();
      evento.stopPropagation();
      setCambioPendiente(() => () => navigate(`${destino.pathname}${destino.search}${destino.hash}`));
    };
    document.addEventListener('click', interceptarNavegacion, true);
    return () => document.removeEventListener('click', interceptarNavegacion, true);
  }, [dirty, navigate]);

  return (
    <div className="animate-fadeIn pb-24 sm:pb-0">
      <PageHeader
        titulo="Control de Asistencia"
        descripcion="Registro diario de presencia por grado"
        acciones={enLista && (
          <button
            onClick={guardar}
            disabled={saving || !dirty || !registros.length || sinMarcar > 0 || !jornada.esLectiva}
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50 min-h-[44px]"
            style={{ background: 'var(--pb)' }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Guardando...' : 'Guardar asistencia'}
          </button>
        )}
      />

      {/* Filtros */}
      <div className="mb-4 grid grid-cols-1 gap-4 rounded-2xl bg-white p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5" style={TARJETA_STYLE}>
        <PeriodoEscolarSelect
          id="asistencia-periodo"
          periodos={contexto.periodos}
          value={contexto.periodoId}
          onChange={(valor) => solicitarCambio(() => contexto.setPeriodoId(valor))}
          loading={contexto.loadingPeriodos}
          disabled={false}
        />
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
              onChange={(valor) => solicitarCambio(() => setFecha(valor))}
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
            onChange={() => {}}
            onGradoSeleccionado={gradoSeleccionado => solicitarCambio(() => seleccionarGrado(String(gradoSeleccionado?.id || ''), gradoSeleccionado))}
            normalizado
            filtros={contexto.filtrosGrado}
            incluirVacio
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={INPUT_STYLE}
          />
        </div>
      </div>

      {grado && !jornada.esLectiva && (
        <div role="status" className="mb-4 flex min-w-0 items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 sm:p-4">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <p className="min-w-0">Esta fecha no está marcada como jornada lectiva. Puedes consultar la lista, pero no registrar asistencia.</p>
        </div>
      )}

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
          titulo={gradoNombre}
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
          <ResumenGrado grado={gradoNombre} fecha={fecha} registros={registros} dirty={dirty} />
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
            disabled={saving || sinMarcar > 0 || !jornada.esLectiva}
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

      <Modal
        open={Boolean(cambioPendiente)}
        onClose={() => setCambioPendiente(null)}
        titulo="Cambios sin guardar"
        size="sm"
        bodyClassName="p-4 sm:p-6"
        footer={(
          <>
            <button type="button" onClick={() => setCambioPendiente(null)} className="min-h-11 w-full rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium sm:w-auto">
              Seguir editando
            </button>
            <button type="button" onClick={confirmarCambio} className="min-h-11 w-full rounded-xl bg-[var(--red)] px-4 py-2 text-sm font-medium text-white sm:w-auto">
              Descartar y continuar
            </button>
          </>
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          <AlertTriangle className="mt-0.5 shrink-0 text-[var(--yellow-dark)]" size={22} aria-hidden="true" />
          <p className="min-w-0 text-sm leading-6 text-[var(--jet-mid)]">
            Si cambias el período, la fecha o la sección, se perderán las marcas que todavía no has guardado.
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default Asistencia;
