import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'react-toastify';
import ReporteResumenEjecutivo from './ReporteResumenEjecutivo';
import { getResumenEjecutivo } from '../api/auditoriaApi';
import { exportarReporteExcel, exportarReportePDF } from '../utils/exportarAuditoria';
import { resumenFixture } from '../test/resumenFixture';

vi.mock('../api/auditoriaApi', () => ({ getResumenEjecutivo: vi.fn() }));
vi.mock('react-toastify', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../../hooks/useInstitucionPDF', () => ({
  useInstitucionPDF: () => ({ nombre: 'Colegio Demo', rif: 'J-123', telefono: '0412', logoColegio: null }),
}));
vi.mock('../utils/exportarAuditoria', async (importOriginal) => ({
  ...(await importOriginal()),
  exportarReportePDF: vi.fn(),
  exportarReporteExcel: vi.fn(),
}));

const filtros = { fecha_inicio: '2026-11-01', fecha_fin: '2026-11-03', area: '', cajero: '' };
const montar = (props = {}) => render(
  <ReporteResumenEjecutivo filtros={filtros} cajeros={[]} onUsuarios={vi.fn()} {...props} />,
);

describe('ReporteResumenEjecutivo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('muestra skeleton durante la carga y luego los KPIs, alertas y rankings', async () => {
    getResumenEjecutivo.mockResolvedValue({ data: resumenFixture() });
    montar();
    expect(screen.getByLabelText('Cargando reporte')).toBeInTheDocument();

    expect(await screen.findByText('Ingresos netos')).toBeInTheDocument();
    expect(screen.queryByLabelText('Cargando reporte')).not.toBeInTheDocument();
    expect(screen.getByText('$9.00')).toBeInTheDocument();
    expect(screen.getByText('32.43 %')).toBeInTheDocument();
    expect(screen.getByText('Productos con mayores ingresos')).toBeInTheDocument();
    expect(screen.getByText('Evolución diaria de ingresos')).toBeInTheDocument();
  });

  it('advierte de los productos vendidos sin costo registrado', async () => {
    getResumenEjecutivo.mockResolvedValue({ data: resumenFixture() });
    montar();
    expect(await screen.findByText('Productos vendidos sin costo registrado')).toBeInTheDocument();
    expect(screen.getByText(/se excluye del margen/)).toBeInTheDocument();
    expect(screen.getByText('Jugo natural')).toBeInTheDocument();
  });

  it('muestra el estado vacío y deshabilita la exportación', async () => {
    getResumenEjecutivo.mockResolvedValue({ data: resumenFixture({ vacio: true }) });
    montar();
    expect(await screen.findByText(/No hay ventas registradas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PDF/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Excel/ })).toBeDisabled();
  });

  it('muestra el error con toast', async () => {
    getResumenEjecutivo.mockRejectedValue({ response: { data: { error: 'Rango inválido' } } });
    montar();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Rango inválido')));
    expect(toast.error.mock.calls[0][0]).toContain('No se pudo cargar el resumen ejecutivo');
  });

  it('al cambiar filtros consulta de nuevo y cancela la petición anterior', async () => {
    getResumenEjecutivo.mockResolvedValue({ data: resumenFixture() });
    const { rerender } = montar();
    await screen.findByText('Ingresos netos');
    const primeraSenal = getResumenEjecutivo.mock.calls[0][1];

    rerender(<ReporteResumenEjecutivo filtros={{ ...filtros, area: 'libreria' }} cajeros={[]} onUsuarios={vi.fn()} />);
    await waitFor(() => expect(getResumenEjecutivo).toHaveBeenCalledTimes(2));
    expect(primeraSenal.aborted).toBe(true);
    expect(getResumenEjecutivo.mock.calls[1][0]).toMatchObject({ area: 'libreria', fecha_inicio: '2026-11-01' });
  });

  it('pide la comparación solo si se activa y muestra la variación', async () => {
    const comparacion = {
      periodo: { fecha_inicio: '2026-10-29', fecha_fin: '2026-10-31' },
      variaciones: { ingresos_netos_usd: { anterior: '5.00', variacion_pct: '80.00' } },
    };
    getResumenEjecutivo.mockImplementation((params) => Promise.resolve({
      data: resumenFixture(params.comparar ? { comparacion } : {}),
    }));
    montar();
    await screen.findByText('Ingresos netos');
    expect(getResumenEjecutivo.mock.calls[0][0].comparar).toBeUndefined();

    await userEvent.click(screen.getByLabelText(/Comparar con el período anterior/));
    expect(await screen.findByText(/\+80\.00 % vs\. anterior/)).toBeInTheDocument();
    expect(getResumenEjecutivo.mock.calls.at(-1)[0].comparar).toBe('true');
  });

  it('exporta a PDF y a Excel con el informe completo', async () => {
    getResumenEjecutivo.mockResolvedValue({ data: resumenFixture() });
    montar();
    await screen.findByText('Ingresos netos');

    await userEvent.click(screen.getByRole('button', { name: /PDF/ }));
    await waitFor(() => expect(exportarReportePDF).toHaveBeenCalledTimes(1));
    const pdf = exportarReportePDF.mock.calls[0][0];
    expect(pdf.institucion.nombre).toBe('Colegio Demo');
    expect(pdf.titulo).toBe('Resumen ejecutivo de Cantina y Librería');

    await userEvent.click(screen.getByRole('button', { name: /Excel/ }));
    await waitFor(() => expect(exportarReporteExcel).toHaveBeenCalledTimes(1));
    expect(exportarReporteExcel.mock.calls[0][0].hojas.map((h) => h.nombre)).toEqual([
      'Resumen', 'Ventas', 'Rentabilidad', 'Métodos de pago', 'Inventario', 'Excepciones',
    ]);
    expect(toast.success).toHaveBeenCalledTimes(2);
  });
});
