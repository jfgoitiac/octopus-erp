import { useState, useRef } from 'react';
import { parse, isValid, format } from 'date-fns';

const SEPARATORS = /[\/\-\.\s]/g;
const CHAR_PATTERN = /^\d{0,8}$/;

function normalizeInput(str) {
  return str.replace(/\D/g, '');
}

function formatDisplay(digits) {
  if (!digits) return '';
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

function parseSmartDate(input) {
  if (!input) return null;

  const digits = normalizeInput(input);
  if (digits.length < 2) return null;

  // Rellenar a la izquierda con ceros según el largo
  let padded;
  if (digits.length <= 2) {
    padded = digits.padStart(2, '0');
  } else if (digits.length <= 4) {
    padded = digits.padStart(4, '0');
  } else if (digits.length <= 6) {
    padded = digits.padStart(6, '0');
  } else {
    padded = digits.padStart(8, '0');
  }

  let d, m, y;

  if (padded.length === 2) {
    // Solo día
    d = parseInt(padded, 10);
    m = new Date().getMonth() + 1;
    y = new Date().getFullYear();
  } else if (padded.length === 4) {
    // DD/MM (sin año, usa actual)
    d = parseInt(padded.slice(0, 2), 10);
    m = parseInt(padded.slice(2, 4), 10);
    y = new Date().getFullYear();
  } else if (padded.length === 6) {
    // DD/MM/YY
    d = parseInt(padded.slice(0, 2), 10);
    m = parseInt(padded.slice(2, 4), 10);
    y = parseInt(padded.slice(4, 6), 10);
    y = y >= 50 ? 1900 + y : 2000 + y;
  } else {
    // DD/MM/YYYY (8+ dígitos)
    d = parseInt(padded.slice(0, 2), 10);
    m = parseInt(padded.slice(2, 4), 10);
    y = parseInt(padded.slice(4, 8), 10);
  }

  try {
    const date = new Date(y, m - 1, d);
    if (date.getDate() !== d || date.getMonth() !== m - 1) return null;
    return date;
  } catch {
    return null;
  }
}

function toISOString(date) {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function SmartDateInput({
  value,
  onChange,
  className = '',
  style = {},
  placeholder = 'dd/mm/aaaa',
  name,
  required,
}) {
  const [displayValue, setDisplayValue] = useState(() => {
    if (!value) return '';
    try {
      const [y, m, d] = value.split('-').map(Number);
      return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
    } catch {
      return '';
    }
  });

  const [error, setError] = useState(false);
  const inputRef = useRef(null);

  const handleChange = (e) => {
    const input = e.target.value;
    const digits = normalizeInput(input);

    if (!CHAR_PATTERN.test(input) || digits.length > 8) return;

    setDisplayValue(formatDisplay(digits));
    setError(false);
  };

  const handleBlur = () => {
    const digits = normalizeInput(displayValue);
    if (!digits) {
      setDisplayValue('');
      onChange({ target: { value: '', name } });
      setError(false);
      return;
    }

    const parsed = parseSmartDate(digits);
    if (!parsed) {
      setError(true);
      return;
    }

    const iso = toISOString(parsed);
    const formatted = formatDisplay(digits);
    setDisplayValue(formatted);
    setError(false);
    onChange({ target: { value: iso, name } });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`${className} ${error ? 'border-red-500' : ''}`}
        style={{
          ...style,
          ...(error && { borderColor: '#ef4444', color: '#dc2626' }),
        }}
        required={required}
        autoComplete="off"
      />
      {error && (
        <p className="text-xs mt-1" style={{ color: '#dc2626' }}>
          Fecha inválida. Usa dd/mm/aaaa
        </p>
      )}
    </div>
  );
}
