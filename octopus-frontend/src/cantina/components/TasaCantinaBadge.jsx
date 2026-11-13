import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { BadgeDollarSign } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  activarTasaPersonalizadaCantina,
  getTasaVigenteCantina,
  restablecerTasaBcvCantina,
} from '../../api/cantina.service';
import { parseApiError } from '../../utils/apiError';
import { guardarCachePos, leerCachePos, valorCachePos } from '../posCache';
import { notificarTasaCantinaCambiada } from '../tasaCantinaEvento';
import TasaPersonalizadaModal from './TasaPersonalizadaModal';

const formatBs = (valor) => (valor == null ? '—' : Number(valor).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 }));
const formatFecha = (iso) => (iso ? format(new Date(iso), 'dd/MM HH:mm', { locale: es }) : '—');

const normalizar = (data) => ({
  ...data,
  personalizada_activa: data?.personalizada_activa ?? data?.fuente === 'manual',
});

async function publicarTasa(data) {
  const vigente = normalizar(data);
  await Promise.all([
    guardarCachePos('tasa-detalle', vigente),
    guardarCachePos('tasa', Number(vigente.valor_bs) || 0),
  ]);
  notificarTasaCantinaCambiada(vigente);
  return vigente;
}

const TasaCantinaBadge = () => {
  const [tasa, setTasa] = useState(null);
  const [puedeGestionar, setPuedeGestionar] = useState(false);
  const [modal, setModal] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      let cacheDisponible = false;
      const registro = await leerCachePos('tasa-detalle');
      let guardada = valorCachePos(registro);
      if (!guardada) {
        const tasaSimple = Number(valorCachePos(await leerCachePos('tasa')));
        if (tasaSimple > 0) guardada = { valor_bs: tasaSimple, fuente: 'bcv' };
      }
      if (!controller.signal.aborted && guardada) {
        cacheDisponible = true;
        setTasa(normalizar(guardada));
      }
      try {
        const res = await getTasaVigenteCantina(controller.signal);
        if (controller.signal.aborted) return;
        const vigente = normalizar(res.data);
        setTasa(vigente);
        setPuedeGestionar(Boolean(res.data?.puede_gestionar));
        await publicarTasa(vigente);
      } catch (err) {
        if (err?.code === 'ERR_CANCELED') return;
        if (err?.response?.status === 404) {
          setTasa({ ...normalizar(err.response.data), sinTasa: true });
          setPuedeGestionar(Boolean(err.response.data?.puede_gestionar));
        }
        else if (!cacheDisponible) toast.error('No se pudo cargar la tasa de Cantina.');
      }
    })();
    return () => controller.abort();
  }, []);

  const abrirModal = () => {
    setError('');
    setModal(tasa?.personalizada_activa ? 'desactivar' : 'activar');
  };

  const cerrarModal = () => {
    if (!guardando) {
      setModal(null);
      setError('');
    }
  };

  const confirmar = async (payload) => {
    if (guardando) return;
    setGuardando(true);
    setError('');
    try {
      const res = modal === 'desactivar'
        ? await restablecerTasaBcvCantina()
        : await activarTasaPersonalizadaCantina(payload);
      const vigente = await publicarTasa(res.data);
      setTasa(vigente);
      setPuedeGestionar(Boolean(res.data?.puede_gestionar ?? puedeGestionar));
      setModal(null);
      toast.success(modal === 'desactivar' ? 'Cantina volvió a usar la tasa BCV.' : 'Tasa personalizada activada.');
    } catch (err) {
      if (err?.response?.status === 403) setPuedeGestionar(false);
      setError(parseApiError(err));
    } finally {
      setGuardando(false);
    }
  };

  if (!tasa) {
    return (
      <div className="shrink-0 px-1 lg:w-full lg:px-5 lg:pt-3" aria-label="Cargando tasa" aria-busy="true">
        <div className="h-9 w-28 animate-pulse rounded-xl bg-[var(--surface-sunken)] lg:w-full" />
      </div>
    );
  }

  const personalizada = Boolean(tasa.personalizada_activa);
  const etiqueta = personalizada ? 'Personalizada' : 'BCV';

  return (
    <>
      <div className="shrink-0 px-1 lg:w-full lg:px-5 lg:pt-3">
        <div className="flex min-h-11 items-center gap-2 rounded-xl bg-[var(--surface-sunken)] px-2.5 py-1.5 lg:flex-wrap">
          <BadgeDollarSign size={16} aria-hidden="true" className={`shrink-0 ${personalizada ? 'text-[var(--amber-ink)]' : 'text-[var(--pb)]'}`} />
          <div className="min-w-0 flex-1 whitespace-nowrap lg:whitespace-normal">
            {tasa.sinTasa ? (
              <p className="text-xs font-semibold text-[var(--ash)]">Sin tasa registrada</p>
            ) : (
              <>
                <p className="text-xs font-semibold tabular-nums text-[var(--jet)]">{etiqueta}: Bs. {formatBs(tasa.valor_bs)}</p>
                {tasa.vigente_desde && <p className="hidden text-xs text-[var(--ash)] lg:block">Desde {formatFecha(tasa.vigente_desde)}</p>}
              </>
            )}
          </div>

          {puedeGestionar && (
            <button
              type="button"
              role="switch"
              aria-checked={personalizada}
              aria-label={personalizada ? 'Desactivar tasa personalizada' : 'Activar tasa personalizada'}
              title={personalizada ? 'Desactivar tasa personalizada' : 'Activar tasa personalizada'}
              onClick={abrirModal}
              className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pb)] lg:px-0"
            >
              <span className="relative h-6 w-11 rounded-full border border-[var(--border-md)] transition-colors" style={{ background: personalizada ? 'var(--pb)' : 'var(--surface)' }} aria-hidden="true">
                <span className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${personalizada ? 'translate-x-[20px]' : 'translate-x-0.5'}`} />
              </span>
              <span className="hidden text-xs font-medium text-[var(--jet-mid)] lg:inline">Personalizada</span>
            </button>
          )}
        </div>
      </div>

      {modal && (
        <TasaPersonalizadaModal
          open
          modo={modal}
          tasa={tasa}
          guardando={guardando}
          error={error}
          onClose={cerrarModal}
          onConfirmar={confirmar}
        />
      )}
    </>
  );
};

export default TasaCantinaBadge;
