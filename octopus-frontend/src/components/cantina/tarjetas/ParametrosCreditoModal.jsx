import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { Loader2, Percent } from 'lucide-react';
import { getParametrosCantina, actualizarParametrosCantina } from '../../../api/cantina.service';
import { Modal } from '../../ui/Modal';

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const LABEL_STYLE = { color: 'var(--ash)' };

function SkeletonCampo() {
  return (
    <div className="animate-pulse">
      <div className="h-3 w-40 rounded mb-2" style={{ background: 'var(--border-md)' }} />
      <div className="h-11 w-full rounded-lg" style={{ background: 'var(--border-md)' }} />
    </div>
  );
}

// Configuración global de crédito/morosidad (parametros/, GET/PUT). El
// límite por defecto solo se aplica a tarjetas NUEVAS al asignarse — NO
// reescribe retroactivamente limite_credito de tarjetas existentes, eso se
// ajusta una por una con AjustarCreditoModal.
export default function ParametrosCreditoModal({ onClose }) {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [limiteDefault, setLimiteDefault] = useState('');
  const [diasAlerta, setDiasAlerta] = useState('');
  const abortRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    getParametrosCantina(controller.signal)
      .then(res => {
        setLimiteDefault(res.data?.limite_credito_default ?? '');
        setDiasAlerta(res.data?.dias_alerta_saldo_negativo ?? '');
      })
      .catch(err => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error(err.response?.data?.detail || 'No se pudieron cargar los parámetros de crédito.');
      })
      .finally(() => setCargando(false));
    return () => controller.abort();
  }, []);

  const validar = () => {
    const n = parseFloat(limiteDefault);
    if (limiteDefault === '' || Number.isNaN(n) || n < 0) {
      toast.warning('Ingresa un límite de crédito válido (0 o mayor).');
      return false;
    }
    if (!/^\d+(,\d+)*$/.test((diasAlerta || '').trim())) {
      toast.warning('Los días de alerta deben ser números separados por comas, ej. 1,3,7.');
      return false;
    }
    return true;
  };

  const handleGuardar = async () => {
    if (!validar()) return;
    if (guardando) return; // evita doble submit

    setGuardando(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const payload = {
        limite_credito_default: parseFloat(limiteDefault).toFixed(2),
        dias_alerta_saldo_negativo: diasAlerta.trim(),
      };
      await actualizarParametrosCantina(payload, controller.signal);
      toast.success('Parámetros de crédito actualizados.');
      onClose();
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      const data = err.response?.data || {};
      const msg = data.detail || data.limite_credito_default?.[0] || data.dias_alerta_saldo_negativo?.[0]
        || 'No se pudieron guardar los parámetros.';
      toast.error(msg);
    } finally {
      setGuardando(false);
    }
  };

  const handleClose = () => { if (!guardando) onClose(); };

  const footer = (
    <>
      <button
        onClick={handleClose}
        disabled={guardando}
        className="w-full sm:w-auto px-4 rounded-xl py-2.5 text-sm min-h-[44px] disabled:opacity-40"
        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
      >
        Cancelar
      </button>
      <button
        onClick={handleGuardar}
        disabled={guardando || cargando}
        className="w-full sm:w-auto px-4 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
        style={{ background: 'var(--pb)' }}
      >
        {guardando ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : 'Guardar'}
      </button>
    </>
  );

  return (
    <Modal
      open
      onClose={handleClose}
      titulo={(
        <>
          <Percent size={17} />
          Crédito por defecto
        </>
      )}
      footer={footer}
      size="sm"
    >
      <p className="text-sm mb-4" style={{ color: 'var(--ash)' }}>
        Este valor se usa como límite de crédito inicial al asignar tarjetas nuevas — no modifica el límite de tarjetas ya asignadas (eso se ajusta individualmente desde la tabla de tarjetas).
      </p>

      {cargando ? (
        <div className="space-y-4">
          <SkeletonCampo />
          <SkeletonCampo />
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>
              Límite de crédito por defecto (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: 'var(--ash)' }}>$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                autoFocus
                className="w-full pl-9 pr-3 py-2 rounded-lg text-sm font-semibold outline-none min-h-[44px]"
                style={FIELD_STYLE}
                value={limiteDefault}
                onChange={e => setLimiteDefault(e.target.value)}
                placeholder="5.00"
                disabled={guardando}
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>
              Días de alerta por saldo negativo
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
              style={FIELD_STYLE}
              value={diasAlerta}
              onChange={e => setDiasAlerta(e.target.value)}
              placeholder="1,3,7"
              disabled={guardando}
            />
            <p className="text-[11px] mt-1" style={LABEL_STYLE}>
              Lista de días (separados por coma) desde que la tarjeta entra en negativo en los que se dispara una alerta. Ej: "1,3,7" avisa al día 1, 3 y 7.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
