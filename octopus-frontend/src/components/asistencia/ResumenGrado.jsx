import { useMemo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarCheck, Users } from 'lucide-react';
import { ESTADO, CONFIGS_ESTADO } from '../../constants/asistencia';
import AvatarAlumno from './AvatarAlumno';

// Orden de lectura: primero quienes vinieron, luego las novedades.
const GRUPOS = [
  { estado: ESTADO.PRESENTE,    titulo: 'Vinieron',     vacio: 'Nadie marcado como presente.' },
  { estado: ESTADO.AUSENTE,     titulo: 'Faltaron',     vacio: 'Nadie faltó.' },
  { estado: ESTADO.RETARDADO,   titulo: 'Con retardo',  vacio: 'Sin retardos.' },
  { estado: ESTADO.JUSTIFICADO, titulo: 'Justificados', vacio: 'Sin justificaciones.' },
];

const SIN_MARCAR = { color: 'var(--jet)', fondo: 'var(--ash-light)' };
const TARJETA_STYLE = { border: '0.5px solid var(--border-md)' };

const plural = (n, uno, varios) => (n === 1 ? uno : varios);

/** Desglose por género; `alumno_genero` viene del backend ('femenino' | 'masculino'). */
const porGenero = (alumnos) => ({
  hembras: alumnos.filter(a => a.alumno_genero === 'femenino').length,
  varones: alumnos.filter(a => a.alumno_genero === 'masculino').length,
});

const textoGenero = ({ hembras, varones }) =>
  `${hembras} ${plural(hembras, 'hembra', 'hembras')} · ${varones} ${plural(varones, 'varón', 'varones')}`;

/** Barra proporcional de la asistencia del grado; las cifras exactas van en las tarjetas. */
const BarraProporcion = ({ segmentos, total }) => (
  <div
    role="img"
    aria-label={segmentos.map(s => `${s.cantidad} ${s.titulo.toLowerCase()}`).join(', ')}
    className="flex h-2.5 w-full overflow-hidden rounded-full"
    style={{ background: 'var(--ash-light)' }}
  >
    {segmentos.filter(s => s.cantidad > 0).map(s => (
      <span key={s.clave} className="h-full" style={{ width: `${(s.cantidad / total) * 100}%`, background: s.color }} />
    ))}
  </div>
);

