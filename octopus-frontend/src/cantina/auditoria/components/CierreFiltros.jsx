import DatePicker, { registerLocale } from 'react-datepicker';
import { es } from 'date-fns/locale/es';
import 'react-datepicker/dist/react-datepicker.css';
import { RotateCcw } from 'lucide-react';
import { datepickerPopperContainer } from '../../../utils/datepickerPortal';
import { ESTADOS_REVISION, ESTILO_CAMPO, ESTILO_TARJETA, aFechaISO, parseFechaLocal } from './CierreFormato';

// Igual que CantinaReportes: la cantina registra el locale acá mismo (§6 cantina.md).
registerLocale('es', es);

const CLASE_CAMPO = 'w-full px-3 py-2 rounded-xl text-sm outline-none min-h-[44px] focus:ring-2 focus:ring-[var(--pb)]';
const CLASE_ETIQUETA = 'block text-xs uppercase tracking-widest mb-1.5';

// Barra de filtros de la lista de cierres (§3 GET cierres/).
// filtros: { fecha_inicio, fecha_fin, cajero, area, estado, con_diferencia }
export default function CierreFiltros({ filtros, cajeros, onCambio, onLimpiar }) {
  const cambiar = (campo) => (valor) => onCambio({ ...filtros, [campo]: valor });

  return (
    <div className="rounded-2xl p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 items-end" style={ESTILO_TARJETA}>
      <div>
        <label htmlFor="cierres-desde" className={CLASE_ETIQUETA} style={{ color: 'var(--ash)' }}>Desde</label>
        <DatePicker
          locale="es"
          selected={parseFechaLocal(filtros.fecha_inicio)}
          onChange={(fecha) => cambiar('fecha_inicio')(aFechaISO(fecha))}
          dateFormat="dd/MM/yyyy"
          maxDate={parseFechaLocal(filtros.fecha_fin) || new Date()}
          wrapperClassName="w-full"
          popperContainer={datepickerPopperContainer}
          customInput={<input id="cierres-desde" className={CLASE_CAMPO} style={ESTILO_CAMPO} autoComplete="off" />}
        />
      </div>
      <div>
        <label htmlFor="cierres-hasta" className={CLASE_ETIQUETA} style={{ color: 'var(--ash)' }}>Hasta</label>
        <DatePicker
          locale="es"
          selected={parseFechaLocal(filtros.fecha_fin)}
          onChange={(fecha) => cambiar('fecha_fin')(aFechaISO(fecha))}
          dateFormat="dd/MM/yyyy"
          minDate={parseFechaLocal(filtros.fecha_inicio)}
          maxDate={new Date()}
          wrapperClassName="w-full"
          popperContainer={datepickerPopperContainer}
          customInput={<input id="cierres-hasta" className={CLASE_CAMPO} style={ESTILO_CAMPO} autoComplete="off" />}
        />
      </div>
      <div>
        <label htmlFor="cierres-cajero" className={CLASE_ETIQUETA} style={{ color: 'var(--ash)' }}>Cajero</label>
        <select id="cierres-cajero" value={filtros.cajero} onChange={(e) => cambiar('cajero')(e.target.value)} className={CLASE_CAMPO} style={ESTILO_CAMPO}>
          <option value="">Todos</option>
          {cajeros.map((c) => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="cierres-area" className={CLASE_ETIQUETA} style={{ color: 'var(--ash)' }}>Área</label>
        <select id="cierres-area" value={filtros.area} onChange={(e) => cambiar('area')(e.target.value)} className={CLASE_CAMPO} style={ESTILO_CAMPO}>
          <option value="">Ambas</option>
          <option value="cantina">Cantina</option>
          <option value="libreria">Librería</option>
        </select>
      </div>
      <div>
        <label htmlFor="cierres-estado" className={CLASE_ETIQUETA} style={{ color: 'var(--ash)' }}>Revisión</label>
        <select id="cierres-estado" value={filtros.estado} onChange={(e) => cambiar('estado')(e.target.value)} className={CLASE_CAMPO} style={ESTILO_CAMPO}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS_REVISION).map(([valor, meta]) => (
            <option key={valor} value={valor}>{meta.etiqueta}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:flex-col xl:items-stretch">
        <label className="flex flex-1 items-center gap-2 min-h-[44px] px-3 rounded-xl text-sm cursor-pointer select-none" style={ESTILO_CAMPO}>
          <input
            type="checkbox"
            checked={filtros.con_diferencia}
            onChange={(e) => cambiar('con_diferencia')(e.target.checked)}
            className="w-4 h-4 accent-[var(--pb)]"
          />
          Solo con diferencia
        </label>
        <button
          type="button"
          onClick={onLimpiar}
          className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-xl text-xs font-medium hover:bg-[var(--jet-light)] w-full sm:w-auto xl:w-full"
          style={{ color: 'var(--jet-mid)' }}
        >
          <RotateCcw size={14} aria-hidden="true" />
          Limpiar filtros
        </button>
      </div>
    </div>
  );
}
