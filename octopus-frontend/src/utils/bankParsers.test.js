import { describe, it, expect } from 'vitest';
import { parseStatement, formatoPorNombre } from './bankParsers';

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

  it('formatoPorNombre y formato desconocido caen a genérico', () => {
    expect(formatoPorNombre('Banco Digital de los Trabajadores')).toBe('bdt');
    expect(formatoPorNombre('Banco del Tesoro')).toBe('tesoro');
    expect(formatoPorNombre('Otro')).toBe('generico');
    expect(parseStatement([['Fecha', 'Referencia', 'Monto'], ['01/01/2026', 'ABC123', '1,00']], 'xyz')).toHaveLength(1);
  });
});
