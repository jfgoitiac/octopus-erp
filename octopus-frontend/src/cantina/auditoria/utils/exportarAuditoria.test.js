import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { exportarReporteExcel, exportarReportePDF } from './exportarAuditoria';
import { construirInforme } from '../components/ResumenEjecutivoDatos';
import { resumenFixture } from '../test/resumenFixture';

const capturado = vi.hoisted(() => ({ doc: null }));
vi.mock('jspdf', async (importOriginal) => {
  const modulo = await importOriginal();
  class Espia extends modulo.default {
    constructor(...args) { super(...args); this.save = vi.fn(); capturado.doc = this; }
  }
  return { ...modulo, default: Espia, jsPDF: Espia };
});
vi.mock('xlsx', async (importOriginal) => ({ ...(await importOriginal()), writeFile: vi.fn() }));

const filtros = { fecha_inicio: '2026-11-01', fecha_fin: '2026-11-03', area: 'cantina', cajero: '' };
const institucion = { nombre: 'Colegio Demo', rif: 'J-123', telefono: '0412', direccion: 'Calle 1', logoColegio: null };
const informe = (cambios) => construirInforme(resumenFixture(cambios), filtros, [], institucion);

describe('exportación del resumen ejecutivo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Excel: seis hojas, montos numéricos y filtros aplicados en la cabecera', () => {
    exportarReporteExcel(informe());
    const [libro, archivo] = XLSX.writeFile.mock.calls[0];
    expect(archivo).toBe('resumen_ejecutivo_de_cantina_y_libreria_2026-11-01_2026-11-03.xlsx');
    expect(libro.SheetNames).toEqual(['Resumen', 'Ventas', 'Rentabilidad', 'Métodos de pago', 'Inventario', 'Excepciones']);

    const filasResumen = XLSX.utils.sheet_to_json(libro.Sheets.Resumen, { header: 1 });
    expect(filasResumen[0][0]).toBe('Colegio Demo');
    expect(filasResumen.flat().join(' ')).toContain('Área: Cantina');
    expect(filasResumen.flat().join(' ')).toContain('Generado:');
    const ingresos = filasResumen.find((f) => f[0] === 'Ingresos netos');
    expect(ingresos[1]).toBe(9); // número, no "$9.00"
    expect(typeof ingresos[1]).toBe('number');
    const margen = filasResumen.find((f) => f[0] === 'Margen bruto');
    expect(margen[3]).toBe(32.43);

    const ventas = XLSX.utils.sheet_to_json(libro.Sheets.Ventas, { header: 1 });
    expect(ventas.find((f) => f[0] === 'Totales')[2]).toBe(9);
    expect(libro.Sheets.Resumen['!autofilter']).toBeDefined();
  });

  it('Excel: con comparación agrega la fila del período anterior', () => {
    const comparacion = {
      periodo: { fecha_inicio: '2026-10-29', fecha_fin: '2026-10-31' },
      variaciones: { ingresos_netos_usd: { anterior: '5.00', variacion_pct: '80.00' } },
    };
    exportarReporteExcel(informe({ comparacion }));
    const filas = XLSX.utils.sheet_to_json(XLSX.writeFile.mock.calls[0][0].Sheets.Resumen, { header: 1 });
    const anterior = filas.find((f) => f[0] === 'Ingresos netos (período anterior)');
    expect(anterior[1]).toBe(5);
    expect(filas.find((f) => f[0] === 'Ingresos netos')[4]).toBe(80);
  });

  it('PDF: membrete del colegio, período, fecha en español, alertas y paginación', () => {
    exportarReportePDF(informe());
    const doc = capturado.doc;
    expect(doc.save).toHaveBeenCalledWith('resumen_ejecutivo_de_cantina_y_libreria_2026-11-01_2026-11-03.pdf');

    const paginas = doc.getNumberOfPages();
    expect(paginas).toBeGreaterThanOrEqual(1);
    const texto = doc.output();
    expect(texto).toContain('COLEGIO DEMO');
    expect(texto).toContain('Del 1 de noviembre 2026 al 3 de noviembre 2026');
    expect(texto).toMatch(/Generado: \d+ de [a-z]+ 2026/);
    expect(texto).toContain('Productos vendidos sin costo registrado');
    expect(texto).toContain(`Página ${paginas} de ${paginas}`);
  });
});
