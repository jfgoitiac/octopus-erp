import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ComprobantePagoModal from './ComprobantePagoModal';

const m = vi.hoisted(() => ({ subir: vi.fn(), metodos: vi.fn() }));

vi.mock('../api/portal.service', () => ({
  subirComprobante: (...a) => m.subir(...a),
  getMetodosPago: (...a) => m.metodos(...a),
}));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const maria = { id: 1, mes_nombre: 'Septiembre', anio: 2026, monto_total: '35.00', alumno_nombre: 'María Pérez' };
const jose = { id: 2, mes_nombre: 'Septiembre', anio: 2026, monto_total: '40.00', alumno_nombre: 'José Pérez' };
const metodo = { id: 7, metodo: 'transferencia', nombre: 'Transferencia', banco: 'Banco X', banco_id: 3, datos: {} };

const abrir = (props = {}) => render(
  <ComprobantePagoModal isOpen onClose={() => {}} mensualidad={maria} mensualidades={[maria, jose]} {...props} />,
);

const completarYEnviar = async () => {
  await userEvent.click(await screen.findByRole('button', { name: /Transferencia/ }));
  const archivo = new File(['x'], 'pago.png', { type: 'image/png' });
  await userEvent.upload(screen.getByLabelText('Archivo'), archivo);
  await userEvent.type(screen.getByLabelText(/Número de referencia/), '123456');
  await userEvent.click(screen.getByRole('button', { name: /Enviar comprobante/ }));
};

describe('ComprobantePagoModal — pago conjunto', () => {
  beforeEach(() => {
    Object.values(m).forEach(f => f.mockReset());
    m.metodos.mockResolvedValue({ data: [metodo] });
    m.subir.mockResolvedValue({});
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview');
  });

  it('marca solo la mensualidad que abrió el modal y envía esa', async () => {
    abrir();
    expect(screen.getByRole('checkbox', { name: /María Pérez/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /José Pérez/ })).not.toBeChecked();
    await completarYEnviar();
    expect(m.subir).toHaveBeenCalledWith([1], expect.any(File), '123456', 'transferencia', 3);
  });

  it('permite sumar la mensualidad de otro hijo al mismo comprobante', async () => {
    abrir();
    await userEvent.click(screen.getByRole('checkbox', { name: /José Pérez/ }));
    expect(screen.getByText(/2 mensualidades — REF\. 75,00/)).toBeInTheDocument();
    await completarYEnviar();
    expect(m.subir).toHaveBeenCalledWith([1, 2], expect.any(File), '123456', 'transferencia', 3);
  });

  it('sin otras mensualidades no muestra la lista de selección', () => {
    abrir({ mensualidades: [maria] });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText(/Septiembre 2026 — REF\. 35,00/)).toBeInTheDocument();
  });
});
