import { NavLink } from 'react-router-dom';
import { pestanasPorRol } from './pestanas';

/** Barra de pestañas; el scroll horizontal queda contenido dentro de la propia barra. */
export function CobranzaInteligenteTabs({ rol }) {
    const pestanas = pestanasPorRol(rol);
    return (
        <nav aria-label="Secciones de Cobranza Inteligente" className="w-full overflow-x-auto">
            <ul role="tablist" className="flex gap-2 w-max min-w-full">
                {pestanas.map(p => {
                    const Icono = p.icono;
                    return (
                        <li key={p.id} role="presentation" className="shrink-0">
                            <NavLink
                                to={p.to}
                                end={p.end}
                                role="tab"
                                className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium min-h-11"
                                style={({ isActive }) => (isActive
                                    ? { background: 'var(--pb)', color: '#fff' }
                                    : { border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--surface)' })}
                            >
                                {Icono && <Icono size={14} aria-hidden="true" />}{p.label}
                            </NavLink>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}

export default CobranzaInteligenteTabs;
