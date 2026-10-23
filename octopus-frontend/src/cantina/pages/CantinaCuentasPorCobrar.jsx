import { useState, useEffect, useCallback, useContext } from 'react';
import { HandCoins, Download, ChevronLeft, ChevronRight, RefreshCw, UserPlus, ShoppingCart } from 'lucide-react';
import { toast } from 'react-toastify';
import { AuthContext } from '../../context/AuthContext';
import { listarCuentasCxc, exportarCuentasCxc, getTasaVigenteCantina } from '../../api/cantina.service';
import BuscadorRepresentanteCxc from '../../components/cantina/cxc/BuscadorRepresentanteCxc';
import ListaCuentasCxc from '../../components/cantina/cxc/ListaCuentasCxc';
import EstadoCuentaCxc from '../../components/cantina/cxc/EstadoCuentaCxc';
import ClienteFormModal from '../../components/cantina/cxc/ClienteFormModal';
import NuevaVentaCreditoModal from '../../components/cantina/cxc/venta/NuevaVentaCreditoModal';
import TicketVenta from '../../components/cantina/pos/TicketVenta';
import {
  ROLES_ADMIN_CANTINA, listaDe, num, esCancelacion, mensajeError, descargarBlob, abrirReciboVenta,
} from '../../components/cantina/cxc/utilsCxc';

const AREAS = [
  { value: '', label: 'Todas las áreas' },
  { value: 'cantina', label: 'Cantina' },
  { value: 'libreria', label: 'Librería' },
];

const TIPOS = [
  { value: '', label: 'Todos los tipos' },
  { value: 'representante', label: 'Representantes' },
  { value: 'personal', label: 'Personal' },
  { value: 'otro', label: 'Otros clientes' },
];

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '15px' };

// Cuentas por cobrar a representantes y clientes generales (ventas de cantina/librería cargadas a
// cuenta). Lista de deudores + estado de cuenta con abonos.
export default function CantinaCuentasPorCobrar() {
  const { user } = useContext(AuthContext);
  const esAdmin = ROLES_ADMIN_CANTINA.includes((user?.rol || '').toLowerCase().trim());

  const [area, setArea] = useState('');
  const [tipo, setTipo] = useState('');
  const [agregando, setAgregando] = useState(false);
  const [vendiendo, setVendiendo] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [versionCuenta, setVersionCuenta] = useState(0);
  const [descargandoTicket, setDescargandoTicket] = useState(false);
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

  const claveFiltros = `${area}|${tipo}|${soloDeuda}|${pagina}`;
  const cargando = cargadoPara !== claveFiltros;

  const cargar = useCallback((signal) => {
    setErrorCarga(false);
    return listarCuentasCxc({
      area: area || undefined,
      tipo: tipo || undefined,
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
  }, [area, tipo, soloDeuda, pagina, claveFiltros]);

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
      const res = await exportarCuentasCxc({ area: area || undefined, tipo: tipo || undefined });
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

  // Tras confirmar una venta a crédito: se refresca la lista, se abre el estado
  // de cuenta del titular (se remonta con la deuda nueva) y se ofrece el ticket.
  const ventaCreada = ({ venta, titular }) => {
    setVendiendo(false);
    setTicket(venta);
    setSeleccionado(titular);
    setVersionCuenta(v => v + 1);
    cargar();
  };

  const descargarTicket = async () => {
    if (!ticket || descargandoTicket) return;
    setDescargandoTicket(true);
    try {
      await abrirReciboVenta(ticket.id);
    } catch (err) {
      toast.error(await mensajeError(err, 'No se pudo generar el ticket.'));
    } finally {
      setDescargandoTicket(false);
    }
  };

  const ticketModal = ticket && (
    <TicketVenta
      venta={ticket}
      onCerrar={() => setTicket(null)}
      onDescargarPdf={descargarTicket}
      descargando={descargandoTicket}
      etiquetaCerrar="Cerrar"
    />
  );

  if (seleccionado) {
    return (
      <>
        <EstadoCuentaCxc
          key={`${seleccionado.tipo}-${seleccionado.id}-${versionCuenta}`}
          titular={seleccionado}
          area={area}
          tasa={tasa}
          esAdmin={esAdmin}
          onVolver={() => setSeleccionado(null)}
          onCambio={() => cargar()}
        />
        {ticketModal}
      </>
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
          Consumos de cantina y librería cargados a la cuenta de representantes y clientes.
        </p>
      </div>

      <div className="rounded-xl p-3 sm:p-4 flex flex-col gap-3" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
        <BuscadorRepresentanteCxc
          onSelect={t => setSeleccionado({ tipo: t.tipo || 'representante', id: t.id })}
          permitirAgregarCliente
        />
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
          <select
            value={tipo}
            onChange={e => cambiarFiltro(setTipo)(e.target.value)}
            aria-label="Filtrar por tipo"
            className="w-full sm:w-auto px-3 py-2 rounded-lg outline-none min-h-[40px]"
            style={FIELD_STYLE}
          >
            {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
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
          <button
            type="button"
            onClick={() => setVendiendo(true)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white min-h-[40px] w-full sm:w-auto sm:ml-auto"
            style={{ background: 'var(--pb)' }}
          >
            <ShoppingCart size={15} /> Nueva venta a crédito
          </button>
          <button
            type="button"
            onClick={() => setAgregando(true)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium min-h-[40px] w-full sm:w-auto"
            style={{ border: '0.5px solid var(--pb)', color: 'var(--pb)' }}
          >
            <UserPlus size={15} /> Agregar cliente
          </button>
          {esAdmin && (
            <button
              type="button"
              onClick={exportar}
              disabled={exportando}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white min-h-[40px] w-full sm:w-auto disabled:opacity-60"
              style={{ background: 'var(--pb)' }}
            >
              <Download size={15} /> {exportando ? 'Generando…' : 'Exportar Excel'}
            </button>
          )}
        </div>
      </div>

      {agregando && (
        <ClienteFormModal
          open
          onClose={() => setAgregando(false)}
          onGuardado={nuevo => setSeleccionado({ tipo: nuevo.tipo, id: nuevo.id })}
        />
      )}

      {vendiendo && (
        <NuevaVentaCreditoModal
          open
          onClose={() => setVendiendo(false)}
          onVentaCreada={ventaCreada}
        />
      )}
      {ticketModal}

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
          onVer={c => setSeleccionado({ tipo: c.tipo || 'representante', id: c.id })}
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
