import { useState } from 'react';
import { toast } from 'react-toastify';
import { X, Loader2, Save } from 'lucide-react';
import { updatePagina } from '../../api/sitio.service';

const inputStyle = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };

/**
 * Modal de edición de metadatos de una Pagina ya creada (título, slug —
 * solo lectura, autogenerado por el backend—, es_home, mostrar_en_menu,
 * SEO). Reutiliza el paso 1 de CrearPaginaModal.jsx sin el selector de
 * plantilla (no aplica a edición). Al guardar llama a `updatePagina` y
 * delega en `onGuardada` para que el llamador refresque la tabla.
 */
const EditarPaginaModal = ({ pagina, onCerrar, onGuardada }) => {
  const [titulo, setTitulo] = useState(pagina.titulo || '');
  const [mostrarEnMenu, setMostrarEnMenu] = useState(!!pagina.mostrar_en_menu);
  const [esHome, setEsHome] = useState(!!pagina.es_home);
  const [seoTitulo, setSeoTitulo] = useState(pagina.seo_titulo || '');
  const [seoDescripcion, setSeoDescripcion] = useState(pagina.seo_descripcion || '');
  const [guardando, setGuardando] = useState(false);

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!titulo.trim()) {
      toast.error('El título es obligatorio.');
      return;
    }
    setGuardando(true);
    try {
      const res = await updatePagina(pagina.id, {
        titulo: titulo.trim(),
        mostrar_en_menu: mostrarEnMenu,
        es_home: esHome,
        seo_titulo: seoTitulo,
        seo_descripcion: seoDescripcion,
      });
      toast.success(`Página "${res.data.titulo}" actualizada.`);
      onGuardada(res.data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo actualizar la página.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ background: 'rgba(43,48,58,0.6)' }} onClick={() => !guardando && onCerrar()}>
      <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl" style={{ background: 'var(--bg)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 sticky top-0 z-10" style={{ background: 'var(--bg)', borderBottom: '0.5px solid var(--border-md)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Editar página</p>
          <button type="button" onClick={onCerrar} disabled={guardando} className="p-1 rounded-lg disabled:opacity-40" style={{ color: 'var(--ash)' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleGuardar} className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Título</label>
            <input
              type="text"
              autoFocus
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Admisiones"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Slug (URL)</label>
            <input
              type="text"
              value={pagina.slug || ''}
              disabled
              className="w-full px-3 py-2 rounded-lg text-sm outline-none opacity-60 cursor-not-allowed"
              style={inputStyle}
            />
            <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>El slug se genera automáticamente a partir del título y no cambia una vez creada la página.</p>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--jet)' }}>
            <input type="checkbox" checked={mostrarEnMenu} onChange={(e) => setMostrarEnMenu(e.target.checked)} />
            Mostrar en el menú de navegación
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--jet)' }}>
            <input type="checkbox" checked={esHome} onChange={(e) => setEsHome(e.target.checked)} />
            Usar como página de inicio
          </label>
          {esHome && !pagina.es_home && (
            <p className="text-[11px]" style={{ color: '#b45309' }}>
              Al guardar, reemplazará a la página de inicio actual.
            </p>
          )}

          <div className="pt-2" style={{ borderTop: '0.5px solid var(--border-md)' }}>
            <p className="text-xs font-semibold mb-3 pt-2" style={{ color: 'var(--jet)' }}>SEO</p>
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Título SEO (máx. 70)</label>
                <input
                  type="text"
                  value={seoTitulo}
                  maxLength={70}
                  onChange={(e) => setSeoTitulo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Descripción SEO (máx. 160)</label>
                <textarea
                  value={seoDescripcion}
                  maxLength={160}
                  rows={3}
                  onChange={(e) => setSeoDescripcion(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCerrar}
              disabled={guardando}
              className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
              style={{ color: 'var(--ash)' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: 'var(--pb)' }}
            >
              {guardando ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              Guardar cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditarPaginaModal;
