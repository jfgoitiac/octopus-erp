import { describe, it, expect } from 'vitest';
import {
  fechaBancoAISO, filtrarPorFechas, rangoFechas, ordenarPropuestas, filtrarPorEstado,
  contarPorEstado, calcularDiferencia, propuestaEfectiva, esSeleccionable, seleccionInicial,
  propuestasAEnviar, construirItems, resumenConfirmacion, dividirEnLotes, agregarResultados,
  claveTransaccion, efectivasDe, faltaObservacion, idsAlternables,
} from './conciliacionMasiva';

const tx = (referencia, fecha, monto) => ({ referencia, fecha, monto });

describe('fechas', () => {
  it('convierte dd/MM/yyyy a ISO', () => {
    expect(fechaBancoAISO('05/03/2026')).toBe('2026-03-05');
    expect(fechaBancoAISO('2026-03-05')).toBe('2026-03-05');
  });
  const lista = [tx('1', '01/03/2026', 1), tx('2', '10/03/2026', 2), tx('3', '20/03/2026', 3)];
  it('filtra por rango inclusivo y opcional', () => {
    expect(filtrarPorFechas(lista, '2026-03-10', '2026-03-20').map((t) => t.referencia)).toEqual(['2', '3']);
    expect(filtrarPorFechas(lista, '', '2026-03-01').map((t) => t.referencia)).toEqual(['1']);
    expect(filtrarPorFechas(lista, '', '')).toBe(lista);
  });
  it('rango min/max', () => {
    expect(rangoFechas(lista)).toEqual({ desde: '2026-03-01', hasta: '2026-03-20' });
    expect(rangoFechas([])).toEqual({ desde: '', hasta: '' });
  });
});

const prop = (o) => ({
  id: 'x', estado: 'exacta', tipo: 'pago', operacion_uuid: 'u', comprobante_id: null,
  fecha: '2026-03-01', monto_sistema_ves: '100.00', transaccion: tx('1', '01/03/2026', '100.00'),
  candidatas: [], diferencia_ves: '0.00', seleccionada_por_defecto: true, ...o,
});

describe('propuestas', () => {
  it('ordena por estado y fecha, filtra y cuenta', () => {
    const ps = [
      prop({ id: 'a', estado: 'sin_banco' }),
      prop({ id: 'b', estado: 'fuera_tolerancia', fecha: '2026-03-05' }),
      prop({ id: 'c', estado: 'fuera_tolerancia', fecha: '2026-03-02' }),
      prop({ id: 'd', estado: 'exacta' }),
    ];
    expect(ordenarPropuestas(ps).map((p) => p.id)).toEqual(['d', 'c', 'b', 'a']);
    expect(filtrarPorEstado(ps, 'fuera_tolerancia')).toHaveLength(2);
    expect(filtrarPorEstado(ps, 'todas')).toBe(ps);
    expect(contarPorEstado(ps)).toMatchObject({ total: 4, exactas: 1, fuera_tolerancia: 2, sin_banco: 1 });
  });

  it('diferencia con signo y redondeo', () => {
    expect(calcularDiferencia('100.10', '100.00')).toBe(0.1);
    expect(calcularDiferencia('90', '100')).toBe(-10);
  });

  it('ambigua: se vuelve seleccionable al elegir candidata y recalcula', () => {
    const c1 = tx('11', '01/03/2026', '100.00');
    const c2 = tx('12', '01/03/2026', '500.00');
    const p = prop({ id: 'amb', estado: 'ambigua', transaccion: null, candidatas: [c1, c2], diferencia_ves: null });
    expect(esSeleccionable(propuestaEfectiva(p, {}, 200))).toBe(false);
    const ok = propuestaEfectiva(p, { amb: claveTransaccion(c1) }, 200);
    expect(esSeleccionable(ok)).toBe(true);
    expect(ok.fueraEfectiva).toBe(false);
    const fuera = propuestaEfectiva(p, { amb: claveTransaccion(c2) }, 200);
    expect(fuera.difEfectiva).toBe(400);
    expect(fuera.fueraEfectiva).toBe(true);
  });

  it('sin_banco nunca es seleccionable', () => {
    const e = propuestaEfectiva(prop({ estado: 'sin_banco', transaccion: null }), {}, 0);
    expect(esSeleccionable(e)).toBe(false);
  });

  it('selección inicial respeta el servidor y excluye ambiguas', () => {
    const ps = [
      prop({ id: 'a' }),
      prop({ id: 'b', seleccionada_por_defecto: false }),
      prop({ id: 'c', estado: 'ambigua', seleccionada_por_defecto: true }),
    ];
    expect(seleccionInicial(ps)).toEqual({ a: true });
  });

  it('fuera de tolerancia exige observación para enviarse', () => {
    const ps = [
      prop({ id: 'a' }),
      prop({ id: 'f', estado: 'fuera_tolerancia', diferencia_ves: '300.00', operacion_uuid: 'uf' }),
    ];
    const base = { seleccion: { a: true, f: true }, elecciones: {}, tolerancia: 200 };
    expect(propuestasAEnviar(ps, { ...base, observaciones: {} }).map((e) => e.id)).toEqual(['a']);
    const con = propuestasAEnviar(ps, { ...base, observaciones: { f: ' ajuste ' } });
    expect(con.map((e) => e.id)).toEqual(['a', 'f']);
    const items = construirItems(con, { f: ' ajuste ' });
    expect(items[1]).toEqual({
      operacion_uuid: 'uf',
      observacion: 'ajuste',
      transaccion: { referencia: '1', fecha: '2026-03-01', monto: '100.00' },
    });
    expect(resumenConfirmacion(con)).toEqual({ operaciones: 2, fueraTolerancia: 1 });
  });

  it('comprobantes por procesar en caja no son seleccionables', () => {
    const p = prop({
      id: 'k', estado: 'requiere_caja', tipo: 'comprobante_por_procesar',
      operacion_uuid: null, comprobante_id: 9, confirmable: false,
    });
    const [e] = efectivasDe([p]);
    expect(esSeleccionable(e)).toBe(false);
    expect(propuestasAEnviar([p], { seleccion: { k: true }, elecciones: {}, observaciones: {}, tolerancia: 0 })).toEqual([]);
    expect(contarPorEstado([p]).requiere_caja).toBe(1);
  });
});

