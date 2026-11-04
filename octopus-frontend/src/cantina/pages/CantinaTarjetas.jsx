import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'react-toastify';
import { CreditCard, AlertTriangle, Layers, Percent, Search } from 'lucide-react';
import ConsultarSaldoModal from '../../components/cantina/tarjetas/ConsultarSaldoModal';
import GenerarLoteModal from '../../components/cantina/tarjetas/GenerarLoteModal';
import ReponerTarjetaModal from '../../components/cantina/tarjetas/ReponerTarjetaModal';
import ParametrosCreditoModal from '../../components/cantina/tarjetas/ParametrosCreditoModal';
import AjustarCreditoModal from '../../components/cantina/tarjetas/AjustarCreditoModal';
import TarjetasTable from '../../components/cantina/tarjetas/TarjetasTable';
import GestionQrPanel from '../../components/cantina/tarjetas/GestionQrPanel';
import { getTarjetas } from '../../api/cantina.service';

// La operación diaria de asignación/recarga vive en GestionQrPanel. Estas
// acciones quedan como herramientas administrativas complementarias.
const ACCIONES = [
  {
    key: 'generar',
    icon: Layers,
    titulo: 'Generar lote de tarjetas',
    descripcion: 'Crea N tarjetas nuevas sin asignar y descarga un .zip con los QR listos para imprimir.',
    color: 'var(--pb)',
    bg: 'var(--pb-light)',
  },
  {
    key: 'consultar',
    icon: Search,
    titulo: 'Consultar saldo',
    descripcion: 'Escanea la tarjeta o busca al alumno para ver su saldo, límite de crédito y lo disponible para gastar.',
    color: 'var(--teal)',
    bg: 'var(--teal-light)',
  },
  {
    key: 'reponer',
    icon: AlertTriangle,
    titulo: 'Reponer tarjeta extraviada/dañada',
    descripcion: 'Genera un nuevo código para una tarjeta activa, conservando el saldo. El código físico anterior queda inválido.',
    color: 'var(--amber-ink)',
    bg: 'var(--yellow-light)',
  },
  {
    key: 'parametros',
    icon: Percent,
    titulo: 'Crédito por defecto',
    descripcion: 'Configura el límite de crédito inicial de tarjetas nuevas y los días de alerta por saldo negativo.',
    color: 'var(--violet)',
    bg: 'var(--violet-light)',
  },
];

export default function CantinaTarjetas() {
  const [modalActivo, setModalActivo] = useState(null); // 'generar' | 'consultar' | 'reponer' | 'parametros' | 'ajustar-credito' | null
  const [tarjetaAReponer, setTarjetaAReponer] = useState(null);
  const [tarjetaAAjustar, setTarjetaAAjustar] = useState(null);
  const [tarjetas, setTarjetas] = useState([]);
  const [cargandoTarjetas, setCargandoTarjetas] = useState(true);
  const abortRef = useRef(null);

  const resumenTarjetas = useMemo(() => {
    const total = tarjetas.length;
    const sinAsignar = tarjetas.filter(t => t.estado === 'sin_asignar').length;
    const asignadas = total - sinAsignar;
    return { total, asignadas, sinAsignar };
  }, [tarjetas]);

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
    const controller = new AbortController();
    abortRef.current = controller;
    getTarjetas(undefined, controller.signal)
      .then(res => setTarjetas(Array.isArray(res.data) ? res.data : res.data?.results || []))
      .catch(err => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        toast.error(err.response?.data?.detail || 'No se pudo cargar el listado de tarjetas.');
      })
      .finally(() => setCargandoTarjetas(false));
    return () => controller.abort();
  }, []);

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

      <GestionQrPanel
        onOperacionCompletada={cargarTarjetas}
        onReponer={abrirReponer}
      />

      <div>
        <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--jet)' }}>Otras acciones</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
      </div>

      <div>
        <div className="flex flex-col gap-3 mb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Listado de tarjetas</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                Consulta y organiza el inventario de tarjetas emitidas.
              </p>
            </div>
          </div>

          <div
            className="rounded-2xl p-4 sm:p-5"
            style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}
            aria-label="Resumen de tarjetas"
          >
            <div className="grid grid-cols-3 gap-3 sm:gap-6 mb-3">
              {[
                { etiqueta: 'Total', valor: resumenTarjetas.total, color: 'var(--jet)' },
                { etiqueta: 'Asignadas', valor: resumenTarjetas.asignadas, color: 'var(--pb)' },
                { etiqueta: 'Sin asignar', valor: resumenTarjetas.sinAsignar, color: 'var(--amber-ink)' },
              ].map(item => (
                <div key={item.etiqueta} className="min-w-0">
                  <p className="text-[11px] sm:text-xs font-medium truncate" style={{ color: 'var(--ash)' }}>
                    {item.etiqueta}
                  </p>
                  <p className="text-xl sm:text-2xl font-semibold leading-tight mt-0.5" style={{ color: item.color }}>
                    {cargandoTarjetas ? '—' : item.valor.toLocaleString('es-VE')}
                  </p>
                </div>
              ))}
            </div>

            <div
              className="h-2.5 rounded-full overflow-hidden flex"
              style={{ background: 'var(--porcelain)' }}
              role="img"
              aria-label={`${resumenTarjetas.asignadas} tarjetas asignadas y ${resumenTarjetas.sinAsignar} sin asignar`}
            >
              {resumenTarjetas.total > 0 && (
                <>
                  <div
                    style={{
                      width: `${(resumenTarjetas.asignadas / resumenTarjetas.total) * 100}%`,
                      background: 'linear-gradient(90deg, var(--pb), var(--pb-mid))',
                    }}
                  />
                  <div
                    style={{
                      width: `${(resumenTarjetas.sinAsignar / resumenTarjetas.total) * 100}%`,
                      background: 'var(--yellow)',
                    }}
                  />
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[11px]" style={{ color: 'var(--ash)' }}>
              <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-[var(--pb)]" /> Asignadas</span>
              <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-[var(--yellow)]" /> Sin asignar</span>
            </div>
          </div>
        </div>
        <TarjetasTable
          tarjetas={tarjetas}
          cargando={cargandoTarjetas}
          onAjustarCredito={(t) => { setTarjetaAAjustar(t); setModalActivo('ajustar-credito'); }}
        />
      </div>

      {modalActivo === 'generar' && (
        <GenerarLoteModal onClose={cerrarModal} />
      )}

      {modalActivo === 'consultar' && <ConsultarSaldoModal onClose={cerrarModal} />}

      {modalActivo === 'reponer' && (
        <ReponerTarjetaModal
          tarjetaInicial={tarjetaAReponer}
          onClose={cerrarModal}
          onRepuesta={() => { cerrarModal(); cargarTarjetas(); }}
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
