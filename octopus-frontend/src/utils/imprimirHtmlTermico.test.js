import { describe, expect, it } from 'vitest';
import { calcularAltoPaginaMm, fijarAltoPaginaTermica } from './imprimirHtmlTermico';

describe('impresión HTML térmica', () => {
  it('calcula el largo real y suma solo el margen final', () => {
    expect(calcularAltoPaginaMm({
      altoPx: 300,
      anchoPx: 300,
      anchoMm: 80,
      margenFinalMm: 2,
    })).toBe(82);
  });

  it('redondea hacia arriba para no crear una segunda página', () => {
    expect(calcularAltoPaginaMm({
      altoPx: 101,
      anchoPx: 100,
      anchoMm: 58,
      margenFinalMm: 2,
    })).toBe(60.6);
  });

  it('inyecta un @page con alto explícito, nunca auto', () => {
    document.body.innerHTML = '<div style="height:100px">Ticket</div>';
    Object.defineProperty(document.body, 'scrollHeight', { configurable: true, value: 100 });
    document.body.getBoundingClientRect = () => ({ width: 200, height: 100 });

    const alto = fijarAltoPaginaTermica(document, 80, 2);
    const regla = document.head.querySelector('[data-alto-ticket="true"]').textContent;

    expect(alto).toBe(42);
    expect(regla).toContain('size:80mm 42mm');
    expect(regla).not.toContain('auto');
  });
});
