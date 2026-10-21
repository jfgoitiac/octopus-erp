import { Link } from 'react-router-dom';
import { Bell, CheckCircle2, ChevronRight, CircleDollarSign, TrendingDown, XCircle } from 'lucide-react';

/**
 * Lista corta de "qué hacer primero". Cada fila es una acción concreta; si no
 * hay nada pendiente se dice explícitamente que todo está en orden.
 */
const WidgetFamiliaHoy = ({ hayPorReportar = false, rechazados = [], avisos = 0, alertas = [], alumnoActivo, onPagar, className = '' }) => {
  const items = [];
  if (rechazados.length > 0) {
    const r = rechazados[0];
    items.push({
      id: 'rechazo', Icon: XCircle, tone: 'bg-[var(--red-light)] text-[var(--red)]',
      title: rechazados.length === 1 ? `Comprobante de ${r.mes_nombre} ${r.anio} rechazado` : `${rechazados.length} comprobantes rechazados`,
      detail: r.observaciones ? `Motivo: ${r.observaciones}` : 'Revisa los datos y envíalo de nuevo.',
      action: 'Enviar de nuevo', onClick: () => onPagar({ id: r.mensualidad }),
    });
  }
  if (hayPorReportar && rechazados.length === 0) {
    items.push({ id: 'pago', Icon: CircleDollarSign, tone: 'bg-[var(--yellow-light)] text-[var(--yellow)]', title: 'Tienes mensualidades por pagar', detail: 'Si ya pagaste, envía el comprobante desde aquí.', action: 'Reportar pago', onClick: () => onPagar() });
  }
  if (avisos > 0) items.push({ id: 'avisos', Icon: Bell, tone: 'bg-[var(--portal-tint)] text-[var(--portal-tint-ink)]', title: `${avisos} aviso${avisos === 1 ? '' : 's'} sin leer`, detail: 'Comunicados y circulares del colegio.', action: 'Leer avisos', to: '/portal/comunicaciones' });
  if (alertas.length > 0) {
    const a = alertas[0];
    items.push({ id: 'rendimiento', Icon: TrendingDown, tone: 'bg-[var(--yellow-light)] text-[var(--yellow)]', title: `${a.alumno_nombre || alumnoActivo?.nombre || 'Tu hijo'} necesita apoyo en ${a.materia_nombre || 'una materia'}`, detail: `Promedio ${a.promedio ?? 'por revisar'} en el último lapso.`, action: 'Ver rendimiento', to: '/portal/rendimiento' });
  }

  return (
    <section className={`portal-card overflow-hidden h-full ${className}`} aria-labelledby="familia-hoy">
      <div className="px-5 pt-5 pb-2 sm:px-6 sm:pt-6">
        <h2 id="familia-hoy" className="portal-section-title text-lg sm:text-xl">Para hoy</h2>
      </div>
      {items.length === 0 ? (
        <div className="px-5 pb-8 pt-4 text-center sm:px-6">
          <CheckCircle2 size={28} strokeWidth={1.75} className="mx-auto text-[var(--green)]" aria-hidden="true" />
          <p className="mt-2 text-base font-medium text-[var(--portal-ink)]">Todo está en orden</p>
          <p className="mt-1 text-sm text-[var(--portal-muted)]">No tienes nada pendiente por ahora.</p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--portal-line)] pb-2">
          {items.map(({ id, Icon, tone, title, detail, action, to, onClick }) => {
            const inner = (
              <>
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tone}`}><Icon size={19} strokeWidth={1.75} aria-hidden="true" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--portal-ink)] sm:text-base">{title}</p>
                  <p className="line-clamp-2 text-xs text-[var(--portal-muted)] sm:text-sm">{detail}</p>
                </div>
                <span className="hidden sm:block shrink-0 text-sm font-semibold text-[var(--portal-tint-ink)]">{action}</span>
                <ChevronRight size={16} className="shrink-0 text-[var(--portal-muted)]" aria-hidden="true" />
              </>
            );
            return to
              ? <Link key={id} to={to} className="flex items-center gap-4 px-5 py-4 min-h-[64px] transition-colors hover:bg-[var(--portal-canvas)] sm:px-6">{inner}</Link>
              : <button key={id} type="button" onClick={onClick} className="flex w-full items-center gap-4 px-5 py-4 min-h-[64px] text-left transition-colors hover:bg-[var(--portal-canvas)] sm:px-6">{inner}</button>;
          })}
        </div>
      )}
    </section>
  );
};

export default WidgetFamiliaHoy;
