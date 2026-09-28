import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getSpy = vi.fn();
vi.mock('../api/apiClient', () => ({ default: { get: (...a) => getSpy(...a) } }));

import { printReciboCobranza } from './printReciboCobranza';

const base = {
  nroControl: 'F-0001', mes: 'JULIO', año: 2026, fechaPago: '01/07/2026',
  nombreEstudiante: 'Ana Perez', grado: '1° A', representante: 'Maria Gonzalez',
  ciRepresentante: 'V11111111', tasa: 0,
  items: [{ concepto: 'Mensualidad', descripcion: 'Julio 2026', monto_ves: 100 }],
};

const membrete = {
  nombre: 'Colegio Demo', rif: 'J-1', direccion: 'Av. Principal', telefono: '0212',
  municipio_estado: 'Baruta, Miranda', logo_colegio: null, afiliacion_nombre: '',
  encabezado_personalizado: 'data:image/png;base64,AAAA',
  pie_pagina_personalizado: 'data:image/png;base64,BBBB',
};

const htmlEscrito = () => document.querySelector('iframe').contentDocument.body.innerHTML;

describe('printReciboCobranza', () => {
  beforeEach(() => { vi.useFakeTimers(); getSpy.mockClear(); });
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

  it('no lee nada fuera de sus parámetros (ni API ni localStorage)', async () => {
    const lsGet = vi.spyOn(Storage.prototype, 'getItem');
    await printReciboCobranza({ ...base, membrete });
    expect(getSpy).not.toHaveBeenCalled();
    expect(lsGet).not.toHaveBeenCalled();
    lsGet.mockRestore();
  });

  it('usa los recortes de encabezado y pie recibidos', async () => {
    await printReciboCobranza({ ...base, membrete });
    const html = htmlEscrito();
    expect(html).toContain('data:image/png;base64,AAAA');
    expect(html).toContain('data:image/png;base64,BBBB');
  });

  it('sin recortes aplica el fallback con los datos del colegio', async () => {
    await printReciboCobranza({
      ...base,
      membrete: { ...membrete, encabezado_personalizado: null, pie_pagina_personalizado: null },
    });
    const html = htmlEscrito();
    expect(html).not.toContain('base64,AAAA');
    expect(html).toContain('Colegio Demo');
    expect(html).toContain('Av. Principal');
  });
});
