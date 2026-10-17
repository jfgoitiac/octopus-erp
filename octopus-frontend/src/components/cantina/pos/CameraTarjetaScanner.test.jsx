import { describe, expect, it } from 'vitest';
import { FORMATOS_BARRAS_PRODUCTO, FORMATOS_QR_TARJETA, normalizarCodigoTarjetaLeido } from './CameraTarjetaScanner';
import { normalizarCodigoProductoLeido } from './CameraProductoScanner';

describe('normalizarCodigoTarjetaLeido', () => {
  it('acepta y normaliza el identificador CANT leído del QR', () => {
    expect(normalizarCodigoTarjetaLeido(' cant-7k9m2xqprt ')).toBe('CANT-7K9M2XQPRT');
  });

  it('conserva el identificador CANT ya normalizado', () => {
    expect(normalizarCodigoTarjetaLeido('CANT-7K9M2XQPRT')).toBe('CANT-7K9M2XQPRT');
  });

  it('rechaza lecturas que no son credenciales de tarjeta', () => {
    expect(normalizarCodigoTarjetaLeido('https://ejemplo.test/tarjeta')).toBeNull();
    expect(normalizarCodigoTarjetaLeido('L003-0007')).toBeNull();
    expect(normalizarCodigoTarjetaLeido('')).toBeNull();
  });
});

describe('separación de formatos en la cámara', () => {
  it('dirige QR a tarjetas y excluye QR del lector de productos', () => {
    expect(FORMATOS_QR_TARJETA).toEqual(['qr_code']);
    expect(FORMATOS_BARRAS_PRODUCTO).not.toContain('qr_code');
  });
});

describe('normalizarCodigoProductoLeido', () => {
  it('acepta códigos de barras de productos', () => {
    expect(normalizarCodigoProductoLeido(' 7501031311309 ')).toBe('7501031311309');
  });

  it('rechaza texto que no corresponde a un código de barras', () => {
    expect(normalizarCodigoProductoLeido('https://ejemplo.test/producto')).toBeNull();
  });
});
