import { useState, useRef } from "react";
import { parse, isValid, format } from "date-fns";
import DatePicker, { registerLocale } from "react-datepicker";
import { es } from "date-fns/locale/es";
import { CalendarDays } from "lucide-react";
import "react-datepicker/dist/react-datepicker.css";

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
    const [display, setDisplay] = useState("");
    const [error, setError] = useState("");
    const [calendarioAbierto, setCalendarioAbierto] = useState(false);
    const inputRef = useRef(null);

    const formatDateDisplay = (date) => {
        if (!date) return "";
        try {
            return format(date, "dd/MM/yyyy");
        } catch {
            return "";
        }
    };

    const parseSmartDate = (input) => {
        if (!input || input.trim() === "") {
            return null;
        }

        const raw = input.trim().replace(/\s+/g, " ");
        const formats = [
            "dd/MM/yyyy",
            "dd-MM-yyyy",
            "dd.MM.yyyy",
            "d/M/yyyy",
            "d-M-yyyy",
            "d.M.yyyy",
            "ddMMyyyy",
            "ddMMyyy",
            "d",
        ];

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

    const [prevValue, setPrevValue] = useState(value);
    if (value !== prevValue) {
        setPrevValue(value);
        setDisplay(value ? formatDateDisplay(value) : "");
        setError("");
    }

    const handleChange = (e) => {
        const input = e.target.value;
        const formatted = input
            .replace(/[^\d\s\-./]/g, "")
            .slice(0, 10);

        setDisplay(formatted);

        if (formatted.length > 0) {
            const parsed = parseSmartDate(formatted);
            if (parsed && isValid(parsed)) {
                onChange(parsed);
                setError("");
            } else if (formatted.length >= 8) {
                setError("Fecha inválida");
                onChange(null);
            }
        } else {
            onChange(null);
            setError("");
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
            setCalendarioAbierto(false);
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
                        onClick={() => setCalendarioAbierto((o) => !o)}
                        aria-label="Abrir calendario"
                        tabIndex={-1}
                        style={{
                            position: "absolute",
                            right: 6,
                            top: "50%",
                            transform: "translateY(-50%)",
                            background: "none",
                            border: "none",
                            padding: 2,
                            lineHeight: 0,
                            cursor: "pointer",
                            color: "var(--ash)",
                        }}
                    >
                        <CalendarDays size={16} aria-hidden="true" />
                    </button>
                )}
                {showCalendar && calendarioAbierto && (
                    <DatePicker
                        open={calendarioAbierto}
                        onClickOutside={() => setCalendarioAbierto(false)}
                        onCalendarClose={() => setCalendarioAbierto(false)}
                        selected={value instanceof Date && isValid(value) ? value : null}
                        onChange={handleSeleccionCalendario}
                        locale="es"
                        dateFormat="dd/MM/yyyy"
                        showMonthDropdown
                        showYearDropdown
                        dropdownMode="select"
                        withPortal
                        customInput={
                            <input
                                readOnly
                                style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
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
