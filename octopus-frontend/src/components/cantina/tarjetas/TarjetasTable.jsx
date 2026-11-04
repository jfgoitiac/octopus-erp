import { useMemo, useState } from 'react';
import { ArrowUpDown, CreditCard, Search, SlidersHorizontal, X } from 'lucide-react';
import { TIPO_LABELS } from '../cxc/utilsCxc';
import Pagination from '../../shared/Pagination';

const PAGE_SIZE = 10;

const ESTADO_LABELS = {
  sin_asignar: 'Sin asignar',
  activa: 'Activa',
  bloqueada: 'Bloqueada',
  extraviada: 'Extraviada',
};

const ESTADO_STYLE = {
  sin_asignar: { background: 'var(--porcelain)', color: 'var(--ash)' },
  activa: { background: 'var(--pb-light)', color: 'var(--pb-mid)' },
  bloqueada: { background: 'var(--yellow-light)', color: 'var(--amber-ink)' },
  extraviada: { background: 'var(--red-light)', color: 'var(--red)' },
};

function SkeletonFila() {
  return (
    <tr>
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded animate-pulse" style={{ background: 'var(--border-md)' }} />
        </td>
      ))}
    </tr>
  );
}

// Listado general de tarjetas (TarjetasListView, §7.3bis Fase 3) — mínimo
// necesario para poder disparar la acción "Ajustar crédito" por fila; el
// wizard de asignación/reposición/recarga sigue siendo autosuficiente por
// código/serial y no depende de esta tabla.
export default function TarjetasTable({ tarjetas, cargando, onAjustarCredito }) {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [orden, setOrden] = useState('titular');
  const [pagina, setPagina] = useState(1);

  const tarjetasFiltradas = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase('es');
    const resultado = (tarjetas || []).filter(t => {
      const coincideFiltro = filtro === 'todas'
        || (filtro === 'asignadas' ? t.estado !== 'sin_asignar' : t.estado === filtro);
      if (!coincideFiltro) return false;
      if (!termino) return true;
      return [t.titular_nombre, t.serial, t.alumno_grado_seccion, TIPO_LABELS[t.titular_tipo]]
        .filter(Boolean)
        .some(valor => String(valor).toLocaleLowerCase('es').includes(termino));
    });

    return resultado.sort((a, b) => {
      if (orden === 'serial') {
        return String(a.serial || '').localeCompare(String(b.serial || ''), 'es', { numeric: true });
      }
      if (orden === 'saldo') return Number(b.saldo || 0) - Number(a.saldo || 0);
      if (orden === 'estado') {
        return String(a.estado || '').localeCompare(String(b.estado || ''), 'es')
          || String(a.titular_nombre || a.serial || '').localeCompare(String(b.titular_nombre || b.serial || ''), 'es');
      }

      // Orden operativo predeterminado: titulares asignados alfabéticamente;
      // las tarjetas aún sin asignar quedan juntas al final, por serial.
      const aSinAsignar = a.estado === 'sin_asignar';
      const bSinAsignar = b.estado === 'sin_asignar';
      if (aSinAsignar !== bSinAsignar) return aSinAsignar ? 1 : -1;
      return String(a.titular_nombre || a.serial || '').localeCompare(
        String(b.titular_nombre || b.serial || ''),
        'es',
        { numeric: true, sensitivity: 'base' },
      );
    });
  }, [busqueda, filtro, orden, tarjetas]);

  const totalPaginas = Math.max(1, Math.ceil(tarjetasFiltradas.length / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const tarjetasPagina = tarjetasFiltradas.slice(
    (paginaActual - 1) * PAGE_SIZE,
    paginaActual * PAGE_SIZE,
  );

  const actualizarBusqueda = (valor) => {
    setBusqueda(valor);
    setPagina(1);
  };

  const actualizarFiltro = (valor) => {
    setFiltro(valor);
    setPagina(1);
  };

  const actualizarOrden = (valor) => {
    setOrden(valor);
    setPagina(1);
  };

  if (cargando) {
    return (
      <div className="rounded-xl overflow-x-auto" style={{ border: '0.5px solid var(--border-md)' }}>
        <table className="w-full text-sm border-collapse min-w-[760px]">
          <tbody className="divide-y" style={{ borderColor: 'var(--border-md)' }}>
            {[1, 2, 3].map(i => <SkeletonFila key={i} />)}
          </tbody>
        </table>
      </div>
    );
  }

  if (!tarjetas || tarjetas.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl py-16"
        style={{ border: '1px dashed var(--border-md)', color: 'var(--ash)' }}
      >
        <CreditCard size={32} className="mb-2 opacity-30" />
        <p className="text-sm">Sin tarjetas registradas</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
      <div className="p-3 sm:p-4 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
        <div className="relative flex-1 max-w-xl">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--ash)' }}
            aria-hidden="true"
          />
          <input
            type="search"
            value={busqueda}
            onChange={e => actualizarBusqueda(e.target.value)}
            placeholder="Buscar por titular, serial o grado…"
            className="w-full h-10 pl-9 pr-9 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[var(--pb-light)]"
            style={{ border: '1px solid var(--border-md)', color: 'var(--jet)', background: 'var(--porcelain)' }}
            aria-label="Buscar tarjetas"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => actualizarBusqueda('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md"
              style={{ color: 'var(--ash)' }}
              aria-label="Limpiar búsqueda"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={filtro}
            onChange={e => actualizarFiltro(e.target.value)}
            className="h-10 rounded-xl px-3 text-sm outline-none"
            style={{ border: '1px solid var(--border-md)', color: 'var(--jet)', background: '#fff' }}
            aria-label="Filtrar tarjetas"
          >
            <option value="todas">Todas las tarjetas</option>
            <option value="asignadas">Todas las asignadas</option>
            <option value="sin_asignar">Sin asignar</option>
            <option value="activa">Activas</option>
            <option value="bloqueada">Bloqueadas</option>
            <option value="extraviada">Extraviadas</option>
          </select>

          <label className="relative flex items-center">
            <ArrowUpDown size={14} className="absolute left-3 pointer-events-none" style={{ color: 'var(--ash)' }} aria-hidden="true" />
            <select
              value={orden}
              onChange={e => actualizarOrden(e.target.value)}
              className="h-10 rounded-xl pl-9 pr-8 text-sm outline-none w-full"
              style={{ border: '1px solid var(--border-md)', color: 'var(--jet)', background: '#fff' }}
              aria-label="Ordenar tarjetas"
            >
              <option value="titular">Titular (A–Z)</option>
              <option value="serial">Serial</option>
              <option value="saldo">Mayor saldo</option>
              <option value="estado">Estado</option>
            </select>
          </label>
        </div>
      </div>

      {tarjetasFiltradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-4 py-14 text-center" style={{ color: 'var(--ash)' }}>
          <Search size={28} className="mb-2 opacity-30" />
          <p className="text-sm font-medium">No hay tarjetas que coincidan</p>
          <p className="text-xs mt-1">Prueba con otra búsqueda o cambia el filtro.</p>
        </div>
      ) : (
      <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[760px]">
        <thead>
          <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
            {['Alumno', 'Serial', 'Saldo', 'Límite de crédito', 'Estado', 'Acciones'].map(h => (
              <th
                key={h}
                scope="col"
                className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--ash)', whiteSpace: 'nowrap' }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tarjetasPagina.map((t, idx) => (
            <tr
              key={t.id}
              className="bg-transparent hover:bg-[var(--ash-light)] transition-colors"
              style={{ borderBottom: idx < tarjetasPagina.length - 1 ? '0.5px solid var(--border-md)' : 'none' }}
            >
              <td className="px-4 py-3 font-medium" style={{ color: 'var(--jet)' }}>
                {t.titular_nombre || '— sin asignar —'}
                {t.titular_tipo && (
                  <span className="block text-xs font-normal" style={{ color: 'var(--ash)' }}>
                    {t.alumno_grado_seccion || TIPO_LABELS[t.titular_tipo]}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--ash)' }}>{t.serial}</td>
              <td className="px-4 py-3 font-semibold" style={{ color: Number(t.saldo) < 0 ? 'var(--red)' : 'var(--jet)' }}>
                ${Number(t.saldo ?? 0).toFixed(2)}
              </td>
              <td className="px-4 py-3" style={{ color: 'var(--jet)' }}>${Number(t.limite_credito ?? 0).toFixed(2)}</td>
              <td className="px-4 py-3">
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-medium"
                  style={ESTADO_STYLE[t.estado] || ESTADO_STYLE.sin_asignar}
                >
                  {ESTADO_LABELS[t.estado] || t.estado}
                </span>
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => onAjustarCredito(t)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--pb)' }}
                  title="Ajustar crédito"
                  aria-label={`Ajustar crédito de ${t.titular_nombre || t.serial}`}
                >
                  <SlidersHorizontal size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      )}

      <Pagination
        page={paginaActual}
        totalPages={totalPaginas}
        onPageChange={setPagina}
        total={tarjetasFiltradas.length}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
