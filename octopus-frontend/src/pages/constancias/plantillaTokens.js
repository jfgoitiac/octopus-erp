/**
 * Traduce entre el HTML crudo que espera el backend (`cuerpo_html`/`anexo_html`,
 * con tags `<p>` y placeholders `{{grupo.campo}}` / `{{sexo:a|b}}`) y el HTML
 * "editable" que usa <PlaceholderRichEditor>, donde cada placeholder se ve
 * como una píldora con su nombre en español en vez de la sintaxis con llaves
 * — el usuario final no programa, así que nunca debe ver `<p>` ni `{{ }}`.
 */

const TOKEN_RE = /\{\{\s*sexo:([^|}]+)\|([^}]+)\}\}|\{\{\s*([a-zA-Z_]+)\.([a-zA-Z_]+)\s*\}\}/g;

export const escapeHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const capitalizar = (s) => s.replace(/_/g, ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase());

const beautifyToken = (grupo, campo) => `${capitalizar(grupo)} · ${capitalizar(campo)}`;

const chipHtml = (token, etiqueta) =>
  `<span class="pc-chip" data-token="${escapeHtml(token)}" contenteditable="false">${escapeHtml(etiqueta)}</span>`;

export const buildTokenToEtiqueta = (grupos) => {
  const mapa = {};
  (grupos || []).forEach((g) => {
    (g.placeholders || []).forEach((p) => {
      mapa[p.token] = p.etiqueta;
    });
  });
  return mapa;
};

/** HTML crudo del backend → HTML "editable" con píldoras, para mostrar en el editor. */
export function rawHtmlToEditable(rawHtml, tokenToEtiqueta = {}) {
  if (!rawHtml) return '';
  const bloques = [...rawHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
  const contenido = bloques.length ? bloques.map((m) => m[1]).join('<br><br>') : rawHtml;

  return contenido.replace(TOKEN_RE, (match, sexoA, sexoB, grupo, campo) => {
    if (sexoA !== undefined) {
      return chipHtml(`{{sexo:${sexoA}|${sexoB}}}`, `${sexoA} / ${sexoB}`);
    }
    const token = `{{${grupo}.${campo}}}`;
    return chipHtml(token, tokenToEtiqueta[token] || beautifyToken(grupo, campo));
  });
}

/** HTML "editable" del DOM (con píldoras) → HTML crudo para guardar en el backend. */
export function editableToRawHtml(containerEl) {
  if (!containerEl) return '';
  const clone = containerEl.cloneNode(true);
  clone.querySelectorAll('[data-token]').forEach((chip) => {
    chip.replaceWith(document.createTextNode(chip.getAttribute('data-token') || ''));
  });
  const inner = clone.innerHTML.trim();
  return inner ? `<p>${inner}</p>` : '';
}

export function crearTokenGenero(formaMasculina, formaFemenina) {
  const limpiar = (s) => String(s || '').trim().replace(/[{}|]/g, '');
  const masc = limpiar(formaMasculina);
  const fem = limpiar(formaFemenina);
  if (!masc || !fem) return null;
  return { token: `{{sexo:${masc}|${fem}}}`, etiqueta: `${masc} / ${fem}` };
}
