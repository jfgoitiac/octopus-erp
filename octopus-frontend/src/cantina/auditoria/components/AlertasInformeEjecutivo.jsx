import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';

// Alertas ejecutivas calculadas por el backend: {codigo, severidad, titulo, detalle}.
// Colores solo con tokens del sistema.

const ESTILOS = {
  critica: { icono: ShieldAlert, fondo: 'var(--red-light)', color: 'var(--red)' },
  advertencia: { icono: AlertTriangle, fondo: 'var(--yellow-light)', color: 'var(--amber-ink)' },
  info: { icono: Info, fondo: 'var(--pb-light)', color: 'var(--pb-mid)' },
};

export default function AlertasInformeEjecutivo({ alertas }) {
  if (alertas.length === 0) {
    return (
      <div
        className="flex items-center gap-3 rounded-2xl p-3 sm:p-4 text-sm"
        style={{ background: 'var(--green-light)', color: 'var(--green)' }}
      >
        <CheckCircle2 size={18} aria-hidden="true" className="shrink-0" />
        Sin alertas ejecutivas en el período.
      </div>
    );
  }
  return (
    <section aria-label="Alertas ejecutivas" className="flex flex-col gap-2">
      {alertas.map((a) => {
        const { icono: Icono, fondo, color } = ESTILOS[a.severidad] ?? ESTILOS.info;
        return (
          <div
            key={a.codigo}
            role={a.severidad === 'info' ? 'status' : 'alert'}
            className="flex items-start gap-3 rounded-2xl p-3 sm:p-4"
            style={{ background: fondo, color }}
          >
            <Icono size={20} aria-hidden="true" className="shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{a.titulo}</p>
              <p className="text-sm mt-0.5 break-words">{a.detalle}</p>
            </div>
          </div>
        );
      })}
    </section>
  );
}
