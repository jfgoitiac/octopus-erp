import { AlertOctagon, AlertTriangle, BellOff, BellRing, Info } from 'lucide-react';
import PanelTarjeta, { PanelVacio } from './PanelTarjeta';
import { fmtFecha } from './PanelFormato';

const SEVERIDADES = {
  critica: { Icono: AlertOctagon, color: 'var(--red)', fondo: 'var(--red-light)', texto: 'Crítica' },
  advertencia: { Icono: AlertTriangle, color: 'var(--amber-ink)', fondo: 'var(--yellow-light)', texto: 'Advertencia' },
  info: { Icono: Info, color: 'var(--teal)', fondo: 'var(--teal-light)', texto: 'Info' },
};

// Alertas abiertas y las más recientes (CONTRATO §2); el detalle vive en la bitácora.
const PanelAlertas = ({ alertas }) => {
  const recientes = alertas?.recientes ?? [];
  const abiertas = alertas?.abiertas ?? 0;

  return (
    <PanelTarjeta
      icono={BellRing}
      titulo="Alertas"
      contador={`${abiertas} abierta${abiertas === 1 ? '' : 's'}`}
      enlace={{ to: '/cantina/auditoria/bitacora?tab=alertas', texto: 'Ver alertas' }}
    >
      {recientes.length === 0 ? (
        <PanelVacio icono={BellOff} texto="Sin alertas recientes." />
      ) : (
        <ul className="flex flex-col gap-2">
          {recientes.map((a) => {
            const sev = SEVERIDADES[a.severidad] ?? SEVERIDADES.info;
            return (
              <li key={a.id} className="flex items-start gap-3 rounded-lg p-2.5" style={{ background: 'var(--surface-sunken)' }}>
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: sev.fondo, color: sev.color }}
                >
                  <sev.Icono size={16} aria-label={sev.texto} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm [overflow-wrap:anywhere]" style={{ color: 'var(--jet)', fontWeight: 'var(--fw-medium)' }}>
                    {a.titulo}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>
                    <span style={{ color: sev.color }}>{sev.texto}</span> · {fmtFecha(a.fecha)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PanelTarjeta>
  );
};

export default PanelAlertas;
