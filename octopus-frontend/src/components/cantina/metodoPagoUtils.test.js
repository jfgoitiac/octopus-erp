import { describe, expect, it } from 'vitest';
import { camposMetodoVenta, validarMetodoPago, valorInicialMetodo } from './metodoPagoUtils';

describe('datos por método de pago', () => {
  it.each(['transferencia', 'pago_movil'])(
    '%s requiere banco receptor y referencia de 6 dígitos',
    (metodo) => {
      const base = { ...valorInicialMetodo(metodo), metodo_pago: metodo };
      expect(validarMetodoPago(base, { conMonto: false })).toEqual({
        banco_receptor: 'Selecciona el banco receptor.',
        referencia: 'Debe tener 6 dígitos.',
      });
      expect(validarMetodoPago({
        ...base, banco_receptor: '3', referencia: '123456',
      }, { conMonto: false })).toEqual({});
    },
  );

  it('punto de venta requiere banco, referencia y lote de 4 dígitos', () => {
    const base = { ...valorInicialMetodo('punto_de_venta'), metodo_pago: 'punto_de_venta' };
    expect(validarMetodoPago(base, { conMonto: false })).toEqual({
      banco_receptor: 'Selecciona el banco receptor.',
      referencia: 'Debe tener 4 dígitos.',
      numero_lote: 'Debe tener 4 dígitos.',
    });
    expect(validarMetodoPago({
      ...base, banco_receptor: '3', referencia: '1234', numero_lote: '5678',
    }, { conMonto: false })).toEqual({});
  });

  it('no incluye banco de procedencia en operaciones nuevas', () => {
    const payload = camposMetodoVenta({
      ...valorInicialMetodo('transferencia'),
      metodo_pago: 'transferencia',
      banco_receptor: '3',
      banco_procedencia: 'dato heredado',
      referencia: '123456',
    });
    expect(payload).toEqual({
      metodo_pago: 'transferencia',
      banco_receptor: '3',
      referencia: '123456',
    });
    expect(payload).not.toHaveProperty('banco_procedencia');
  });

  it('efectivo no solicita datos bancarios', () => {
    expect(validarMetodoPago({ metodo_pago: 'efectivo' }, { conMonto: false })).toEqual({});
    expect(camposMetodoVenta({ metodo_pago: 'efectivo' })).toEqual({ metodo_pago: 'efectivo' });
  });
});