describe('lotes', () => {
  it('divide en lotes de 200', () => {
    const items = Array.from({ length: 450 }, (_, i) => i);
    expect(dividirEnLotes(items).map((l) => l.length)).toEqual([200, 200, 50]);
    expect(dividirEnLotes([])).toEqual([]);
  });
  it('agrega resultados re-indexando', () => {
    const r = agregarResultados([
      { conciliadas: [{ indice: 0, conciliacion_id: 1 }], errores: [{ indice: 1, error: 'a' }], lote: { id: 1, total_operaciones: 1 } },
      { conciliadas: [{ indice: 0, conciliacion_id: 2 }], errores: [{ indice: 3, error: 'b' }], lote: { id: 1, total_operaciones: 2 } },
    ]);
    expect(r.conciliadas.map((c) => c.indice)).toEqual([0, 200]);
    expect(r.errores.map((e) => e.indice)).toEqual([1, 203]);
    expect(r.lote.total_operaciones).toBe(2);
  });
});

describe('pago conjunto', () => {
  const linea = tx('123456', '02/10/2026', '800.00');
  const grupo = { clave: '123456|2026-10-02', operaciones: 2, monto_sistema_ves: '800.00', monto_previo_ves: null };

  it('las filas de un grupo del servidor se alternan juntas y comparten la observación', () => {
    const ps = [
      prop({ id: 'a', transaccion: linea, monto_sistema_ves: '400.00', grupo, estado: 'fuera_tolerancia', diferencia_ves: '-300.00' }),
      prop({ id: 'b', transaccion: linea, monto_sistema_ves: '400.00', grupo, estado: 'fuera_tolerancia', diferencia_ves: '-300.00' }),
      prop({ id: 'c' }),
    ];
    const [a, b, c] = efectivasDe(ps, {}, 200);
    expect(a.conjuntoIds).toEqual(['a', 'b']);
    expect(a.montoConjunto).toBe(800);
    expect(idsAlternables(b)).toEqual(['a', 'b']);
    expect(idsAlternables(c)).toEqual(['c']);
    expect(faltaObservacion(b, {})).toBe(true);
    expect(faltaObservacion(b, { a: 'pagó de más' })).toBe(false);
  });

  it('ambiguas con la misma línea elegida se evalúan sobre la suma', () => {
    const otra = tx('123456', '03/10/2026', '400.00');
    const amb = (id) => prop({
      id, estado: 'ambigua', transaccion: null, diferencia_ves: null, monto_sistema_ves: '400.00',
      candidatas: [linea, otra],
    });
    const elecciones = { a: claveTransaccion(linea), b: claveTransaccion(linea) };
    const [a, b] = efectivasDe([amb('a'), amb('b')], elecciones, 200);
    expect(a.difEfectiva).toBe(0);
    expect(b.fueraEfectiva).toBe(false);
    expect(a.conjuntoIds).toEqual(['a', 'b']);
    // Sola, la misma ambigua quedaría 400 por encima: fuera de tolerancia.
    const [sola] = efectivasDe([amb('a')], { a: claveTransaccion(linea) }, 200);
    expect(sola.fueraEfectiva).toBe(true);
  });

  it('propuestasAEnviar deja contiguos a los miembros del grupo', () => {
    const ps = [
      prop({ id: 'a', transaccion: linea, grupo }),
      prop({ id: 'x', transaccion: tx('9', '01/10/2026', '100.00') }),
      prop({ id: 'b', transaccion: linea, grupo }),
    ];
    const sel = { seleccion: { a: true, b: true, x: true }, elecciones: {}, observaciones: {}, tolerancia: 200 };
    expect(propuestasAEnviar(ps, sel).map((e) => e.id)).toEqual(['a', 'b', 'x']);
  });

  it('dividirEnLotes no separa ítems de la misma línea del banco', () => {
    const item = (ref) => ({ transaccion: { referencia: ref, fecha: '2026-10-02', monto: '1' } });
    const items = [item('1'), item('2'), item('2'), item('3')];
    expect(dividirEnLotes(items, 2).map((l) => l.length)).toEqual([1, 2, 1]);
    const r = agregarResultados([
      { conciliadas: [{ indice: 0 }] },
      { conciliadas: [{ indice: 0 }, { indice: 1 }] },
      { errores: [{ indice: 0, error: 'x' }] },
    ], [1, 2, 1]);
    expect(r.conciliadas.map((c) => c.indice)).toEqual([0, 1, 2]);
    expect(r.errores.map((e) => e.indice)).toEqual([3]);
  });
});
