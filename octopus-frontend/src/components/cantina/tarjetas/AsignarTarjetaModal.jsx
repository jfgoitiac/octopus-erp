import { useState, useRef } from 'react';
import { toast } from 'react-toastify';
import { Loader2, ScanLine, Search, UserRound, AlertTriangle, CheckCircle2, ArrowLeft, GraduationCap, BriefcaseBusiness } from 'lucide-react';
import {
  buscarTarjetaSinAsignar, buscarRepresentantePorCedula, asignarTarjeta,
} from '../../../api/cantina.service';
import { Modal } from '../../ui/Modal';
import BuscadorRepresentanteCxc from '../cxc/BuscadorRepresentanteCxc';
import { nombreCompleto, TIPO_LABELS } from '../cxc/utilsCxc';

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const LABEL_STYLE = { color: 'var(--ash)' };

const TIPOS_TITULAR = [
  { value: 'alumno', label: 'Alumno', Icono: GraduationCap },
  { value: 'cliente', label: 'Otra persona', Icono: BriefcaseBusiness },
];

// El QR codifica siempre el `codigo` con prefijo CANT- (§5.1 cantina.md); el
// `serial` humano es alfanumérico tipo L003-0001. Se detecta automáticamente
// para no obligar al cajero/admin a elegir un modo de búsqueda aparte.
function esCodigoQR(valor) {
  return /CANT-/i.test(valor);
}

