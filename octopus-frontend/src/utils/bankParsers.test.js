import { describe, it, expect } from 'vitest';
import { parseStatement } from './bankParsers';

describe('parseStatement', () => {
  it('Bancaribe: fecha con mes abreviado, débito/crédito y limpieza de referencia', () => {
    const rows = [
      ['Fecha', 'Referencia', 'Descripción', 'Débito', 'Crédito'],
      ['01-JUL-2026', '428951916672ND', 'ND EMISION\nDE CUENTA', '1.250,50', ''],
      ['02-JUL-2026', '1142001139734\n86432', 'NC TRANSF', '', '14.320,00'],
    ];
    const txs = parseStatement(rows, 'bancaribe');
    expect(txs).toHaveLength(2);
    expect(txs[0]).toMatchObject({ fecha: '01/07/2026', referencia: '428951916672', monto: 1250.5, tipo: 'egreso', descripcion: 'ND EMISION DE CUENTA' });
    expect(txs[1]).toMatchObject({ referencia: '114200113973486432', monto: 14320, tipo: 'ingreso' });
  });

  it('Banesco/Tesoro: columna Monto con signo y entidades HTML', () => {
    const rows = [
      ['Fecha', 'Nro. Referencia', 'Concepto', 'Monto'],
      ['05/03/2026', '123456789', 'DEP', '124000,00'],
      ['06/03/2026', '987654321', 'PAGO', '-500,25'],
    ];
    const txs = parseStatement(rows, 'banesco');
    expect(txs.map(t => [t.monto, t.tipo])).toEqual([[124000, 'ingreso'], [500.25, 'egreso']]);
    const t2 = parseStatement([['Fecha', 'Referencia', 'D&eacute;bito', 'Cr&eacute;dito'], ['2026-03-05', '555555', '10,00', '']], 'tesoro');
    expect(t2[0]).toMatchObject({ tipo: 'egreso', monto: 10, fecha: '05/03/2026' });
  });

  it('BDT: punto decimal, fecha con hora y columna Operación', () => {
    const rows = [
      ['Fecha', 'Operación', 'Descripción', 'Débito', 'Crédito', 'Saldo'],
      ['05/03/2026 14:32:10', '00123456', 'TRANSFERENCIA RECIBIDA', '', '1,234.56', '9,999.00'],
      ['06/03/2026 09:00:00', '00123457', 'COMISION', '12.50', '', '9,986.50'],
      ['07/03/2026', '00123458', 'EXCEL NUM', '', 2500.75, ''],
    ];
    const txs = parseStatement(rows, 'bdt');
    expect(txs).toHaveLength(3);
    expect(txs[0]).toMatchObject({ fecha: '05/03/2026', referencia: '00123456', monto: 1234.56, tipo: 'ingreso' });
    expect(txs[1]).toMatchObject({ monto: 12.5, tipo: 'egreso' });
    expect(txs[2]).toMatchObject({ monto: 2500.75 });
  });

  it('formato desconocido cae a genérico', () => {
    expect(parseStatement([['Fecha', 'Referencia', 'Monto'], ['01/01/2026', 'ABC123', '1,00']], 'xyz')).toHaveLength(1);
  });
});

