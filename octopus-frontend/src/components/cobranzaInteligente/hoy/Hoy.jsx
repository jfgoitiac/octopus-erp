import { SkeletonLista } from '../shared/SkeletonLista';

// TODO(Fase A): placeholder. Lo reemplaza la pestaña real; mantener el export default estable.
const Hoy = () => (
    <section aria-label="Hoy" className="space-y-3">
        <p className="text-sm" style={{ color: 'var(--ash)' }}>Hoy: próximamente.</p>
        <SkeletonLista />
    </section>
);

export default Hoy;