const GrupoAlumnos = ({ titulo, vacio, Icon = Users, color, fondo, alumnos }) => (
  <section
    aria-label={`${titulo}: ${alumnos.length}`}
    className="flex min-w-0 flex-col rounded-2xl bg-white"
    style={TARJETA_STYLE}
  >
    <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold" style={{ color: 'var(--jet)' }}>
          <Icon size={16} aria-hidden="true" style={{ color }} />
          <span className="truncate">{titulo}</span>
        </h3>
        {alumnos.length > 0 && (
          <p className="mt-0.5 pl-6 text-xs" style={{ color: 'var(--jet-mid)' }}>{textoGenero(porGenero(alumnos))}</p>
        )}
      </div>
      <span
        className="min-w-8 rounded-lg px-2 py-0.5 text-center text-sm font-bold tabular-nums"
        style={{ background: fondo, color }}
      >
        {alumnos.length}
      </span>
    </header>

    {alumnos.length === 0 ? (
      <p className="px-4 pb-4 text-sm sm:px-5" style={{ color: 'var(--jet-mid)' }}>{vacio}</p>
    ) : (
      <ul className="max-h-80 divide-y overflow-y-auto px-2 pb-2 sm:px-3" style={{ borderColor: 'var(--border-md)' }}>
        {alumnos.map(r => (
          <li key={r.alumno_id} className="flex items-center gap-3 px-2 py-2">
            <AvatarAlumno nombre={r.alumno_nombre} foto={r.alumno_foto} className="h-8 w-8 rounded-xl text-xs" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium" style={{ color: 'var(--jet)' }}>{r.alumno_nombre}</span>
              {r.observacion && (
                <span className="block truncate text-xs" style={{ color: 'var(--jet-mid)' }}>{r.observacion}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
);

/**
 * Vista "Resumen" del panel: quiénes asistieron, faltaron, llegaron tarde o
 * tienen justificación en el grado y fecha seleccionados. Solo lectura.
 */
const ResumenGrado = ({ grado, fecha, registros, dirty }) => {
  const { grupos, sinMarcar, total, asistieron, generoAsistieron } = useMemo(() => {
    const por = new Map(GRUPOS.map(g => [g.estado, []]));
    const sin = [];
    registros.forEach(r => (r.estado ? por.get(r.estado)?.push(r) : sin.push(r)));
    return {
      grupos: GRUPOS.map(def => ({ ...def, alumnos: por.get(def.estado) })),
      sinMarcar: sin,
      total: registros.length,
      // Quien llega tarde igual asistió a clase.
      asistieron: por.get(ESTADO.PRESENTE).length + por.get(ESTADO.RETARDADO).length,
      generoAsistieron: porGenero([...por.get(ESTADO.PRESENTE), ...por.get(ESTADO.RETARDADO)]),
    };
  }, [registros]);

  const cuenta = (estado) => grupos.find(g => g.estado === estado).alumnos.length;
  const faltaron = cuenta(ESTADO.AUSENTE);
  const retardos = cuenta(ESTADO.RETARDADO);
  const justificados = cuenta(ESTADO.JUSTIFICADO);
  const porcentaje = total ? Math.round((asistieron / total) * 100) : 0;

  const segmentos = [
    ...grupos.map(g => ({
      clave: g.estado,
      titulo: g.titulo,
      cantidad: g.alumnos.length,
      color: CONFIGS_ESTADO[g.estado].activeStyle.color,
    })),
    { clave: 'sin', titulo: 'Sin marcar', cantidad: sinMarcar.length, color: 'var(--ash)' },
  ];

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="rounded-2xl bg-white p-4 sm:p-5" style={TARJETA_STYLE}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold sm:text-lg" style={{ color: 'var(--jet)' }}>{grado}</h2>
            <p className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--jet-mid)' }}>
              <CalendarCheck size={14} aria-hidden="true" className="shrink-0" />
              <span className="truncate">
                {format(fecha, "EEEE d 'de' MMMM", { locale: es })} · {total} {plural(total, 'alumno', 'alumnos')}
              </span>
            </p>
          </div>
          <p className="text-sm sm:text-right" style={{ color: 'var(--jet)' }}>
            <strong className="text-lg font-bold tabular-nums sm:text-xl">{asistieron}</strong> de {total} asistieron
            <span style={{ color: 'var(--jet-mid)' }}> · {porcentaje}%</span>
          </p>
        </div>

        <div className="mt-4"><BarraProporcion segmentos={segmentos} total={total} /></div>

        <p className="mt-3 text-sm font-medium" style={{ color: 'var(--jet)' }}>
          Asistieron: {textoGenero(generoAsistieron)}
        </p>

        <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--jet-mid)' }}>
          {cuenta(ESTADO.PRESENTE)} {plural(cuenta(ESTADO.PRESENTE), 'vino', 'vinieron')}, {faltaron} {plural(faltaron, 'faltó', 'faltaron')}
          {retardos > 0 && `, ${retardos} con retardo`}
          {justificados > 0 && `, ${justificados} ${plural(justificados, 'justificado', 'justificados')}`}
          {sinMarcar.length > 0 && ` y ${sinMarcar.length} sin marcar`}.
        </p>

        {dirty && (
          <p className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ background: '#fef3c7', color: '#b45309' }}>
            Hay cambios sin guardar. Este resumen los incluye; guárdalos desde la vista Lista.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {grupos.map(g => {
          const cfg = CONFIGS_ESTADO[g.estado];
          return (
            <GrupoAlumnos
              key={g.estado}
              titulo={g.titulo}
              vacio={g.vacio}
              Icon={cfg.Icon}
              color={cfg.activeStyle.color}
              fondo={cfg.activeStyle.background}
              alumnos={g.alumnos}
            />
          );
        })}
        {sinMarcar.length > 0 && (
          <GrupoAlumnos titulo="Sin marcar" vacio="" color={SIN_MARCAR.color} fondo={SIN_MARCAR.fondo} alumnos={sinMarcar} />
        )}
      </div>
    </div>
  );
};

export default ResumenGrado;
