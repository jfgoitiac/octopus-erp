import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { fmtMonto, montoEnBs } from '../utils/montos';

// Montos del portal: el monto de referencia en dólares (REF.) y debajo su
// equivalente en bolívares a la tasa BCV vigente que envía el backend
// (resumen_financiero.tasa_bcv = { valor, fecha }), la misma que usa caja.

const TAMANOS = {
  sm: { ref: 'text-sm font-semibold', bs: 'text-xs' },
  lg: { ref: 'text-2xl font-bold', bs: 'text-sm font-medium' },
};

const MontoRef = ({
  usd, tasaBcv, size = 'sm', align = 'right', className = '',
  colorRef = 'text-[var(--jet)]', colorBs = 'text-[var(--ash)]',
}) => {
  const t = TAMANOS[size] || TAMANOS.sm;
  const bs = montoEnBs(usd, tasaBcv);
  return (
    <div className={`${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      <p className={`${t.ref} ${colorRef} leading-tight whitespace-nowrap`}>REF. {fmtMonto(usd)}</p>
      {bs !== null && (
        <p className={`${t.bs} ${colorBs} leading-tight whitespace-nowrap`}>Bs. {fmtMonto(bs)}</p>
      )}
    </div>
  );
};

export const NotaTasaBcv = ({ tasaBcv, className = '' }) => {
  if (!tasaBcv) {
    return (
      <p className={`text-xs text-[var(--ash)] ${className}`}>
        Montos en dólares de referencia (REF.). Aún no hay tasa BCV registrada para
        calcular el equivalente en bolívares.
      </p>
    );
  }
  const fecha = format(parseISO(tasaBcv.fecha), 'dd/MM/yyyy', { locale: es });
  return (
    <p className={`text-xs text-[var(--ash)] ${className}`}>
      El monto en bolívares corresponde a la tasa del dólar BCV del día {fecha}
      {' '}(Bs. {fmtMonto(tasaBcv.valor)} por dólar).
    </p>
  );
};

export default MontoRef;
