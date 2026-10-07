import { describe, it, expect } from 'vitest';
import { configAFormulario, formularioAConfig, textoAAlias, primerMensajeError } from './configEstadoCuenta';

describe('configEstadoCuenta', () => {
  it('textoAAlias separa por comas, recorta y deduplica', () => {
    expect(textoAAlias(' Serial, nro. op ;serial\n ')).toEqual(['Serial', 'nro. op']);
  });
  it('ida y vuelta conserva solo lo definido', () => {
    const cfg = { columnas: { referencia: ['Serial'] }, formato_fecha: 'MM/dd/yyyy', filas_encabezado_max: 12 };
    expect(formularioAConfig(configAFormulario(cfg))).toEqual(cfg);
    expect(formularioAConfig(configAFormulario(null))).toEqual({});
  });
  it('primerMensajeError', () => {
    expect(primerMensajeError({ config_estado_cuenta: { formato_fecha: ['No válido'] } }, 'x')).toBe('config_estado_cuenta: formato_fecha: No válido');
    expect(primerMensajeError({ detail: 'Prohibido' }, 'x')).toBe('Prohibido');
    expect(primerMensajeError(null, 'x')).toBe('x');
  });
});
