import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SaldoTarjetaCard from './SaldoTarjetaCard';

describe('SaldoTarjetaCard', () => {
  it('muestra el saldo sin ofrecer recargas desde el portal', () => {
    render(
      <SaldoTarjetaCard
        saldoTarjeta={{ tiene_tarjeta: true, saldo: '32.00', estado: 'activa' }}
        loading={false}
      />,
    );

    expect(screen.getByText('Saldo de la tarjeta')).toBeInTheDocument();
    expect(screen.getByText('REF. 32,00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /recargar/i })).not.toBeInTheDocument();
  });
});
