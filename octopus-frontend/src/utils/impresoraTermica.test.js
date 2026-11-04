import { beforeEach, describe, expect, it } from 'vitest';
import { guardarConfigImpresora, MARGENES_FINALES, Ticket } from './impresoraTermica';

describe('corte de ticket ESC/POS', () => {
  beforeEach(() => localStorage.clear());

  it('usa una sola línea de avance en modo compacto', () => {
    guardarConfigImpresora({ margenFinal: MARGENES_FINALES.COMPACTO });
    const bytes = [...new Ticket(32).linea('FIN').cortar(1).bytes()];
    expect(bytes.slice(-5)).toEqual([0x0a, 0x1d, 0x56, 0x42, 0x00]);
  });

  it('permite tres líneas para impresoras de corte manual', () => {
    const bytes = [...new Ticket(32).linea('FIN').cortar(3).bytes()];
    expect(bytes.slice(-7)).toEqual([0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00]);
  });
});
