import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import {
  Bold, Italic, Underline as UnderlineIcon,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered,
} from 'lucide-react';

import PlaceholderNode from './PlaceholderNode';
import PasteConversionExtension from './PasteConversionExtension';
import FontSizeExtension from './FontSizeExtension';
import LineHeightExtension from './LineHeightExtension';
import SelectorPlaceholders from './SelectorPlaceholders';
import { getPlaceholdersCatalog, PARES_GENERO_FALLBACK } from './placeholdersApi';

/**
 * EditorConstancia — editor de texto rico (TipTap) para plantillas de
 * constancias, con selector de placeholders e inserción de género inline.
 *
 * Props públicas:
 * - value {string}: HTML inicial del cuerpo de la constancia.
 * - onChange(html: string): se llama con el HTML actualizado en cada edición.
 * - destinatario {'alumno'|'trabajador'}: contexto usado para (a) pedir el
 *   catálogo de placeholders correcto al backend y (b) resolver campos
 *   ambiguos de la notación vieja (apellidos/nombres/cargo) al pegar.
 * - placeholder {string}: texto de placeholder cuando el editor está vacío.
 */

const FUENTES = [
  { valor: '', etiqueta: 'Fuente' },
  { valor: 'Arial, sans-serif', etiqueta: 'Arial' },
  { valor: 'Georgia, serif', etiqueta: 'Georgia' },
  { valor: '"Times New Roman", Times, serif', etiqueta: 'Times New Roman' },
  { valor: '"Courier New", Courier, monospace', etiqueta: 'Courier New' },
  { valor: 'Verdana, sans-serif', etiqueta: 'Verdana' },
];

const TAMANOS = [
  { valor: '', etiqueta: 'Tamaño' },
  { valor: '10px', etiqueta: '10' },
  { valor: '12px', etiqueta: '12' },
  { valor: '14px', etiqueta: '14' },
  { valor: '16px', etiqueta: '16' },
  { valor: '18px', etiqueta: '18' },
  { valor: '24px', etiqueta: '24' },
  { valor: '32px', etiqueta: '32' },
];

const INTERLINEADOS = [
  { valor: '', etiqueta: 'Interlineado' },
  { valor: '1', etiqueta: '1.0' },
  { valor: '1.15', etiqueta: '1.15' },
  { valor: '1.5', etiqueta: '1.5' },
  { valor: '2', etiqueta: '2.0' },
];

const selectStyle = {
  border: '0.5px solid var(--border-md)',
  background: '#fff',
  color: 'var(--jet)',
  fontSize: '12px',
};

