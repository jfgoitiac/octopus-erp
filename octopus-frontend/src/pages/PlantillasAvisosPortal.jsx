import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ListX, Mail } from 'lucide-react';
import { toast } from 'react-toastify';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { CardSkeleton } from '../components/shared/Skeleton';
import MotivosRechazoConfig from '../components/comprobantes/MotivosRechazoConfig';
import EditorPlantillaAviso from '../components/comprobantes/EditorPlantillaAviso';
import { listarPlantillasAviso } from '../services/comprobantesRevisionService';

const PESTANAS = [
  { id: 'plantillas', label: 'Plantillas de aviso', icono: Mail },
  { id: 'motivos', label: 'Motivos de rechazo', icono: ListX },
];

// Respaldo por si la API no devuelve el catálogo de tokens.
const TOKENS_POR_DEFECTO = [
  { token: '{{representante.nombre}}', etiqueta: 'Nombre del representante' },
  { token: '{{alumno.nombre}}', etiqueta: 'Nombre del alumno' },
  { token: '{{mensualidad}}', etiqueta: 'Mensualidad' },
  { token: '{{monto}}', etiqueta: 'Monto' },
  { token: '{{referencia}}', etiqueta: 'Referencia' },
  { token: '{{motivo}}', etiqueta: 'Motivo del rechazo' },
  { token: '{{colegio.nombre}}', etiqueta: 'Nombre del colegio' },
  { token: '{{portal.link}}', etiqueta: 'Enlace al portal' },
];

const ORDEN_CLAVES = ['comprobante_rechazado', 'comprobante_aprobado'];

function PlantillasAviso() {
  const [plantillas, setPlantillas] = useState([]);
  const [tokens, setTokens] = useState(TOKENS_POR_DEFECTO);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async (signal) => {
    setCargando(true);
    try {
      const { data } = await listarPlantillasAviso(signal);
      const lista = Array.isArray(data) ? data : data?.plantillas || [];
      setPlantillas([...lista].sort((a, b) => ORDEN_CLAVES.indexOf(a.clave) - ORDEN_CLAVES.indexOf(b.clave)));
      if (Array.isArray(data?.tokens) && data.tokens.length) setTokens(data.tokens);
    } catch (error) {
      if (error?.code !== 'ERR_CANCELED') toast.error('No se pudieron cargar las plantillas de aviso.');
    } finally {
      if (!signal?.aborted) setCargando(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial tras respuesta HTTP
    cargar(controller.signal);
    return () => controller.abort();
  }, [cargar]);

  const actualizar = (nueva) => setPlantillas((lista) => lista.map((p) => (p.id === nueva.id ? nueva : p)));

  if (cargando) {
    return <div className="space-y-4"><CardSkeleton /><CardSkeleton /></div>;
  }
  if (plantillas.length === 0) {
    return (
      <Card>
        <p className="text-sm" style={{ color: 'var(--ash)' }}>
          No hay plantillas de aviso configuradas. Se usarán los textos por defecto del sistema.
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'var(--ash)' }}>
        Mensajes que recibe el representante (aviso en el portal, notificación y correo) cuando se aprueba o rechaza su comprobante.
      </p>
      {plantillas.map((p) => (
        <EditorPlantillaAviso key={p.id} plantilla={p} tokens={tokens} onGuardada={actualizar} />
      ))}
    </div>
  );
}

const PlantillasAvisosPortal = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activa = PESTANAS.some((p) => p.id === searchParams.get('tab')) ? searchParams.get('tab') : 'plantillas';

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        titulo="Avisos del portal"
        descripcion="Personaliza los avisos de comprobantes aprobados o rechazados y el catálogo de motivos de rechazo."
      />

      <div
        role="tablist"
        aria-label="Secciones de avisos del portal"
        className="grid grid-cols-2 gap-1 p-1 rounded-2xl w-full sm:w-auto sm:inline-grid"
        style={{ background: 'var(--surface-sunken)', border: '0.5px solid var(--border)' }}
      >
        {PESTANAS.map((p) => {
          const seleccionada = p.id === activa;
          const Icono = p.icono;
          return (
            <button
              key={p.id}
              id={`avisos-tab-${p.id}`}
              type="button"
              role="tab"
              aria-selected={seleccionada}
              aria-controls={`avisos-panel-${p.id}`}
              onClick={() => setSearchParams(p.id === 'plantillas' ? {} : { tab: p.id }, { replace: true })}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-2 sm:px-4 rounded-xl text-xs sm:text-sm font-medium transition-colors"
              style={seleccionada
                ? { background: '#fff', color: 'var(--pb-mid)', boxShadow: '0 1px 3px rgba(43,48,58,0.10)' }
                : { color: 'var(--jet-mid)' }}
            >
              <Icono size={16} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{p.label}</span>
            </button>
          );
        })}
      </div>

      <div id={`avisos-panel-${activa}`} role="tabpanel" aria-labelledby={`avisos-tab-${activa}`}>
        {activa === 'plantillas' ? <PlantillasAviso /> : <MotivosRechazoConfig />}
      </div>
    </div>
  );
};

export default PlantillasAvisosPortal;
