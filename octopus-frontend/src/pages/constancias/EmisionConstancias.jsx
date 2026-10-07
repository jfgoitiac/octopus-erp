import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import {
  Search, FileText, User, ArrowRight, ArrowLeft, Eye, Send,
  AlertTriangle, CheckCircle2, Loader2, X,
} from 'lucide-react';
import apiClient from '../../api/apiClient';
import { abrirConstanciaPdf, getPlantillas, previsualizarConstancia, emitirConstancia, getCobroConstanciaInfo } from '../../services/constancias';
import { getBancos } from '../../api/cobranza.service';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Bone } from '../../components/shared/Skeleton';

const PASOS = ['Plantilla', 'Destinatario', 'Datos', 'Previsualización'];

const DESTINATARIO_LABEL = {
  alumno: 'alumno',
  trabajador: 'trabajador',
};

// Endpoints de búsqueda por destinatario, confirmados contra el backend real:
// - alumno: secretaria/alumnos/ (AlumnoListView, filtra ?buscar= por nombre/
//   apellido/cedula_escolar/representante).
// - trabajador: nomina/empleados/buscar/ (BuscarEmpleadosView, nueva — no
//   existía endpoint de búsqueda para nomina.Empleado, que es la fuente
//   canónica según CONTRATO_CONSTANCIAS.md D4, distinta de rrhh.Empleado).
//   Devuelve id/cedula/nombre/apellido/tipo_personal, sin sueldo.
const BUSQUEDA_ENDPOINT = {
  alumno: 'secretaria/alumnos/',
  trabajador: 'nomina/empleados/buscar/',
};

// Los modelos reales usan nombre/apellido (singular), no nombres/apellidos.
const nombreCompleto = (p) => {
  if (!p) return '';
  const nombre = p.nombre ?? p.nombres ?? '';
  const apellido = p.apellido ?? p.apellidos ?? '';
  const junto = `${nombre} ${apellido}`.trim();
  return junto || p.nombre_completo || `#${p.id}`;
};

const inputCls = 'w-full text-sm rounded-lg px-3 py-2.5 outline-none border transition-all duration-150 focus:border-[color:var(--pb)]';
const inputStyle = {
  background: 'var(--bg)',
  borderColor: 'var(--border-md)',
  color: 'var(--jet)',
  fontSize: '16px',
};

