import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model';
import { contieneNotacionVieja, convertirNotacionVieja } from './notacionVieja';

const escaparHtml = (texto = '') =>
  texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/**
 * Extensión TipTap que detecta la notación vieja ❴❴campo❵❵ en el contenido
 * pegado (HTML o texto plano) y la convierte automáticamente a píldoras de
 * placeholder antes de insertarla en el documento.
 *
 * Recibe `destinatario` y una función `getCatalogoEtiquetas()` para resolver
 * la etiqueta legible de cada token convertido (o el token crudo si no está
 * en el catálogo cargado en ese momento).
 */
export const PasteConversionExtension = Extension.create({
  name: 'pasteConversionNotacionVieja',

  addOptions() {
    return {
      destinatario: 'alumno',
      getCatalogoEtiquetas: () => new Map(),
    };
  },

  addProseMirrorPlugins() {
    const { destinatario, getCatalogoEtiquetas } = this.options;

    return [
      new Plugin({
        key: new PluginKey('pasteConversionNotacionVieja'),
        props: {
          handlePaste: (view, event) => {
            const clipboard = event.clipboardData;
            if (!clipboard) return false;

            const html = clipboard.getData('text/html');
            const texto = clipboard.getData('text/plain');
            const fuente = html || texto;
            if (!fuente || !contieneNotacionVieja(fuente)) return false;

            const catalogo = getCatalogoEtiquetas ? getCatalogoEtiquetas() : new Map();
            const destinatarioActual = destinatario;

            const htmlBase = html || `<p>${escaparHtml(texto).replace(/\r?\n/g, '</p><p>')}</p>`;
            const htmlConvertido = convertirNotacionVieja(htmlBase, destinatarioActual, catalogo);

            const contenedor = document.createElement('div');
            contenedor.innerHTML = htmlConvertido;

            const parser = ProseMirrorDOMParser.fromSchema(view.state.schema);
            const slice = parser.parseSlice(contenedor, { preserveWhitespace: true });

            const tr = view.state.tr.replaceSelection(slice);
            view.dispatch(tr.scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },
});

export default PasteConversionExtension;
