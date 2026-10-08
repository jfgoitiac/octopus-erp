import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, AlertTriangle, Printer, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { Modal } from '../../ui/Modal';
import DatePickerES from '../../DatePickerES';
import MetodoPagoFields from '../MetodoPagoFields';
import { getBancosCantina, registrarAbonoCxc } from '../../../api/cantina.service';
import { useTasaPorFecha } from '../../../hooks/useTasaPorFecha';
import { esBolivares } from '../../../utils/metodosPago';
import { validarMetodoPago } from '../metodoPagoUtils';
import { fechaLocalISO, fmtUsd, fmtVes, num, listaDe, esCancelacion, mensajeError, abrirReciboAbono } from './utilsCxc';

const MOTIVO_MIN = 10;
const DESVIACION_MAX = 0.2;
const TOLERANCIA = 0.005;

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '15px' };

// Una línea = un método de pago. La forma coincide con el payload de
// POST cxc/abonos/ (contrato §3.3), que es también el `value` de MetodoPagoFields.
let secuencia = 0;
const lineaVacia = () => ({
  key: ++secuencia,
  metodo_pago: '',
  monto_usd: '',
  monto_ves: '',
  banco_receptor: '',
  banco_procedencia: '',
  referencia: '',
  numero_lote: '',
});

const redondear = (n) => Math.round(n * 100) / 100;

// Equivalente en USD de una línea con la tasa dada (métodos en Bs. derivan USD).
const usdDeLinea = (linea, tasa) => {
  if (esBolivares(linea.metodo_pago)) {
    return tasa > 0 ? redondear(num(linea.monto_ves) / tasa) : 0;
  }
  return redondear(num(linea.monto_usd));
};

