import { SkeletonLista } from '../shared/SkeletonLista';

// TODO(Fase A): placeholder. Lo reemplaza la pestaña real; mantener el export default estable.
const Conversaciones = () => (
    <section aria-label="Conversaciones" className="space-y-3">
        <p className="text-sm" style={{ color: 'var(--ash)' }}>Conversaciones: próximamente.</p>
        <SkeletonLista />
    </section>
);

export default Conversaciones;
