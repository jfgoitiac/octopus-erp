import { useCallback, useEffect, useState } from 'react';
import { History, Loader2, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'react-toastify';
import { Modal } from '../../components/ui/Modal';
import { TablaScroll } from '../../components/ui/TablaScroll';
import { cambiarTasaCantina, getHistorialTasaCantina, getTasaVigenteCantina } from '../../api/cantina.service';

const EVENTO_TASA_CAMBIADA = 'cantina:tasa-cambiada';

const formatBs = (valor) => (valor == null ? '—' : Number(valor).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 }));
const formatFecha = (iso) => (iso ? format(new Date(iso), 'dd/MM HH:mm', { locale: es }) : '—');
const mensajeError = (err, fallback) =>
  err?.response?.data?.valor_bs?.[0] || err?.response?.data?.motivo?.[0] || err?.response?.data?.detail || fallback;

// Insignia con la tasa que Cantina aplica hoy (la BCV queda como referencia).
// Quien tenga permiso ve el lápiz para cambiarla; todos ven el historial.
const TasaCantinaBadge = () => {
  const [tasa, setTasa] = useState(null);
  const [modalEditar, setModalEditar] = useState(false);
  const [modalHistorial, setModalHistorial] = useState(false);

  const cargar = useCallback((signal) => {
    getTasaVigenteCantina(signal)
      .then(res => setTasa(res.data))
      .catch(err => {
        if (err?.code === 'ERR_CANCELED') return;
        if (err?.response?.status === 404) setTasa({ sinTasa: true, puede_editar: !!err.response.data?.puede_editar });
        else toast.error('No se pudo cargar la tasa de Cantina.');
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    cargar(controller.signal);
    const alCambiar = () => cargar();
    window.addEventListener(EVENTO_TASA_CAMBIADA, alCambiar);
    return () => {
      controller.abort();
      window.removeEventListener(EVENTO_TASA_CAMBIADA, alCambiar);
    };
  }, [cargar]);

  if (!tasa) return null;

  return (
    <>
      <div className="shrink-0 px-1 lg:px-5 lg:pt-3 lg:w-full">
        <div className="flex items-center gap-1 rounded-xl px-2.5 py-1.5" style={{ background: 'var(--surface-sunken)' }}>
          <div className="min-w-0 flex-1 whitespace-nowrap lg:whitespace-normal">
            {tasa.sinTasa ? (
              <p className="text-xs font-semibold text-[var(--ash)]">Sin tasa registrada</p>
            ) : (
              <>
                <p className="text-xs font-semibold text-[var(--jet)]">
                  Tasa Cantina: Bs. {formatBs(tasa.valor_bs)}
                  <span className="font-normal text-[var(--ash)]"> · desde {formatFecha(tasa.vigente_desde)}</span>
                </p>
                {tasa.bcv_referencia != null && (
                  <p className="text-[11px] text-[var(--ash)]">BCV ref.: Bs. {formatBs(tasa.bcv_referencia)}</p>
                )}
              </>
            )}
          </div>
          <button
            type="button" onClick={() => setModalHistorial(true)}
            aria-label="Ver historial de la tasa" title="Historial de la tasa"
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-[var(--ash)] hover:bg-[var(--border)]"
          >
            <History size={16} />
          </button>
          {tasa.puede_editar && (
            <button
              type="button" onClick={() => setModalEditar(true)}
              aria-label="Cambiar la tasa de Cantina" title="Cambiar la tasa"
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-[var(--pb)] hover:bg-[var(--border)]"
            >
              <Pencil size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Se montan solo abiertos: cada apertura arranca con el estado limpio. */}
      {modalEditar && <ModalCambiarTasa onClose={() => setModalEditar(false)} tasaActual={tasa} />}
      {modalHistorial && <ModalHistorialTasa onClose={() => setModalHistorial(false)} />}
    </>
  );
};

const ModalCambiarTasa = ({ onClose, tasaActual }) => {
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const valorNum = Number(valor);
  const valido = valor !== '' && Number.isFinite(valorNum) && valorNum > 0;

  const guardar = async (e) => {
    e.preventDefault();
    if (!valido || guardando) return;
    setGuardando(true);
    try {
      await cambiarTasaCantina({ valor_bs: valor, motivo: motivo.trim() });
      toast.success('Tasa de Cantina actualizada.');
      window.dispatchEvent(new Event(EVENTO_TASA_CAMBIADA));
      onClose();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo actualizar la tasa.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open onClose={onClose} titulo="Cambiar tasa de Cantina" size="sm"
      footer={
        <>
          <button
            type="button" onClick={onClose}
            className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-lg text-sm border border-[var(--border-md)] text-[var(--jet-mid)]"
          >
            Cancelar
          </button>
          <button
            type="submit" form="form-cambiar-tasa" disabled={!valido || guardando}
            className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'var(--pb)' }}
          >
            {guardando && <Loader2 size={14} className="animate-spin" />}
            Guardar tasa
          </button>
        </>
      }
    >
      <form id="form-cambiar-tasa" onSubmit={guardar} className="space-y-4">
        {!tasaActual.sinTasa && (
          <p className="text-sm text-[var(--jet-mid)]">Tasa actual: Bs. {formatBs(tasaActual.valor_bs)}</p>
        )}
        <div>
          <label htmlFor="tasa-valor" className="block text-xs font-medium text-[var(--jet-mid)] mb-1">Nueva tasa (Bs. por USD)</label>
          <input
            id="tasa-valor" type="number" inputMode="decimal" step="0.0001" min="0.0001" max="99999999.9999"
            value={valor} onChange={e => setValor(e.target.value)} autoFocus required
            className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-[var(--border-md)] text-sm bg-[var(--surface)]"
          />
        </div>
        <div>
          <label htmlFor="tasa-motivo" className="block text-xs font-medium text-[var(--jet-mid)] mb-1">Motivo (opcional)</label>
          <input
            id="tasa-motivo" type="text" maxLength={255} value={motivo} onChange={e => setMotivo(e.target.value)}
            className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-[var(--border-md)] text-sm bg-[var(--surface)]"
          />
        </div>
        <p className="text-xs text-[var(--ash)]">
          El cambio aplica solo a ventas desde ahora; las ventas ya registradas conservan su tasa.
        </p>
      </form>
    </Modal>
  );
};

const ModalHistorialTasa = ({ onClose }) => {
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState(null);
  const cargando = !datos || datos.page !== pagina;

  useEffect(() => {
    const controller = new AbortController();
    getHistorialTasaCantina({ page: pagina, page_size: 10 }, controller.signal)
      .then(res => setDatos(res.data))
      .catch(err => {
        if (err?.code !== 'ERR_CANCELED') toast.error('No se pudo cargar el historial de la tasa.');
      });
    return () => controller.abort();
  }, [pagina]);

  return (
    <Modal
      open onClose={onClose} titulo="Historial de la tasa" size="lg"
      footer={
        <button
          type="button" onClick={onClose}
          className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-lg text-sm border border-[var(--border-md)] text-[var(--jet-mid)]"
        >
          Cerrar
        </button>
      }
    >
      <TablaScroll>
        <table className="w-full text-left text-sm min-w-[560px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-[var(--ash)]">
              <th className="py-2 pr-3">Fecha</th>
              <th className="py-2 pr-3">Anterior</th>
              <th className="py-2 pr-3">Nueva</th>
              <th className="py-2 pr-3">Usuario</th>
              <th className="py-2">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {cargando && !datos ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}><td colSpan={5} className="py-2"><div className="h-6 rounded bg-[var(--surface-sunken)] animate-pulse" /></td></tr>
              ))
            ) : datos?.results?.length ? datos.results.map(f => (
              <tr key={f.id} className="border-t border-[var(--border)]">
                <td className="py-2 pr-3 whitespace-nowrap">{formatFecha(f.vigente_desde)}</td>
                <td className="py-2 pr-3 whitespace-nowrap text-[var(--ash)]">{f.valor_anterior != null ? formatBs(f.valor_anterior) : '—'}</td>
                <td className="py-2 pr-3 whitespace-nowrap font-medium">{formatBs(f.valor_bs)}</td>
                <td className="py-2 pr-3">{f.usuario || '—'}</td>
                <td className="py-2 text-[var(--jet-mid)]">{f.motivo || '—'}</td>
              </tr>
            )) : (
              <tr><td colSpan={5} className="py-8 text-center text-[var(--ash)]">Aún no se ha configurado una tasa propia; se usa la BCV.</td></tr>
            )}
          </tbody>
        </table>
      </TablaScroll>

      {datos && datos.num_pages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-2 text-sm">
          <button
            type="button" disabled={pagina <= 1 || cargando} onClick={() => setPagina(p => p - 1)}
            className="min-h-[44px] px-4 rounded-lg border border-[var(--border-md)] disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-[var(--ash)]">Página {datos.page} de {datos.num_pages}</span>
          <button
            type="button" disabled={pagina >= datos.num_pages || cargando} onClick={() => setPagina(p => p + 1)}
            className="min-h-[44px] px-4 rounded-lg border border-[var(--border-md)] disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      )}
    </Modal>
  );
};

export default TasaCantinaBadge;