export default function AsignarTarjetaModal({ onClose, onAsignada, onSugerirReponer }) {
  const [paso, setPaso] = useState(1);

  // Paso 1
  const [entradaTarjeta, setEntradaTarjeta] = useState('');
  const [buscandoTarjeta, setBuscandoTarjeta] = useState(false);
  const [tarjeta, setTarjeta] = useState(null);
  const [errorTarjeta, setErrorTarjeta] = useState('');

  // Paso 2 — alumno (vía cédula del representante) u otra persona de CxC
  const [tipoTitular, setTipoTitular] = useState('alumno');
  const [cliente, setCliente] = useState(null);
  const [cedula, setCedula] = useState('');
  const [buscandoRep, setBuscandoRep] = useState(false);
  const [representante, setRepresentante] = useState(null);
  const [errorRep, setErrorRep] = useState('');

  // Paso 3
  const [alumnoId, setAlumnoId] = useState('');
  const [asignando, setAsignando] = useState(false);
  const [conflicto, setConflicto] = useState(null); // { detail, tarjeta_existente_id }

  const abortRef = useRef(null);

  const handleBuscarTarjeta = async () => {
    const valor = entradaTarjeta.trim();
    if (!valor) {
      toast.warning('Escanea el código QR o escribe el serial de la tarjeta.');
      return;
    }
    setBuscandoTarjeta(true);
    setErrorTarjeta('');
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const query = esCodigoQR(valor) ? { codigo: valor } : { serial: valor };
      const res = await buscarTarjetaSinAsignar(query, controller.signal);
      setTarjeta(res.data);
      setPaso(2);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      if (err.response?.data?.detail) {
        setErrorTarjeta(err.response.data.detail);
      } else if (err.response?.status === 404) {
        setErrorTarjeta('No se encontró ninguna tarjeta sin asignar con ese código/serial.');
      } else {
        setErrorTarjeta('Esa tarjeta ya está asignada o no está disponible.');
      }
    } finally {
      setBuscandoTarjeta(false);
    }
  };

  const handleBuscarRepresentante = async () => {
    const valor = cedula.trim();
    if (!valor) {
      toast.warning('Ingresa la cédula del representante.');
      return;
    }
    setBuscandoRep(true);
    setErrorRep('');
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await buscarRepresentantePorCedula(valor, controller.signal);
      const data = res.data;
      if (!data?.alumnos?.length) {
        setErrorRep('El representante no tiene alumnos inscritos.');
        return;
      }
      setRepresentante(data);
      setPaso(3);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      if (err.response?.status === 404) {
        setErrorRep('No se encontró ningún representante con esa cédula.');
      } else {
        setErrorRep(err.response?.data?.detail || 'Error al buscar el representante.');
      }
    } finally {
      setBuscandoRep(false);
    }
  };

  const esCliente = tipoTitular === 'cliente';
  const PASOS = [
    { n: 1, label: 'Tarjeta' },
    { n: 2, label: 'Titular' },
    { n: 3, label: esCliente ? 'Confirmar' : 'Alumno' },
  ];

  const elegirCliente = (c) => {
    if (c.activo === false) {
      toast.warning(`${nombreCompleto(c)} está inactivo; actívalo en Cuentas por Cobrar antes de asignarle una tarjeta.`);
      return;
    }
    setCliente(c);
    setPaso(3);
  };

  const handleConfirmarAsignacion = async () => {
    if (!esCliente && !alumnoId) {
      toast.warning('Selecciona el alumno al que se le entregará la tarjeta.');
      return;
    }
    setAsignando(true);
    setConflicto(null);
    try {
      await asignarTarjeta(tarjeta.id, esCliente ? { cliente_id: cliente.id } : { alumno_id: alumnoId });
      toast.success('Tarjeta asignada correctamente.');
      onAsignada?.();
      onClose();
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      if (err.response?.status === 409) {
        const data = err.response.data || {};
        setConflicto({
          detail: data.detail || 'Esta persona ya tiene una tarjeta activa.',
          tarjeta_existente_id: data.tarjeta_existente_id,
        });
      } else {
        toast.error(err.response?.data?.detail || 'No se pudo asignar la tarjeta.');
      }
    } finally {
      setAsignando(false);
    }
  };

  const alumnoSeleccionado = representante?.alumnos?.find(a => String(a.id) === String(alumnoId));
  const nombreTitular = esCliente ? nombreCompleto(cliente) : (alumnoSeleccionado && nombreCompleto(alumnoSeleccionado));

  const footer = (
    <>
      <button
        onClick={onClose}
        className="w-full sm:w-auto px-4 rounded-xl py-2.5 text-sm min-h-[44px]"
        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
      >
        Cancelar
      </button>
      {paso === 3 && (
        <button
          onClick={handleConfirmarAsignacion}
          disabled={asignando || (!esCliente && !alumnoId)}
          className="w-full sm:w-auto px-4 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
          style={{ background: 'var(--pb)' }}
        >
          {asignando ? <><Loader2 size={14} className="animate-spin" /> Asignando...</> : 'Confirmar asignación'}
        </button>
      )}
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      titulo={(
        <>
          <ScanLine size={17} />
          Asignar tarjeta
        </>
      )}
      footer={footer}
      size="md"
    >
      {/* Indicador de pasos */}
      <div className="flex items-center gap-1.5 sm:gap-2 mb-4">
        {PASOS.map((p, i) => (
          <div key={p.n} className="flex items-center gap-2 flex-1">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
              style={
                paso >= p.n
                  ? { background: 'var(--pb)', color: '#fff' }
                  : { background: 'var(--porcelain)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }
              }
            >
              {p.n}
            </div>
            <span className="text-xs font-medium truncate" style={{ color: paso >= p.n ? 'var(--jet)' : 'var(--ash)' }}>
              {p.label}
            </span>
            {i < PASOS.length - 1 && <div className="flex-1 h-px" style={{ background: 'var(--border-md)' }} />}
          </div>
        ))}
      </div>

      {/* Paso 1 — buscar tarjeta */}
      {paso === 1 && (
        <div className="space-y-3">
          <label htmlFor="asignartarjetamodal-codigo-qr-o-serial-de-la-tar" className="block text-xs uppercase tracking-widest" style={LABEL_STYLE}>
            Código QR o serial de la tarjeta
          </label>
          <div className="flex gap-2">
            <input id="asignartarjetamodal-codigo-qr-o-serial-de-la-tar"
              autoFocus
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
              style={FIELD_STYLE}
              value={entradaTarjeta}
              onChange={e => { setEntradaTarjeta(e.target.value); setErrorTarjeta(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleBuscarTarjeta(); }}
              placeholder="CANT-7K9M2XQPRT o L003-0007"
            />
            <button
              onClick={handleBuscarTarjeta}
              disabled={buscandoTarjeta}
              className="px-4 rounded-xl text-sm font-medium text-white flex items-center gap-1.5 disabled:opacity-50 min-h-[44px]"
              style={{ background: 'var(--pb)' }}
            >
              {buscandoTarjeta ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Buscar
            </button>
          </div>
          {errorTarjeta && (
            <p className="text-sm flex items-center gap-1.5" style={{ color: 'var(--red)' }}>
              <AlertTriangle size={14} /> {errorTarjeta}
            </p>
          )}
        </div>
      )}

      {/* Paso 2 — buscar representante */}
      {paso === 2 && (
        <div className="space-y-3">
          <div className="rounded-lg px-3 py-2 text-sm flex items-center gap-2" style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
            <CheckCircle2 size={16} />
            Tarjeta {tarjeta?.serial} lista para asignar.
          </div>

          <div role="radiogroup" aria-label="Tipo de titular" className="grid grid-cols-2 gap-2">
            {TIPOS_TITULAR.map(({ value, label, Icono }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={tipoTitular === value}
                onClick={() => { setTipoTitular(value); setErrorRep(''); }}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium min-h-[44px]"
                style={
                  tipoTitular === value
                    ? { border: '1.5px solid var(--pb)', background: 'var(--pb-light)', color: 'var(--pb)' }
                    : { border: '0.5px solid var(--border-md)', color: 'var(--ash)' }
                }
              >
                <Icono size={15} /> {label}
              </button>
            ))}
          </div>

          {esCliente ? (
            <>
              <span className="block text-xs uppercase tracking-widest" style={LABEL_STYLE}>
                Personal u otra persona (Cuentas por Cobrar)
              </span>
              <BuscadorRepresentanteCxc
                autoFocus
                soloClientes
                paraVenta
                permitirAgregarCliente
                placeholder="Buscar por nombre o cédula…"
                onSelect={elegirCliente}
              />
            </>
          ) : (
          <>
          <label htmlFor="asignartarjetamodal-cedula-del-representante" className="block text-xs uppercase tracking-widest" style={LABEL_STYLE}>
            Cédula del representante
          </label>
          <div className="flex gap-2">
            <input id="asignartarjetamodal-cedula-del-representante"
              autoFocus
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
              style={FIELD_STYLE}
              value={cedula}
              onChange={e => { setCedula(e.target.value); setErrorRep(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleBuscarRepresentante(); }}
              placeholder="V-12345678"
            />
            <button
              onClick={handleBuscarRepresentante}
              disabled={buscandoRep}
              className="px-4 rounded-xl text-sm font-medium text-white flex items-center gap-1.5 disabled:opacity-50 min-h-[44px]"
              style={{ background: 'var(--pb)' }}
            >
              {buscandoRep ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Buscar
            </button>
          </div>
          {errorRep && (
            <p className="text-sm flex items-center gap-1.5" style={{ color: 'var(--red)' }}>
              <AlertTriangle size={14} /> {errorRep}
            </p>
          )}
          </>
          )}

          <button
            onClick={() => setPaso(1)}
            className="text-xs flex items-center gap-1 mt-1"
            style={{ color: 'var(--ash)' }}
          >
            <ArrowLeft size={12} /> Cambiar tarjeta
          </button>
        </div>
      )}

      {/* Paso 3 — seleccionar alumno y confirmar */}
      {paso === 3 && (
        <div className="space-y-3">
          {esCliente ? (
            <div className="rounded-lg px-3 py-3 text-sm flex items-start gap-2" style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
              <UserRound size={16} className="mt-0.5 shrink-0" />
              <span className="min-w-0">
                <span className="block font-medium break-words" style={{ color: 'var(--jet)' }}>{nombreTitular}</span>
                <span className="block text-xs">
                  {[TIPO_LABELS[cliente?.tipo], (cliente?.cedula || cliente?.documento) && `C.I. ${cliente.cedula || cliente.documento}`].filter(Boolean).join(' · ')}
                  {' '}— recibirá la tarjeta {tarjeta?.serial}
                </span>
              </span>
            </div>
          ) : (
          <>
          <div className="rounded-lg px-3 py-2 text-sm flex items-center gap-2" style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
            <UserRound size={16} className="shrink-0" />
            <span className="min-w-0 break-words">
              {nombreCompleto(representante?.representante)} — {representante?.alumnos.length} alumno(s)
            </span>
          </div>

          <span id="asignar-alumno" className="block text-xs uppercase tracking-widest" style={LABEL_STYLE}>
            Alumno que recibirá la tarjeta {tarjeta?.serial}
          </span>
          <div role="radiogroup" aria-labelledby="asignar-alumno" className="space-y-2">
            {representante?.alumnos.map(al => (
              <label
                key={al.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer"
                style={
                  String(alumnoId) === String(al.id)
                    ? { border: '1.5px solid var(--pb)', background: 'var(--pb-light)' }
                    : { border: '0.5px solid var(--border-md)' }
                }
              >
                <input
                  type="radio"
                  name="alumno"
                  value={al.id}
                  checked={String(alumnoId) === String(al.id)}
                  onChange={() => setAlumnoId(al.id)}
                />
                <span style={{ color: 'var(--jet)' }}>
                  {al.nombre} {al.apellido}
                  {al.grado_seccion ? <span style={{ color: 'var(--ash)' }}> — {al.grado_seccion}</span> : null}
                  {al.tiene_tarjeta ? <span style={{ color: 'var(--ash)' }}> · ya tiene tarjeta</span> : null}
                </span>
              </label>
            ))}
          </div>
          </>
          )}

          {conflicto && (
            <div className="rounded-lg px-3 py-3 text-sm" style={{ background: 'var(--red-light)', border: '0.5px solid color-mix(in srgb, var(--red) 25%, white)', color: 'var(--red)' }}>
              <p className="flex items-center gap-1.5 font-medium mb-2">
                <AlertTriangle size={14} /> {conflicto.detail}
              </p>
              <p className="mb-2" style={{ color: 'var(--red)' }}>
                {nombreTitular || 'Esta persona'} ya tiene una tarjeta activa. Si la tarjeta anterior se extravió o dañó, usa el flujo de reposición en vez de asignar una nueva.
              </p>
              <button
                onClick={() => {
                  onSugerirReponer?.({
                    id: conflicto.tarjeta_existente_id,
                    alumnoNombre: nombreTitular || '',
                  });
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: 'var(--red)' }}
              >
                Ir a reponer tarjeta
              </button>
            </div>
          )}

          <button
            onClick={() => { setPaso(2); setConflicto(null); setCliente(null); }}
            className="text-xs flex items-center gap-1 mt-1"
            style={{ color: 'var(--ash)' }}
          >
            <ArrowLeft size={12} /> {esCliente ? 'Cambiar persona' : 'Cambiar representante'}
          </button>
        </div>
      )}
    </Modal>
  );
}
