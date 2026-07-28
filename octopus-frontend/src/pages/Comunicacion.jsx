import { useState } from 'react';
import { Megaphone, Plus, Inbox } from 'lucide-react';
import { useCirculares } from '../hooks/useCirculares';
import TarjetaCircular from '../components/comunicacion/TarjetaCircular';
import SkeletonCircular from '../components/comunicacion/SkeletonCircular';
import ModalNuevaCircular from '../components/comunicacion/ModalNuevaCircular';

const Comunicacion = () => {
  const { circulares, loading, publicarCircular } = useCirculares();
  const [modalAbierto, setModalAbierto] = useState(false);

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--jet)' }}>
            <Megaphone size={20} style={{ color: 'var(--pb)' }} />
            Comunicación
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
            Circulares y avisos institucionales para representantes
          </p>
        </div>

        <button
          onClick={() => setModalAbierto(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all min-h-[44px]"
          style={{ background: 'var(--pb)' }}
        >
          <Plus size={16} />
          Nueva Circular
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <SkeletonCircular key={i} />)}
        </div>
      ) : circulares.length === 0 ? (
        <div
          className="rounded-xl p-16 text-center"
          style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}
        >
          <Inbox size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay circulares publicadas.</p>
        </div>
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
