import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { editableToRawHtml, rawHtmlToEditable } from '../../pages/constancias/plantillaTokens';

/**
 * Caja de texto "sin HTML a la vista": por dentro guarda `<p>` y
 * `{{token}}`, pero quien escribe solo ve texto normal y píldoras con
 * nombres en español (ver plantillaTokens.js). Pensado para gente que no
 * programa — nada de etiquetas ni llaves visibles.
 *
 * Uncontrolled a propósito: el valor inicial se vuelca una sola vez al
 * montar (rawHtmlToEditable) y de ahí en adelante el DOM manda; si lo
 * volviéramos a pisar en cada render se perdería el cursor y las píldoras
 * ya insertadas.
 */
const PlaceholderRichEditor = forwardRef(function PlaceholderRichEditor(
  { valorInicial, onChange, onFocus, placeholder, minHeight = 160 },
  ref,
) {
  const divRef = useRef(null);
  const rangoGuardadoRef = useRef(null);
  const [vacio, setVacio] = useState(!valorInicial);

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;
    el.innerHTML = rawHtmlToEditable(valorInicial, {});
    setVacio(el.textContent.trim().length === 0 && el.querySelectorAll('[data-token]').length === 0);
    // Solo al montar: este editor es no-controlado a propósito (ver docstring).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notificarCambio = () => {
    const el = divRef.current;
    if (!el) return;
    setVacio(el.textContent.trim().length === 0 && el.querySelectorAll('[data-token]').length === 0);
    onChange?.(editableToRawHtml(el));
  };

  const guardarRango = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const rango = sel.getRangeAt(0);
    if (divRef.current?.contains(rango.commonAncestorContainer)) {
      rangoGuardadoRef.current = rango.cloneRange();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.execCommand('insertLineBreak');
      notificarCambio();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const texto = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, texto);
    notificarCambio();
  };

  useImperativeHandle(ref, () => ({
    insertarPlaceholder(token, etiqueta) {
      const el = divRef.current;
      if (!el) return;
      el.focus();

      const sel = window.getSelection();
      let rango = rangoGuardadoRef.current;
      if (rango && el.contains(rango.commonAncestorContainer)) {
        sel.removeAllRanges();
        sel.addRange(rango);
      } else {
        rango = document.createRange();
        rango.selectNodeContents(el);
        rango.collapse(false);
        sel.removeAllRanges();
        sel.addRange(rango);
      }

      const chip = document.createElement('span');
      chip.className = 'pc-chip';
      chip.setAttribute('data-token', token);
      chip.setAttribute('contenteditable', 'false');
      chip.textContent = etiqueta;

      const espacio = document.createTextNode(' ');

      const rangoActivo = sel.getRangeAt(0);
      rangoActivo.deleteContents();
      rangoActivo.insertNode(espacio);
      rangoActivo.insertNode(chip);

      const nuevoRango = document.createRange();
      nuevoRango.setStartAfter(espacio);
      nuevoRango.collapse(true);
      sel.removeAllRanges();
      sel.addRange(nuevoRango);
      rangoGuardadoRef.current = nuevoRango.cloneRange();

      notificarCambio();
    },
  }));

  return (
    <div className="relative">
      <div
        ref={divRef}
        role="textbox"
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        onInput={notificarCambio}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onFocus={(e) => { guardarRango(); onFocus?.(e); }}
        onBlur={guardarRango}
        onMouseUp={guardarRango}
        onKeyUp={guardarRango}
        className="w-full text-sm rounded-lg px-3 py-2.5 outline-none border transition-all duration-150 focus:border-[color:var(--pb)]"
        style={{
          background: 'var(--bg)',
          borderColor: 'var(--border-md)',
          color: 'var(--jet)',
          fontSize: '15px',
          lineHeight: '1.6',
          minHeight,
        }}
      />
      {vacio && (
        <span
          className="absolute left-3 top-2.5 text-sm pointer-events-none"
          style={{ color: 'var(--ash)' }}
        >
          {placeholder}
        </span>
      )}
    </div>
  );
});

export default PlaceholderRichEditor;
