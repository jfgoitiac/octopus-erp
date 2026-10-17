import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Link2, ScrollText, X } from 'lucide-react';
import { parseApiError } from '../../../utils/apiError';
import { getBitacora } from '../api/auditoriaApi';
import { ESTILO_TARJETA, aFechaISO, esCancelacion, haceNDias } from './CierreFormato';
import { OBJETO_ETIQUETA } from './BitacoraFormato';
import BitacoraFiltros from './BitacoraFiltros';
import BitacoraEvento, { BitacoraEventoSkeleton } from './BitacoraEvento';
import BitacoraPaginacion from './BitacoraPaginacion';
import BitacoraVerificar from './BitacoraVerificar';

const TAMANO_PAGINA = 25;

const filtrosIniciales = (usuario = '') => ({
  fecha_inicio: haceNDias(30),
  fecha_fin: aFechaISO(new Date()),
  tipos: [],
  usuario,
  area: '',
});

// `tipo` es repetible en el backend (?tipo=a&tipo=b). Axios serializa los
// arrays como `tipo[]=`, así que se arma un URLSearchParams a mano.
const armarParams = (filtros, objeto, pagina) => {
  const params = new URLSearchParams({ page: String(pagina), page_size: String(TAMANO_PAGINA) });
  if (filtros.fecha_inicio) params.set('fecha_inicio', filtros.fecha_inicio);
  if (filtros.fecha_fin) params.set('fecha_fin', filtros.fecha_fin);
  filtros.tipos.forEach((t) => params.append('tipo', t));
  if (filtros.usuario) params.set('usuario', filtros.usuario);
  if (filtros.area) params.set('area', filtros.area);
  if (objeto) {
    params.set('objeto_tipo', objeto.tipo);
    params.set('objeto_id', objeto.id);
  }
  return params;
};

// Pestaña Bitácora (§5). `objeto` ({ tipo, id }) y `usuarioInicial` llegan
// desde la URL cuando se entra desde una alerta.
export default function BitacoraTab({ objeto, usuarioInicial = '', onQuitarObjeto }) {
  const [filtros, setFiltros] = useState(() => filtrosIniciales(usuarioInicial));
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState({ clave: null, count: 0, results: [] });
  // No hay endpoint de usuarios: se acumulan los que aparecen (patrón de F2).
  const [usuarios, setUsuarios] = useState(() => (usuarioInicial ? { [usuarioInicial]: `Usuario #${usuarioInicial}` } : {}));

  const clave = JSON.stringify({ filtros, objeto, pagina });
  const cargando = datos.clave !== clave;

  useEffect(() => {
    const controller = new AbortController();
    getBitacora(armarParams(filtros, objeto, pagina), controller.signal)
      .then(({ data }) => {
        const results = data.results ?? [];
        setDatos({ clave, count: data.count ?? results.length, results });
        setUsuarios((prev) => {
          const next = { ...prev };
          results.forEach((ev) => { if (ev.usuario?.id != null) next[ev.usuario.id] = ev.usuario.nombre; });
          return next;
        });
      })
      .catch((err) => {
        if (esCancelacion(err)) return;
        toast.error(`No se pudo cargar la bitácora: ${parseApiError(err)}`);
        setDatos({ clave, count: 0, results: [] });
      });
    return () => controller.abort();
  }, [clave, filtros, objeto, pagina]);

  const cambiarFiltros = (nuevos) => {
    setFiltros(nuevos);
    setPagina(1);
  };

  const listaUsuarios = Object.entries(usuarios)
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-sm sm:max-w-xl" style={{ color: 'var(--jet-mid)' }}>
          Registro inalterable de las acciones críticas de la cantina. Ningún evento se puede editar ni borrar.
        </p>
        <BitacoraVerificar />
      </div>

      <BitacoraFiltros
        filtros={filtros}
        usuarios={listaUsuarios}
        onCambio={cambiarFiltros}
        onLimpiar={() => cambiarFiltros(filtrosIniciales())}
      />

      {objeto && (
        <div className="flex items-center gap-2 self-start max-w-full rounded-full pl-3 pr-1 py-1 text-xs" style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
          <Link2 size={13} aria-hidden="true" className="shrink-0" />
          <span className="truncate">
            Solo eventos de {OBJETO_ETIQUETA[objeto.tipo] ?? objeto.tipo} #{objeto.id}
          </span>
          <button
            type="button"
            onClick={onQuitarObjeto}
            aria-label="Quitar filtro de objeto"
            className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full hover:bg-white/60"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      <p className="text-xs" style={{ color: 'var(--ash)' }} aria-live="polite">
        {cargando ? 'Cargando…' : `${datos.count} evento${datos.count !== 1 ? 's' : ''} encontrado${datos.count !== 1 ? 's' : ''}`}
      </p>

      {cargando && <BitacoraEventoSkeleton />}

      {!cargando && datos.results.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl p-8 sm:p-12 text-center" style={ESTILO_TARJETA}>
          <ScrollText size={28} aria-hidden="true" style={{ color: 'var(--ash)' }} />
          <p className="text-sm" style={{ color: 'var(--jet-mid)' }}>No hay eventos con estos filtros.</p>
        </div>
      )}

      {!cargando && datos.results.length > 0 && (
        <ul className="flex flex-col gap-3">
          {datos.results.map((ev) => <BitacoraEvento key={ev.id} evento={ev} />)}
        </ul>
      )}

      {!cargando && (
        <BitacoraPaginacion
          pagina={pagina}
          total={datos.count}
          tamano={TAMANO_PAGINA}
          onCambio={setPagina}
          etiqueta="Paginación de la bitácora"
        />
      )}
    </div>
  );
}
