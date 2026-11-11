import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ModalReglaRecargoPago from './ModalReglaRecargoPago';


const form = {
    nombre: 'Recargo noviembre', descripcion: '', tipo: 'recargo',
    modo_calculo: 'monto_fijo_usd', valor: '5', dia_aplicacion: 1,
    dia_desde: '', dia_hasta: '', ancla_recargo: 'dia_mes',
    dias_desde_vencimiento: '', frecuencia_recargo: 'unico', cada_dias: '',
    vigente_desde: '2026-11-15', activa: true,
};


describe('ModalReglaRecargoPago', () => {
    it('explica el período excluido y la primera fecha efectiva', () => {
        render(
            <ModalReglaRecargoPago
                open form={form} setForm={vi.fn()} onClose={vi.fn()}
                onSave={vi.fn()} saving={false}
            />,
        );

        expect(screen.getByText(/octubre 2026 queda excluido/i)).toBeInTheDocument();
        expect(screen.getByText(/15 de noviembre de 2026/)).toBeInTheDocument();
        expect(screen.getByText(/mensualidades de meses anteriores quedan excluidas/i)).toBeInTheDocument();
    });
});
