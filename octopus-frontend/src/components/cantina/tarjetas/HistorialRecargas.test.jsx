import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HistorialRecargas from './HistorialRecargas';
import { anularRecarga, corregirRecarga, getHistorialRecargas } from '../../../api/cantina.service';

vi.mock('../../../api/cantina.service', () => ({
  getHistorialRecargas: vi.fn(),
  anularRecarga: vi.fn(),
  corregirRecarga: vi.fn(),
  descargarComprobanteAnulacionRecarga: vi.fn(),
}));

const recarga = {
  id: 41,
  titular_nombre: 'Ana Pérez',
  tarjeta_serial: 'L001-0041',
  metodo_pago: 'efectivo',
  monto_usd: '10.00',
  referencia: '',
  numero_lote: '',
  banco_receptor: null,
  cajero_username: 'cajero',
  creado_en: '2026-11-04T10:00:00-04:00',
  estatus: 'aprobado',
  puede_anular: true,
  puede_corregir: true,
  caja_cerrada: false,
  saldo_proyectado: '2.00',
  requiere_forzar_saldo: false,
  puede_forzar_saldo: false,
};

describe('HistorialRecargas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHistorialRecargas.mockResolvedValue({ data: { count: 1, results: [recarga] } });
    anularRecarga.mockResolvedValue({ data: { ...recarga, estatus: 'anulado' } });
    corregirRecarga.mockResolvedValue({ data: { recarga: { ...recarga, monto_usd: '15.00' } } });
  });

  it('no vuelve a dejar el historial cargando después de la respuesta inicial', async () => {
    render(<HistorialRecargas />);
    await screen.findByText('Ana Pérez');
    await new Promise(resolve => setTimeout(resolve, 350));
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('anula con motivo y registra si se devolvió el dinero', async () => {
    const user = userEvent.setup();
    render(<HistorialRecargas />);
    await screen.findByText('Ana Pérez');

    await user.click(screen.getByRole('button', { name: 'Anular recarga 41' }));
    const dialogo = screen.getByRole('dialog');
    await user.click(within(dialogo).getByRole('checkbox', { name: /Se devolvió el dinero/i }));
    await user.type(within(dialogo).getByLabelText('Motivo *'), 'Recarga duplicada por error');
    await user.click(within(dialogo).getByRole('button', { name: 'Anular recarga' }));

    await waitFor(() => expect(anularRecarga).toHaveBeenCalledWith(41, {
      motivo: 'Recarga duplicada por error',
      devolucion_dinero: true,
      forzar_saldo_negativo: false,
    }));
  });

  it('corrige el monto conservando los datos de pago', async () => {
    const user = userEvent.setup();
    render(<HistorialRecargas />);
    await screen.findByText('Ana Pérez');

    await user.click(screen.getByRole('button', { name: 'Corregir recarga 41' }));
    const dialogo = screen.getByRole('dialog');
    const monto = within(dialogo).getByLabelText('Monto correcto');
    await user.clear(monto);
    await user.type(monto, '15');
    await user.type(within(dialogo).getByLabelText('Motivo *'), 'Monto digitado incorrectamente');
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar corrección' }));

    await waitFor(() => expect(corregirRecarga).toHaveBeenCalledWith(41, {
      motivo: 'Monto digitado incorrectamente',
      forzar_saldo_negativo: false,
      recarga: {
        metodo_pago: 'efectivo', monto_usd: '15.00', banco_receptor: null,
        referencia: '', numero_lote: '',
      },
    }));
  });
});
