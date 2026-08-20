import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { UserX } from 'lucide-react';
import { getReporteMorosos } from '../../api/cantina.service';
import MorosidadTable from '../../components/cantina/reportes/MorosidadTable';
import AjustarCreditoModal from '../../components/cantina/tarjetas/AjustarCreditoModal';

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '15px' };

// Reporte de morosidad (ReporteMorososView, §contrato GET
// reportes/morosos/?dias_min=N) — tarjetas con saldo negativo, ordenadas por
// días en negativo descendente. Reutiliza AjustarCreditoModal (mismo modal
// que la tabla de tarjetas de CantinaTarjetas.jsx) adaptando el shape de la
// fila del reporte (tarjeta_id, no id) al que espera el modal.
export default function CantinaMorosos() {
  const [diasMinInput, setDiasMinInput] = useState('');
  const [diasMinAplicado, setDiasMinAplicado] = useState('');
  const [count, setCount] = useState(0);
  const [resultados, setResultados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [tarjetaAAjustar, setTarjetaAAjustar] = useState(null);
  const abortRef = useRef(null);

  const cargar = useCallback(() => {
    setCargando(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    getReporteMorosos({ diasMin: diasMinAplicado || undefined }, controller.signal)
      .then(res => {
        setCount(res.data?.count ?? 0);
        setResultados(Array.isArray(res.data?.resultados) ? res.data.resultados : []);
      })
      .catch(err => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error(err.response?.data?.detail || 'No se pudo cargar el reporte de morosos.');
      })
      .finally(() => setCargando(false));
  }, [diasMinAplicado]);

  useEffect(() => {
    cargar();
    return () => abortRef.current?.abort();
  }, [cargar]);

  const handleFiltrar = (e) => {
    e.preventDefault();
    const n = diasMinInput.trim();
    if (n && (Number.isNaN(Number(n)) || Number(n) < 0)) {
      toast.warning('Ingresa un número de días válido (0 o mayor).');
      return;
    }
    setDiasMinAplicado(n);
  };

  const abrirAjustarCredito = (fila) => {
    // El modal espera { id, limite_credito, alumno_nombre, serial, saldo } —
    // mismo shape que TarjetaPrepagoSerializer, adaptado desde la fila del
    // reporte de morosos (que usa tarjeta_id en vez de id).
    setTarjetaAAjustar({
      id: fila.tarjeta_id,
      limite_credito: fila.limite_credito,
      alumno_nombre: fila.alumno_nombre,
      serial: fila.serial,
      saldo: fila.saldo,
    });
  };

  const handleCreditoAjustado = (tarjetaActualizada) => {
    setResultados(prev => prev.map(r => (
      r.tarjeta_id === tarjetaActualizada.id
        ? { ...r, limite_credito: tarjetaActualizada.limite_credito, saldo: tarjetaActualizada.saldo }
        : r
    )));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: 'var(--jet)' }}>
            <UserX size={20} style={{ color: 'var(--pb)' }} />
            Morosos
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
            Tarjetas con saldo negativo, ordenadas por días en negativo.
          </p>
        </div>
      </div>

      <form onSubmit={handleFiltrar} className="flex flex-wrap items-end gap-4 rounded-xl p-4" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Días mínimos en negativo
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={diasMinInput}
            onChange={e => setDiasMinInput(e.target.value)}
            placeholder="Ej. 3"
            className="w-36 px-3 py-2 rounded-lg text-sm outline-none min-h-[40px]"
            style={FIELD_STYLE}
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2.5 rounded-xl text-sm font-medium text-white min-h-[40px]"
          style={{ background: 'var(--pb)' }}
        >
          Filtrar
        </button>
        <p className="text-xs ml-auto" style={{ color: 'var(--ash)' }}>
          {cargando ? 'Cargando…' : `${count} tarjeta${count !== 1 ? 's' : ''} en negativo`}
        </p>
      </form>

      <MorosidadTable
        resultados={resultados}
        cargando={cargando}
        onAjustarCredito={abrirAjustarCredito}
      />

      {tarjetaAAjustar && (
        <AjustarCreditoModal
          tarjeta={tarjetaAAjustar}
          onClose={() => setTarjetaAAjustar(null)}
          onAjustado={handleCreditoAjustado}
        />
      )}
    </div>
  );
}
