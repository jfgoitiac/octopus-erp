import { describe, it, expect } from 'vitest';
import {
  cambiosEsperados,
  esperadosDe,
  estadoDiferencia,
  fechaHoraCierre,
  formatoUsd,
  formatoVes,
  metodosConDinero,
  montoParaApi,
  movimientosSinDinero,
  origenDelIngreso,
  parsearMonto,
  resultadoCierre,
  tarjetasDeOrigen,
  totalRecibidoUsd,
} from './calculosCierre';

const ORIGEN = {
  ventas: { usd: '100.00', operaciones: 12 },
  recargas_cobradas: { usd: '30.00', operaciones: 3, efectivo_usd: '10.00', banco_usd: '20.00' },
  consumo_recargas: { usd: '25.00', operaciones: 5 },
  abonos: { usd: '15.00', operaciones: 1 },
  cargado_a_cuenta: { usd: '8.00', operaciones: 2 },
  anuladas: { usd: '0.00', operaciones: 0 },
  recargas_portal: { usd: '0.00', operaciones: 0 },
};

describe('parsearMonto', () => {
  it.each([
    ['1.234,50', 1234.5],
    ['1234,5', 1234.5],
    ['1234.50', 1234.5],
    ['1,234.50', 1234.5],
    ['1.234', 1234],
    ['1.234.567,89', 1234567.89],
    ['1.234.567', 1234567],
    ['0', 0],
    ['0,5', 0.5],
    [',50', 0.5],
    ['1234,', 1234],
    ['  12,30 ', 12.3],
    ['$ 12,30', 12.3],
    ['Bs. 12,30', 12.3],
  ])('lee %s', (texto, esperado) => {
    expect(parsearMonto(texto)).toBe(esperado);
  });

  it.each([
    [''], ['   '], [null], [undefined], ['abc'], ['-5'], ['1,234'], ['0.125'],
    ['1234.567'], ['12.34,50'], ['1.23.456'], [','], ['.'], ['NaN'], ['Infinity'],
  ])('rechaza %s', (texto) => {
    expect(parsearMonto(texto)).toBeNull();
  });

  it('envía punto decimal al backend', () => {
    expect(montoParaApi(parsearMonto('1.234,5'))).toBe('1234.50');
    expect(montoParaApi(0)).toBe('0.00');
  });
});

describe('formato', () => {
  it('usa el mismo formato en dólares y bolívares', () => {
    expect(formatoUsd(1234.5)).toBe('$ 1.234,50');
    expect(formatoVes('1234.5')).toBe('Bs 1.234,50');
  });

  it('formatea fechas en español y tolera datos ausentes', () => {
    expect(fechaHoraCierre('2026-03-02T15:30:00')).toBe('2 de marzo de 2026, 15:30');
    expect(fechaHoraCierre(null)).toBe('');
    expect(fechaHoraCierre('no es fecha')).toBe('');
  });
});

describe('estadoDiferencia', () => {
  it('sin conteo falta contar', () => {
    expect(estadoDiferencia(null, 10).tipo).toBe('pendiente');
    expect(estadoDiferencia(null, 10).texto).toBe('Falta contar');
  });

  it('distingue cuadrado, faltante y sobrante por moneda', () => {
    expect(estadoDiferencia(10, 10).texto).toBe('Cuadrado');
    expect(estadoDiferencia(5, 10)).toMatchObject({ tipo: 'faltante', texto: 'Faltante $ 5,00', diferencia: -5 });
    expect(estadoDiferencia(15, 10, 'ves')).toMatchObject({ tipo: 'sobrante', texto: 'Sobrante Bs 5,00', diferencia: 5 });
  });

  it('no arrastra el error de coma flotante', () => {
    expect(estadoDiferencia(0.3, 0.1 + 0.2).tipo).toBe('cuadrado');
  });

  it('sin esperado no inventa una diferencia', () => {
    expect(estadoDiferencia(10, null).tipo).toBe('sin_referencia');
  });
});

describe('cambiosEsperados', () => {
  const con = (usd, ves) => ({ desglose: { arqueo: { esperado_usd: usd, esperado_ves: ves } } });

  it('avisa solo de la moneda que cambió', () => {
    expect(cambiosEsperados(con('10.00', '50.00'), con('12.00', '50.00'))).toEqual([
      { moneda: 'usd', antes: 10, despues: 12 },
    ]);
  });

  it('sin cambios o sin datos no avisa', () => {
    expect(cambiosEsperados(con('10.00', '5.00'), con('10.00', '5.00'))).toEqual([]);
    expect(cambiosEsperados({}, con('10.00', '5.00'))).toEqual([]);
  });

  it('esperadosDe devuelve null si no hay arqueo', () => {
    expect(esperadosDe({ desglose: {} })).toEqual({ usd: null, ves: null });
  });
});

