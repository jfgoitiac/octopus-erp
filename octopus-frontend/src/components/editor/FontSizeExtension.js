import { Extension } from '@tiptap/core';

/**
 * Tamaño de fuente para el editor de constancias.
 * No existe una versión estable de @tiptap/extension-font-size para tiptap 3.x
 * (solo un prerelease "next"), así que se replica el patrón oficial: un
 * atributo global sobre la marca `textStyle` (igual a como funciona
 * @tiptap/extension-font-family, ya instalado). No es una librería nueva,
 * es una extensión local sobre una extensión ya aprobada.
 */
export const FontSizeExtension = Extension.create({
  name: 'fontSize',

  addOptions() {
    return { types: ['textStyle'] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize) =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

export default FontSizeExtension;
