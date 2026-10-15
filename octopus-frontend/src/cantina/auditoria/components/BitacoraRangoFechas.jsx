import DatePicker, { registerLocale } from 'react-datepicker';
import { es } from 'date-fns/locale/es';
import 'react-datepicker/dist/react-datepicker.css';
import { datepickerPopperContainer } from '../../../utils/datepickerPortal';
import { ESTILO_CAMPO, aFechaISO, parseFechaLocal } from './CierreFormato';
import { CLASE_CAMPO, CLASE_ETIQUETA } from './BitacoraFormato';

// Igual que CierreFiltros: la cantina registra el locale acá mismo.
registerLocale('es', es);

// Par de campos Desde / Hasta (YYYY-MM-DD) para los filtros de bitácora y
// alertas. Devuelve dos celdas para que el padre las acomode en su grilla.
export default function BitacoraRangoFechas({ idBase, desde, hasta, onCambio }) {
  return (
    <>
      <div>
        <label htmlFor={`${idBase}-desde`} className={CLASE_ETIQUETA} style={{ color: 'var(--ash)' }}>Desde</label>
        <DatePicker
          locale="es"
          selected={parseFechaLocal(desde)}
          onChange={(fecha) => onCambio({ fecha_inicio: aFechaISO(fecha), fecha_fin: hasta })}
          dateFormat="dd/MM/yyyy"
          maxDate={parseFechaLocal(hasta) || new Date()}
          wrapperClassName="w-full"
          popperContainer={datepickerPopperContainer}
          customInput={<input id={`${idBase}-desde`} className={CLASE_CAMPO} style={ESTILO_CAMPO} autoComplete="off" />}
        />
      </div>
      <div>
        <label htmlFor={`${idBase}-hasta`} className={CLASE_ETIQUETA} style={{ color: 'var(--ash)' }}>Hasta</label>
        <DatePicker
          locale="es"
          selected={parseFechaLocal(hasta)}
          onChange={(fecha) => onCambio({ fecha_inicio: desde, fecha_fin: aFechaISO(fecha) })}
          dateFormat="dd/MM/yyyy"
          minDate={parseFechaLocal(desde)}
          maxDate={new Date()}
          wrapperClassName="w-full"
          popperContainer={datepickerPopperContainer}
          customInput={<input id={`${idBase}-hasta`} className={CLASE_CAMPO} style={ESTILO_CAMPO} autoComplete="off" />}
        />
      </div>
    </>
  );
}
