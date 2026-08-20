import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { CreditCard, ScanLine, AlertTriangle, Layers, Wallet, Percent } from 'lucide-react';
import GenerarLoteModal from '../../components/cantina/tarjetas/GenerarLoteModal';
import AsignarTarjetaModal from '../../components/cantina/tarjetas/AsignarTarjetaModal';
import ReponerTarjetaModal from '../../components/cantina/tarjetas/ReponerTarjetaModal';
import RecargaCajeroModal from '../../components/cantina/tarjetas/RecargaCajeroModal';
import RecargasPendientesList from '../../components/cantina/tarjetas/RecargasPendientesList';
import ParametrosCreditoModal from '../../components/cantina/tarjetas/ParametrosCreditoModal';
import AjustarCreditoModal from '../../components/cantina/tarjetas/AjustarCreditoModal';
import TarjetasTable from '../../components/cantina/tarjetas/TarjetasTable';
import { getTarjetas } from '../../api/cantina.service';

// Fase 2 de cantina.md (§7.3bis): pantalla desktop-first con las tres
// acciones del ciclo de vida de la tarjeta QR, más el panel de configuración
// de crédito por defecto y el listado general de tarjetas (Fase 3,
// TarjetasListView) que ahora sí existe, mínimo, para poder ajustar el
// límite de crédito por fila.
const ACCIONES = [
  {
    key: 'generar',
    icon: Layers,
    titulo: 'Generar lote de tarjetas',
    descripcion: 'Crea N tarjetas nuevas sin asignar y descarga un .zip con los QR listos para imprimir.',
    color: 'var(--pb)',
    bg: 'var(--pb-light, #e6f7f9)',
  },
  {
    key: 'asignar',
    icon: ScanLine,
    titulo: 'Asignar tarjeta',
    descripcion: 'Escanea o busca por serial una tarjeta sin asignar y vincúlala a un alumno por la cédula de su representante.',
    color: 'var(--pb)',
    bg: 'var(--pb-light, #e6f7f9)',
  },
  {
    key: 'reponer',
    icon: AlertTriangle,
    titulo: 'Reponer tarjeta extraviada/dañada',
    descripcion: 'Genera un nuevo código para una tarjeta activa, conservando el saldo. El código físico anterior queda inválido.',
    color: '#b45309',
    bg: '#fef3c7',
  },
  {
    key: 'recargar',
    icon: Wallet,
    titulo: 'Recargar tarjeta',
    descripcion: 'Acredita saldo en caja: efectivo USD/VES, o transferencia/pago móvil/zelle si el representante paga presente. Aprobación instantánea.',
    color: '#0f766e',
    bg: '#ccfbf1',
  },
  {
    key: 'parametros',
    icon: Percent,
    titulo: 'Crédito por defecto',
    descripcion: 'Configura el límite de crédito inicial de tarjetas nuevas y los días de alerta por saldo negativo.',
    color: '#7c3aed',
    bg: '#ede9fe',
  },
];

export default function CantinaTarjetas() {
  const [modalActivo, setModalActivo] = useState(null); // 'generar' | 'asignar' | 'reponer' | 'recargar' | 'parametros' | null
  const [tarjetaAReponer, setTarjetaAReponer] = useState(null);
  const [tarjetaAAjustar, setTarjetaAAjustar] = useState(null);
  const [refreshPendientes, setRefreshPendientes] = useState(0);

  const [tarjetas, setTarjetas] = useState([]);
  const [cargandoTarjetas, setCargandoTarjetas] = useState(true);
  const abortRef = useRef(null);

  const cargarTarjetas = useCallback(() => {
    setCargandoTarjetas(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    getTarjetas(undefined, controller.signal)
      .then(res => setTarjetas(Array.isArray(res.data) ? res.data : res.data?.results || []))
      .catch(err => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error(err.response?.data?.detail || 'No se pudo cargar el listado de tarjetas.');
      })
      .finally(() => setCargandoTarjetas(false));
  }, []);

  useEffect(() => {
    cargarTarjetas();
    return () => abortRef.current?.abort();
  }, [cargarTarjetas]);

  const abrirReponer = (tarjeta) => {
    setTarjetaAReponer(tarjeta || null);
    setModalActivo('reponer');
  };

  const cerrarModal = () => {
    setModalActivo(null);
    setTarjetaAReponer(null);
    setTarjetaAAjustar(null);
  };

  // Actualiza la fila local con la respuesta del PATCH — no hace falta
  // refetch completo del listado.
  const handleCreditoAjustado = (tarjetaActualizada) => {
    setTarjetas(prev => prev.map(t => (t.id === tarjetaActualizada.id ? tarjetaActualizada : t)));
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: 'var(--jet)' }}>
          <CreditCard size={20} style={{ color: 'var(--pb)' }} />
          Tarjetas de Cantina
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
          Provisioning, asignación, reposición y crédito de tarjetas prepago QR.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ACCIONES.map(({ key, icon: Icon, titulo, descripcion, color, bg }) => (
          <button
            key={key}
            onClick={() => (key === 'reponer' ? abrirReponer(null) : setModalActivo(key))}
            className="text-left rounded-2xl p-5 flex flex-col gap-3 transition-transform hover:-translate-y-0.5"
            style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{ background: bg, color }}
            >
              <Icon size={20} />
            </div>
            <div>
              <h2 className="font-semibold text-sm" style={{ color: 'var(--jet)' }}>{titulo}</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>{descripcion}</p>
            </div>
          </button>
        ))}
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--jet)' }}>Listado de tarjetas</h2>
        <TarjetasTable
          tarjetas={tarjetas}
          cargando={cargandoTarjetas}
          onAjustarCredito={(t) => { setTarjetaAAjustar(t); setModalActivo('ajustar-credito'); }}
        />
      </div>

      <RecargasPendientesList refreshSignal={refreshPendientes} />

      {modalActivo === 'generar' && (
        <GenerarLoteModal onClose={cerrarModal} />
      )}

      {modalActivo === 'asignar' && (
        <AsignarTarjetaModal
          onClose={cerrarModal}
          onAsignada={() => { cerrarModal(); cargarTarjetas(); }}
          onSugerirReponer={(tarjeta) => abrirReponer(tarjeta)}
        />
      )}

      {modalActivo === 'reponer' && (
        <ReponerTarjetaModal
          tarjetaInicial={tarjetaAReponer}
          onClose={cerrarModal}
          onRepuesta={() => { cerrarModal(); cargarTarjetas(); }}
        />
      )}

      {modalActivo === 'recargar' && (
        <RecargaCajeroModal
          onClose={cerrarModal}
          onRecargada={() => setRefreshPendientes(n => n + 1)}
        />
      )}

      {modalActivo === 'parametros' && (
        <ParametrosCreditoModal onClose={cerrarModal} />
      )}

      {modalActivo === 'ajustar-credito' && tarjetaAAjustar && (
        <AjustarCreditoModal
          tarjeta={tarjetaAAjustar}
          onClose={cerrarModal}
          onAjustado={handleCreditoAjustado}
        />
      )}
    </div>
  );
}
