import { Link } from 'react-router-dom';
import { Upload, Receipt, TrendingUp, Megaphone, MessageCircle } from 'lucide-react';

const estiloIcono = { color: 'var(--portal-tint-ink)', background: 'var(--portal-tint)' };

const Accion = ({ to, onClick, Icon, label, destacada = false }) => {
  const contenido = (
    <>
      <div
        className={`w-11 h-11 rounded-2xl flex items-center justify-center ${destacada ? 'bg-[var(--portal-hero)] text-white' : ''}`}
        style={destacada ? undefined : estiloIcono}
      >
        <Icon size={19} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-[var(--portal-ink)] leading-tight">{label}</p>
    </>
  );
  const clases = 'portal-action p-4 sm:p-5 flex flex-col items-start justify-between gap-4 text-left min-h-[112px]';
  return to
    ? <Link to={to} className={clases}>{contenido}</Link>
    : <button type="button" onClick={onClick} className={clases}>{contenido}</button>;
};

// Accesos frecuentes. "Reportar un pago" solo aparece si hay algo que
// reportar; si no, ese lugar lo ocupa Mensajes para no ofrecer un botón que
// termina en "no tienes nada pendiente".
const WidgetAccionesRapidas = ({ onPagar = null, className = '' }) => (
  <section className={`grid grid-cols-2 gap-3 sm:gap-4 h-full ${className}`} aria-label="Accesos rápidos">
    {onPagar
      ? <Accion onClick={onPagar} Icon={Upload} label="Reportar un pago" destacada />
      : <Accion to="/portal/mensajes" Icon={MessageCircle} label="Escribir a un docente" />}
    <Accion to="/portal/historial" Icon={Receipt} label="Ver mis pagos" />
    <Accion to="/portal/rendimiento" Icon={TrendingUp} label="Ver notas" />
    <Accion to="/portal/comunicaciones" Icon={Megaphone} label="Leer avisos" />
  </section>
);

export default WidgetAccionesRapidas;
