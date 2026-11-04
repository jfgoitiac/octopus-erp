import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GestionQrPanel from './GestionQrPanel';
import {
  buscarTarjetaOperacion, getBancosCantina, getTasaVigenteCantina, recargarTarjetaCajero,
} from '../../../api/cantina.service';

vi.mock('../../../api/cantina.service', () => ({
  asignarTarjeta: vi.fn(),
  asignarYRecargarTarjeta: vi.fn(),
  buscarTarjetaOperacion: vi.fn(),
  getBancosCantina: vi.fn(),
  getTasaVigenteCantina: vi.fn(),
  recargarTarjetaCajero: vi.fn(),
}));

const activa = {
  id: 7,
  codigo: 'CANT-ABCDEFGHJK',
  serial: 'L001-0007',
  estado: 'activa',
  titular_nombre: 'Ana Pérez',
  titular_tipo: 'alumno',
  alumno_grado_seccion: '3ro A',
  saldo: '5.00',
  limite_credito: '2.00',
};

describe('GestionQrPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBancosCantina.mockResolvedValue({ data: [] });
    getTasaVigenteCantina.mockResolvedValue({ data: { valor_bs: '50.00' } });
  });

  it('resuelve una tarjeta activa y permite recargar sin salir de la pantalla', async () => {
    const user = userEvent.setup();
    buscarTarjetaOperacion.mockResolvedValue({ data: activa });
    recargarTarjetaCajero.mockResolvedValue({ data: { id: 90 } });
    render(<GestionQrPanel />);

    await user.type(screen.getByLabelText(/QR, serial, nombre o cédula/i), `${activa.codigo}{enter}`);
    expect(await screen.findByText('Registrar recarga')).toBeInTheDocument();
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('$7.00')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Monto recibido'), '10');
    await user.click(screen.getByRole('button', { name: 'Confirmar recarga' }));

    await waitFor(() => expect(recargarTarjetaCajero).toHaveBeenCalledWith({
      tarjeta: 7,
      metodo_pago: 'efectivo',
      monto_usd: '10.00',
      banco_receptor: null,
      banco_procedencia: '',
      referencia: '',
    }));
    expect(await screen.findByText('Recarga completada')).toBeInTheDocument();
    expect(screen.getByText('$15.00')).toBeInTheDocument();
  });

  it('dirige un QR sin asignar al flujo de titular y recarga inicial', async () => {
    const user = userEvent.setup();
    buscarTarjetaOperacion.mockResolvedValue({ data: {
      ...activa,
      id: 8,
      serial: 'L001-0008',
      estado: 'sin_asignar',
      titular_nombre: null,
      saldo: '0.00',
    } });
    render(<GestionQrPanel />);

    await user.type(screen.getByLabelText(/QR, serial, nombre o cédula/i), 'L001-0008{enter}');
    expect(await screen.findByText('¿Quién recibirá la tarjeta?')).toBeInTheDocument();
    expect(screen.getByText('Recarga inicial')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Asignar y recargar' })).toBeInTheDocument();
  });
});
