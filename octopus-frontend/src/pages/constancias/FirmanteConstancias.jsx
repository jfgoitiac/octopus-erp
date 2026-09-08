import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import {
  User, IdCard, Briefcase, Save, Loader2, ImagePlus, Trash2, Lock, ToggleLeft, ToggleRight,
  Users,
} from 'lucide-react';
import { getFirmante, actualizarFirmante, getFirmaDelegada, agregarFirmaDelegada, quitarFirmaDelegada } from '../../services/constancias';
import { getUsuarios } from '../../services/authentication';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Bone } from '../../components/shared/Skeleton';

// Roles con sentido como candidatos a firma delegada: director ya puede
// firmar siempre (ver constancias/permissions.py::puede_firmar_como_director),
// y docente/representante no participan en la emisión de constancias.
const ROLES_EXCLUIDOS_FIRMA_DELEGADA = ['director', 'docente', 'representante'];

const MAX_SIZE = 2 * 1024 * 1024;

const NACIONALIDADES = [
  { value: 'V', label: 'V - Venezolano(a)' },
  { value: 'E', label: 'E - Extranjero(a)' },
];

const inputCls = 'w-full text-sm rounded-lg px-3 py-2.5 outline-none border transition-all duration-150 focus:border-[color:var(--pb)]';
const inputStyle = {
  background: 'var(--bg)',
  borderColor: 'var(--border-md)',
  color: 'var(--jet)',
  fontSize: '16px',
};

const FORM_INICIAL = {
  nombre: '',
  cedula: '',
  nacionalidad: 'V',
  cargo: '',
  estampado_global_activo: true,
};

function ImagenUploader({ label, valor, onChange, onRemove }) {
  const inputRef = useRef(null);
  const hasImagen = !!(valor?.preview || (valor?.tieneImagenGuardada && valor?.mantener));

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_SIZE) {
      toast.error('La imagen no debe superar 2MB.');
      return;
    }
    onChange({ file, preview: URL.createObjectURL(file) });
  };

  return (
    <div>
      <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>{label}</label>
      <div
        className="flex flex-col sm:flex-row items-center gap-3 p-3 rounded-lg"
        style={{ border: '1px dashed var(--border-md)', background: 'var(--bg)' }}
      >
        <div
          className="w-24 h-16 rounded-md flex items-center justify-center overflow-hidden shrink-0"
          style={{ background: '#fff', border: '1px solid var(--border-md)' }}
        >
          {valor?.preview ? (
            <img src={valor.preview} alt={label} className="max-w-full max-h-full object-contain" />
          ) : valor?.tieneImagenGuardada && valor?.mantener ? (
            <div className="flex flex-col items-center gap-1" style={{ color: 'var(--ash)' }}>
              <Lock size={14} />
              <span className="text-[10px]">Privada</span>
            </div>
          ) : (
            <ImagePlus size={18} style={{ color: 'var(--border-md)' }} />
          )}
        </div>
        <div className="flex-1 min-w-0 w-full">
          <p className="text-xs" style={{ color: 'var(--ash)' }}>
            {valor?.tieneImagenGuardada && valor?.mantener && !valor?.preview
              ? 'Ya hay una imagen guardada. No es una URL pública: solo se usa al generar el PDF.'
              : 'PNG o JPG, máx. 2MB, fondo transparente recomendado.'}
          </p>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
            >
              <ImagePlus size={13} /> {hasImagen ? 'Reemplazar' : 'Subir'}
            </button>
            {hasImagen && (
              <button
                type="button"
                onClick={() => onRemove()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: '#fee2e2', color: '#dc2626' }}
              >
                <Trash2 size={13} /> Quitar
              </button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={handleFile}
        aria-label={`Subir ${label.toLowerCase()}`}
      />
    </div>
  );
}

