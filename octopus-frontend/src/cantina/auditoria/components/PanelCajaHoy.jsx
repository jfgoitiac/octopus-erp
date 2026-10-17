import { CheckCircle2, LockOpen, Wallet } from 'lucide-react';
import PanelTarjeta from './PanelTarjeta';
import { fmtUsd, fmtUsdConSigno, tonoDiferencia } from './PanelFormato';

const Cifra = ({ etiqueta, valor }) => (
  <div className="min-w-0 rounded-lg p-3" style={{ background: 'var(--surface-sunken)' }}>
    <p className="text-xs" style={{ color: 'var(--ash)' }}>{etiqueta}</p>
    <p className="truncate text-base tabular-nums sm:text-lg" style={{ color: 'var(--jet)', fontWeight: 'var(--fw-semibold)' }}>
      {valor}
    </p>
  </div>
);

const Contador = ({ icono: Icono, valor, texto }) => (
  <div className="flex min-w-0 items-center gap-2 text-sm" style={{ color: 'var(--jet-mid)' }}>
    <Icono size={15} aria-hidden="true" style={{ color: 'var(--pb-mid)' }} />
    <span className="tabular-nums" style={{ color: 'var(--jet)', fontWeight: 'var(--fw-semibold)' }}>{valor}</span>
    <span className="truncate">{texto}</span>
  </div>
);

// Caja de hoy: esperado vs. reportado (conteo físico) y su diferencia.
const PanelCajaHoy = ({ caja }) => {
  const tono = tonoDiferencia(caja?.diferencia_usd);
  const abiertas = caja?.cajas_abiertas ?? 0;
  const cierres = caja?.cierres_realizados ?? 0;

  return (
    <PanelTarjeta icono={Wallet} titulo="Caja de hoy" subtitulo="Esperado vs. conteo físico de los cierres del día">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Cifra etiqueta="Esperado" valor={fmtUsd(caja?.esperado_usd)} />
        <Cifra etiqueta="Reportado" valor={fmtUsd(caja?.reportado_usd)} />
      </div>
      <div
        className="flex flex-col gap-1 rounded-lg p-3 sm:flex-row sm:items-center sm:justify-between"
        style={{ background: tono.fondo, color: tono.color }}
      >
        <span className="text-sm" style={{ fontWeight: 'var(--fw-medium)' }}>Diferencia · {tono.etiqueta}</span>
        <span className="text-xl tabular-nums" style={{ fontWeight: 'var(--fw-semibold)' }}>
          {fmtUsdConSigno(caja?.diferencia_usd)}
        </span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-5">
        <Contador icono={LockOpen} valor={abiertas} texto={abiertas === 1 ? 'caja abierta' : 'cajas abiertas'} />
        <Contador icono={CheckCircle2} valor={cierres} texto={cierres === 1 ? 'cierre realizado' : 'cierres realizados'} />
      </div>
    </PanelTarjeta>
  );
};

export default PanelCajaHoy;
