import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import {
  Globe, Newspaper, FileText, LayoutTemplate, Menu as MenuIcon, Settings, BarChart3,
  Save, Loader2, ArrowUp, ArrowDown, Plus, Trash2, ExternalLink, Trash, AlertTriangle,
} from 'lucide-react';
import TablaArticulos from '../components/sitio/TablaArticulos';
import TablaPaginas from '../components/sitio/TablaPaginas';
import TabPapelera from '../components/sitio/TabPapelera';
import BibliotecaMedia from '../components/sitio/BibliotecaMedia';
import EditorArticulo from '../components/sitio/EditorArticulo';
import ConstructorPaginas from '../components/sitio/EditorVisual/ConstructorPaginas';
import CrearPaginaModal from '../components/sitio/CrearPaginaModal';
import EditarPaginaModal from '../components/sitio/EditarPaginaModal';
import MetricasSitio from './MetricasSitio';
import {
  getConfiguracionSitio, patchConfiguracionSitio, getMenus, createMenu, actualizarItemsMenu,
  getPaginas, getArticulos,
} from '../api/sitio.service';

// URL del sitio público (octopus-sitio) — origin distinto al panel admin en
// producción (deploy/nginx/clhma.com.conf: clhma.com sirve octopus-sitio/dist,
// app.clhma.com sirve este panel + la API). Fallback solo por si falta la env
// var en algún entorno no configurado.
const SITIO_URL = (import.meta.env.VITE_SITIO_URL || 'http://localhost:5174').replace(/\/$/, '');

const MENUS_ESPERADOS = [
  { nombre: 'principal', label: 'Menú principal', descripcion: 'Navegación superior del sitio público.' },
  { nombre: 'footer', label: 'Menú de pie de página', descripcion: 'Enlaces del footer del sitio público.' },
];

const TABS = [
  { key: 'articulos', label: 'Artículos', icon: Newspaper },
  { key: 'paginas', label: 'Páginas', icon: FileText },
  { key: 'editor', label: 'Editor visual', icon: LayoutTemplate },
  { key: 'papelera', label: 'Papelera', icon: Trash },
  { key: 'menu', label: 'Menú', icon: MenuIcon },
  { key: 'config', label: 'Config', icon: Settings },
  { key: 'metricas', label: 'Métricas', icon: BarChart3 },
];

// ─── Tab: Config ────────────────────────────────────────────────────────────

