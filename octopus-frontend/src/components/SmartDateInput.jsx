import { useState, useRef } from "react";
import { parse, isValid, format } from "date-fns";
import DatePicker, { registerLocale } from "react-datepicker";
import { es } from "date-fns/locale/es";
import { CalendarDays } from "lucide-react";
import "react-datepicker/dist/react-datepicker.css";
import { datepickerPopperContainer } from "../utils/datepickerPortal";

registerLocale("es", es);

const SmartDateInput = ({
    id,
    value,
    onChange,
    placeholder = "DD/MM/AAAA",
    className = "",
    style = {},
    disabled = false,
    autoFocus = false,
    showCalendar = true,
    "aria-label": ariaLabel = "Campo de fecha",
}) => {
    const [display, setDisplay] = useState(() =>
        value instanceof Date && isValid(value) ? format(value, "dd/MM/yyyy") : ""
    );
    const [error, setError] = useState("");
    const [calendarioAbierto, setCalendarioAbierto] = useState(false);
    const inputRef = useRef(null);
    const datePickerRef = useRef(null);

    const formatDateDisplay = (date) => {
        if (!date) return "";
        try {
            return format(date, "dd/MM/yyyy");
        } catch {
            return "";
        }
    };

    // Formatos completos, sin ambigüedad — seguros para parsear en cada tecla.
    const STRICT_FORMATS = [
        "dd/MM/yyyy",
        "dd-MM-yyyy",
        "dd.MM.yyyy",
        "ddMMyyyy",
    ];

    const parseStrictDate = (input) => {
        if (!input || input.trim() === "") return null;
        const raw = input.trim().replace(/\s+/g, " ");

        for (const fmt of STRICT_FORMATS) {
            try {
                const parsed = parse(raw, fmt, new Date());
                if (isValid(parsed)) {
                    const year = parsed.getFullYear();
                    if (year >= 1900 && year <= 2100) {
                        return parsed;
                    }
                }
            } catch {
                continue;
            }
        }
        return null;
    };

    // Heurísticas laxas (día solo, año de 2 dígitos) — solo al confirmar (blur/Enter),
    // nunca en cada tecla, porque interpretan entradas parciales como fechas completas.
    const parseSmartDate = (input) => {
        if (!input || input.trim() === "") {
            return null;
        }

        const strict = parseStrictDate(input);
        if (strict) return strict;

        const raw = input.trim().replace(/\s+/g, " ");
        const formats = ["d/M/yyyy", "d-M-yyyy", "d.M.yyyy", "ddMMyyy"];

        for (const fmt of formats) {
            try {
                const parsed = parse(raw, fmt, new Date());
                if (isValid(parsed)) {
                    const year = parsed.getFullYear();
                    if (year >= 1900 && year <= 2100) {
                        return parsed;
                    }
                }
            } catch {
                continue;
            }
        }

        // Parse con pivote para años de 2 dígitos
        const parts = raw.split(/[\s\-./]+/);
        if (parts.length >= 2) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10);
            let year = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear();

            if (day > 0 && day <= 31 && month > 0 && month <= 12) {
                if (year < 100) {
                    year = year >= 50 ? 1900 + year : 2000 + year;
                }

                const parsed = new Date(year, month - 1, day);
                if (
                    parsed.getDate() === day &&
                    parsed.getMonth() === month - 1 &&
                    parsed.getFullYear() === year
                ) {
                    return parsed;
                }
            }
        }

        // Si solo es un día, usar mes/año actuales
        const onlyDay = parseInt(raw, 10);
        if (!isNaN(onlyDay) && onlyDay > 0 && onlyDay <= 31) {
            const today = new Date();
            const parsed = new Date(today.getFullYear(), today.getMonth(), onlyDay);
            if (parsed.getDate() === onlyDay) {
                return parsed;
            }
        }

        return null;
    };

    const [prevValueTime, setPrevValueTime] = useState(
        value instanceof Date && isValid(value) ? value.getTime() : null
    );
    const valueTime = value instanceof Date && isValid(value) ? value.getTime() : null;
    if (valueTime !== prevValueTime) {
        setPrevValueTime(valueTime);
        setDisplay(value ? formatDateDisplay(value) : "");
        setError("");
    }

    const handleChange = (e) => {
        const input = e.target.value;
        const formatted = input
            .replace(/[^\d\s\-./]/g, "")
            .slice(0, 10);

        setDisplay(formatted);

        if (formatted.length === 0) {
            onChange(null);
            setError("");
            return;
        }

        // Solo se confirma la fecha mientras se escribe si el formato ya está
        // completo y es inequívoco (ver parseStrictDate). Entradas parciales
        // (ej. "1", "15") no disparan onChange — se resuelven en handleBlur.
        const parsed = parseStrictDate(formatted);
        if (parsed && isValid(parsed)) {
            onChange(parsed);
            setError("");
        } else if (formatted.length >= 10) {
            setError("Fecha inválida");
            onChange(null);
        }
    };

    const handleBlur = () => {
        if (display.trim() === "") {
            setDisplay("");
            onChange(null);
            setError("");
            return;
        }

        const parsed = parseSmartDate(display);

        if (parsed && isValid(parsed)) {
            const formatted = formatDateDisplay(parsed);
            setDisplay(formatted);
            onChange(parsed);
            setError("");
        } else {
            setError("Formato: DD/MM/AAAA");
            onChange(null);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter") {
            handleBlur();
        } else if (e.key === "Escape" && calendarioAbierto) {
            datePickerRef.current?.setOpen(false);
        }
    };

    const handleSeleccionCalendario = (date) => {
        setDisplay(formatDateDisplay(date));
        onChange(date);
        setError("");
        setCalendarioAbierto(false);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ position: "relative" }}>
                <input
                    ref={inputRef}
                    id={id}
                    type="text"
                    inputMode="numeric"
                    className={className}
                    style={{
                        ...style,
                        paddingRight: showCalendar ? "2rem" : style.paddingRight,
                        borderColor: error ? "#ef4444" : style.borderColor || "var(--border-md)",
                    }}
                    placeholder={placeholder}
                    value={display}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    autoFocus={autoFocus}
                    aria-label={ariaLabel}
                    aria-invalid={error ? "true" : "false"}
                />
                {showCalendar && !disabled && (
                    <button
                        type="button"
                        onClick={() => {
                            const dp = datePickerRef.current;
                            if (dp) dp.setOpen(!calendarioAbierto);
                        }}
                        aria-label="Abrir calendario"
                        tabIndex={-1}
                        style={{
                            position: "absolute",
                            right: 8,
                            top: "50%",
                            transform: "translateY(-50%)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "none",
                            border: "none",
                            padding: 2,
                            lineHeight: 0,
                            cursor: "pointer",
                            color: calendarioAbierto ? "var(--pb)" : "var(--ash)",
                            transition: "color 0.15s ease",
                        }}
                    >
                        <CalendarDays size={16} aria-hidden="true" />
                    </button>
                )}
                {showCalendar && (
                    <DatePicker
                        ref={datePickerRef}
                        onClickOutside={() => setCalendarioAbierto(false)}
                        onCalendarClose={() => setCalendarioAbierto(false)}
                        onCalendarOpen={() => setCalendarioAbierto(true)}
                        selected={value instanceof Date && isValid(value) ? value : null}
                        onChange={handleSeleccionCalendario}
                        locale="es"
                        dateFormat="dd/MM/yyyy"
                        showMonthDropdown
                        showYearDropdown
                        dropdownMode="scroll"
                        popperPlacement="bottom-end"
                        popperContainer={datepickerPopperContainer}
                        popperModifiers={[
                            { name: "offset", options: { offset: [0, 6] } },
                        ]}
                        customInput={
                            <input
                                readOnly
                                style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", pointerEvents: "none" }}
                            />
                        }
                    />
                )}
            </div>
            {error && (
                <span
                    style={{
                        marginTop: "4px",
                        fontSize: "12px",
                        color: "#ef4444",
                        fontWeight: "500",
                    }}
                    role="alert"
                >
                    {error}
                </span>
            )}
        </div>
    );
};

export default SmartDateInput;