const RegistrarAbonoModal = ({ open, onClose, representante, saldoUsd, areaFiltrada, tasaVigente, esAdmin, onGuardado }) => {
  const [lineas, setLineas] = useState(() => [lineaVacia()]);
  const [bancos, setBancos] = useState([]);
  const [retro, setRetro] = useState(false);
  const [fecha, setFecha] = useState(() => fechaLocalISO(-1));
  const [intentado, setIntentado] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [tasaManual, setTasaManual] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [imprimiendo, setImprimiendo] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    getBancosCantina(controller.signal)
      .then(res => setBancos(listaDe(res.data)))
      .catch(async err => {
        if (esCancelacion(err)) return;
        toast.error(await mensajeError(err, 'No se pudo cargar el catálogo de bancos.'));
      });
    return () => controller.abort();
  }, [open]);

  // Tasa histórica sugerida por la fecha (solo en modo retroactivo).
  const { valor: tasaSugerida, exacta, fechaReal, loading: cargandoTasa } = useTasaPorFecha(retro ? fecha : null);
  const tasaRetro = tasaManual ?? (tasaSugerida != null ? String(tasaSugerida) : '');
  const tasaUsada = retro ? num(tasaRetro) : num(tasaVigente);

  const hayBolivares = lineas.some(l => esBolivares(l.metodo_pago));
  const totalUsd = useMemo(
    () => redondear(lineas.reduce((acc, l) => acc + usdDeLinea(l, tasaUsada), 0)),
    [lineas, tasaUsada],
  );
  const saldo = num(saldoUsd);
  const excede = totalUsd > saldo + TOLERANCIA;
  const restante = redondear(saldo - totalUsd);

  const desviacionAlta = retro && hayBolivares && num(tasaSugerida) > 0 && tasaUsada > 0
    && Math.abs(tasaUsada - num(tasaSugerida)) / num(tasaSugerida) > DESVIACION_MAX;

  const cambiarLinea = (key, nueva) =>
    setLineas(prev => prev.map(l => (l.key === key ? { ...l, ...nueva, key } : l)));

  const quitarLinea = (key) =>
    setLineas(prev => (prev.length > 1 ? prev.filter(l => l.key !== key) : prev));

  // Completa la última línea con lo que falta para cancelar toda la deuda.
  const pagarTodo = () => {
    setLineas(prev => {
      const ultima = prev[prev.length - 1];
      const otros = redondear(prev.slice(0, -1).reduce((acc, l) => acc + usdDeLinea(l, tasaUsada), 0));
      const falta = Math.max(redondear(saldo - otros), 0);
      const nueva = esBolivares(ultima.metodo_pago)
        ? { monto_ves: tasaUsada > 0 ? (falta * tasaUsada).toFixed(2) : '', monto_usd: '' }
        : { monto_usd: falta.toFixed(2), monto_ves: '' };
      return [...prev.slice(0, -1), { ...ultima, ...nueva }];
    });
  };

  const cambiarFecha = (e) => {
    setFecha(e.target.value);
    setTasaManual(null);
  };

  const validar = () => {
    if (saldo <= 0) return 'El representante no tiene deuda pendiente.';
    for (const [i, l] of lineas.entries()) {
      if (!l.metodo_pago) return `Elige el método de pago de la línea ${i + 1}.`;
      if (usdDeLinea(l, tasaUsada) <= 0) return `Indica un monto válido en la línea ${i + 1}.`;
      // Banco, referencia y lote (el monto ya se validó arriba).
      const errores = Object.values(validarMetodoPago(l, { conMonto: false }));
      if (errores.length > 0) return `Línea ${i + 1}: ${errores[0]}`;
    }
    if (excede) return 'El total del abono supera la deuda pendiente.';
    if (retro) {
      if (!fecha || fecha >= fechaLocalISO()) return 'La fecha del pago retroactivo debe ser anterior a hoy.';
      if (hayBolivares && !(tasaUsada > 0)) return 'Indica la tasa aplicada para los pagos en bolívares.';
      if (motivo.trim().length < MOTIVO_MIN) return `Explica el motivo (mínimo ${MOTIVO_MIN} caracteres).`;
    } else if (hayBolivares && !(tasaUsada > 0)) {
      return 'No hay tasa BCV vigente para convertir bolívares.';
    }
    return null;
  };

  const construirPayload = () => {
    const payload = {
      representante_id: representante.id,
      lineas: lineas.map(l => {
        const bs = esBolivares(l.metodo_pago);
        const linea = { metodo_pago: l.metodo_pago };
        if (bs) linea.monto_ves = num(l.monto_ves).toFixed(2);
        else linea.monto_usd = num(l.monto_usd).toFixed(2);
        if (retro && tasaUsada > 0) linea.tasa_aplicada = tasaUsada;
        ['banco_receptor', 'banco_procedencia', 'referencia', 'numero_lote'].forEach(campo => {
          const v = typeof l[campo] === 'string' ? l[campo].trim() : l[campo];
          if (v) linea[campo] = v;
        });
        return linea;
      }),
    };
    if (retro) {
      payload.fecha_pago = fecha;
      payload.motivo = motivo.trim();
    }
    return payload;
  };

  const guardar = async () => {
    setIntentado(true);
    const problema = validar();
    if (problema) {
      toast.warning(problema);
      return;
    }
    setGuardando(true);
    try {
      const res = await registrarAbonoCxc(construirPayload());
      toast.success('Abono registrado correctamente.');
      setResultado({
        uuid: res.data?.operacion_uuid ?? res.data?.operacion?.operacion_uuid ?? null,
        total: totalUsd,
      });
      onGuardado?.(res.data);
    } catch (err) {
      toast.error(await mensajeError(err, 'No se pudo registrar el abono.'));
    } finally {
      setGuardando(false);
    }
  };

  const imprimir = async () => {
    if (!resultado?.uuid) return;
    setImprimiendo(true);
    try {
      await abrirReciboAbono(resultado.uuid);
    } catch (err) {
      toast.error(await mensajeError(err, 'No se pudo abrir el recibo.'));
    } finally {
      setImprimiendo(false);
    }
  };

  // Mientras se guarda, Escape/overlay no cierran el modal.
  const cerrar = () => { if (!guardando) onClose(); };

  const btnSecundario = 'px-4 py-2.5 rounded-xl text-sm min-h-[40px]';
  const nombre = [representante?.nombre, representante?.apellido].filter(Boolean).join(' ');

  // ── Paso final: abono guardado, se ofrece el recibo ──
  if (resultado) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        titulo="Abono registrado"
        size="sm"
        footer={(
          <>
            <button type="button" onClick={onClose} className={btnSecundario} style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
              Cerrar
            </button>
            {resultado.uuid && (
              <button type="button" onClick={imprimir} disabled={imprimiendo} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white min-h-[40px] disabled:opacity-60" style={{ background: 'var(--pb)' }}>
                <Printer size={16} /> {imprimiendo ? 'Abriendo…' : 'Imprimir recibo'}
              </button>
            )}
          </>
        )}
      >
        <div className="flex flex-col items-center gap-2 text-center py-2">
          <CheckCircle2 size={36} style={{ color: 'var(--green)' }} />
          <p className="text-sm" style={{ color: 'var(--jet)' }}>
            Se abonaron <strong>{fmtUsd(resultado.total)}</strong> a la cuenta de {nombre}.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={cerrar}
      titulo="Registrar abono"
      size="lg"
      footer={(
        <>
          <button type="button" onClick={cerrar} className={btnSecundario} style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || excede}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-white min-h-[40px] disabled:opacity-60"
            style={{ background: 'var(--pb)' }}
          >
            {guardando ? 'Guardando…' : `Registrar abono de ${fmtUsd(totalUsd)}`}
          </button>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        {/* Resumen deuda vs total en vivo */}
        <div className="rounded-xl p-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
          <div>
            <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Deuda</p>
            <p className="font-bold" style={{ color: saldo > 0 ? 'var(--red)' : 'var(--jet)' }}>{fmtUsd(saldo)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Total del abono</p>
            <p className="font-bold" style={{ color: excede ? 'var(--red)' : 'var(--jet)' }}>{fmtUsd(totalUsd)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Quedaría</p>
            <p className="font-bold" style={{ color: 'var(--jet)' }}>{fmtUsd(Math.max(restante, 0))}</p>
          </div>
        </div>
        {areaFiltrada && (
          <p className="text-xs flex items-start gap-1" style={{ color: 'var(--amber-ink)' }}>
            <AlertTriangle size={12} className="mt-0.5 shrink-0" /> El abono se aplica a la deuda más antigua, sin importar el área.
          </p>
        )}
        {excede && (
          <p className="text-xs flex items-center gap-1" style={{ color: 'var(--red)' }}>
            <AlertTriangle size={12} /> El total supera la deuda; no se admite saldo a favor.
          </p>
        )}

        {/* Modo retroactivo (solo admin) */}
        {esAdmin && (
          <div className="rounded-xl p-3 flex flex-col gap-3" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer" style={{ color: 'var(--jet)' }}>
              <input type="checkbox" role="switch" checked={retro} onChange={e => setRetro(e.target.checked)} className="h-4 w-4" />
              Pago retroactivo
            </label>
            {retro && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                    Fecha del pago
                  </span>
                  <DatePickerES
                    value={fecha}
                    onChange={cambiarFecha}
                    maxDate={fechaLocalISO(-1)}
                    className="w-full px-3 py-2 rounded-lg outline-none min-h-[40px]"
                    style={FIELD_STYLE}
                  />
                </div>
                <div>
                  <label htmlFor="cxc-tasa-retro" className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                    Tasa aplicada (Bs./$)
                  </label>
                  <input
                    id="cxc-tasa-retro"
                    type="text"
                    inputMode="decimal"
                    value={tasaRetro}
                    onChange={e => setTasaManual(e.target.value.replace(',', '.'))}
                    placeholder={cargandoTasa ? 'Consultando…' : 'Sin tasa registrada'}
                    className="w-full px-3 py-2 rounded-lg outline-none min-h-[40px]"
                    style={FIELD_STYLE}
                  />
                  {!exacta && fechaReal && tasaManual == null && (
                    <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>
                      Sin tasa ese día: se sugiere la del {fechaReal.split('-').reverse().join('/')}.
                    </p>
                  )}
                  {desviacionAlta && (
                    <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--amber-ink)' }}>
                      <AlertTriangle size={11} /> Se desvía más de 20% de la tasa sugerida (Bs. {num(tasaSugerida).toFixed(2)}). Verifica que sea correcta.
                    </p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="cxc-motivo-retro" className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                    Motivo (obligatorio)
                  </label>
                  <textarea
                    id="cxc-motivo-retro"
                    rows={2}
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    placeholder="Por qué se registra este pago con fecha pasada"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={FIELD_STYLE}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Líneas de método */}
        {lineas.map((l, i) => (
          <div key={l.key} className="rounded-xl p-3 flex flex-col gap-3" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--ash)' }}>
                Método {i + 1}
              </p>
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: 'var(--ash)' }}>
                  {usdDeLinea(l, tasaUsada) > 0 && esBolivares(l.metodo_pago)
                    ? `${fmtVes(l.monto_ves)} = ${fmtUsd(usdDeLinea(l, tasaUsada))}`
                    : ''}
                </span>
                {lineas.length > 1 && (
                  <button type="button" onClick={() => quitarLinea(l.key)} aria-label={`Quitar método ${i + 1}`} className="p-1.5 rounded-lg" style={{ color: 'var(--red)' }}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
            <MetodoPagoFields
              value={l}
              onChange={nueva => cambiarLinea(l.key, nueva)}
              bancos={bancos}
              tasa={tasaUsada}
              mostrarErrores={intentado}
              metodosPermitidos={undefined}
            />
          </div>
        ))}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <button
            type="button"
            onClick={() => setLineas(prev => [...prev, lineaVacia()])}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm min-h-[40px] w-full sm:w-auto"
            style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
          >
            <Plus size={15} /> Agregar otro método
          </button>
          <button
            type="button"
            onClick={pagarTodo}
            disabled={saldo <= 0}
            className="inline-flex items-center justify-center px-3 py-2 rounded-xl text-sm font-medium min-h-[40px] w-full sm:w-auto disabled:opacity-60"
            style={{ border: '0.5px solid var(--pb)', color: 'var(--pb)' }}
          >
            Pagar todo ({fmtUsd(saldo)})
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default RegistrarAbonoModal;