function FirmaDelegadaSection() {
  const [candidatos, setCandidatos] = useState([]);
  const [delegados, setDelegados] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [pendientes, setPendientes] = useState(() => new Set());

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const [resUsuarios, resDelegada] = await Promise.all([
          getUsuarios(undefined, controller.signal),
          getFirmaDelegada(controller.signal),
        ]);
        const usuarios = (resUsuarios.data || []).filter(
          (u) => !ROLES_EXCLUIDOS_FIRMA_DELEGADA.includes(u.perfil?.rol),
        );
        setCandidatos(usuarios);
        setDelegados(new Set((resDelegada.data?.usuarios || []).map((u) => u.id)));
      } catch (err) {
        if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return;
        toast.error('No se pudo cargar la lista de firma delegada.');
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const toggleDelegado = async (usuario) => {
    const yaDelegado = delegados.has(usuario.id);
    // Optimistic update — con rollback si la llamada falla.
    setDelegados((prev) => {
      const next = new Set(prev);
      yaDelegado ? next.delete(usuario.id) : next.add(usuario.id);
      return next;
    });
    setPendientes((prev) => new Set(prev).add(usuario.id));
    try {
      if (yaDelegado) {
        await quitarFirmaDelegada(usuario.id);
        toast.success(`${usuario.nombre_completo || usuario.username} ya no tiene firma delegada.`);
      } else {
        await agregarFirmaDelegada(usuario.id);
        toast.success(`${usuario.nombre_completo || usuario.username} ahora puede emitir con firma delegada.`);
      }
    } catch (err) {
      // Rollback: la llamada falló, revertimos el estado optimista.
      setDelegados((prev) => {
        const next = new Set(prev);
        yaDelegado ? next.add(usuario.id) : next.delete(usuario.id);
        return next;
      });
      toast.error(err.response?.data?.detail || 'No se pudo actualizar la firma delegada.');
    } finally {
      setPendientes((prev) => {
        const next = new Set(prev);
        next.delete(usuario.id);
        return next;
      });
    }
  };

  return (
    <div className="mt-6">
      <Card
        titulo="Firma delegada"
        subtitulo="Quién puede emitir con la firma del director"
      >
        <p className="text-xs mb-4" style={{ color: 'var(--ash)' }}>
          Estos usuarios pueden emitir constancias con la firma del director ya
          estampada, sin necesidad de firmarlas a mano después.
        </p>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Bone key={i} className="h-12 w-full" />)}
          </div>
        ) : candidatos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center" style={{ color: 'var(--ash)' }}>
            <Users size={20} />
            <p className="text-xs">No hay usuarios candidatos para este permiso.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {candidatos.map((usuario) => {
              const activo = delegados.has(usuario.id);
              const pendiente = pendientes.has(usuario.id);
              return (
                <li
                  key={usuario.id}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg px-3 py-2.5"
                  style={{ border: '1px solid var(--border-md)', background: 'var(--bg)' }}
                >
                  <div className="min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--jet)' }}>
                      {usuario.nombre_completo || usuario.username}
                    </p>
                    <p className="text-[11px] capitalize" style={{ color: 'var(--ash)' }}>
                      {usuario.perfil?.rol || 'sin rol'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleDelegado(usuario)}
                    disabled={pendiente}
                    className="flex items-center gap-2 w-full sm:w-auto text-left disabled:opacity-60"
                  >
                    {pendiente ? (
                      <Loader2 size={22} className="animate-spin" style={{ color: 'var(--ash)' }} />
                    ) : activo ? (
                      <ToggleRight size={26} style={{ color: 'var(--pb)' }} />
                    ) : (
                      <ToggleLeft size={26} style={{ color: 'var(--ash)' }} />
                    )}
                    <span className="text-xs sm:hidden" style={{ color: 'var(--jet)' }}>
                      {activo ? 'Firma delegada activa' : 'Sin firma delegada'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function FirmanteConstancias() {
  const [form, setForm] = useState(FORM_INICIAL);
  const [firma, setFirma] = useState({ preview: null, file: null, tieneImagenGuardada: false, mantener: true });
  const [sello, setSello] = useState({ preview: null, file: null, tieneImagenGuardada: false, mantener: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const res = await getFirmante(controller.signal);
        const d = res.data || {};
        setForm({
          nombre: d.nombre || '',
          cedula: d.cedula || '',
          nacionalidad: d.nacionalidad || 'V',
          cargo: d.cargo || '',
          estampado_global_activo: d.estampado_global_activo ?? true,
        });
        setFirma({ preview: null, file: null, tieneImagenGuardada: !!d.firma_imagen_url, mantener: true });
        setSello({ preview: null, file: null, tieneImagenGuardada: !!d.sello_imagen_url, mantener: true });
      } catch (err) {
        if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return;
        // 404 es esperado si aún no se ha configurado ningún firmante.
        if (err.response?.status !== 404) {
          toast.error('No se pudo cargar la configuración del firmante.');
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const set = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.cedula.trim() || !form.cargo.trim()) {
      toast.warning('Nombre, cédula y cargo son obligatorios.');
      return;
    }
    setSaving(true);
    try {
      const hayImagenes = firma.file || sello.file || !firma.mantener || !sello.mantener;
      let payload;
      if (hayImagenes) {
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => fd.append(k, v));
        if (firma.file) fd.append('firma_imagen', firma.file);
        else if (!firma.mantener) fd.append('firma_imagen_clear', 'true');
        if (sello.file) fd.append('sello_imagen', sello.file);
        else if (!sello.mantener) fd.append('sello_imagen_clear', 'true');
        payload = fd;
      } else {
        payload = form;
      }
      const res = await actualizarFirmante(payload);
      const d = res.data || {};
      setFirma({ preview: null, file: null, tieneImagenGuardada: !!d.firma_imagen_url, mantener: true });
      setSello({ preview: null, file: null, tieneImagenGuardada: !!d.sello_imagen_url, mantener: true });
      toast.success('Configuración del firmante guardada.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo guardar la configuración del firmante.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <PageHeader titulo="Firmante de constancias" descripcion="Datos y estampado que aparecerán en las constancias emitidas" />
        <Card className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Bone key={i} className="h-11 w-full" />)}
          <Bone className="h-24 w-full" />
        </Card>
        <FirmaDelegadaSection />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader titulo="Firmante de constancias" descripcion="Datos y estampado que aparecerán en las constancias emitidas" />

      <form onSubmit={handleSubmit}>
        <Card className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Nombre completo</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                <input className={inputCls} style={{ ...inputStyle, paddingLeft: '2rem' }} value={form.nombre} onChange={set('nombre')} />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Cédula</label>
              <div className="relative">
                <IdCard size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                <input className={inputCls} style={{ ...inputStyle, paddingLeft: '2rem' }} value={form.cedula} onChange={set('cedula')} />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Nacionalidad</label>
              <select className={inputCls} style={inputStyle} value={form.nacionalidad} onChange={set('nacionalidad')}>
                {NACIONALIDADES.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Cargo</label>
              <div className="relative">
                <Briefcase size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                <input className={inputCls} style={{ ...inputStyle, paddingLeft: '2rem' }} value={form.cargo} onChange={set('cargo')} placeholder="Ej: Director" />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setForm(p => ({ ...p, estampado_global_activo: !p.estampado_global_activo }))}
            className="flex items-center gap-2 w-full sm:w-auto text-left"
          >
            {form.estampado_global_activo
              ? <ToggleRight size={28} style={{ color: 'var(--pb)' }} />
              : <ToggleLeft size={28} style={{ color: 'var(--ash)' }} />}
            <span className="text-xs" style={{ color: 'var(--jet)' }}>
              Estampado global {form.estampado_global_activo ? 'activo' : 'inactivo'}
              <span className="block text-[11px]" style={{ color: 'var(--ash)' }}>
                Controla si la firma y el sello se aplican a las constancias emitidas.
              </span>
            </span>
          </button>

          <ImagenUploader
            label="Firma"
            valor={firma}
            onChange={(v) => setFirma({ ...v, tieneImagenGuardada: firma.tieneImagenGuardada, mantener: true })}
            onRemove={() => setFirma({ preview: null, file: null, tieneImagenGuardada: firma.tieneImagenGuardada, mantener: false })}
          />

          <ImagenUploader
            label="Sello"
            valor={sello}
            onChange={(v) => setSello({ ...v, tieneImagenGuardada: sello.tieneImagenGuardada, mantener: true })}
            onRemove={() => setSello({ preview: null, file: null, tieneImagenGuardada: sello.tieneImagenGuardada, mantener: false })}
          />

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60 min-h-[44px]"
              style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)' }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Guardando…' : 'Guardar configuración'}
            </button>
          </div>
        </Card>
      </form>

      <FirmaDelegadaSection />
    </div>
  );
}
