import { Construction } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';

// Marcador de la Fase 0: cada página de Auditoría la reemplaza su carril
// (ver PLAN_AUDITORIA_CANTINA.md §4). Se borra cuando no quede ninguna.
const PaginaPendiente = ({ titulo, descripcion, carril }) => (
  <div className="w-full max-w-6xl mx-auto p-3 sm:p-5">
    <PageHeader titulo={titulo} descripcion={descripcion} />
    <div
      className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 sm:p-10 text-center"
      style={{ borderColor: 'var(--border)', color: 'var(--ash)' }}
    >
      <Construction size={28} aria-hidden="true" />
      <p className="text-sm sm:text-base">En construcción — {carril}.</p>
    </div>
  </div>
);

export default PaginaPendiente;
