import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, HandCoins, Settings2, Ban, Printer, Lock, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import { estadoCuentaCxc } from '../../../api/cantina.service';
import { TablaScroll } from '../../ui/TablaScroll';
import { METODO_LABELS } from '../../../constants/reportes';
import RegistrarAbonoModal from './RegistrarAbonoModal';
import CreditoRepresentanteModal from './CreditoRepresentanteModal';
import AnularAbonoModal from './AnularAbonoModal';
import {
  AREA_LABELS, detalleCargoTexto, fmtUsd, fmtVes, fmtFecha, nombreCompleto, num,
  esCancelacion, mensajeError, abrirReciboAbono,
} from './utilsCxc';

const ESTADO_STYLE = {
  pendiente: { label: 'Pendiente', color: '#b45309', bg: '#fef3c7' },
  pagado: { label: 'Pagado', color: '#16a34a', bg: '#dcfce7' },
  completado: { label: 'Completado', color: '#16a34a', bg: '#dcfce7' },
  anulado: { label: 'Anulado', color: '#6b7280', bg: '#f3f4f6' },
};

const Chip = ({ estado }) => {
  const s = ESTADO_STYLE[estado] || { label: estado || '—', color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ color: s.color, background: s.bg }}>
      {s.label}
    </span>
  );
};

const Skeleton = () => (
  <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando estado de cuenta">
    <div className="h-28 rounded-xl animate-pulse" style={{ background: 'var(--border)' }} />
    <div className="h-10 w-48 rounded-lg animate-pulse" style={{ background: 'var(--border)' }} />
    {[0, 1, 2].map(i => (
      <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'var(--border)' }} />
    ))}
  </div>
);

// Nombre del alumno del cargo: acepta string, objeto o campos planos.
const alumnoDe = (c) => {
  if (c.alumno_nombre) return c.alumno_nombre;
  if (c.alumno && typeof c.alumno === 'object') return nombreCompleto(c.alumno);
  return c.alumno || '—';
};

const metodosDe = (abono) =>
  (abono.lineas || []).map(l => METODO_LABELS[l.metodo_pago] || l.metodo_pago).join(' + ') || '—';

