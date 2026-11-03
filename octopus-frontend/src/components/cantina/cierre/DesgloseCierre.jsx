import {
  Ban, Banknote, Coins, CreditCard, FileClock, Globe, HandCoins, Landmark,
  Send, ShoppingCart, Smartphone, Wallet, WalletCards,
} from 'lucide-react';
import TarjetaCierre from './TarjetaCierre';
import { formatoUsd, metodosConDinero, tarjetasDeOrigen, totalRecibidoUsd } from './calculosCierre';

const ICONO_METODO = {
  efectivo: Banknote,
  efectivo_ves: Coins,
  pago_movil: Smartphone,
  punto_de_venta: CreditCard,
  transferencia: Landmark,
  zelle: Send,
};

const ICONO_ORIGEN = {
  ventas: ShoppingCart,
  recargas_cobradas: WalletCards,
  consumo_recargas: CreditCard,
  abonos: HandCoins,
  cargado_a_cuenta: FileClock,
  anuladas: Ban,
  recargas_portal: Globe,
};

function Seccion({ titulo, resumen, children }) {
  return (
    <section className="flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--jet)' }}>{titulo}</h2>
        {resumen}
      </div>
      {children}
    </section>
  );
}

export function DineroRecibido({ totales }) {
  const metodos = metodosConDinero(totales);
  return (
    <Seccion
      titulo="Dinero recibido"
      resumen={metodos.length > 0 && (
        <p className="text-sm tabular-nums" style={{ color: 'var(--jet-mid)' }}>
          Total <span className="text-base font-semibold" style={{ color: 'var(--jet)' }}>{formatoUsd(totalRecibidoUsd(metodos))}</span>
        </p>
      )}
    >
      {metodos.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--jet-mid)' }}>Esta caja todavía no ha recibido dinero.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {metodos.map((m) => (
            <TarjetaCierre
              key={m.metodo}
              icono={ICONO_METODO[m.metodo] ?? Wallet}
              titulo={m.etiqueta}
              cifra={m.cifra}
              equivalente={m.equivalente}
              detalle={m.destino}
            />
          ))}
        </div>
      )}
    </Seccion>
  );
}

export function OrigenCierre({ cierre }) {
  const tarjetas = tarjetasDeOrigen(cierre);
  if (tarjetas.length === 0) return null;
  return (
    <Seccion titulo="De dónde salió">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tarjetas.map((t) => (
          <TarjetaCierre
            key={t.id}
            icono={ICONO_ORIGEN[t.id]}
            titulo={t.titulo}
            cifra={t.cifra}
            detalle={t.detalle}
            pie={t.operaciones}
          />
        ))}
      </div>
    </Seccion>
  );
}
