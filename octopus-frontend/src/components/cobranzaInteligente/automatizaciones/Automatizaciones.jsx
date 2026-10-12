import { SkeletonLista } from '../shared/SkeletonLista';

// TODO(Fase A): placeholder. Lo reemplaza la pestaña real; mantener el export default estable.
const Automatizaciones = () => (
    <section aria-label="Automatizaciones" className="space-y-3">
        <p className="text-sm" style={{ color: 'var(--ash)' }}>Automatizaciones: próximamente.</p>
        <SkeletonLista />
    </section>
);

export default Automatizaciones;