const TabConfig = () => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchConfig = () => {
    setLoading(true);
    getConfiguracionSitio()
      .then((res) => setConfig(res.data))
      .catch(() => toast.error('No se pudo cargar la configuración del sitio.'))
      .finally(() => setLoading(false));
  };

  useEffect(fetchConfig, []);

  const handleChange = (field, value) => setConfig((c) => ({ ...c, [field]: value }));
  const handleRedChange = (red, value) =>
    setConfig((c) => ({ ...c, redes_sociales: { ...c.redes_sociales, [red]: value } }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await patchConfiguracionSitio(config);
      toast.success('Configuración del sitio actualizada.');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin" size={24} style={{ color: 'var(--pb)' }} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
        <div className="px-5 py-3.5" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Marca</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Color Primario</label>
              <div className="flex items-center gap-2">
                <input type="color" value={config?.color_primario || '#0fa3b1'} onChange={(e) => handleChange('color_primario', e.target.value)}
                  className="h-9 w-10 rounded cursor-pointer border-0 p-0.5" style={{ border: '0.5px solid var(--border-md)' }} />
                <input type="text" value={config?.color_primario || ''} onChange={(e) => handleChange('color_primario', e.target.value)}
                  maxLength={7} className="flex-1 px-3 py-2 rounded-lg text-sm outline-none font-mono"
                  style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }} />
              </div>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Color Secundario</label>
              <div className="flex items-center gap-2">
                <input type="color" value={config?.color_secundario || '#1f3864'} onChange={(e) => handleChange('color_secundario', e.target.value)}
                  className="h-9 w-10 rounded cursor-pointer border-0 p-0.5" style={{ border: '0.5px solid var(--border-md)' }} />
                <input type="text" value={config?.color_secundario || ''} onChange={(e) => handleChange('color_secundario', e.target.value)}
                  maxLength={7} className="flex-1 px-3 py-2 rounded-lg text-sm outline-none font-mono"
                  style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }} />
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Color de Acento</label>
              <div className="flex items-center gap-2">
                <input type="color" value={config?.color_acento || '#f5a623'} onChange={(e) => handleChange('color_acento', e.target.value)}
                  className="h-9 w-10 rounded cursor-pointer border-0 p-0.5" style={{ border: '0.5px solid var(--border-md)' }} />
                <input type="text" value={config?.color_acento || ''} onChange={(e) => handleChange('color_acento', e.target.value)}
                  maxLength={7} className="flex-1 px-3 py-2 rounded-lg text-sm outline-none font-mono"
                  style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }} />
              </div>
            </div>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--ash)' }}>
            Logo y favicon se suben desde el detalle de configuración una vez conectado el backend (uploads multipart, límite 15MB).
          </p>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
        <div className="px-5 py-3.5" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Menú y footer</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Color del menú</label>
              <select value={config?.estilo_menu || 'claro'} onChange={(e) => handleChange('estilo_menu', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}>
                <option value="claro">Claro</option>
                <option value="oscuro">Oscuro</option>
                <option value="marca">Color de marca</option>
                <option value="transparente">Transparente sobre el hero</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Color del footer</label>
              <select value={config?.estilo_footer || 'claro'} onChange={(e) => handleChange('estilo_footer', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}>
                <option value="claro">Claro</option>
                <option value="oscuro">Oscuro</option>
                <option value="marca">Color de marca</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Alineación del menú</label>
              <select value={config?.alineacion_menu || 'izquierda'} onChange={(e) => handleChange('alineacion_menu', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}>
                <option value="izquierda">Logo izquierda, links derecha</option>
                <option value="centro">Logo y links centrados</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Menú fijo (sticky)</label>
              <label className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer select-none"
                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                <input type="checkbox" checked={config?.menu_fijo ?? true} onChange={(e) => handleChange('menu_fijo', e.target.checked)}
                  className="h-4 w-4" />
                Queda fijo al hacer scroll
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
        <div className="px-5 py-3.5" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Tipografía y botones</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Tipografía</label>
              <select value={config?.tipografia || 'moderna'} onChange={(e) => handleChange('tipografia', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}>
                <option value="moderna">Moderna (sans)</option>
                <option value="editorial">Editorial (serif + sans)</option>
                <option value="clasica">Clásica (serif)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Estilo de botones</label>
              <select value={config?.estilo_botones || 'pildora'} onChange={(e) => handleChange('estilo_botones', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}>
                <option value="pildora">Píldora</option>
                <option value="redondeado">Redondeado</option>
                <option value="cuadrado">Cuadrado</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
        <div className="px-5 py-3.5" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>SEO por defecto</h3>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Título (máx. 70)</label>
            <input type="text" value={config?.seo_titulo_default || ''} maxLength={70}
              onChange={(e) => handleChange('seo_titulo_default', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Descripción (máx. 160)</label>
            <textarea value={config?.seo_descripcion_default || ''} maxLength={160} rows={3}
              onChange={(e) => handleChange('seo_descripcion_default', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
              style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }} />
          </div>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
        <div className="px-5 py-3.5" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Contacto</h3>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Teléfono</label>
            <input type="tel" value={config?.telefono_contacto || ''} onChange={(e) => handleChange('telefono_contacto', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Correo</label>
            <input type="email" value={config?.email_contacto || ''} onChange={(e) => handleChange('email_contacto', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Dirección</label>
            <input type="text" value={config?.direccion || ''} onChange={(e) => handleChange('direccion', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }} />
          </div>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
        <div className="px-5 py-3.5" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Redes Sociales</h3>
        </div>
        <div className="p-5 space-y-3">
          {['facebook', 'instagram', 'twitter', 'youtube', 'tiktok'].map((red) => (
            <div key={red}>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5 capitalize" style={{ color: 'var(--ash)' }}>{red}</label>
              <input type="url" value={config?.redes_sociales?.[red] || ''} onChange={(e) => handleRedChange(red, e.target.value)}
                placeholder={`https://${red}.com/...`}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }} />
            </div>
          ))}
        </div>
      </div>

      <div className="lg:col-span-2 flex justify-end">
        <button type="submit" disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 min-h-[44px]"
          style={{ background: 'var(--pb)' }}>
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          Guardar Configuración
        </button>
      </div>
    </form>
  );
};

// ─── Tab: Menú ──────────────────────────────────────────────────────────────

const TabMenu = () => {
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [creandoNombre, setCreandoNombre] = useState(null);
  const [paginasDisponibles, setPaginasDisponibles] = useState([]);
  const [articulosDisponibles, setArticulosDisponibles] = useState([]);

  const fetchMenus = () => {
    setLoading(true);
    getMenus()
      .then((res) => setMenus(res.data))
      .catch(() => toast.error('No se pudieron cargar los menús.'))
      .finally(() => setLoading(false));
  };

  useEffect(fetchMenus, []);

  // Opciones para los <select> de destino de cada item (tipo 'pagina' /
  // 'articulo'). page_size alto porque son listas de referencia para un
  // dropdown, no una tabla paginada.
  useEffect(() => {
    getPaginas({ page_size: 100 })
      .then((res) => setPaginasDisponibles(res.data?.results ?? []))
      .catch(() => toast.error('No se pudieron cargar las páginas del sitio.'));
    getArticulos({ page_size: 100 })
      .then((res) => setArticulosDisponibles(res.data?.results ?? []))
      .catch(() => toast.error('No se pudieron cargar los artículos del sitio.'));
  }, []);

  const crearMenu = async (nombre) => {
    setCreandoNombre(nombre);
    try {
      await createMenu(nombre);
      toast.success(`Menú "${nombre}" creado.`);
      fetchMenus();
    } catch (err) {
      toast.error(err?.response?.data?.nombre?.[0] || err?.response?.data?.detail || 'No se pudo crear el menú.');
    } finally {
      setCreandoNombre(null);
    }
  };

  const menusFaltantes = MENUS_ESPERADOS.filter(
    (esperado) => !menus.some((m) => m.nombre === esperado.nombre)
  );

  const moverItem = (menuIdx, itemIdx, delta) => {
    setMenus((prev) => {
      const copia = prev.map((m) => ({ ...m, items: [...m.items] }));
      const items = copia[menuIdx].items;
      const nuevo = itemIdx + delta;
      if (nuevo < 0 || nuevo >= items.length) return prev;
      [items[itemIdx], items[nuevo]] = [items[nuevo], items[itemIdx]];
      items.forEach((it, i) => { it.orden = i; });
      return copia;
    });
  };

  const eliminarItem = (menuIdx, itemIdx) => {
    setMenus((prev) => {
      const copia = prev.map((m) => ({ ...m, items: [...m.items] }));
      copia[menuIdx].items.splice(itemIdx, 1);
      copia[menuIdx].items.forEach((it, i) => { it.orden = i; });
      return copia;
    });
  };

  const agregarItem = (menuIdx) => {
    setMenus((prev) => {
      const copia = prev.map((m) => ({ ...m, items: [...m.items] }));
      const items = copia[menuIdx].items;
      items.push({
        id: `nuevo-${Date.now()}`, etiqueta: 'Nuevo item', tipo_destino: 'url_externa',
        pagina: null, url_externa: '', orden: items.length, abre_nueva_pestana: false,
      });
      return copia;
    });
  };

  const actualizarCampo = (menuIdx, itemIdx, campo, valor) => {
    setMenus((prev) => {
      const copia = prev.map((m) => ({ ...m, items: [...m.items] }));
      copia[menuIdx].items[itemIdx] = { ...copia[menuIdx].items[itemIdx], [campo]: valor };
      return copia;
    });
  };

  const guardarMenu = async (menu) => {
    setSavingId(menu.id);
    try {
      // El id local `nuevo-<timestamp>` solo sirve como key de React mientras
      // se edita en el cliente; el backend espera id ausente/null para crear
      // items nuevos (ver ItemMenuInputSerializer). Si viaja el string, DRF
      // responde 400 y se pierde el resto del árbol en el mismo PUT.
      const itemsParaEnviar = menu.items.map(({ id, ...resto }) => (
        typeof id === 'string' && id.startsWith('nuevo-') ? resto : { id, ...resto }
      ));
      await actualizarItemsMenu(menu.id, itemsParaEnviar);
      toast.success(`Menú "${menu.nombre}" actualizado.`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo guardar el menú.');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin" size={24} style={{ color: 'var(--pb)' }} />
      </div>
    );
  }

  if (menus.length === 0) {
    return (
      <div className="rounded-xl p-8 text-center" style={{ border: '0.5px dashed var(--border-md)', background: 'var(--porcelain)' }}>
        <div className="mx-auto mb-3 w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'var(--pb-light)' }}>
          <MenuIcon size={18} style={{ color: 'var(--pb)' }} />
        </div>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Todavía no hay menús</h3>
        <p className="text-xs mt-1 max-w-md mx-auto" style={{ color: 'var(--ash)' }}>
          El sitio público necesita un menú <strong>principal</strong> (navegación superior) y un menú <strong>footer</strong> (pie
          de página) para mostrar la navegación. Creá ambos para empezar a agregar items.
        </p>
        <div className="flex flex-wrap justify-center gap-2 mt-5">
          {MENUS_ESPERADOS.map((esperado) => (
            <button key={esperado.nombre} type="button" onClick={() => crearMenu(esperado.nombre)} disabled={creandoNombre === esperado.nombre}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--pb)' }}>
              {creandoNombre === esperado.nombre ? <Loader2 className="animate-spin" size={13} /> : <Plus size={13} />}
              Crear {esperado.label.toLowerCase()}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {menusFaltantes.length > 0 && (
        <div className="rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3"
          style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
          <p className="text-xs" style={{ color: 'var(--ash)' }}>
            Falta{menusFaltantes.length > 1 ? 'n' : ''} crear: {menusFaltantes.map((m) => m.label.toLowerCase()).join(', ')}.
          </p>
          <div className="flex flex-wrap gap-2">
            {menusFaltantes.map((esperado) => (
              <button key={esperado.nombre} type="button" onClick={() => crearMenu(esperado.nombre)} disabled={creandoNombre === esperado.nombre}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--pb)' }}>
                {creandoNombre === esperado.nombre ? <Loader2 className="animate-spin" size={12} /> : <Plus size={12} />}
                Crear {esperado.label.toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {menus.map((menu, menuIdx) => (
        <div key={menu.id} className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
          <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
            <h3 className="text-sm font-semibold capitalize" style={{ color: 'var(--jet)' }}>Menú: {menu.nombre}</h3>
            <button type="button" onClick={() => agregarItem(menuIdx)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white"
              style={{ background: 'var(--pb)' }}>
              <Plus size={12} /> Item
            </button>
          </div>
          <div className="p-4 space-y-2">
            {menu.items.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: 'var(--ash)' }}>Sin items en este menú.</p>
            ) : (
              menu.items.map((item, itemIdx) => (
                <div key={item.id} className="flex items-center gap-2 p-2.5 rounded-lg" style={{ background: 'var(--bg)', border: '0.5px solid var(--border)' }}>
                  <div className="flex flex-col">
                    <button type="button" onClick={() => moverItem(menuIdx, itemIdx, -1)} disabled={itemIdx === 0}
                      className="p-0.5 disabled:opacity-25" style={{ color: 'var(--ash)' }}><ArrowUp size={12} /></button>
                    <button type="button" onClick={() => moverItem(menuIdx, itemIdx, 1)} disabled={itemIdx === menu.items.length - 1}
                      className="p-0.5 disabled:opacity-25" style={{ color: 'var(--ash)' }}><ArrowDown size={12} /></button>
                  </div>
                  <input type="text" value={item.etiqueta} onChange={(e) => actualizarCampo(menuIdx, itemIdx, 'etiqueta', e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded-md text-xs outline-none"
                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                  <select value={item.tipo_destino} onChange={(e) => actualizarCampo(menuIdx, itemIdx, 'tipo_destino', e.target.value)}
                    className="px-2 py-1.5 rounded-md text-xs outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                    <option value="pagina">Página</option>
                    <option value="articulo">Artículo</option>
                    <option value="url_externa">URL externa</option>
                  </select>
                  {item.tipo_destino === 'url_externa' && (
                    <input type="text" value={item.url_externa} onChange={(e) => actualizarCampo(menuIdx, itemIdx, 'url_externa', e.target.value)}
                      placeholder="/ruta" className="w-28 px-2 py-1.5 rounded-md text-xs outline-none"
                      style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                  )}
                  {item.tipo_destino === 'pagina' && (
                    <select value={item.pagina ?? ''} onChange={(e) => actualizarCampo(menuIdx, itemIdx, 'pagina', e.target.value ? Number(e.target.value) : null)}
                      className="w-28 px-2 py-1.5 rounded-md text-xs outline-none"
                      style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                      <option value="">Elegir página…</option>
                      {paginasDisponibles.map((p) => (
                        <option key={p.id} value={p.id}>{p.titulo}</option>
                      ))}
                    </select>
                  )}
                  {item.tipo_destino === 'articulo' && (
                    <select value={item.articulo ?? ''} onChange={(e) => actualizarCampo(menuIdx, itemIdx, 'articulo', e.target.value ? Number(e.target.value) : null)}
                      className="w-28 px-2 py-1.5 rounded-md text-xs outline-none"
                      style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                      <option value="">Elegir artículo…</option>
                      {articulosDisponibles.map((a) => (
                        <option key={a.id} value={a.id}>{a.titulo}</option>
                      ))}
                    </select>
                  )}
                  <button type="button" onClick={() => eliminarItem(menuIdx, itemIdx)} className="p-1.5 rounded-md" style={{ color: 'var(--red)', background: 'var(--red-light)' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="px-4 pb-4 flex justify-end">
            <button type="button" onClick={() => guardarMenu(menu)} disabled={savingId === menu.id}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--pb)' }}>
              {savingId === menu.id ? <Loader2 className="animate-spin" size={13} /> : <Save size={13} />}
              Guardar Menú
            </button>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
};

// ─── Página principal ───────────────────────────────────────────────────────

const GestionSitio = () => {
  const [tab, setTab] = useState('articulos');
  const [articuloEditando, setArticuloEditando] = useState(undefined); // undefined: cerrado, null: nuevo, obj: editar
  const [paginaEditorVisual, setPaginaEditorVisual] = useState(null);
  const [creandoPagina, setCreandoPagina] = useState(false);
  const [paginaEditandoMeta, setPaginaEditandoMeta] = useState(null);
  const [refrescarPaginas, setRefrescarPaginas] = useState(0);
  const [sinHomePublicada, setSinHomePublicada] = useState(false);

  // Auditoría (Fase 0): el panel no avisaba cuando ningún Pagina publicada
  // tiene es_home=True — el sitio público en "/" cae al 404 genérico sin que
  // el director se entere de por qué. Chequeo liviano, no bloqueante.
  useEffect(() => {
    const controller = new AbortController();
    getPaginas({ estado: 'publicado', page_size: 100 }, controller.signal)
      .then((res) => setSinHomePublicada(!(res.data?.results ?? []).some((p) => p.es_home)))
      .catch(() => {});
    return () => controller.abort();
  }, [refrescarPaginas]);

  return (
    <div className="animate-fadeIn pb-16">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="p-2.5 rounded-xl" style={{ background: 'var(--pb-light)' }}>
            <Globe size={20} style={{ color: 'var(--pb)' }} />
          </div>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--jet)' }}>Sitio Institucional</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>Páginas, artículos, medios y configuración del sitio público</p>
          </div>
        </div>
        <button type="button" onClick={() => window.open(SITIO_URL, '_blank')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
          <ExternalLink size={14} /> Ver sitio público
        </button>
      </div>

      {sinHomePublicada && (
        <div className="mb-5 flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: '#fef3c7', border: '0.5px solid #fcd34d' }}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: '#b45309' }} />
          <p className="text-xs" style={{ color: '#92400e' }}>
            Tu sitio no tiene página de inicio configurada — nadie marcó una página como "Home" y publicada.
            Quien visite <code>{SITIO_URL}</code> va a ver un 404. Anda a <b>Páginas</b>, marcá "Home" en una y publicala.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 overflow-x-auto pb-1" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors"
            style={{
              color: tab === key ? 'var(--pb)' : 'var(--ash)',
              borderBottom: tab === key ? '2px solid var(--pb)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Contenido por tab */}
      {tab === 'articulos' && (
        articuloEditando !== undefined ? (
          <EditorArticulo
            articulo={articuloEditando}
            onGuardado={() => setArticuloEditando(undefined)}
            onCancelar={() => setArticuloEditando(undefined)}
          />
        ) : (
          <TablaArticulos
            onNuevo={() => setArticuloEditando(null)}
            onEditar={(articulo) => setArticuloEditando(articulo)}
          />
        )
      )}

      {tab === 'paginas' && (
        <TablaPaginas
          key={refrescarPaginas}
          onNueva={() => setCreandoPagina(true)}
          onEditar={(pagina) => setPaginaEditandoMeta(pagina)}
          onAbrirEditorVisual={(pagina) => { setPaginaEditorVisual(pagina); setTab('editor'); }}
        />
      )}

      {creandoPagina && (
        <CrearPaginaModal
          onCerrar={() => setCreandoPagina(false)}
          onCreada={(pagina) => {
            setCreandoPagina(false);
            setPaginaEditorVisual(pagina);
            setTab('editor');
          }}
        />
      )}

      {paginaEditandoMeta && (
        <EditarPaginaModal
          pagina={paginaEditandoMeta}
          onCerrar={() => setPaginaEditandoMeta(null)}
          onGuardada={() => {
            setPaginaEditandoMeta(null);
            setRefrescarPaginas((n) => n + 1);
          }}
        />
      )}

      {tab === 'editor' && (
        <div className="space-y-5">
          <ConstructorPaginas pagina={paginaEditorVisual} />
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--ash)' }}>
              Biblioteca de medios
            </h3>
            <BibliotecaMedia />
          </div>
        </div>
      )}

      {tab === 'papelera' && <TabPapelera />}

      {tab === 'menu' && <TabMenu />}

      {tab === 'config' && <TabConfig />}

      {tab === 'metricas' && <MetricasSitio />}
    </div>
  );
};

export default GestionSitio;
