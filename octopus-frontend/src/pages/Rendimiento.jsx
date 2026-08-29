import { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { useRendimiento } from '../hooks/useRendimiento';
import GradoSelect from '../components/GradoSelect';
import MapaCalorSeccion from '../components/rendimiento/MapaCalorSeccion';
import AlertasRiesgoList from '../components/rendimiento/AlertasRiesgoList';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';

const TABS = [
  { key: 'mapa', label: 'Mapa de Calor' },
  { key: 'alertas', label: 'Alertas de Riesgo' },
];

const INPUT_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };

const Rendimiento = () => {
  const [tab, setTab] = useState('mapa');
  const {
    grado, setGrado,
    lapsos, lapsoId, setLapsoId,
    seccion, loadingSeccion,
    alertas, loadingAlertas,
  } = useRendimiento();

  return (
    <div className="animate-fadeIn pb-24 sm:pb-0">
      <PageHeader
        titulo="Seguimiento de Rendimiento"
        descripcion="Desempeño académico por sección y alumnos en riesgo"
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-5 border-b" style={{ borderColor: 'var(--border-md)' }}>
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors"
            style={
              tab === key
                ? { borderColor: 'var(--pb)', color: 'var(--pb)' }
                : { borderColor: 'transparent', color: 'var(--ash)' }
            }
          >
            {label}
            {key === 'alertas' && alertas.length > 0 && (
              <span
                className="ml-2 text-[11px] px-1.5 py-0.5 rounded-full"
                style={{ background: 'var(--red-light)', color: 'var(--red)' }}
              >
                {alertas.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'mapa' && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label
                htmlFor="filtro-grado-rendimiento"
                className="block text-[11px] uppercase tracking-widest mb-1.5"
                style={{ color: 'var(--ash)' }}
              >
                Grado / Sección
              </label>
              <GradoSelect
                id="filtro-grado-rendimiento"
                value={grado}
                onChange={e => setGrado(e.target.value)}
                incluirVacio
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={INPUT_STYLE}
              />
            </div>
            <div>
              <label
                htmlFor="filtro-lapso-rendimiento"
                className="block text-[11px] uppercase tracking-widest mb-1.5"
                style={{ color: 'var(--ash)' }}
              >
                Lapso
              </label>
              <select
                id="filtro-lapso-rendimiento"
                value={lapsoId}
                onChange={e => setLapsoId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={INPUT_STYLE}
              >
                <option value="">Lapso activo / más reciente</option>
                {lapsos.map(l => (
                  <option key={l.id} value={l.id}>{l.nombre} ({l.periodo_escolar})</option>
                ))}
              </select>
            </div>
          </div>

          {!grado ? (
            <Card>
              <div className="py-16 text-center" style={{ color: 'var(--ash)' }}>
                <GraduationCap size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Selecciona un grado y sección para ver el mapa de calor.</p>
              </div>
            </Card>
          ) : (
            <MapaCalorSeccion seccion={seccion} loading={loadingSeccion} />
          )}
        </div>
      )}

      {tab === 'alertas' && (
        <AlertasRiesgoList alertas={alertas} loading={loadingAlertas} />
      )}
    </div>
  );
};

export default Rendimiento;
