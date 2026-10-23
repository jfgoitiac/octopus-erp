import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { RotateCcw, Search, ShieldAlert } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { parseApiError } from '../../../utils/apiError';
import { buscarVentas } from '../api/auditoriaApi';
import BitacoraPaginacion from '../components/BitacoraPaginacion';
import BitacoraRangoFechas from '../components/BitacoraRangoFechas';
import CorreccionVentaModal from '../components/CorreccionVentaModal';
import CorreccionVentas, { CorreccionVentasSkeleton } from '../components/CorreccionVentas';
import { aFechaISO, esCancelacion, ESTILO_CAMPO, ESTILO_TARJETA, haceNDias } from '../components/CierreFormato';
import { CLASE_CAMPO, CLASE_ETIQUETA } from '../components/BitacoraFormato';

const TAMANO_PAGINA = 20;

const filtrosIniciales = () => ({
  q: '',
  fecha_inicio: haceNDias(7),
  fecha_fin: aFechaISO(new Date()),
  area: '',
  estado: '',
});

// Correcciones del Director: busca una venta y corrige método de pago,
// descuento u observaciones con motivo obligatorio (queda en la bitácora).
const AuditoriaCorrecciones = () => {
  const [filtros, setFiltros] = useState(filtrosIniciales);
  // El texto se aplica con retardo para no consultar en cada tecla.
  const [texto, setTexto] = useState('');
  const [pagina, setPagina] = useState(1);
  const [recarga, setRecarga] = useState(0);
  const [datos, setDatos] = useState({ clave: null, count: 0, results: [] });
  const [seleccionada, setSeleccionada] = useState(null);

  const clave = JSON.stringify({ filtros, pagina, recarga });
  const cargando = datos.clave !== clave;

  useEffect(() => {
    const t = setTimeout(() => {
      setFiltros((f) => (f.q === texto.trim() ? f : { ...f, q: texto.trim() }));
      setPagina(1);
    }, 400);
    return () => clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    const controller = new AbortController();
    const params = { page: pagina, page_size: TAMANO_PAGINA };
    Object.entries(filtros).forEach(([k, v]) => { if (v) params[k] = v; });
    buscarVentas(params, controller.signal)
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        const results = data.results ?? [];
        setDatos({ clave, count: data.count ?? results.length, results });
      })
      .catch((err) => {
        if (esCancelacion(err)) return;
        toast.error(`No se pudieron buscar las ventas: ${parseApiError(err)}`);
        setDatos({ clave, count: 0, results: [] });
      });
    return () => controller.abort();
  }, [clave, filtros, pagina]);

  const cambiarFiltros = (cambio) => {
    setFiltros((f) => ({ ...f, ...cambio }));
    setPagina(1);
  };

  const limpiar = () => {
    setTexto('');
    setFiltros(filtrosIniciales());
    setPagina(1);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-4">
      <PageHeader
        titulo="Correcciones"
        descripcion="Corrige el método de pago, el descuento o las observaciones de una venta."
      />

      <div
        className="flex items-start gap-3 rounded-2xl p-3 text-sm sm:p-4"
        style={{ background: 'var(--yellow-light)', color: 'var(--amber-ink)' }}
        role="note"
      >
        <ShieldAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>
          Toda corrección exige un motivo y queda en la bitácora con los valores anteriores. Las ventas anuladas no se pueden modificar y, en turnos ya cerrados, el método y el monto del descuento quedan bloqueados.
        </p>
      </div>

      <div className="grid grid-cols-1 items-end gap-3 rounded-2xl p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3 xl:grid-cols-7" style={ESTILO_TARJETA}>
        <div className="sm:col-span-2 xl:col-span-2">
          <label htmlFor="corr-q" className={CLASE_ETIQUETA} style={{ color: 'var(--ash)' }}>Buscar venta</label>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} aria-hidden="true" />
            <input
              id="corr-q"
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="N.º, cajero, alumno, cliente o referencia"
              autoComplete="off"
              className={`${CLASE_CAMPO} pl-9`}
              style={ESTILO_CAMPO}
            />
          </div>
        </div>
        <BitacoraRangoFechas idBase="corr" desde={filtros.fecha_inicio} hasta={filtros.fecha_fin} onCambio={cambiarFiltros} />
        <div>
          <label htmlFor="corr-area" className={CLASE_ETIQUETA} style={{ color: 'var(--ash)' }}>Área</label>
          <select id="corr-area" value={filtros.area} onChange={(e) => cambiarFiltros({ area: e.target.value })} className={CLASE_CAMPO} style={ESTILO_CAMPO}>
            <option value="">Ambas</option>
            <option value="cantina">Cantina</option>
            <option value="libreria">Librería</option>
          </select>
        </div>
        <div>
          <label htmlFor="corr-estado" className={CLASE_ETIQUETA} style={{ color: 'var(--ash)' }}>Estado</label>
          <select id="corr-estado" value={filtros.estado} onChange={(e) => cambiarFiltros({ estado: e.target.value })} className={CLASE_CAMPO} style={ESTILO_CAMPO}>
            <option value="">Todas</option>
            <option value="completada">Completadas</option>
            <option value="anulada">Anuladas</option>
          </select>
        </div>
        <button
          type="button"
          onClick={limpiar}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-medium hover:bg-[var(--jet-light)]"
          style={{ color: 'var(--jet-mid)' }}
        >
          <RotateCcw size={14} aria-hidden="true" />
          Limpiar
        </button>
      </div>

      <p className="text-xs" style={{ color: 'var(--ash)' }} aria-live="polite">
        {cargando ? 'Buscando…' : `${datos.count} venta${datos.count !== 1 ? 's' : ''} encontrada${datos.count !== 1 ? 's' : ''}`}
      </p>

      {cargando ? (
        <CorreccionVentasSkeleton />
      ) : (
        <CorreccionVentas ventas={datos.results} buscando={Boolean(filtros.q)} onCorregir={setSeleccionada} />
      )}

      {!cargando && (
        <BitacoraPaginacion pagina={pagina} total={datos.count} tamano={TAMANO_PAGINA} onCambio={setPagina} etiqueta="Paginación de ventas" />
      )}

      {seleccionada && (
        <CorreccionVentaModal
          key={seleccionada.id ?? seleccionada.venta_id}
          venta={seleccionada}
          onClose={() => setSeleccionada(null)}
          onCorregida={() => { setSeleccionada(null); setRecarga((n) => n + 1); }}
        />
      )}
    </div>
  );
};

export default AuditoriaCorrecciones;
