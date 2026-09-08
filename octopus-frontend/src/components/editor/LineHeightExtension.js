import { Extension } from '@tiptap/core';

/**
 * Interlineado (line-height) para el editor de constancias.
 * No hay una extensión oficial de TipTap para esto; se implementa como
 * atributo global sobre los nodos de bloque (párrafo / encabezado), mismo
 * patrón que usa @tiptap/extension-text-align (ya instalado) para alineación.
 */
export const LineHeightExtension = Extension.create({
  name: 'lineHeight',

  addOptions() {
    return { types: ['paragraph', 'heading'] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) => {
              if (!attributes.lineHeight) return {};
              return { style: `line-height: ${attributes.lineHeight}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineHeight:
        (lineHeight) =>
        ({ commands }) =>
          this.options.types.every((type) => commands.updateAttributes(type, { lineHeight })),
      unsetLineHeight:
        () =>
        ({ commands }) =>
          this.options.types.every((type) => commands.updateAttributes(type, { lineHeight: null })),
    };
  },
});

export default LineHeightExtension;