describe('parseStatement con config_estado_cuenta', () => {
  it('alias nuevos para un banco inventado sin preset', () => {
    const rows = [
      ['Fec. Mov.', 'Cod. Transac', 'Glosa', 'Retiros', 'Depositos'],
      ['05/03/2026', 'ZX99887', 'PAGO', '', '1.500,75'],
      ['06/03/2026', 'ZX99888', 'COMPRA', '20,00', ''],
    ];
    const cfg = { columnas: { fecha: ['fec. mov'], referencia: ['cod. transac'], descripcion: ['glosa'], debito: ['retiros'], credito: ['depositos'] } };
    const txs = parseStatement(rows, 'banco-inventado', cfg);
    expect(txs).toHaveLength(2);
    expect(txs[0]).toMatchObject({ fecha: '05/03/2026', referencia: 'ZX99887', monto: 1500.75, tipo: 'ingreso', descripcion: 'PAGO' });
    expect(txs[1]).toMatchObject({ monto: 20, tipo: 'egreso' });
    // sin config los alias no se reconocen
    expect(parseStatement(rows, 'banco-inventado')).toHaveLength(0);
  });

  it('alias con acentos y mayúsculas se normalizan', () => {
    const rows = [['FECHA', 'NÚMERO DE OPERACIÓN', 'DÉBITO'], ['01/02/2026', '445566', '5,00']];
    const txs = parseStatement(rows, 'generico', { columnas: { referencia: ['Número de Operación'] } });
    expect(txs[0]).toMatchObject({ referencia: '445566', monto: 5, tipo: 'egreso' });
  });

  it('formato de fecha explícito MM/dd/yyyy y separador punto', () => {
    const rows = [['Fecha', 'Referencia', 'Monto'], ['03/05/2026', 'REF001', '1,234.50']];
    const txs = parseStatement(rows, 'generico', { formato_fecha: 'MM/dd/yyyy', separador_decimal: '.' });
    expect(txs[0]).toMatchObject({ fecha: '05/03/2026', monto: 1234.5 });
    const t2 = parseStatement(rows, 'generico', { formato_fecha: 'dd/MM/yyyy', separador_decimal: ',' });
    expect(t2[0].fecha).toBe('03/05/2026');
  });

  it('autodetecta MM/dd por valores > 12 y dd/MM por defecto', () => {
    const mdy = [['Fecha', 'Referencia', 'Monto'], ['03/25/2026', 'REF001', '10.00'], ['04/02/2026', 'REF002', '5.50']];
    expect(parseStatement(mdy).map(t => t.fecha)).toEqual(['25/03/2026', '02/04/2026']);
    const dmy = [['Fecha', 'Referencia', 'Monto'], ['25/03/2026', 'REF001', '10,00'], ['04/02/2026', 'REF002', '5,50']];
    expect(parseStatement(dmy).map(t => t.fecha)).toEqual(['25/03/2026', '04/02/2026']);
  });

  it('autodetecta separador decimal: 1.234,56 vs 1,234.56 vs 1.234 ambiguo', () => {
    const base = (v) => parseStatement([['Fecha', 'Referencia', 'Monto'], ['01/01/2026', 'REF001', v]])[0].monto;
    expect(base('1.234,56')).toBe(1234.56);
    expect(base('1,234.56')).toBe(1234.56);
    expect(base('1.234')).toBe(1234);
    // en un archivo donde otros valores usan punto decimal, 1.234 es 1.234
    const dot = parseStatement([['Fecha', 'Referencia', 'Monto'], ['01/01/2026', 'REF001', '1.234'], ['02/01/2026', 'REF002', '12.50']]);
    expect(dot.map(t => t.monto)).toEqual([1.234, 12.5]);
  });

  it('fechas con hora, serial de Excel y año de 2 dígitos', () => {
    const rows = [
      ['Fecha', 'Referencia', 'Monto'],
      ['05/03/2026 14:32:10', 'REF001', '1,00'],
      [46086, 'REF002', '2,00'],
      ['05/03/26', 'REF003', '3,00'],
      ['2026-03-05T10:00:00', 'REF004', '4,00'],
      ['05 mar 2026', 'REF005', '5,00'],
    ];
    expect(parseStatement(rows).map(t => t.fecha)).toEqual(['05/03/2026', '05/03/2026', '05/03/2026', '05/03/2026', '05/03/2026']);
  });

  it('encabezado en fila profunda y respeto de filas_encabezado_max', () => {
    const rows = [
      ['ESTADO DE CUENTA'], ['Cliente: X'], [''], ['Periodo'], [''],
      ['Fecha', 'Referencia', 'Descripcion', 'Debito', 'Credito'],
      ['05/03/2026', '123456', 'DEP', '', '10,00'],
    ];
    expect(parseStatement(rows)).toHaveLength(1);
    expect(parseStatement(rows, 'generico', { filas_encabezado_max: 3 })).toHaveLength(0);
  });

  it('descarta filas de totales y saldos', () => {
    const rows = [
      ['Fecha', 'Referencia', 'Descripcion', 'Debito', 'Credito'],
      ['', 'Saldo inicial', '', '', '100,00'],
      ['05/03/2026', '123456', 'DEP', '', '10,00'],
      ['', 'TOTALES', '', '50,00', '10,00'],
    ];
    expect(parseStatement(rows)).toHaveLength(1);
  });

  it('config inválida o ausente no rompe el parseo', () => {
    const rows = [['Fecha', 'Referencia', 'Monto'], ['01/01/2026', 'REF001', '1,00']];
    expect(parseStatement(rows, 'generico', { columnas: 'x', formato_fecha: 'zzz', separador_decimal: 5, filas_encabezado_max: 'a' })).toHaveLength(1);
    expect(parseStatement(rows, 'generico', null)).toHaveLength(1);
    expect(parseStatement([], 'generico')).toEqual([]);
  });
});
