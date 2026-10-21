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
  if (avisos > 0) items.push({ id: 'avisos', Icon: Bell, tone: 'bg-[var(--portal-primary)]/10 text-[var(--portal-primary)]', title: `${avisos} aviso${avisos === 1 ? '' : 's'} sin leer`, detail: 'Comunicados y circulares del colegio.', action: 'Leer avisos', to: '/portal/comunicaciones' });
  if (alertas.length > 0) {
    const a = alertas[0];
    items.push({ id: 'rendimiento', Icon: TrendingDown, tone: 'bg-[var(--yellow-light)] text-[var(--yellow)]', title: `${a.alumno_nombre || alumnoActivo?.nombre || 'Tu hijo'} necesita apoyo en ${a.materia_nombre || 'una materia'}`, detail: `Promedio ${a.promedio ?? 'por revisar'} en el último lapso.`, action: 'Ver rendimiento', to: '/portal/rendimiento' });
  }

  return (
    <section className={`portal-card overflow-hidden ${className}`} aria-labelledby="familia-hoy">
      <div className="px-4 pt-4 pb-3">
        <h2 id="familia-hoy" className="text-base font-semibold text-[var(--jet)]">Para hoy</h2>
      </div>
      {items.length === 0 ? (
        <div className="px-4 pb-6 pt-2 text-center">
          <CheckCircle2 size={25} className="mx-auto text-[var(--green)]" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-[var(--jet-mid)]">Todo está en orden</p>
          <p className="mt-1 text-xs text-[var(--ash)]">No tienes nada pendiente por ahora.</p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {items.map(({ id, Icon, tone, title, detail, action, to, onClick }) => {
            const inner = (
              <>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon size={16} aria-hidden="true" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--jet)]">{title}</p>
                  <p className="line-clamp-2 text-xs text-[var(--ash)]">{detail}</p>
                </div>
                <span className="hidden sm:block shrink-0 text-xs font-semibold text-[var(--portal-primary)]">{action}</span>
                <ChevronRight size={16} className="shrink-0 text-[var(--ash)]" aria-hidden="true" />
              </>
            );
            return to
              ? <Link key={id} to={to} className="flex items-center gap-3 px-4 py-3 min-h-[56px] hover:bg-[var(--surface-sunken)]">{inner}</Link>
              : <button key={id} type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 min-h-[56px] text-left hover:bg-[var(--surface-sunken)]">{inner}</button>;
          })}
        </div>
      )}
    </section>
  );
};

export default WidgetFamiliaHoy;
