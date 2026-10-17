import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { parseApiError } from '../../../utils/apiError';
import { getCierres } from '../api/auditoriaApi';
import CierreFiltros from '../components/CierreFiltros';
import CierreLista, { CierreListaSkeleton } from '../components/CierreLista';
import { aFechaISO, esCancelacion, haceNDias } from '../components/CierreFormato';

const TAMANO_PAGINA = 20;

const filtrosIniciales = () => ({
  fecha_inicio: haceNDias(30),
  fecha_fin: aFechaISO(new Date()),
  cajero: '',
  area: '',
  estado: '',
  con_diferencia: false,
});

const ESTILO_BOTON_PAGINA = { background: '#fff', border: '0.5px solid var(--border-md)', color: 'var(--jet)' };

// Carril Fase 1 · F2 — lista de cierres diarios (CONTRATO_AUDITORIA_CANTINA.md §3).
const AuditoriaCierres = () => {
  const [filtros, setFiltros] = useState(filtrosIniciales);
  const [pagina, setPagina] = useState(1);
  // `clave` identifica la consulta que produjo los datos: mientras no coincida
  // con la consulta actual, la lista está cargando.
  const [datos, setDatos] = useState({ clave: null, count: 0, results: [] });
  // No hay endpoint de cajeros: se acumulan los que aparecen en los cierres,
  // igual que CantinaReportes.
  const [cajeros, setCajeros] = useState({});

  const clave = JSON.stringify({ filtros, pagina });
  const cargando = datos.clave !== clave;

  useEffect(() => {
    const controller = new AbortController();
    const params = { page: pagina, page_size: TAMANO_PAGINA };
    if (filtros.fecha_inicio) params.fecha_inicio = filtros.fecha_inicio;
    if (filtros.fecha_fin) params.fecha_fin = filtros.fecha_fin;
    if (filtros.cajero) params.cajero = filtros.cajero;
    if (filtros.area) params.area = filtros.area;
    if (filtros.estado) params.estado = filtros.estado;
    if (filtros.con_diferencia) params.con_diferencia = true;

    getCierres(params, controller.signal)
      .then(({ data }) => {
        const results = data.results ?? [];
        setDatos({ clave, count: data.count ?? results.length, results });
        setCajeros((prev) => {
          const next = { ...prev };
          results.forEach((c) => { if (c.cajero?.id != null) next[c.cajero.id] = c.cajero.nombre; });
          return next;
        });
      })
      .catch((err) => {
        if (esCancelacion(err)) return;
        toast.error(`No se pudieron cargar los cierres: ${parseApiError(err)}`);
        setDatos({ clave, count: 0, results: [] });
      });
    return () => controller.abort();
  }, [clave, filtros, pagina]);

  const cambiarFiltros = (nuevos) => {
    setFiltros(nuevos);
    setPagina(1);
  };

  const totalPaginas = Math.max(1, Math.ceil(datos.count / TAMANO_PAGINA));
  const listaCajeros = Object.entries(cajeros)
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4">
      <PageHeader
        titulo="Cierres diarios"
        descripcion="Consulta los cierres de caja, sus diferencias y su estado de revisión."
      />

      <CierreFiltros
        filtros={filtros}
        cajeros={listaCajeros}
        onCambio={cambiarFiltros}
        onLimpiar={() => cambiarFiltros(filtrosIniciales())}
      />

      <p className="text-xs" style={{ color: 'var(--ash)' }} aria-live="polite">
        {cargando ? 'Cargando…' : `${datos.count} cierre${datos.count !== 1 ? 's' : ''} encontrado${datos.count !== 1 ? 's' : ''}`}
      </p>

      {cargando ? <CierreListaSkeleton /> : <CierreLista cierres={datos.results} />}

      {!cargando && datos.count > TAMANO_PAGINA && (
        <nav className="flex items-center justify-between gap-2" aria-label="Paginación de cierres">
          <button
            type="button"
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={pagina <= 1}
            className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-xl text-sm font-medium disabled:opacity-40"
            style={ESTILO_BOTON_PAGINA}
          >
            <ChevronLeft size={16} aria-hidden="true" />
            Anterior
          </button>
          <span className="text-sm text-center" style={{ color: 'var(--jet-mid)' }}>
            Página {pagina} de {totalPaginas}
          </span>
          <button
            type="button"
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            disabled={pagina >= totalPaginas}
            className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-xl text-sm font-medium disabled:opacity-40"
            style={ESTILO_BOTON_PAGINA}
          >
            Siguiente
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
};

export default AuditoriaCierres;
