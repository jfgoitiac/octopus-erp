import DatePicker, { registerLocale } from 'react-datepicker';
import { es } from 'date-fns/locale/es';
import 'react-datepicker/dist/react-datepicker.css';
import { CalendarDays, MapPin, RotateCcw, UserRound } from 'lucide-react';
import { datepickerPopperContainer } from '../../../utils/datepickerPortal';
import { ESTILO_CAMPO, ESTILO_TARJETA, aFechaISO, parseFechaLocal } from './CierreFormato';

// Igual que CierreFiltros: la cantina registra el locale acá mismo.
registerLocale('es', es);

// Cada campo es una "píldora" con su etiqueta adentro, así la barra queda
// alineada al centro (sm:items-center) sin etiquetas flotando encima.
const CLASE_PILDORA = 'flex items-center gap-2 w-full sm:w-auto sm:flex-1 sm:min-w-[11rem] min-h-[44px] px-3 rounded-xl text-sm focus-within:ring-2 focus-within:ring-[var(--pb)]';
const CLASE_ETIQUETA = 'shrink-0 text-[11px] uppercase tracking-widest';
const CLASE_CONTROL = 'w-full min-w-0 bg-transparent outline-none py-2';

function Campo({ id, etiqueta, icono: Icono, children }) {
  return (
    <label htmlFor={id} className={CLASE_PILDORA} style={ESTILO_CAMPO}>
      <Icono size={15} aria-hidden="true" className="shrink-0" style={{ color: 'var(--ash)' }} />
      <span className={CLASE_ETIQUETA} style={{ color: 'var(--ash)' }}>{etiqueta}</span>
      <span className="flex-1 min-w-0">{children}</span>
    </label>
  );
}

// filtros: { fecha_inicio, fecha_fin, area, cajero } — CONTRATO §4 "Filtros comunes".
export default function ReporteFiltros({ filtros, cajeros, onCambio, onLimpiar }) {
  const cambiar = (campo) => (valor) => onCambio({ ...filtros, [campo]: valor });

  return (
    <div
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 rounded-2xl p-3 sm:p-4"
      style={ESTILO_TARJETA}
    >
      <Campo id="reportes-desde" etiqueta="Desde" icono={CalendarDays}>
        <DatePicker
          locale="es"
          selected={parseFechaLocal(filtros.fecha_inicio)}
          onChange={(fecha) => fecha && cambiar('fecha_inicio')(aFechaISO(fecha))}
          dateFormat="dd/MM/yyyy"
          maxDate={parseFechaLocal(filtros.fecha_fin) || new Date()}
          wrapperClassName="w-full"
          popperContainer={datepickerPopperContainer}
          customInput={<input id="reportes-desde" className={CLASE_CONTROL} autoComplete="off" />}
        />
      </Campo>
      <Campo id="reportes-hasta" etiqueta="Hasta" icono={CalendarDays}>
        <DatePicker
          locale="es"
          selected={parseFechaLocal(filtros.fecha_fin)}
          onChange={(fecha) => fecha && cambiar('fecha_fin')(aFechaISO(fecha))}
          dateFormat="dd/MM/yyyy"
          minDate={parseFechaLocal(filtros.fecha_inicio)}
          maxDate={new Date()}
          wrapperClassName="w-full"
          popperContainer={datepickerPopperContainer}
          customInput={<input id="reportes-hasta" className={CLASE_CONTROL} autoComplete="off" />}
        />
      </Campo>
      <Campo id="reportes-area" etiqueta="Área" icono={MapPin}>
        <select id="reportes-area" value={filtros.area} onChange={(e) => cambiar('area')(e.target.value)} className={CLASE_CONTROL}>
          <option value="">Ambas</option>
          <option value="cantina">Cantina</option>
          <option value="libreria">Librería</option>
        </select>
      </Campo>
      <Campo id="reportes-cajero" etiqueta="Cajero" icono={UserRound}>
        <select id="reportes-cajero" value={filtros.cajero} onChange={(e) => cambiar('cajero')(e.target.value)} className={CLASE_CONTROL}>
          <option value="">Todos</option>
          {cajeros.map((c) => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
        </select>
      </Campo>
      <button
        type="button"
        onClick={onLimpiar}
        className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-xl text-xs font-medium hover:bg-[var(--jet-light)] w-full sm:w-auto shrink-0"
        style={{ color: 'var(--jet-mid)' }}
      >
        <RotateCcw size={14} aria-hidden="true" />
        Mes en curso
      </button>
    </div>
  );
}
