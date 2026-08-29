import { useState } from 'react';
import { Plus, Inbox } from 'lucide-react';
import { useCirculares } from '../hooks/useCirculares';
import TarjetaCircular from '../components/comunicacion/TarjetaCircular';
import SkeletonCircular from '../components/comunicacion/SkeletonCircular';
import ModalNuevaCircular from '../components/comunicacion/ModalNuevaCircular';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';

const Comunicacion = () => {
  const { circulares, loading, publicarCircular } = useCirculares();
  const [modalAbierto, setModalAbierto] = useState(false);

  return (
    <div className="animate-fadeIn">
      <PageHeader
        titulo="Comunicación"
        descripcion="Circulares y avisos institucionales para representantes"
        acciones={
          <button
            onClick={() => setModalAbierto(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all min-h-[44px]"
            style={{ background: 'var(--pb)' }}
          >
            <Plus size={16} />
            Nueva Circular
          </button>
        }
      />

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <SkeletonCircular key={i} />)}
        </div>
      ) : circulares.length === 0 ? (
        <Card>
          <div className="py-16 text-center" style={{ color: 'var(--ash)' }}>
            <Inbox size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay circulares publicadas.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {circulares.map(c => <TarjetaCircular key={c.id} circular={c} />)}
        </div>
      )}

      {modalAbierto && (
        <ModalNuevaCircular
          onClose={() => setModalAbierto(false)}
          onSubmit={publicarCircular}
        />
      )}
    </div>
  );
};

export default Comunicacion;
