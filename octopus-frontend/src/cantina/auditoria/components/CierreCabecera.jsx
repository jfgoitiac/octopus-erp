import { CalendarDays, Clock, MapPin, User } from 'lucide-react';
import EstadoRevisionBadge from './EstadoRevisionBadge';
import {
  ESTILO_TARJETA, ETIQUETA_AREA, colorDiferencia, fmtFecha, fmtHora, fondoDiferencia, usd, usdConSigno,
} from './CierreFormato';

function Dato({ icono: Icono, etiqueta, valor }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="mt-0.5 shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-xl" style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
        <Icono size={16} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>{etiqueta}</p>
        <p className="text-sm font-medium break-words" style={{ color: 'var(--jet)' }}>{valor}</p>
      </div>
    </div>
  );
}

function Cifra({ etiqueta, valor, ayuda }) {
  return (
    <div className="rounded-2xl p-3 sm:p-4" style={ESTILO_TARJETA}>
      <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>{etiqueta}</p>
      <p className="text-lg sm:text-xl font-semibold font-mono tabular-nums mt-1" style={{ color: 'var(--jet)' }}>{valor}</p>
      {ayuda && <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>{ayuda}</p>}
    </div>
  );
}

// Cabecera del detalle: quién, cuándo y dónde; esperado vs. conteo físico.
export default function CierreCabecera({ cierre }) {
  const turno = cierre.turno;
  const horario = turno?.inicio ? `${fmtHora(turno.inicio)}–${turno.fin ? fmtHora(turno.fin) : 'abierto'}` : null;
  const nombreTurno = turno?.apertura_id ? `Turno #${turno.apertura_id}` : 'Turno';
  const diferencia = Number(cierre.diferencia_usd ?? 0);
  const tono = colorDiferencia(diferencia);

  return (
    <section className="flex flex-col gap-3" aria-label="Resumen del cierre">
      <div className="rounded-2xl p-3 sm:p-5 flex flex-col gap-4" style={ESTILO_TARJETA}>
        <div className="flex flex-wrap items-center gap-2">
          <EstadoRevisionBadge estado={cierre.revision?.estado ?? cierre.estado_revision} />
          {cierre.fue_reabierto && (
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ color: 'var(--violet)', background: 'var(--violet-light)' }}>
              Caja reabierta
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Dato icono={User} etiqueta="Cajero" valor={cierre.cajero?.nombre ?? '—'} />
          <Dato icono={Clock} etiqueta="Turno" valor={horario ? `${nombreTurno} · ${horario}` : (turno?.etiqueta ?? '—')} />
          <Dato icono={CalendarDays} etiqueta="Fecha" valor={fmtFecha(cierre.fecha)} />
          <Dato icono={MapPin} etiqueta="Área" valor={ETIQUETA_AREA[cierre.area] ?? cierre.area ?? '—'} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Cifra etiqueta="Ventas del turno" valor={usd(cierre.total_ventas_usd)} />
        <Cifra
          etiqueta="Efectivo esperado"
          valor={usd(cierre.esperado_efectivo_usd)}
          ayuda={cierre.monto_inicial_usd != null ? `Incluye ${usd(cierre.monto_inicial_usd)} de fondo inicial` : null}
        />
        <Cifra etiqueta="Conteo físico" valor={usd(cierre.conteo_fisico_usd)} ayuda="Reportado por el cajero" />
        <div className="rounded-2xl p-3 sm:p-4" style={{ background: fondoDiferencia(diferencia), border: `0.5px solid ${tono}` }}>
          <p className="text-xs uppercase tracking-widest" style={{ color: tono }}>Diferencia</p>
          <p className="text-lg sm:text-xl font-bold font-mono tabular-nums mt-1" style={{ color: tono }}>
            {usdConSigno(diferencia)}
          </p>
          <p className="text-xs mt-0.5" style={{ color: tono }}>
            {diferencia < 0 ? 'Faltante' : diferencia > 0 ? 'Sobrante' : 'Cuadre exacto'}
          </p>
        </div>
      </div>
    </section>
  );
}
