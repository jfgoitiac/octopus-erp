import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  ArrowLeft, Save, Loader2, ToggleLeft, ToggleRight, Tag, ChevronDown, Plus, VenetianMask,
} from 'lucide-react';
import { getPlantilla, crearPlantilla, actualizarPlantilla, getPlaceholders } from '../../services/constancias';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Bone } from '../../components/shared/Skeleton';
import PlaceholderRichEditor from '../../components/constancias/PlaceholderRichEditor';
import { crearTokenGenero } from './plantillaTokens';

// Debe coincidir con constancias/models.py: TIPOS_CONSTANCIA / DESTINATARIOS_CONSTANCIA.
const TIPOS = [
  { value: 'estudio', label: 'Estudio' },
  { value: 'conducta', label: 'Buena Conducta' },
  { value: 'retiro', label: 'Retiro' },
  { value: 'trabajo', label: 'Trabajo' },
];

const DESTINATARIOS = [
  { value: 'alumno', label: 'Alumno' },
  { value: 'trabajador', label: 'Trabajador' },
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
  tipo: 'estudio',
  destinatario: 'alumno',
  cuerpo_html: '',
  anexo_habilitado: false,
  anexo_html: '',
  permite_estampado: false,
  activa: true,
};

function ToggleField({ activo, onToggle, label, descripcion }) {
  return (
    <button type="button" onClick={onToggle} className="flex items-center gap-2 w-full sm:w-auto text-left">
      {activo
        ? <ToggleRight size={28} style={{ color: 'var(--pb)' }} />
        : <ToggleLeft size={28} style={{ color: 'var(--ash)' }} />}
      <span className="text-xs" style={{ color: 'var(--jet)' }}>
        {label}
        {descripcion && (
          <span className="block text-[11px]" style={{ color: 'var(--ash)' }}>{descripcion}</span>
        )}
      </span>
    </button>
  );
}

