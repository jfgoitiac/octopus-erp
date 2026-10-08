import { useState, useEffect, useCallback, useContext } from 'react';
import { HandCoins, Download, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import { AuthContext } from '../../context/AuthContext';
import { listarCuentasCxc, exportarCuentasCxc, getTasaVigenteCantina } from '../../api/cantina.service';
import BuscadorRepresentanteCxc from '../../components/cantina/cxc/BuscadorRepresentanteCxc';
import ListaCuentasCxc from '../../components/cantina/cxc/ListaCuentasCxc';
import EstadoCuentaCxc from '../../components/cantina/cxc/EstadoCuentaCxc';
import {
  ROLES_ADMIN_CANTINA, listaDe, num, esCancelacion, mensajeError, descargarBlob,
} from '../../components/cantina/cxc/utilsCxc';

const AREAS = [
  { value: '', label: 'Todas las áreas' },
  { value: 'cantina', label: 'Cantina' },
  { value: 'libreria', label: 'Librería' },
];

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '15px' };

// Cuentas por cobrar a representantes (ventas de cantina/librería cargadas a
// cuenta). Lista de deudores + estado de cuenta con abonos.
export default function CantinaCuentasPorCobrar() {
  const { user } = useContext(AuthContext);
  const esAdmin = ROLES_ADMIN_CANTINA.includes((user?.rol || '').toLowerCase().trim());

  const [area, setArea] = useState('');
  const [soloDeuda, setSoloDeuda] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [cuentas, setCuentas] = useState([]);
  const [total, setTotal] = useState(0);
  const [hayMas, setHayMas] = useState(false);
  const [cargadoPara, setCargadoPara] = useState(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [tasa, setTasa] = useState(0);
  const [exportando, setExportando] = useState(false);
  const [seleccionado, setSeleccionado] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    getTasaVigenteCantina(controller.signal)
      .then(res => setTasa(num(res.data?.valor_bs)))
      .catch(() => { /* sin tasa: se omite el equivalente en Bs. */ });
    return () => controller.abort();
  }, []);

  const claveFiltros = `${area}|${soloDeuda}|${pagina}`;
  const cargando = cargadoPara !== claveFiltros;

  const cargar = useCallback((signal) => {
    setErrorCarga(false);
    return listarCuentasCxc({
      area: area || undefined,
      con_deuda: soloDeuda ? 1 : undefined,
      page: pagina,
    }, signal)
      .then(res => {
        const lista = listaDe(res.data);
        setCuentas(lista);
        setTotal(res.data?.count ?? lista.length);
        setHayMas(Boolean(res.data?.next));
      })
      .catch(async err => {
        if (esCancelacion(err)) return;
        setErrorCarga(true);
        toast.error(await mensajeError(err, 'No se pudieron cargar las cuentas por cobrar.'));
      })
      .finally(() => { if (!signal?.aborted) setCargadoPara(claveFiltros); });
  }, [area, soloDeuda, pagina, claveFiltros]);

  useEffect(() => {
    const controller = new AbortController();
    cargar(controller.signal);
    return () => controller.abort();
  }, [cargar]);

  const cambiarFiltro = (setter) => (valor) => {
    setter(valor);
    setPagina(1);
  };

  const exportar = async () => {
    if (exportando) return;
    setExportando(true);
    try {
      const res = await exportarCuentasCxc({ area: area || undefined });
      descargarBlob(new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }), `cuentas_por_cobrar${area ? `_${area}` : ''}.xlsx`);
      toast.success('Archivo Excel descargado.');
    } catch (err) {
      toast.error(await mensajeError(err, 'No se pudo generar el Excel.'));
    } finally {
      setExportando(false);
    }
  };

  if (seleccionado) {
    return (
      <EstadoCuentaCxc
        representanteId={seleccionado}
        area={area}
        tasa={tasa}
        esAdmin={esAdmin}
        onVolver={() => setSeleccionado(null)}
        onCambio={() => cargar()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: 'var(--jet)' }}>
          <HandCoins size={20} style={{ color: 'var(--pb)' }} />
          Cuentas por cobrar
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
          Consumos de cantina y librería cargados a la cuenta del representante.
        </p>
      </div>

      <div className="rounded-xl p-3 sm:p-4 flex flex-col gap-3" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
        <BuscadorRepresentanteCxc onSelect={rep => setSeleccionado(rep.id)} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <select
            value={area}
            onChange={e => cambiarFiltro(setArea)(e.target.value)}
            aria-label="Filtrar por área"
            className="w-full sm:w-auto px-3 py-2 rounded-lg outline-none min-h-[40px]"
            style={FIELD_STYLE}
          >
            {AREAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm cursor-pointer min-h-[40px]" style={{ color: 'var(--jet)' }}>
            <input
              type="checkbox"
              checked={soloDeuda}
              onChange={e => cambiarFiltro(setSoloDeuda)(e.target.checked)}
              className="h-4 w-4"
            />
            Solo con deuda
          </label>
          {esAdmin && (
            <button
              type="button"
              onClick={exportar}
              disabled={exportando}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white min-h-[40px] w-full sm:w-auto sm:ml-auto disabled:opacity-60"
              style={{ background: 'var(--pb)' }}
            >
              <Download size={15} /> {exportando ? 'Generando…' : 'Exportar Excel'}
            </button>
          )}
        </div>
      </div>

      {errorCarga && !cargando ? (
        <div className="rounded-xl p-6 flex flex-col items-center gap-3 text-center" role="alert" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
          <p className="text-sm" style={{ color: 'var(--red)' }}>No se pudieron cargar las cuentas por cobrar.</p>
          <button
            type="button"
            onClick={() => { setCargadoPara(null); cargar(); }}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white min-h-[40px] w-full sm:w-auto"
            style={{ background: 'var(--pb)' }}
          >
            <RefreshCw size={15} /> Reintentar
          </button>
        </div>
      ) : (
        <ListaCuentasCxc
          cuentas={cuentas}
          cargando={cargando}
          tasa={tasa}
          onVer={c => setSeleccionado(c.id)}
        />
      )}

      {!cargando && !errorCarga && (pagina > 1 || hayMas) && (
        <div className="flex items-center justify-between gap-3 text-sm" style={{ color: 'var(--ash)' }}>
          <button
            type="button"
            onClick={() => setPagina(p => Math.max(p - 1, 1))}
            disabled={pagina === 1}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg min-h-[40px] disabled:opacity-40"
            style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
          >
            <ChevronLeft size={15} /> Anterior
          </button>
          <span>Página {pagina}{total ? ` · ${total} cuentas` : ''}</span>
          <button
            type="button"
            onClick={() => setPagina(p => p + 1)}
            disabled={!hayMas}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg min-h-[40px] disabled:opacity-40"
            style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
          >
            Siguiente <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
