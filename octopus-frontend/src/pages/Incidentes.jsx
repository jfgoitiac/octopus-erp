import { useState } from 'react';
import { Plus, ShieldAlert } from 'lucide-react';
import { useIncidentes } from '../hooks/useIncidentes';
import TarjetaIncidente from '../components/incidentes/TarjetaIncidente';
import SkeletonIncidente from '../components/incidentes/SkeletonIncidente';
import ModalNuevoIncidente from '../components/incidentes/ModalNuevoIncidente';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';

const INPUT_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };

const FILTROS_SEVERIDAD = [
  { value: '', label: 'Todas' },
  { value: 'L', label: 'Leve' },
  { value: 'M', label: 'Moderado' },
  { value: 'G', label: 'Grave' },
];

const Incidentes = () => {
  const { incidentes, loading, severidad, setSeveridad, registrarIncidente } = useIncidentes();
  const [modalAbierto, setModalAbierto] = useState(false);

  return (
    <div className="animate-fadeIn">
      <PageHeader
        titulo="Incidentes Disciplinarios"
        descripcion="Registro de incidentes por alumno"
        acciones={
          <button
            onClick={() => setModalAbierto(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all min-h-[44px]"
            style={{ background: 'var(--pb)' }}
          >
            <Plus size={16} />
            Nuevo Incidente
          </button>
        }
      />

      {/* Filtro de severidad */}
      <div className="mb-5 max-w-xs">
        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
          Severidad
        </label>
        <select
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={INPUT_STYLE}
          value={severidad}
          onChange={e => setSeveridad(e.target.value)}
        >
          {FILTROS_SEVERIDAD.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <SkeletonIncidente key={i} />)}
        </div>
      ) : incidentes.length === 0 ? (
        <Card>
          <div className="py-16 text-center" style={{ color: 'var(--ash)' }}>
            <ShieldAlert size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay incidentes registrados.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {incidentes.map(inc => <TarjetaIncidente key={inc.id} incidente={inc} />)}
        </div>
      )}

      {modalAbierto && (
        <ModalNuevoIncidente
          onClose={() => setModalAbierto(false)}
          onSubmit={registrarIncidente}
        />
      )}
    </div>
  );
};

export default Incidentes;
