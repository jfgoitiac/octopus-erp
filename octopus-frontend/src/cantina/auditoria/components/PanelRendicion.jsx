import { Banknote, CalendarDays, CreditCard, Landmark, Store, WalletCards } from 'lucide-react';
import { fmt } from '../../../utils/formato';
import PanelTarjeta, { PanelVacio } from './PanelTarjeta';
import { fmtFecha, fmtUsd, num } from './PanelFormato';

const AREA = { cantina: 'Cantina', libreria: 'Librería' };
const hoyLocalISO = () => {
  const fecha = new Date();
  fecha.setMinutes(fecha.getMinutes() - fecha.getTimezoneOffset());
  return fecha.toISOString().slice(0, 10);
};

const PorMetodo = ({ filas = [], compacto = false }) => {
  if (!filas.length) return <span className="text-xs" style={{ color: 'var(--ash)' }}>Sin movimientos</span>;
  return (
    <div className={compacto ? 'flex flex-wrap gap-1.5' : 'flex flex-col divide-y divide-[var(--border)]'}>
      {filas.map((fila) => (
        <div
          key={fila.metodo}
          className={compacto ? 'rounded-lg px-2 py-1 text-xs' : 'flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0'}
          style={compacto ? { background: 'var(--surface-sunken)', color: 'var(--jet-mid)' } : undefined}
        >
          <span>{fila.etiqueta}</span>
          <span className="tabular-nums" style={{ color: 'var(--jet)', fontWeight: 'var(--fw-semibold)' }}>
            {fmtUsd(fila.total_usd)}{!compacto && <small style={{ color: 'var(--ash)', fontWeight: 'var(--fw-regular)' }}> · {fmt(fila.cantidad, 0)}</small>}
          </span>
        </div>
      ))}
    </div>
  );
};

const Kpi = ({ etiqueta, valor, ayuda, tono = 'var(--pb-light)', color = 'var(--pb-mid)' }) => (
  <article className="rounded-2xl p-4" style={{ background: tono, border: '1px solid var(--border)' }}>
    <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--ash)', fontWeight: 'var(--fw-medium)' }}>{etiqueta}</p>
    <p className="mt-1 text-xl tabular-nums sm:text-2xl" style={{ color, fontWeight: 'var(--fw-semibold)' }}>{fmtUsd(valor)}</p>
    <p className="mt-1 text-xs" style={{ color: 'var(--jet-mid)' }}>{ayuda}</p>
  </article>
);

