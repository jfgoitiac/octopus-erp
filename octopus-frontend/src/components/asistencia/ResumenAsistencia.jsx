import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Loader2, Save, UserCheck } from 'lucide-react';
import { ESTADO, CONFIGS_ESTADO } from '../../constants/asistencia';
import { iniciales, prefiereMenosMovimiento } from './paseLista.utils';

const CONTADORES = [
  { estado: ESTADO.PRESENTE,    label: 'Presentes' },
  { estado: ESTADO.AUSENTE,     label: 'Ausentes' },
  { estado: ESTADO.JUSTIFICADO, label: 'Justificados' },
  { estado: ESTADO.RETARDADO,   label: 'Retardados' },
];

const TARJETA_STYLE = { border: '0.5px solid var(--border-md)', boxShadow: '0 12px 32px -8px rgba(43,48,58,0.12)' };

/** Cuenta del último valor mostrado hasta `valor` en ~600ms (ease-out). Sin animación si se prefiere menos movimiento. */
function useContadorAnimado(valor) {
  const [mostrado, setMostrado] = useState(0);
  const actualRef = useRef(0);

  useEffect(() => {
    const desde = actualRef.current;
    const sinAnimar = prefiereMenosMovimiento() || desde === valor;
    const t0 = performance.now();
    let raf;
    const paso = (t) => {
      const p = sinAnimar ? 1 : Math.min(1, (t - t0) / 600);
      const v = Math.round(desde + (valor - desde) * (1 - Math.pow(1 - p, 3)));
      actualRef.current = v;
      setMostrado(v);
      if (p < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor]);

  return mostrado;
}

const Contador = ({ estado, label, valor }) => {
  const { background, color } = CONFIGS_ESTADO[estado].activeStyle;
  const mostrado = useContadorAnimado(valor);
  return (
    <div className="rounded-xl p-3" style={{ background }}>
      <p className="text-2xl font-bold leading-none tabular-nums sm:text-3xl" style={{ color }}>
        <span aria-hidden="true">{mostrado}</span>
        <span className="sr-only">{valor}</span>
      </p>
      <p className="mt-1 text-xs font-medium" style={{ color }}>{label}</p>
    </div>
  );
};

// Microcelebración sobria: el check entra con un pequeño rebote y una onda
// que se expande y se desvanece (solo transform/opacity).
const CheckGuardado = () => (
  <div className="relative h-14 w-14 shrink-0" aria-hidden="true">
    <span className="pl-check-onda absolute inset-0 rounded-2xl" style={{ background: '#16a34a' }} />
    <span className="pl-check-pop relative flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: '#15803d' }}>
      <Check size={28} strokeWidth={3} color="#fff" />
    </span>
  </div>
);

/**
 * Pantalla final del pase de lista: totales, novedades editables con un toque
 * y guardado. `onGuardar` devuelve true si se guardó.
 */
const ResumenAsistencia = ({ registros, dirty, saving, onGuardar, onEditar, onMarcarRestantes, onVolver }) => {
  const [guardado, setGuardado] = useState(false);
  const exito = guardado && !dirty;

  const { conteos, sinMarcar, novedades } = useMemo(() => {
    const c = { [ESTADO.PRESENTE]: 0, [ESTADO.AUSENTE]: 0, [ESTADO.JUSTIFICADO]: 0, [ESTADO.RETARDADO]: 0 };
    const nov = [];
    let sin = 0;
    registros.forEach((r, i) => {
      if (!r.estado) { sin++; return; }
      c[r.estado]++;
      if (r.estado !== ESTADO.PRESENTE) nov.push({ registro: r, indice: i });
    });
    return { conteos: c, sinMarcar: sin, novedades: nov };
  }, [registros]);

  const guardar = async () => {
    const ok = await onGuardar();
    if (ok) setGuardado(true);
  };

  return (
    <section className="mx-auto w-full max-w-md space-y-3 anim-scale-in" aria-labelledby="pl-resumen-titulo">
      <div className="rounded-2xl bg-white p-5 sm:p-6" style={TARJETA_STYLE}>
        <div className="flex items-center gap-3">
          {exito && <CheckGuardado />}
          <div className="min-w-0">
            <h2 id="pl-resumen-titulo" className="text-lg font-semibold tracking-tight sm:text-xl" style={{ color: 'var(--jet)' }}>
              {exito ? 'Asistencia guardada' : 'Resumen del pase'}
            </h2>
            <p className="text-sm" style={{ color: 'var(--jet-mid)' }}>
              {exito ? 'Todo quedó registrado.' : `Revisa antes de guardar · ${registros.length} alumnos`}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CONTADORES.map(c => <Contador key={c.estado} {...c} valor={conteos[c.estado]} />)}
        </div>

        {sinMarcar > 0 && (
          <div className="mt-4 rounded-xl p-3 sm:p-4" style={{ background: 'var(--ash-light)' }}>
            <p className="text-sm" style={{ color: 'var(--jet)' }}>
              <strong className="font-semibold">{sinMarcar} sin marcar.</strong>{' '}
              <span style={{ color: 'var(--jet-mid)' }}>Si guardas así, se registran como ausentes.</span>
            </p>
            <button
              type="button"
              onClick={onMarcarRestantes}
              className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold transition-transform active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
              style={{ color: '#15803d', boxShadow: 'inset 0 0 0 1px #bbf7d0' }}
            >
              <UserCheck size={16} aria-hidden="true" />
              Marcar {sinMarcar === 1 ? 'el restante' : `los ${sinMarcar} restantes`} como presentes
            </button>
          </div>
        )}
      </div>

      {novedades.length > 0 && (
        <div className="rounded-2xl bg-white p-2 sm:p-3" style={TARJETA_STYLE}>
          <h3 className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ash)' }}>
            Ausencias y novedades
          </h3>
          <ul>
            {novedades.map(({ registro: r, indice }) => {
              const cfg = CONFIGS_ESTADO[r.estado];
              return (
                <li key={r.alumno_id}>
                  <button
                    type="button"
                    onClick={() => onEditar(indice)}
                    aria-label={`Editar a ${r.alumno_nombre || 'alumno'}: ${cfg.label}`}
                    className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-[var(--ash-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold" style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
                      {iniciales(r.alumno_nombre)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium" style={{ color: 'var(--jet)' }}>{r.alumno_nombre}</span>
                      {r.observacion && <span className="block truncate text-xs" style={{ color: 'var(--jet-mid)' }}>{r.observacion}</span>}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold" style={{ background: cfg.activeStyle.background, color: cfg.activeStyle.color }}>
                      <cfg.Icon size={12} aria-hidden="true" /> {cfg.label}
                    </span>
                    <ChevronRight size={16} className="shrink-0" style={{ color: 'var(--ash)' }} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onVolver}
          className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-medium transition-colors hover:bg-[var(--ash-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40"
          style={{ color: 'var(--jet-mid)' }}
        >
          <ArrowLeft size={16} aria-hidden="true" /> Volver a las tarjetas
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={saving || !dirty}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-6 text-base font-semibold text-white transition-[transform,opacity] active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/50 focus-visible:ring-offset-2 sm:w-auto"
          style={{ background: 'var(--docente-primary)', boxShadow: '0 10px 24px -10px rgba(15,163,177,0.7)' }}
        >
          {saving ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
          {saving ? 'Guardando...' : exito ? 'Guardada' : 'Guardar asistencia'}
        </button>
      </div>
    </section>
  );
};

export default ResumenAsistencia;
