import { describe, it, expect } from 'vitest';
import { lineasReporteCierre } from './reporteCierreCaja';
import { construirCierreEscPos } from './imprimirCierreCantina';

const BASE = {
  id: 7,
  apertura: 3,
  area: 'cantina',
  monto_inicial: '20.00',
  efectivo_esperado: '60.00',
  conteo_fisico: '55.00',
  diferencia: '-5.00',
  cerrado_en: '2026-03-02T15:30:00',
  fecha_hora_apertura: '2026-03-02T07:00:00',
  total_tarjeta: '25.00',
  totales_por_metodo: {
    efectivo: { total_usd: '30.00', total_ves: '3000.00', ventas: '30.00', abonos: '0.00', recargas: '0.00' },
    efectivo_ves: { total_usd: '10.00', total_ves: '1000.00', ventas: '10.00', abonos: '0.00', recargas: '0.00' },
    tarjeta_prepago: { total_usd: '25.00', total_ves: '2500.00', ventas: '25.00', abonos: '0.00', recargas: '0.00' },
    credito_representante: { total_usd: '8.00', total_ves: '800.00', ventas: '8.00', abonos: '0.00', recargas: '0.00' },
  },
};

const DESGLOSE = {
  origen: { consumo_recargas: { usd: '25.00', operaciones: 5 }, cargado_a_cuenta: { usd: '8.00', operaciones: 2 } },
  arqueo: {
    esperado_usd: '50.00',
    esperado_ves: '1000.00',
    tasa_ves: '100.0000',
    contado_usd: '45.00',
    contado_ves: '1000.00',
    diferencia_usd: '-5.00',
    diferencia_ves: '0.00',
  },
};

const filas = (lineas) => Object.fromEntries(lineas.filter((l) => l.tipo === 'fila').map((l) => [l.izq, l.der]));
const titulos = (lineas) => lineas.filter((l) => l.tipo === 'titulo').map((l) => l.txt);

describe('lineasReporteCierre', () => {
  it('el TOTAL solo suma dinero y lo demás va aparte', () => {
    const lineas = lineasReporteCierre({ ...BASE, desglose: DESGLOSE });
    const f = filas(lineas);
    expect(titulos(lineas)).toEqual(expect.arrayContaining(['DINERO RECIBIDO', 'SIN ENTRADA DE DINERO']));
    expect(f.TOTAL).toBe('$ 40,00');
    expect(f['Efectivo divisas']).toBe('$ 30,00');
    expect(f['Efectivo bolívares']).toBe('Bs 1.000,00');
    expect(f['Tarjeta prepago']).toBeUndefined();
    expect(f['Consumo de recargas']).toBe('$ 25,00');
    expect(f['Cargado a cuenta']).toBe('$ 8,00');
    expect(f.Ventas).toBe('$ 40,00');
  });

  it('con conteo por moneda, el arqueo va por moneda y totaliza en dólares', () => {
    const f = filas(lineasReporteCierre({ ...BASE, desglose: DESGLOSE }));
    expect(f['Fondo inicial $']).toBe('$ 20,00');
    expect(f['Esperado $']).toBe('$ 50,00');
    expect(f['Contado $']).toBe('$ 45,00');
    expect(f['Diferencia $']).toBe('-$ 5,00');
    expect(f['Esperado Bs']).toBe('Bs 1.000,00');
    expect(f['Contado Bs']).toBe('Bs 1.000,00');
    expect(f['Diferencia Bs']).toBe('Bs 0,00');
    expect(f['FALTANTE TOTAL']).toBe('-$ 5,00');
    expect(f['Conteo físico']).toBeUndefined();
  });

  it('sin conteo por moneda conserva el arqueo anterior', () => {
    const f = filas(lineasReporteCierre({ ...BASE, desglose: {} }));
    expect(f['Fondo inicial']).toBe('$ 20,00');
    expect(f['Cobrado efectivo']).toBe('$ 40,00');
    expect(f.Esperado).toBe('$ 60,00');
    expect(f['Conteo físico']).toBe('$ 55,00');
    expect(f.FALTANTE).toBe('-$ 5,00');
  });

  it('cierre sin datos no falla ni inventa secciones', () => {
    const lineas = lineasReporteCierre({ id: 1 });
    expect(titulos(lineas)).not.toContain('SIN ENTRADA DE DINERO');
    expect(titulos(lineas)).not.toContain('ORIGEN DEL INGRESO');
    expect(lineasReporteCierre(null)).toEqual([]);
  });

  it('las mismas líneas se convierten a ESC/POS', async () => {
    const bytes = await construirCierreEscPos(lineasReporteCierre({ ...BASE, desglose: DESGLOSE }), 58, null);
    expect(bytes.length).toBeGreaterThan(0);
  });
});