const EstadoCuentaCxc = ({ representanteId, area, tasa, esAdmin, onVolver, onCambio }) => {
  const [data, setData] = useState(null);
  const [saldoTotal, setSaldoTotal] = useState(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [cargadoPara, setCargadoPara] = useState(null);
  const [pestana, setPestana] = useState('cargos');
  const [abonoAbierto, setAbonoAbierto] = useState(false);
  const [creditoAbierto, setCreditoAbierto] = useState(false);
  const [abonoAAnular, setAbonoAAnular] = useState(null);

  const cargar = useCallback((signal) => {
    setErrorCarga(false);
    // El abono se aplica FIFO a toda la deuda: con filtro de área se pide también
    // el saldo total (sin área) para el modal de abono.
    const total = area
      ? estadoCuentaCxc(representanteId, {}, signal).then(res => num(res.data?.saldo_usd))
      : Promise.resolve(null);
    return Promise.all([estadoCuentaCxc(representanteId, { area: area || undefined }, signal), total])
      .then(([res, saldoGlobal]) => {
        setData(res.data);
        setSaldoTotal(saldoGlobal ?? num(res.data?.saldo_usd));
      })
      .catch(async err => {
        if (esCancelacion(err)) return;
        setErrorCarga(true);
        toast.error(await mensajeError(err, 'No se pudo cargar el estado de cuenta.'));
      })
      .finally(() => { if (!signal?.aborted) setCargadoPara(`${representanteId}|${area}`); });
  }, [representanteId, area]);

  useEffect(() => {
    const controller = new AbortController();
    cargar(controller.signal);
    return () => controller.abort();
  }, [cargar]);

  const refrescar = () => {
    cargar();
    onCambio?.();
  };

  const imprimir = async (uuid) => {
    try {
      await abrirReciboAbono(uuid);
    } catch (err) {
      toast.error(await mensajeError(err, 'No se pudo abrir el recibo.'));
    }
  };

  const cargando = cargadoPara !== `${representanteId}|${area}`;
  const rep = data?.representante || {};
  const saldo = num(data?.saldo_usd);
  const bloqueado = Boolean(data?.bloqueado ?? rep.bloqueado);
  const cargos = data?.cargos || [];
  const abonos = data?.abonos || [];
  const saldoVes = data?.saldo_ves_tasa_vigente ?? (tasa > 0 ? saldo * tasa : null);

  const tabBtn = (id, texto, n) => (
    <button
      type="button"
      onClick={() => setPestana(id)}
      className="px-4 py-2 text-sm font-medium min-h-[40px]"
      style={{
        color: pestana === id ? 'var(--pb)' : 'var(--ash)',
        borderBottom: pestana === id ? '2px solid var(--pb)' : '2px solid transparent',
      }}
    >
      {texto} ({n})
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onVolver} className="inline-flex items-center gap-1.5 text-sm self-start min-h-[40px]" style={{ color: 'var(--pb)' }}>
        <ArrowLeft size={16} /> Volver a la lista
      </button>

      {errorCarga && !cargando && (
        <div className="rounded-xl p-6 flex flex-col items-center gap-3 text-center" role="alert" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
          <p className="text-sm" style={{ color: '#dc2626' }}>No se pudo cargar el estado de cuenta.</p>
          <button type="button" onClick={() => { setCargadoPara(null); cargar(); }} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white min-h-[40px] w-full sm:w-auto" style={{ background: 'var(--pb)' }}>
            <RefreshCw size={15} /> Reintentar
          </button>
        </div>
      )}

      {errorCarga ? null : cargando && data?.representante?.id !== representanteId ? <Skeleton /> : data && (
        <>
          <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold break-words" style={{ color: 'var(--jet)' }}>{nombreCompleto(rep)}</h2>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>
                  C.I. {rep.cedula || '—'}{rep.telefono ? ` · ${rep.telefono}` : ''}
                </p>
              </div>
              <div className="sm:text-right">
                <p className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Deuda pendiente</p>
                <p className="text-2xl sm:text-3xl font-bold" style={{ color: saldo > 0 ? '#dc2626' : '#16a34a' }}>{fmtUsd(saldo)}</p>
                {saldoVes != null && <p className="text-xs" style={{ color: 'var(--ash)' }}>{fmtVes(saldoVes)} a tasa vigente</p>}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <p className="text-sm flex items-center gap-1.5" style={{ color: 'var(--jet)' }}>
                Límite de crédito: <strong>{data.limite_usd != null ? fmtUsd(data.limite_usd) : '—'}</strong>
                {bloqueado && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ color: '#dc2626', background: '#fee2e2' }}>
                    <Lock size={11} /> Bloqueado
                  </span>
                )}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:ml-auto sm:gap-3">
                {esAdmin && (
                  <button type="button" onClick={() => setCreditoAbierto(true)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm min-h-[40px] w-full sm:w-auto" style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
                    <Settings2 size={15} /> Límite y bloqueo
                  </button>
                )}
                <button type="button" onClick={() => setAbonoAbierto(true)} disabled={(saldoTotal ?? saldo) <= 0} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white min-h-[40px] w-full sm:w-auto disabled:opacity-60" style={{ background: 'var(--pb)' }}>
                  <HandCoins size={16} /> Registrar abono
                </button>
              </div>
            </div>
          </div>

          <div className="flex" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
            {tabBtn('cargos', 'Cargos', cargos.length)}
            {tabBtn('abonos', 'Abonos', abonos.length)}
          </div>

          {pestana === 'cargos' && (
            cargos.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--ash)' }}>Sin cargos registrados.</p>
            ) : (
              <>
                <ul className="flex flex-col gap-2 md:hidden">
                  {cargos.map(c => (
                    <li key={c.id} className="rounded-xl p-3 flex flex-col gap-1" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs" style={{ color: 'var(--ash)' }}>{fmtFecha(c.creado_en || c.fecha)}</span>
                        <Chip estado={c.estado} />
                      </div>
                      <p className="text-sm" style={{ color: 'var(--jet)' }}>
                        {AREA_LABELS[c.area] || c.area} · {alumnoDe(c)}
                      </p>
                      <p className="text-xs break-words" style={{ color: 'var(--ash)' }}>{detalleCargoTexto(c)}</p>
                      <p className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>
                        {fmtUsd(c.monto_usd)} <span className="font-normal text-xs" style={{ color: 'var(--ash)' }}>· pagado {fmtUsd(c.monto_pagado)}</span>
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="hidden md:block rounded-xl overflow-hidden" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
                  <TablaScroll>
                    <table className="w-full min-w-[680px] text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)', borderBottom: '0.5px solid var(--border-md)' }}>
                          <th className="px-4 py-3 font-medium">Fecha</th>
                          <th className="px-4 py-3 font-medium">Área</th>
                          <th className="px-4 py-3 font-medium">Alumno</th>
                          <th className="px-4 py-3 font-medium">Detalle</th>
                          <th className="px-4 py-3 font-medium text-right">Monto</th>
                          <th className="px-4 py-3 font-medium text-right">Pagado</th>
                          <th className="px-4 py-3 font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cargos.map(c => (
                          <tr key={c.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                            <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--ash)' }}>{fmtFecha(c.creado_en || c.fecha)}</td>
                            <td className="px-4 py-3">{AREA_LABELS[c.area] || c.area}</td>
                            <td className="px-4 py-3">{alumnoDe(c)}</td>
                            <td className="px-4 py-3 max-w-[16rem]" style={{ color: 'var(--ash)' }}>{detalleCargoTexto(c)}</td>
                            <td className="px-4 py-3 text-right font-semibold">{fmtUsd(c.monto_usd)}</td>
                            <td className="px-4 py-3 text-right">{fmtUsd(c.monto_pagado)}</td>
                            <td className="px-4 py-3"><Chip estado={c.estado} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TablaScroll>
                </div>
              </>
            )
          )}

          {pestana === 'abonos' && (
            abonos.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--ash)' }}>Sin abonos registrados.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {abonos.map(a => (
                  <li key={a.operacion_uuid} className="rounded-xl p-3 flex flex-col gap-2" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm" style={{ color: 'var(--jet)' }}>{fmtFecha(a.fecha_pago)}</span>
                      <div className="flex items-center gap-2">
                        {a.es_retroactivo && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ color: '#7c3aed', background: '#ede9fe' }}>Retroactivo</span>
                        )}
                        <Chip estado={a.estatus} />
                      </div>
                    </div>
                    <p className="text-sm break-words" style={{ color: 'var(--ash)' }}>{metodosDe(a)}</p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-base font-semibold" style={{ color: a.estatus === 'anulado' ? 'var(--ash)' : 'var(--jet)', textDecoration: a.estatus === 'anulado' ? 'line-through' : 'none' }}>
                        {fmtUsd(a.total_usd)}
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button type="button" onClick={() => imprimir(a.operacion_uuid)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm min-h-[40px] w-full sm:w-auto" style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
                          <Printer size={15} /> Recibo
                        </button>
                        {esAdmin && a.estatus !== 'anulado' && (
                          <button type="button" onClick={() => setAbonoAAnular(a)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm min-h-[40px] w-full sm:w-auto" style={{ border: '0.5px solid #dc2626', color: '#dc2626' }}>
                            <Ban size={15} /> Anular
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )
          )}

          {abonoAbierto && (
            <RegistrarAbonoModal
              open
              onClose={() => setAbonoAbierto(false)}
              representante={rep}
              saldoUsd={saldoTotal ?? saldo}
              areaFiltrada={Boolean(area)}
              tasaVigente={tasa}
              esAdmin={esAdmin}
              onGuardado={refrescar}
            />
          )}
          {creditoAbierto && (
            <CreditoRepresentanteModal
              open
              onClose={() => setCreditoAbierto(false)}
              representanteId={representanteId}
              limiteUsd={data.limite_usd}
              limitePersonalizado={Boolean(data.limite_personalizado)}
              bloqueado={bloqueado}
              onGuardado={refrescar}
            />
          )}
          {abonoAAnular && (
            <AnularAbonoModal abono={abonoAAnular} onClose={() => setAbonoAAnular(null)} onAnulado={refrescar} />
          )}
        </>
      )}
    </div>
  );
};

export default EstadoCuentaCxc;
