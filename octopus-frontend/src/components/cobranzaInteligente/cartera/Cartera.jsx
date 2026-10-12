import { SkeletonLista } from '../shared/SkeletonLista';

// TODO(Fase A): placeholder. Lo reemplaza la pestaña real; mantener el export default estable.
const Cartera = () => (
    <section aria-label="Cartera" className="space-y-3">
        <p className="text-sm" style={{ color: 'var(--ash)' }}>Cartera: próximamente.</p>
        <SkeletonLista />
    </section>
);

export default Cartera;
