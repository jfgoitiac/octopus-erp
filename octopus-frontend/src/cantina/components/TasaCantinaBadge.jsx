import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'react-toastify';
import { getTasaVigenteCantina } from '../../api/cantina.service';
import { guardarCachePos, leerCachePos, valorCachePos } from '../posCache';

const formatBs = (valor) => (valor == null ? '—' : Number(valor).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 }));
const formatFecha = (iso) => (iso ? format(new Date(iso), 'dd/MM HH:mm', { locale: es }) : '—');

// Insignia con la tasa BCV que Cantina aplica hoy, la misma de cobranza.
const TasaCantinaBadge = () => {
  const [tasa, setTasa] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      let cacheDisponible = false;
      const registro = await leerCachePos('tasa-detalle');
      let guardada = valorCachePos(registro);
      if (!guardada) {
        const tasaSimple = Number(valorCachePos(await leerCachePos('tasa')));
        if (tasaSimple > 0) guardada = { valor_bs: tasaSimple };
      }
      if (!controller.signal.aborted && guardada) {
        cacheDisponible = true;
        setTasa(guardada);
      }
      try {
        const res = await getTasaVigenteCantina(controller.signal);
        setTasa(res.data);
        guardarCachePos('tasa-detalle', res.data);
      } catch (err) {
        if (err?.code === 'ERR_CANCELED') return;
        if (err?.response?.status === 404) setTasa({ sinTasa: true });
        else if (!cacheDisponible) toast.error('No se pudo cargar la tasa BCV.');
      }
    })();
    return () => controller.abort();
  }, []);

  if (!tasa) return null;

  return (
    <div className="shrink-0 px-1 lg:px-5 lg:pt-3 lg:w-full">
      <div className="rounded-xl px-2.5 py-1.5 whitespace-nowrap lg:whitespace-normal" style={{ background: 'var(--surface-sunken)' }}>
        {tasa.sinTasa ? (
          <p className="text-xs font-semibold text-[var(--ash)]">Sin tasa BCV registrada</p>
        ) : (
          <p className="text-xs font-semibold text-[var(--jet)]">
            Tasa BCV: Bs. {formatBs(tasa.valor_bs)}
            {tasa.vigente_desde && (
              <span className="font-normal text-[var(--ash)]"> · desde {formatFecha(tasa.vigente_desde)}</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
};

export default TasaCantinaBadge;
