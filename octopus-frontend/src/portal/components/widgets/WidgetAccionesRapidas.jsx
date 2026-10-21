import { Link } from 'react-router-dom';
import { Upload, Receipt, TrendingUp, Megaphone, MessageCircle } from 'lucide-react';

const estiloIcono = { color: 'var(--portal-primary)', background: 'color-mix(in srgb, var(--portal-primary) 12%, white)' };

const Accion = ({ to, onClick, Icon, label, destacada = false }) => {
  const contenido = (
    <>
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center ${destacada ? 'bg-[var(--portal-primary)] text-white' : ''}`}
        style={destacada ? undefined : estiloIcono}
      >
        <Icon size={17} aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-[var(--jet-mid)] leading-tight">{label}</p>
    </>
  );
  const clases = 'portal-action rounded-2xl p-4 flex flex-col items-start gap-2 text-left min-h-[96px]';
  return to
    ? <Link to={to} className={clases}>{contenido}</Link>
    : <button type="button" onClick={onClick} className={clases}>{contenido}</button>;
};

// Accesos frecuentes. "Reportar un pago" solo aparece si hay algo que
// reportar; si no, ese lugar lo ocupa Mensajes para no ofrecer un botón que
// termina en "no tienes nada pendiente".
const WidgetAccionesRapidas = ({ onPagar = null, className = '' }) => (
  <section className={`grid grid-cols-2 lg:grid-cols-4 gap-3 ${className}`} aria-label="Accesos rápidos">
    {onPagar
      ? <Accion onClick={onPagar} Icon={Upload} label="Reportar un pago" destacada />
      : <Accion to="/portal/mensajes" Icon={MessageCircle} label="Escribir a un docente" />}
    <Accion to="/portal/historial" Icon={Receipt} label="Ver mis pagos" />
    <Accion to="/portal/rendimiento" Icon={TrendingUp} label="Ver notas" />
    <Accion to="/portal/comunicaciones" Icon={Megaphone} label="Leer avisos" />
  </section>
);

export default WidgetAccionesRapidas;