const EditorConstancia = ({ value = '', onChange = () => {}, destinatario = 'alumno', placeholder = '' }) => {
  const [grupos, setGrupos] = useState([]);
  const [paresGenero, setParesGenero] = useState(PARES_GENERO_FALLBACK);
  // Contenedor mutable (no un ref de React) para exponer el catálogo cargado
  // a la extensión de pegado sin recrear el editor cada vez que llega la
  // respuesta del endpoint.
  const catalogoContenedor = useMemo(() => ({ current: new Map() }), []);

  useEffect(() => {
    let cancelado = false;
    getPlaceholdersCatalog(destinatario)
      .then((data) => {
        if (cancelado) return;
        const gruposData = data?.grupos || [];
        setGrupos(gruposData);
        const mapa = new Map();
        gruposData.forEach((g) => g.placeholders?.forEach((p) => mapa.set(p.token, p.etiqueta)));
        catalogoContenedor.current = mapa;
        if (data?.sexo?.pares_sugeridos?.length) {
          setParesGenero(data.sexo.pares_sugeridos);
        }
      })
      .catch(() => {
        toast.error('No se pudo cargar el catálogo de placeholders. Se usa el listado de género por defecto.');
      });
    return () => { cancelado = true; };
  }, [destinatario, catalogoContenedor]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      FontFamily,
      FontSizeExtension,
      LineHeightExtension,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      PlaceholderNode,
      PasteConversionExtension.configure({
        destinatario,
        getCatalogoEtiquetas: () => catalogoContenedor.current,
      }),
    ],
    content: value,
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
  });

  // Si `value` cambia externamente (ej. cargar otra plantilla), resincroniza.
  useEffect(() => {
    if (!editor) return;
    const actual = editor.getHTML();
    if (value !== actual && value !== undefined) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  }, [value, editor]);

  const insertarPlaceholder = (token, etiqueta) => {
    editor?.chain().focus().insertPlaceholder({ token, label: etiqueta }).run();
  };

  const insertarGenero = (a, b) => {
    const token = `sexo:${a}|${b}`;
    editor?.chain().focus().insertPlaceholder({ token, label: `${a}/${b}` }).run();
  };

  const toolbarBtns = useMemo(() => {
    if (!editor) return [];
    return [
      { icon: Bold, label: 'Negrita', activo: editor.isActive('bold'), onClick: () => editor.chain().focus().toggleBold().run() },
      { icon: Italic, label: 'Cursiva', activo: editor.isActive('italic'), onClick: () => editor.chain().focus().toggleItalic().run() },
      { icon: UnderlineIcon, label: 'Subrayado', activo: editor.isActive('underline'), onClick: () => editor.chain().focus().toggleUnderline().run() },
      { icon: AlignLeft, label: 'Alinear izquierda', activo: editor.isActive({ textAlign: 'left' }), onClick: () => editor.chain().focus().setTextAlign('left').run() },
      { icon: AlignCenter, label: 'Centrar', activo: editor.isActive({ textAlign: 'center' }), onClick: () => editor.chain().focus().setTextAlign('center').run() },
      { icon: AlignRight, label: 'Alinear derecha', activo: editor.isActive({ textAlign: 'right' }), onClick: () => editor.chain().focus().setTextAlign('right').run() },
      { icon: AlignJustify, label: 'Justificar', activo: editor.isActive({ textAlign: 'justify' }), onClick: () => editor.chain().focus().setTextAlign('justify').run() },
      { icon: List, label: 'Lista', activo: editor.isActive('bulletList'), onClick: () => editor.chain().focus().toggleBulletList().run() },
      { icon: ListOrdered, label: 'Lista numerada', activo: editor.isActive('orderedList'), onClick: () => editor.chain().focus().toggleOrderedList().run() },
    ];
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="rounded-lg overflow-hidden w-full" style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
      <div
        className="flex items-center gap-1 px-2 py-1.5 flex-nowrap overflow-x-auto"
        style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}
      >
        {toolbarBtns.map(({ icon: Icon, label, activo, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            title={label}
            className="p-1.5 rounded-md shrink-0"
            style={{
              color: activo ? 'var(--pb)' : 'var(--ash)',
              background: activo ? 'var(--pb-light)' : 'transparent',
            }}
          >
            <Icon size={14} />
          </button>
        ))}

        <span className="w-px h-5 mx-1 shrink-0" style={{ background: 'var(--border-md)' }} />

        <select
          className="px-2 py-1.5 rounded-md text-xs shrink-0"
          style={selectStyle}
          value={editor.getAttributes('textStyle').fontFamily || ''}
          onChange={(e) => {
            const v = e.target.value;
            if (v) editor.chain().focus().setFontFamily(v).run();
            else editor.chain().focus().unsetFontFamily().run();
          }}
        >
          {FUENTES.map((f) => <option key={f.valor} value={f.valor}>{f.etiqueta}</option>)}
        </select>

        <select
          className="px-2 py-1.5 rounded-md text-xs shrink-0"
          style={selectStyle}
          value={editor.getAttributes('textStyle').fontSize || ''}
          onChange={(e) => {
            const v = e.target.value;
            if (v) editor.chain().focus().setFontSize(v).run();
            else editor.chain().focus().unsetFontSize().run();
          }}
        >
          {TAMANOS.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
        </select>

        <select
          className="px-2 py-1.5 rounded-md text-xs shrink-0"
          style={selectStyle}
          value={editor.getAttributes('paragraph').lineHeight || ''}
          onChange={(e) => {
            const v = e.target.value;
            if (v) editor.chain().focus().setLineHeight(v).run();
            else editor.chain().focus().unsetLineHeight().run();
          }}
        >
          {INTERLINEADOS.map((i) => <option key={i.valor} value={i.valor}>{i.etiqueta}</option>)}
        </select>

        <span className="w-px h-5 mx-1 shrink-0" style={{ background: 'var(--border-md)' }} />

        <SelectorPlaceholders
          grupos={grupos}
          paresGenero={paresGenero}
          onInsertarPlaceholder={insertarPlaceholder}
          onInsertarGenero={insertarGenero}
        />
      </div>

      <div className="px-3 py-2.5 octo-editor-constancia-wrap relative" style={{ minHeight: 220 }}>
        <EditorContent editor={editor} />
        {editor.isEmpty && placeholder && (
          <p
            className="text-xs pointer-events-none absolute top-2.5 left-3"
            style={{ color: 'var(--ash)' }}
          >
            {placeholder}
          </p>
        )}
      </div>

      <style>{`
        .octo-editor-constancia-wrap .ProseMirror {
          outline: none;
          min-height: 200px;
          font-size: 14px;
          line-height: 1.6;
          color: var(--jet);
        }
        .octo-editor-constancia-wrap .ProseMirror ul {
          list-style: disc;
          padding-left: 1.25rem;
        }
        .octo-editor-constancia-wrap .ProseMirror ol {
          list-style: decimal;
          padding-left: 1.25rem;
        }
        .octo-editor-constancia-wrap .ProseMirror p {
          margin: 0.25rem 0;
        }
      `}</style>
    </div>
  );
};

export default EditorConstancia;