function GeneroInserter({ onInsertar }) {
  const [abierto, setAbierto] = useState(false);
  const [masc, setMasc] = useState('');
  const [fem, setFem] = useState('');

  const insertar = () => {
    const resultado = crearTokenGenero(masc, fem);
    if (!resultado) {
      toast.warning('Completa las dos formas (masculina y femenina) antes de insertar.');
      return;
    }
    onInsertar(resultado.token, resultado.etiqueta);
    setMasc('');
    setFem('');
    setAbierto(false);
  };

  return (
    <div className="rounded-lg" style={{ border: '1px solid var(--border-md)' }}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold"
        style={{ color: 'var(--jet)' }}
      >
        <span className="flex items-center gap-1.5">
          <VenetianMask size={13} /> Palabra que cambia según sexo
        </span>
        <ChevronDown
          size={14}
          style={{ color: 'var(--ash)', transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
        />
      </button>
      {abierto && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          <p className="text-[11px]" style={{ color: 'var(--ash)' }}>
            Para palabras como "inscrito/inscrita" — escribe cada forma y se inserta como un solo dato.
          </p>
          <input
            className="w-full text-xs rounded-md px-2.5 py-2 outline-none border"
            style={{ background: 'var(--bg)', borderColor: 'var(--border-md)', color: 'var(--jet)' }}
            placeholder="Forma para él (ej: inscrito)"
            value={masc}
            onChange={(e) => setMasc(e.target.value)}
          />
          <input
            className="w-full text-xs rounded-md px-2.5 py-2 outline-none border"
            style={{ background: 'var(--bg)', borderColor: 'var(--border-md)', color: 'var(--jet)' }}
            placeholder="Forma para ella (ej: inscrita)"
            value={fem}
            onChange={(e) => setFem(e.target.value)}
          />
          <button
            type="button"
            onClick={insertar}
            className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-md text-xs font-semibold"
            style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
          >
            <Plus size={13} /> Insertar
          </button>
        </div>
      )}
    </div>
  );
}

function PlaceholdersPanel({ destinatario, onInsertar }) {
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [grupoAbierto, setGrupoAbierto] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getPlaceholders(destinatario, controller.signal)
      .then((res) => {
        setGrupos(res.data?.grupos || []);
        setGrupoAbierto(res.data?.grupos?.[0]?.grupo || null);
      })
      .catch((err) => {
        if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return;
        toast.error('No se pudieron cargar los datos disponibles.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [destinatario]);

  return (
    <Card titulo="Datos disponibles" subtitulo="Haz clic para insertar en el texto">
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Bone key={i} className="h-8 w-full" />)}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {grupos.map((g) => (
            <div key={g.grupo} className="rounded-lg" style={{ border: '1px solid var(--border-md)' }}>
              <button
                type="button"
                onClick={() => setGrupoAbierto(prev => prev === g.grupo ? null : g.grupo)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold"
                style={{ color: 'var(--jet)' }}
              >
                {g.etiqueta}
                <ChevronDown
                  size={14}
                  style={{
                    color: 'var(--ash)',
                    transform: grupoAbierto === g.grupo ? 'rotate(180deg)' : 'none',
                    transition: 'transform 150ms',
                  }}
                />
              </button>
              {grupoAbierto === g.grupo && (
                <div className="px-2 pb-2 flex flex-wrap gap-1.5">
                  {g.placeholders.map((p) => (
                    <button
                      key={p.token}
                      type="button"
                      onClick={() => onInsertar(p.token, p.etiqueta)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-left text-[11px] font-medium hover:opacity-80"
                      style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
                      title={`Ejemplo: ${p.ejemplo}`}
                    >
                      <Tag size={11} className="shrink-0" />
                      {p.etiqueta}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          <GeneroInserter onInsertar={onInsertar} />
        </div>
      )}
    </Card>
  );
}

export default function PlantillaEditorConstancia() {
  const { id } = useParams();
  const esNueva = !id;
  const navigate = useNavigate();

  const [form, setForm] = useState(FORM_INICIAL);
  const [loading, setLoading] = useState(!esNueva);
  const [saving, setSaving] = useState(false);
  const ultimoCampoActivoRef = useRef('cuerpo_html');

  const cuerpoEditorRef = useRef(null);
  const anexoEditorRef = useRef(null);

  useEffect(() => {
    if (esNueva) return;
    const controller = new AbortController();
    setLoading(true);
    getPlantilla(id, controller.signal)
      .then((res) => {
        const d = res.data;
        setForm({
          nombre: d.nombre || '',
          tipo: d.tipo || 'estudio',
          destinatario: d.destinatario || 'alumno',
          cuerpo_html: d.cuerpo_html || '',
          anexo_habilitado: !!d.anexo_habilitado,
          anexo_html: d.anexo_html || '',
          permite_estampado: !!d.permite_estampado,
          activa: d.activa ?? true,
        });
      })
      .catch((err) => {
        if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return;
        toast.error('No se pudo cargar la plantilla.');
        navigate('/constancias/plantillas', { replace: true });
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [id, esNueva, navigate]);

  const set = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  const insertarPlaceholder = (token, etiqueta) => {
    const editorRef = ultimoCampoActivoRef.current === 'anexo_html' ? anexoEditorRef : cuerpoEditorRef;
    editorRef.current?.insertarPlaceholder(token, etiqueta);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      toast.warning('El nombre de la plantilla es obligatorio.');
      return;
    }
    if (!form.cuerpo_html.trim()) {
      toast.warning('El texto de la constancia no puede estar vacío.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        destinatario: form.destinatario,
        cuerpo_html: form.cuerpo_html,
        anexo_habilitado: form.anexo_habilitado,
        anexo_html: form.anexo_habilitado ? form.anexo_html : '',
        permite_estampado: form.permite_estampado,
        activa: form.activa,
      };
      if (esNueva) {
        await crearPlantilla(payload);
        toast.success('Plantilla creada.');
      } else {
        await actualizarPlantilla(id, payload);
        toast.success('Plantilla actualizada.');
      }
      navigate('/constancias/plantillas');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo guardar la plantilla.');
    } finally {
      setSaving(false);
    }
  };

  const titulo = esNueva ? 'Nueva plantilla' : 'Editar plantilla';

  if (loading) {
    return (
      <div>
        <PageHeader titulo={titulo} descripcion="Cargando…" />
        <Card className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Bone key={i} className="h-11 w-full" />)}
          <Bone className="h-40 w-full" />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        titulo={titulo}
        descripcion="Define el contenido y los datos disponibles para esta constancia"
        acciones={
          <button
            type="button"
            onClick={() => navigate('/constancias/plantillas')}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold"
            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
          >
            <ArrowLeft size={14} /> Volver
          </button>
        }
      />

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Card className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Nombre de la plantilla</label>
                <input className={inputCls} style={inputStyle} value={form.nombre} onChange={set('nombre')} placeholder="Ej: Constancia de estudio - Primaria" />
              </div>

              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Tipo</label>
                <select className={inputCls} style={inputStyle} value={form.tipo} onChange={set('tipo')}>
                  {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Destinatario</label>
                <select className={inputCls} style={inputStyle} value={form.destinatario} onChange={set('destinatario')}>
                  {DESTINATARIOS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Texto de la constancia</label>
              <PlaceholderRichEditor
                ref={cuerpoEditorRef}
                valorInicial={form.cuerpo_html}
                onChange={(html) => setForm(prev => ({ ...prev, cuerpo_html: html }))}
                onFocus={() => { ultimoCampoActivoRef.current = 'cuerpo_html'; }}
                minHeight={200}
                placeholder="Escribe el texto de la constancia y usa el panel de la derecha para insertar datos del alumno o trabajador…"
              />
            </div>

            <ToggleField
              activo={form.anexo_habilitado}
              onToggle={() => setForm(p => ({ ...p, anexo_habilitado: !p.anexo_habilitado }))}
              label={`Anexo ${form.anexo_habilitado ? 'activo' : 'inactivo'}`}
              descripcion="Agrega un bloque adicional al final de la constancia (ej. tabla de notas)."
            />

            {form.anexo_habilitado && (
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Texto del anexo</label>
                <PlaceholderRichEditor
                  ref={anexoEditorRef}
                  valorInicial={form.anexo_html}
                  onChange={(html) => setForm(prev => ({ ...prev, anexo_html: html }))}
                  onFocus={() => { ultimoCampoActivoRef.current = 'anexo_html'; }}
                  minHeight={110}
                  placeholder="Texto adicional que se agrega al final de la constancia…"
                />
              </div>
            )}

            <div className="flex flex-col gap-3 pt-1">
              <ToggleField
                activo={form.permite_estampado}
                onToggle={() => setForm(p => ({ ...p, permite_estampado: !p.permite_estampado }))}
                label={`Estampado ${form.permite_estampado ? 'permitido' : 'no permitido'}`}
                descripcion="Permite aplicar firma y sello del firmante institucional al emitir."
              />
              <ToggleField
                activo={form.activa}
                onToggle={() => setForm(p => ({ ...p, activa: !p.activa }))}
                label={`Plantilla ${form.activa ? 'activa' : 'inactiva'}`}
                descripcion="Solo las plantillas activas están disponibles al emitir constancias."
              />
            </div>
          </Card>

          <div>
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60 min-h-[44px]"
              style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)' }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Guardando…' : 'Guardar plantilla'}
            </button>
          </div>
        </div>

        <div className="lg:col-span-1">
          <PlaceholdersPanel destinatario={form.destinatario} onInsertar={insertarPlaceholder} />
        </div>
      </form>
    </div>
  );
}