function StepperMovil({ paso }) {
  return (
    <div className="flex items-center gap-1.5 sm:hidden mb-4">
      {PASOS.map((label, i) => (
        <div key={label} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full h-1.5 rounded-full"
            style={{ background: i <= paso ? 'var(--pb)' : 'var(--border-md)' }}
          />
          <span className="text-[10px] text-center" style={{ color: i === paso ? 'var(--pb)' : 'var(--ash)' }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

function StepperDesktop({ paso }) {
  return (
    <div className="hidden sm:flex items-center gap-3 mb-5">
      {PASOS.map((label, i) => (
        <div key={label} className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{
                background: i <= paso ? 'var(--pb)' : 'var(--ash-light)',
                color: i <= paso ? '#fff' : 'var(--ash)',
              }}
            >
              {i < paso ? <CheckCircle2 size={14} /> : i + 1}
            </div>
            <span className="text-xs font-medium" style={{ color: i === paso ? 'var(--jet)' : 'var(--ash)' }}>
              {label}
            </span>
          </div>
          {i < PASOS.length - 1 && (
            <div className="w-8 h-px" style={{ background: 'var(--border-md)' }} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function EmisionConstancias() {
  const [paso, setPaso] = useState(0);

  // Paso 0: plantilla
  const [plantillas, setPlantillas] = useState([]);
  const [loadingPlantillas, setLoadingPlantillas] = useState(true);
  const [plantilla, setPlantilla] = useState(null);

  // Paso 1: destinatario (alumno/trabajador)
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [persona, setPersona] = useState(null);
  const debounceRef = useRef(null);

  // Paso 2: datos capturados
  const [datosCapturados, setDatosCapturados] = useState({
    horario: '',
    grado_promocion: '',
    nivel_promocion: '',
    anio_escolar_promocion: '',
  });

  // Paso 3: previsualización / emisión
  const [previsualizando, setPrevisualizando] = useState(false);
  const [preview, setPreview] = useState(null); // { html_renderizado, advertencias }
  const [emitiendo, setEmitiendo] = useState(false);
  const [emitida, setEmitida] = useState(null);
  const [cobro, setCobro] = useState(null);
  const [bancos, setBancos] = useState([]);
  const [pago, setPago] = useState({ metodo_pago: 'efectivo', banco_receptor_id: '', referencia: '', numero_lote: '' });

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoadingPlantillas(true);
      try {
        const res = await getPlantillas({ activa: true }, controller.signal);
        const data = res.data;
        const lista = Array.isArray(data) ? data : (data?.results ?? []);
        setPlantillas(lista.filter(p => p.activa !== false));
      } catch (err) {
        if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return;
        toast.error('No se pudieron cargar las plantillas disponibles.');
      } finally {
        setLoadingPlantillas(false);
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    getBancos().then((res) => setBancos(res.data || [])).catch(() => setBancos([]));
  }, []);

  // Búsqueda de destinatario (debounced), según el tipo que exige la plantilla.
  useEffect(() => {
    if (!plantilla) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!busqueda.trim()) {
      return;
    }
    const endpoint = BUSQUEDA_ENDPOINT[plantilla.destinatario];
    if (!endpoint) {
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await apiClient.get(endpoint, { params: { buscar: busqueda.trim(), page_size: 10 } });
        const data = res.data;
        setResultados(Array.isArray(data) ? data : (data?.results ?? []));
      } catch {
        toast.error('No se pudo buscar. Intenta de nuevo.');
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [busqueda, plantilla]);

  const buildPayload = useCallback(() => {
    if (!plantilla || !persona) return null;
    const payload = { plantilla_id: plantilla.id, datos_capturados: datosCapturados };
    payload[`${plantilla.destinatario}_id`] = persona.id;
    if (cobro?.requiere_pago) {
      payload.pago = {
        ...pago,
        banco_receptor_id: pago.banco_receptor_id || undefined,
        monto_usd: pago.metodo_pago === 'efectivo' || pago.metodo_pago === 'zelle' ? cobro.monto_usd : undefined,
        monto_ves: pago.metodo_pago !== 'efectivo' && pago.metodo_pago !== 'zelle' ? cobro.monto_ves : undefined,
      };
    }
    return payload;
  }, [plantilla, persona, datosCapturados, cobro, pago]);

  const handlePrevisualizar = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setPrevisualizando(true);
    setPreview(null);
    try {
      const res = await previsualizarConstancia(payload);
      setPreview(res.data);
      if (plantilla.destinatario === 'alumno') {
        const cobroRes = await getCobroConstanciaInfo(plantilla.id, persona.id);
        setCobro(cobroRes.data);
      } else {
        setCobro({ requiere_pago: false });
      }
      setPaso(3);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo generar la previsualización.');
    } finally {
      setPrevisualizando(false);
    }
  };

  const handleEmitir = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setEmitiendo(true);
    try {
      const res = await emitirConstancia(payload);
      setEmitida(res.data);
      toast.success(`Constancia ${res.data.numero} emitida correctamente.`);
    } catch (err) {
      if (err.response?.status === 403) {
        toast.error(err.response?.data?.detail || 'No tienes permiso para emitir esta constancia.');
      } else {
        toast.error(err.response?.data?.detail || 'No se pudo emitir la constancia.');
      }
    } finally {
      setEmitiendo(false);
    }
  };

  const reiniciar = () => {
    setPaso(0);
    setPlantilla(null);
    setBusqueda('');
    setResultados([]);
    setPersona(null);
    setDatosCapturados({ horario: '', grado_promocion: '', nivel_promocion: '', anio_escolar_promocion: '' });
    setPreview(null);
    setCobro(null);
    setEmitida(null);
  };

  const personaLabel = useMemo(() => nombreCompleto(persona), [persona]);

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader titulo="Emitir constancia" descripcion="Selecciona una plantilla, el destinatario y previsualiza antes de emitir" />

      <StepperMovil paso={paso} />
      <StepperDesktop paso={paso} />

      {emitida ? (
        <Card>
          <div className="flex flex-col items-center text-center gap-3 py-6">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: '#dcfce7' }}>
              <CheckCircle2 size={28} style={{ color: '#16a34a' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>
                Constancia {emitida.numero} emitida
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>
                {emitida.salio_firmada ? 'Emitida con firma y sello.' : 'Emitida sin estampado.'}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto mt-2">
              {emitida.pdf_url && (
                <button
                  onClick={() => abrirConstanciaPdf(emitida.pdf_url).catch(() => toast.error('No se pudo abrir el PDF.'))}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-white min-h-[44px]"
                  style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)' }}
                >
                  <FileText size={14} /> Ver PDF
                </button>
              )}
              <button
                onClick={reiniciar}
                className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-xs font-semibold min-h-[44px]"
                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
              >
                Emitir otra constancia
              </button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {/* Paso 0: Plantilla */}
          {paso === 0 && (
            <Card>
              <p className="text-xs font-semibold mb-3" style={{ color: 'var(--ash)' }}>
                Selecciona una plantilla activa
              </p>
              {loadingPlantillas ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 3 }).map((_, i) => <Bone key={i} className="h-14 w-full" />)}
                </div>
              ) : plantillas.length === 0 ? (
                <p className="text-xs py-6 text-center" style={{ color: 'var(--ash)' }}>
                  No hay plantillas activas disponibles.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {plantillas.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setPlantilla(p); setResultados([]); setBusqueda(''); setPersona(null); setPaso(1); }}
                      className="text-left flex items-start gap-3 p-3.5 rounded-lg transition-all duration-150"
                      style={{
                        border: `1px solid ${plantilla?.id === p.id ? 'var(--pb)' : 'var(--border-md)'}`,
                        background: plantilla?.id === p.id ? 'var(--pb-light)' : 'transparent',
                      }}
                    >
                      <FileText size={16} style={{ color: 'var(--pb)', flexShrink: 0, marginTop: 2 }} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: 'var(--jet)' }}>{p.nombre}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                          Para {DESTINATARIO_LABEL[p.destinatario] || p.destinatario}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Paso 1: Destinatario */}
          {paso === 1 && plantilla && (
            <Card>
              <p className="text-xs font-semibold mb-3" style={{ color: 'var(--ash)' }}>
                Busca al {DESTINATARIO_LABEL[plantilla.destinatario] || 'destinatario'}
              </p>
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                <input
                  autoFocus
                  className={inputCls}
                  style={{ ...inputStyle, paddingLeft: '2rem' }}
                  placeholder="Nombre, apellido o cédula…"
                  value={busqueda}
                  onChange={(e) => {
                    const valor = e.target.value;
                    setBusqueda(valor);
                    setPersona(null);
                    if (!valor.trim()) setResultados([]);
                  }}
                />
                {buscando && (
                  <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: 'var(--ash)' }} />
                )}
              </div>

              {resultados.length > 0 && !persona && (
                <div className="flex flex-col gap-1.5 mb-3 max-h-72 overflow-y-auto">
                  {resultados.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => { setPersona(r); setResultados([]); setBusqueda(''); }}
                      className="flex items-center gap-2 p-2.5 rounded-lg text-left"
                      style={{ border: '0.5px solid var(--border-md)' }}
                    >
                      <User size={14} style={{ color: 'var(--ash)' }} />
                      <span className="text-xs" style={{ color: 'var(--jet)' }}>
                        {nombreCompleto(r)}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {persona && (
                <div
                  className="flex items-center justify-between gap-2 p-3 rounded-lg mb-3"
                  style={{ background: 'var(--pb-light)' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <User size={14} style={{ color: 'var(--pb-mid)', flexShrink: 0 }} />
                    <span className="text-xs font-semibold truncate" style={{ color: 'var(--pb-mid)' }}>
                      {personaLabel}
                    </span>
                  </div>
                  <button onClick={() => setPersona(null)} aria-label="Quitar selección">
                    <X size={14} style={{ color: 'var(--pb-mid)' }} />
                  </button>
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between pt-2">
                <button
                  onClick={() => setPaso(0)}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold min-h-[44px]"
                  style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                >
                  <ArrowLeft size={13} /> Atrás
                </button>
                <button
                  onClick={() => setPaso(2)}
                  disabled={!persona}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 min-h-[44px]"
                  style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)' }}
                >
                  Continuar <ArrowRight size={13} />
                </button>
              </div>
            </Card>
          )}

          {/* Paso 2: Datos capturados */}
          {paso === 2 && (
            <Card>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--ash)' }}>
                Datos adicionales (opcionales)
              </p>
              <p className="text-xs mb-3" style={{ color: 'var(--ash)' }}>
                Complétalos solo si la plantilla los requiere.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Horario</label>
                  <input
                    className={inputCls} style={inputStyle}
                    value={datosCapturados.horario}
                    onChange={(e) => setDatosCapturados(p => ({ ...p, horario: e.target.value }))}
                    placeholder="Ej: 7:00 a.m. - 12:00 p.m."
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Grado de promoción</label>
                  <input
                    className={inputCls} style={inputStyle}
                    value={datosCapturados.grado_promocion}
                    onChange={(e) => setDatosCapturados(p => ({ ...p, grado_promocion: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Nivel de promoción</label>
                  <input
                    className={inputCls} style={inputStyle}
                    value={datosCapturados.nivel_promocion}
                    onChange={(e) => setDatosCapturados(p => ({ ...p, nivel_promocion: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Año escolar de promoción</label>
                  <input
                    className={inputCls} style={inputStyle}
                    value={datosCapturados.anio_escolar_promocion}
                    onChange={(e) => setDatosCapturados(p => ({ ...p, anio_escolar_promocion: e.target.value }))}
                    placeholder="Ej: 2025-2026"
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between pt-4">
                <button
                  onClick={() => setPaso(1)}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold min-h-[44px]"
                  style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                >
                  <ArrowLeft size={13} /> Atrás
                </button>
                <button
                  onClick={handlePrevisualizar}
                  disabled={previsualizando}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60 min-h-[44px]"
                  style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)' }}
                >
                  {previsualizando ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
                  Previsualizar
                </button>
              </div>
            </Card>
          )}

          {/* Paso 3: Previsualización */}
          {paso === 3 && preview && (
            <Card>
              {preview.advertencias?.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg mb-3" style={{ background: '#fef9c3' }}>
                  <AlertTriangle size={15} style={{ color: '#ca8a04', flexShrink: 0, marginTop: 1 }} />
                  <ul className="text-xs space-y-0.5" style={{ color: '#854d0e' }}>
                    {preview.advertencias.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}

              <div
                className="rounded-lg p-4 overflow-x-auto text-sm"
                style={{ border: '1px solid var(--border-md)', background: '#fff', color: '#111' }}
                dangerouslySetInnerHTML={{ __html: preview.html_renderizado }}
              />

              {cobro?.requiere_pago && (
                <div className="mt-4 p-4 rounded-lg" style={{ background: 'var(--pb-light)', border: '1px solid var(--pb)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Pago obligatorio antes de emitir</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>
                    USD {cobro.monto_usd} · Tasa BCV: {cobro.tasa_bcv} · Total: Bs. {cobro.monto_ves}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <select className={inputCls} style={inputStyle} value={pago.metodo_pago}
                      onChange={(e) => setPago((v) => ({ ...v, metodo_pago: e.target.value, banco_receptor_id: '' }))}>
                      <option value="efectivo">Efectivo divisas</option>
                      <option value="efectivo_ves">Efectivo bolívares</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="pago_movil">Pago móvil</option>
                      <option value="punto_de_venta">Punto de venta</option>
                      <option value="zelle">Zelle</option>
                    </select>
                    {!['efectivo', 'efectivo_ves'].includes(pago.metodo_pago) && (
                      <select className={inputCls} style={inputStyle} value={pago.banco_receptor_id}
                        onChange={(e) => setPago((v) => ({ ...v, banco_receptor_id: e.target.value }))}>
                        <option value="">Selecciona banco receptor</option>
                        {bancos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                      </select>
                    )}
                    {!['efectivo', 'efectivo_ves'].includes(pago.metodo_pago) && (
                      <input className={inputCls} style={inputStyle} placeholder="Referencia obligatoria" value={pago.referencia}
                        onChange={(e) => setPago((v) => ({ ...v, referencia: e.target.value }))} />
                    )}
                    {pago.metodo_pago === 'punto_de_venta' && (
                      <input className={inputCls} style={inputStyle} placeholder="Lote de 4 dígitos" value={pago.numero_lote}
                        onChange={(e) => setPago((v) => ({ ...v, numero_lote: e.target.value }))} />
                    )}
                  </div>
                </div>
              )}
              {cobro && !cobro.requiere_pago && plantilla?.destinatario === 'alumno' && (
                <p className="mt-4 text-xs p-3 rounded-lg" style={{ background: '#f1f5f9', color: 'var(--ash)' }}>
                  Esta constancia se emitirá gratis porque no tiene una tarifa configurada. Dirección puede activarla en Constancias → Cobros.
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between pt-4">
                <button
                  onClick={() => setPaso(2)}
                  disabled={emitiendo}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold disabled:opacity-50 min-h-[44px]"
                  style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                >
                  <ArrowLeft size={13} /> Atrás
                </button>
                <button
                  onClick={handleEmitir}
                  disabled={emitiendo}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60 min-h-[44px]"
                  style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)' }}
                >
                  {emitiendo ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  Emitir constancia
                </button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
