import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Nodo TipTap tipo "átomo" para representar un placeholder de constancia
 * ({{grupo.campo}} o {{sexo:variante_a|variante_b}}) como una píldora visual
 * no editable, en vez de texto crudo.
 *
 * Atributos:
 * - token: el token técnico completo, ej. "alumno.nombres" o "sexo:el|la".
 *   Se guarda en el HTML serializado como data-token, para poder reconstruir
 *   `{{token}}` desde el HTML aunque la píldora solo muestre la etiqueta.
 * - label: etiqueta legible mostrada en la píldora, ej. "Nombres del alumno".
 *   Si no se conoce (token convertido desde notación vieja y no encontrado
 *   en el catálogo), se usa el propio token como fallback visual.
 */
export const PlaceholderNode = Node.create({
  name: 'placeholder',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      token: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-token'),
        renderHTML: (attrs) => ({ 'data-token': attrs.token }),
      },
      label: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-label') || el.textContent || '',
        renderHTML: (attrs) => ({ 'data-label': attrs.label }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-token]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const texto = node.attrs.label || node.attrs.token || '';
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'octo-placeholder-pill',
        contenteditable: 'false',
        style:
          'display:inline-flex;align-items:center;padding:1px 8px;margin:0 1px;'
          + 'border-radius:9999px;font-size:0.75em;line-height:1.6;white-space:nowrap;'
          + 'background:var(--pb-light,#dbeafe);color:var(--pb,#2563eb);'
          + 'border:0.5px solid var(--pb,#2563eb);user-select:none;',
      }),
      texto,
    ];
  },

  renderText({ node }) {
    return `{{${node.attrs.token}}}`;
  },

  addCommands() {
    return {
      insertPlaceholder:
        (attrs) =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({ type: this.name, attrs })
            .run(),
    };
  },
});

export default PlaceholderNode;
