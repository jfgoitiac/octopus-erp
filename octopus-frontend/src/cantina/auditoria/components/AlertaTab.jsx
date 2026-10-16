import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { BellOff } from 'lucide-react';
import { parseApiError } from '../../../utils/apiError';
import { getAlertas } from '../api/auditoriaApi';
import { ESTILO_TARJETA, esCancelacion } from './CierreFormato';
import AlertaFiltros from './AlertaFiltros';
import AlertaTarjeta, { AlertaTarjetaSkeleton } from './AlertaTarjeta';
import AlertaAtenderModal from './AlertaAtenderModal';
import { avisarAlertasCambiadas } from './AlertaEventos';
import BitacoraPaginacion from './BitacoraPaginacion';

const TAMANO_PAGINA = 20;

// Sin rango de fechas por defecto: el backend no filtra por fecha si no se
// envían, así la bandeja muestra TODAS las alertas abiertas, también las de
// días anteriores (contrato §6, ajuste de la integración de la Fase 2).
const filtrosIniciales = () => ({
  estado: 'abierta',
  tipo: '',
  fecha_inicio: '',
  fecha_fin: '',
});

// Pestaña Alertas (§6): bandeja con filtros y acción "Atender".
export default function AlertaTab() {
  const [filtros, setFiltros] = useState(filtrosIniciales);
  const [pagina, setPagina] = useState(1);
  // `version` fuerza la recarga tras atender una alerta.
  const [version, setVersion] = useState(0);
  const [datos, setDatos] = useState({ clave: null, count: 0, results: [] });
  const [atendiendo, setAtendiendo] = useState(null);

  const clave = JSON.stringify({ filtros, pagina, version });
  const cargando = datos.clave !== clave;

  useEffect(() => {
    const controller = new AbortController();
    const params = { page: pagina, page_size: TAMANO_PAGINA };
    if (filtros.estado) params.estado = filtros.estado;
    if (filtros.tipo) params.tipo = filtros.tipo;
    if (filtros.fecha_inicio) params.fecha_inicio = filtros.fecha_inicio;
    if (filtros.fecha_fin) params.fecha_fin = filtros.fecha_fin;

    getAlertas(params, controller.signal)
      .then(({ data }) => {
        const results = data.results ?? [];
        setDatos({ clave, count: data.count ?? results.length, results });
      })
      .catch((err) => {
        if (esCancelacion(err)) return;
        toast.error(`No se pudieron cargar las alertas: ${parseApiError(err)}`);
        setDatos({ clave, count: 0, results: [] });
      });
    return () => controller.abort();
  }, [clave, filtros, pagina]);

  const cambiarFiltros = (nuevos) => {
    setFiltros(nuevos);
    setPagina(1);
  };

  const alAtender = () => {
    setAtendiendo(null);
    setVersion((v) => v + 1);
    avisarAlertasCambiadas();
  };

  const vacio = filtros.estado === 'abierta' ? 'No hay alertas abiertas en este período.' : 'No hay alertas con estos filtros.';

  return (
    <div className="flex flex-col gap-4">
      <AlertaFiltros filtros={filtros} onCambio={cambiarFiltros} onLimpiar={() => cambiarFiltros(filtrosIniciales())} />

      <p className="text-xs" style={{ color: 'var(--ash)' }} aria-live="polite">
        {cargando ? 'Cargando…' : `${datos.count} alerta${datos.count !== 1 ? 's' : ''}`}
      </p>

      {cargando && <AlertaTarjetaSkeleton />}

      {!cargando && datos.results.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl p-8 sm:p-12 text-center" style={ESTILO_TARJETA}>
          <BellOff size={28} aria-hidden="true" style={{ color: 'var(--ash)' }} />
          <p className="text-sm" style={{ color: 'var(--jet-mid)' }}>{vacio}</p>
        </div>
      )}

      {!cargando && datos.results.length > 0 && (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          {datos.results.map((a) => <AlertaTarjeta key={a.id} alerta={a} onAtender={setAtendiendo} />)}
        </ul>
      )}

      {!cargando && (
        <BitacoraPaginacion
          pagina={pagina}
          total={datos.count}
          tamano={TAMANO_PAGINA}
          onCambio={setPagina}
          etiqueta="Paginación de alertas"
        />
      )}

      <AlertaAtenderModal alerta={atendiendo} onClose={() => setAtendiendo(null)} onAtendida={alAtender} />
    </div>
  );
}