describe('resultadoCierre', () => {
  it('resume en USD total', () => {
    expect(resultadoCierre({ diferencia: '0.00' }).titulo).toBe('Caja cerrada · Cuadrada');
    expect(resultadoCierre({ diferencia: '-5.00' })).toMatchObject({ tipo: 'faltante', titulo: 'Faltante $ 5,00' });
    expect(resultadoCierre({ diferencia: '2.50' })).toMatchObject({ tipo: 'sobrante', titulo: 'Sobrante $ 2,50' });
  });

  it('no llama cuadrada a una caja cuyas monedas se compensan', () => {
    const cierre = { diferencia: '0.00', desglose: { arqueo: { diferencia_usd: '1.00', diferencia_ves: '-100.00' } } };
    expect(resultadoCierre(cierre)).toMatchObject({ tipo: 'sobrante', titulo: 'Caja cerrada · Diferencias que se compensan' });
  });

  it('sin diferencia guardada no afirma que cuadró', () => {
    expect(resultadoCierre({ diferencia: null })).toMatchObject({ tipo: 'sin_referencia', titulo: 'Caja cerrada' });
  });
});

describe('metodosConDinero', () => {
  const totales = {
    zelle: { total_usd: '20.00', total_ves: '2000.00' },
    tarjeta_prepago: { total_usd: '25.00', total_ves: '2500.00' },
    credito_representante: { total_usd: '8.00', total_ves: '800.00' },
    pago_movil: { total_usd: '10.00', total_ves: '1000.00' },
    efectivo_ves: { total_usd: '0.00', total_ves: '0.00' },
    efectivo: { total_usd: '30.00', total_ves: '3000.00' },
  };

  it('excluye lo que no es dinero y los métodos sin movimiento', () => {
    expect(metodosConDinero(totales).map((m) => m.metodo)).toEqual(['efectivo', 'pago_movil', 'zelle']);
  });

  it('muestra cada método en su moneda y su destino', () => {
    const [efectivo, pagoMovil] = metodosConDinero(totales);
    expect(efectivo).toMatchObject({ cifra: '$ 30,00', equivalente: null, destino: 'Va a la gaveta' });
    expect(pagoMovil).toMatchObject({ cifra: 'Bs 1.000,00', equivalente: '≈ $ 10,00', destino: 'Va al banco' });
  });

  it('totaliza en USD solo el dinero', () => {
    expect(totalRecibidoUsd(metodosConDinero(totales))).toBe(60);
  });

  it('admite el formato antiguo de string', () => {
    const [m] = metodosConDinero({ pago_movil: '12.50' });
    expect(m).toMatchObject({ cifra: '$ 12,50', equivalente: null });
  });

  it('tolera totales ausentes', () => {
    expect(metodosConDinero(undefined)).toEqual([]);
  });
});

describe('tarjetasDeOrigen', () => {
  it('con desglose muestra las cinco base y operaciones', () => {
    const tarjetas = tarjetasDeOrigen({ desglose: { origen: ORIGEN } });
    expect(tarjetas.map((t) => t.id)).toEqual(['ventas', 'recargas_cobradas', 'consumo_recargas', 'abonos', 'cargado_a_cuenta']);
    expect(tarjetas[0]).toMatchObject({ cifra: '$ 100,00', operaciones: '12 operaciones' });
    expect(tarjetas[1].detalle).toBe('$ 10,00 en efectivo · $ 20,00 por banco');
    expect(tarjetas[3].operaciones).toBe('1 operación');
  });

  it('anuladas y portal solo aparecen si son mayores que cero', () => {
    const origen = { ...ORIGEN, anuladas: { usd: '4.00', operaciones: 1 }, recargas_portal: { usd: '9.00', operaciones: 2 } };
    expect(tarjetasDeOrigen({ desglose: { origen } }).map((t) => t.id)).toContain('anuladas');
    expect(tarjetasDeOrigen({ desglose: { origen } }).map((t) => t.id)).toContain('recargas_portal');
  });

  it('cierre antiguo: deriva lo guardado sin inventar ceros', () => {
    const tarjetas = tarjetasDeOrigen({
      desglose: {},
      total_ventas: '50.00',
      total_tarjeta: '10.00',
      total_recargas_efectivo: '5.00',
      totales_por_metodo: { efectivo: '45.00' },
    });
    expect(tarjetas.map((t) => t.id)).toEqual(['ventas', 'recargas_cobradas', 'consumo_recargas']);
    expect(tarjetas[1].detalle).toBe('$ 5,00 en efectivo');
    expect(tarjetas[2].cifra).toBe('$ 10,00');
    expect(tarjetas[0].operaciones).toBeNull();
  });

  it('cierre sin ningún dato no produce tarjetas', () => {
    expect(tarjetasDeOrigen({ desglose: {} })).toEqual([]);
  });
});

describe('movimientos para el ticket', () => {
  it('sin dinero: usa el desglose o el cierre antiguo y omite lo ausente', () => {
    expect(movimientosSinDinero({ desglose: { origen: ORIGEN } })).toEqual([
      { etiqueta: 'Consumo de recargas', usd: 25 },
      { etiqueta: 'Cargado a cuenta', usd: 8 },
    ]);
    expect(movimientosSinDinero({ desglose: {}, total_tarjeta: '7.00' })).toEqual([
      { etiqueta: 'Consumo de recargas', usd: 7 },
    ]);
  });

  it('origen del ingreso ignora lo que no es dinero', () => {
    expect(origenDelIngreso({
      efectivo: { ventas: '10.00', abonos: '1.00', recargas: '2.00' },
      tarjeta_prepago: { ventas: '99.00' },
    })).toEqual({ ventas: 10, abonos: 1, recargas: 2 });
    expect(origenDelIngreso({ efectivo: '10.00' })).toBeNull();
  });
});
