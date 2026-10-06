import { Eye } from 'lucide-react';
import { TablaScroll } from '../../ui/TablaScroll';
import { fmtUsd, fmtVes, nombreCompleto, num } from './utilsCxc';

const DIAS_ALERTA = 7;

const alumnosTexto = (c) =>
  Array.isArray(c.alumnos) && c.alumnos.length
    ? c.alumnos.map(a => (typeof a === 'string' ? a : nombreCompleto(a))).join(', ')
    : '—';

const DiasDeuda = ({ dias }) => {
  if (dias == null) return <span style={{ color: 'var(--ash)' }}>—</span>;
  const alerta = num(dias) > DIAS_ALERTA;
  return (
    <span className="font-medium" style={{ color: alerta ? '#dc2626' : 'var(--jet)' }}>
      {num(dias)} {num(dias) === 1 ? 'día' : 'días'}
    </span>
  );
};

const SkeletonFilas = () => (
  <div className="flex flex-col gap-2" aria-busy="true" aria-label="Cargando cuentas">
    {[0, 1, 2, 3].map(i => (
      <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--border)' }} />
    ))}
  </div>
);

// Lista de cuentas por cobrar: tarjetas en móvil, tabla (TablaScroll) desde md.
const ListaCuentasCxc = ({ cuentas, cargando, tasa, onVer }) => {
  if (cargando) return <SkeletonFilas />;

  if (cuentas.length === 0) {
    return (
      <div
        className="rounded-xl p-8 text-center text-sm"
        style={{ background: '#fff', border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
      >
        No hay cuentas por cobrar con los filtros actuales.
      </div>
    );
  }

  const botonVer = (c) => (
    <button
      type="button"
      onClick={() => onVer(c)}
      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white min-h-[40px] w-full md:w-auto"
      style={{ background: 'var(--pb)' }}
    >
      <Eye size={15} /> Ver cuenta
    </button>
  );

  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {cuentas.map(c => (
          <li
            key={c.id}
            className="rounded-xl p-3 flex flex-col gap-2"
            style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold break-words" style={{ color: 'var(--jet)' }}>
                  {nombreCompleto(c)}
                </p>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>C.I. {c.cedula || '—'}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-base font-bold" style={{ color: num(c.saldo_usd) > 0 ? '#dc2626' : 'var(--jet)' }}>
                  {fmtUsd(c.saldo_usd)}
                </p>
                {tasa > 0 && (
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>{fmtVes(num(c.saldo_usd) * tasa)}</p>
                )}
              </div>
            </div>
            <p className="text-xs break-words" style={{ color: 'var(--ash)' }}>
              Alumnos: {alumnosTexto(c)}
            </p>
            <p className="text-xs" style={{ color: 'var(--ash)' }}>
              Deuda más antigua: <DiasDeuda dias={c.dias_deuda_mas_antigua} />
            </p>
            {botonVer(c)}
          </li>
        ))}
      </ul>

      <div className="hidden md:block rounded-xl overflow-hidden" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
        <TablaScroll>
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)', borderBottom: '0.5px solid var(--border-md)' }}>
                <th className="px-4 py-3 font-medium">Representante</th>
                <th className="px-4 py-3 font-medium">Cédula</th>
                <th className="px-4 py-3 font-medium">Alumnos</th>
                <th className="px-4 py-3 font-medium text-right">Deuda USD</th>
                <th className="px-4 py-3 font-medium text-right">Equiv. Bs.</th>
                <th className="px-4 py-3 font-medium">Días deuda</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {cuentas.map(c => (
                <tr key={c.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--jet)' }}>{nombreCompleto(c)}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--ash)' }}>{c.cedula || '—'}</td>
                  <td className="px-4 py-3 max-w-[16rem]" style={{ color: 'var(--ash)' }}>{alumnosTexto(c)}</td>
                  <td className="px-4 py-3 text-right font-semibold" style={{ color: num(c.saldo_usd) > 0 ? '#dc2626' : 'var(--jet)' }}>
                    {fmtUsd(c.saldo_usd)}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--ash)' }}>
                    {tasa > 0 ? fmtVes(num(c.saldo_usd) * tasa) : '—'}
                  </td>
                  <td className="px-4 py-3"><DiasDeuda dias={c.dias_deuda_mas_antigua} /></td>
                  <td className="px-4 py-3 text-right">{botonVer(c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaScroll>
      </div>
    </>
  );
};

export default ListaCuentasCxc;
