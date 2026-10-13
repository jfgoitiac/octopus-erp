import DatePicker, { registerLocale } from 'react-datepicker';
import { es } from 'date-fns/locale/es';
import 'react-datepicker/dist/react-datepicker.css';
import { datepickerPopperContainer } from '../utils/datepickerPortal';

registerLocale('es', es);

// Converts YYYY-MM-DD string to Date, avoiding timezone offset issues
function parseLocalDate(str) {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function toISOString(date) {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export default function DatePickerES({ value, onChange, className, style, name, required, placeholder, maxDate, minDate, clearable = false }) {
    const selected = parseLocalDate(value);

    function handleChange(date) {
        const iso = toISOString(date);
        if (name) {
            onChange({ target: { name, value: iso } });
        } else {
            onChange({ target: { value: iso } });
        }
    }

    return (
        <DatePicker
            locale="es"
            selected={selected}
            onChange={handleChange}
            dateFormat="dd/MM/yyyy"
            placeholderText={placeholder || 'dd/mm/aaaa'}
            wrapperClassName="w-full"
            customInput={
                <input
                    className={className}
                    style={style}
                    autoComplete="off"
                />
            }
            required={required}
            // maxDate/minDate son strings YYYY-MM-DD (mismo formato que `value`),
            // opcionales — los callers existentes no los pasan, así que no cambia
            // su comportamiento.
            maxDate={maxDate ? parseLocalDate(maxDate) : undefined}
            minDate={minDate ? parseLocalDate(minDate) : undefined}
            // `clearable` (opcional, apagado por defecto): muestra una "x" para vaciar la fecha;
            // onChange recibe value '' como con cualquier otra selección vacía.
            isClearable={clearable}
            clearButtonTitle="Quitar fecha"
            ariaLabelClose="Quitar fecha"
            showMonthDropdown
            showYearDropdown
            dropdownMode="scroll"
            popperContainer={datepickerPopperContainer}
        />
    );
}