export default function PanelRendicion({ datos, periodo, onPeriodo, deshabilitado }) {
  const recargas = datos?.recargas ?? {};
  const ventas = datos?.ventas ?? {};

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <section className="rounded-[var(--radius-card)] p-3 sm:p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base" style={{ color: 'var(--jet)', fontWeight: 'var(--fw-semibold)' }}>Rendición de cuentas</h2>
            <p className="text-xs" style={{ color: 'var(--ash)' }}>El rango aplica a ventas, consumos, recargas y cajas.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            {[
              ['fecha_inicio', 'Desde'],
              ['fecha_fin', 'Hasta'],
            ].map(([campo, etiqueta]) => (
              <label key={campo} className="flex min-w-0 flex-col gap-1 text-xs" style={{ color: 'var(--ash)' }}>
                {etiqueta}
                <span className="flex min-h-[40px] items-center gap-2 rounded-xl px-3" style={{ border: '1px solid var(--border-md)', color: 'var(--jet-mid)' }}>
                  <CalendarDays size={14} className="hidden sm:block" aria-hidden="true" />
                  <input
                    type="date"
                    value={periodo[campo]}
                    max={campo === 'fecha_inicio' ? periodo.fecha_fin : hoyLocalISO()}
                    min={campo === 'fecha_fin' ? periodo.fecha_inicio : undefined}
                    disabled={deshabilitado}
                    onChange={(e) => onPeriodo({ ...periodo, [campo]: e.target.value })}
                    className="w-full bg-transparent outline-none disabled:opacity-60"
                  />
                </span>
              </label>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta="Ventas del período" valor={ventas.total_usd} ayuda={`${fmt(num(ventas.cantidad), 0)} operaciones completadas`} />
        <Kpi etiqueta="Recargas ingresadas" valor={recargas.captado_periodo_usd} ayuda={`${fmt(num(recargas.captado_periodo_cantidad), 0)} recargas aprobadas · fondo común`} tono="var(--green-light)" color="var(--green)" />
        <Kpi etiqueta="Saldo recargado consumido" valor={recargas.consumido_periodo_usd} ayuda={`${fmt(num(recargas.consumido_periodo_cantidad), 0)} pagos con tarjeta prepago`} tono="var(--yellow-light)" color="var(--amber-ink)" />
        <Kpi etiqueta="Falta por consumir" valor={recargas.saldo_disponible_usd} ayuda={`${fmt(num(recargas.tarjetas_con_saldo), 0)} tarjetas con saldo disponible`} tono="var(--blue-light, var(--pb-light))" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PanelTarjeta icono={Store} titulo="Separación por negocio" subtitulo="Ventas y uso de recargas en cada área">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(datos?.por_area ?? []).map((fila) => (
              <article key={fila.area} className="rounded-xl p-3" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                <p className="text-sm" style={{ color: 'var(--jet)', fontWeight: 'var(--fw-semibold)' }}>{AREA[fila.area] ?? fila.area}</p>
                <p className="mt-2 text-xl tabular-nums" style={{ color: 'var(--jet)', fontWeight: 'var(--fw-semibold)' }}>{fmtUsd(fila.total_usd)}</p>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>{fmt(fila.cantidad, 0)} ventas totales</p>
                <div className="mt-3 flex justify-between gap-2 border-t border-[var(--border)] pt-2 text-xs">
                  <span style={{ color: 'var(--jet-mid)' }}>Consumido de recargas</span>
                  <strong className="tabular-nums" style={{ color: 'var(--pb-mid)' }}>{fmtUsd(fila.consumo_recargas_usd)}</strong>
                </div>
              </article>
            ))}
            {!datos?.por_area?.length && <PanelVacio icono={Store} texto="No hay ventas en el período." />}
          </div>
        </PanelTarjeta>

        <PanelTarjeta icono={Banknote} titulo="Ventas por método de pago" subtitulo="Distribución de todo lo vendido en el área seleccionada">
          <PorMetodo filas={datos?.por_metodo} />
        </PanelTarjeta>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PanelTarjeta icono={WalletCards} titulo="Control de recargas" subtitulo="La captación es global; el consumo se asigna al negocio al vender">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl p-3" style={{ background: 'var(--surface-sunken)' }}>
              <p className="text-xs" style={{ color: 'var(--ash)' }}>Captado histórico</p>
              <strong className="tabular-nums" style={{ color: 'var(--jet)' }}>{fmtUsd(recargas.captado_historico_usd)}</strong>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'var(--surface-sunken)' }}>
              <p className="text-xs" style={{ color: 'var(--ash)' }}>Consumido histórico</p>
              <strong className="tabular-nums" style={{ color: 'var(--jet)' }}>{fmtUsd(recargas.consumido_historico_usd)}</strong>
            </div>
          </div>
          <div className="mt-1 rounded-xl px-3 py-2 text-xs" style={{ background: 'var(--yellow-light)', color: 'var(--amber-ink)' }}>
            Saldo neto contable (incluye tarjetas en negativo): <strong>{fmtUsd(recargas.saldo_neto_usd)}</strong>
          </div>
          <div className="mt-1">
            <p className="mb-2 text-xs uppercase tracking-wider" style={{ color: 'var(--ash)', fontWeight: 'var(--fw-medium)' }}>Recargas ingresadas por método</p>
            <PorMetodo filas={recargas.por_metodo} />
          </div>
        </PanelTarjeta>

        <PanelTarjeta icono={CalendarDays} titulo="Distribución diaria" subtitulo="Ventas diarias con detalle por método">
          <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            {(datos?.por_dia ?? []).map((dia) => (
              <article key={dia.fecha} className="rounded-xl p-3" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm" style={{ color: 'var(--jet)', fontWeight: 'var(--fw-semibold)' }}>{fmtFecha(dia.fecha, "EEEE d 'de' MMMM")}</p>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>{fmt(dia.cantidad, 0)} operaciones</p>
                  </div>
                  <strong className="tabular-nums" style={{ color: 'var(--jet)' }}>{fmtUsd(dia.total_usd)}</strong>
                </div>
                <PorMetodo filas={dia.por_metodo} compacto />
              </article>
            ))}
            {!datos?.por_dia?.length && <PanelVacio icono={CalendarDays} texto="No hay movimientos diarios en el período." />}
          </div>
        </PanelTarjeta>
      </div>

      <PanelTarjeta icono={Landmark} titulo="Consumo por caja" subtitulo="Cada turno separado por cajero, área y método de pago" contador={datos?.cajas?.length ?? 0}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {(datos?.cajas ?? []).map((caja) => (
            <article key={caja.apertura_id} className="rounded-xl p-3 sm:p-4" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm" style={{ color: 'var(--jet)', fontWeight: 'var(--fw-semibold)' }}>Caja #{caja.apertura_id} · {AREA[caja.area] ?? caja.area}</p>
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>{caja.cajero?.nombre ?? 'Sin cajero'} · {fmtFecha(caja.inicio, "d MMM, HH:mm")}{caja.fin ? `–${fmtFecha(caja.fin, 'HH:mm')}` : ' · abierta'}</p>
                </div>
                <div className="text-right">
                  <strong className="block tabular-nums" style={{ color: 'var(--jet)' }}>{fmtUsd(caja.total_usd)}</strong>
                  <span className="text-xs" style={{ color: 'var(--ash)' }}>{fmt(caja.cantidad, 0)} ventas</span>
                </div>
              </div>
              <div className="mt-3 border-t border-[var(--border)] pt-3"><PorMetodo filas={caja.por_metodo} compacto /></div>
            </article>
          ))}
          {!datos?.cajas?.length && <PanelVacio icono={CreditCard} texto="No hay cajas con ventas en el período." />}
        </div>
      </PanelTarjeta>
    </div>
  );
}
