import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Cobranza from './Cobranza';
import { AuthContext } from '../context/AuthContext';

// `mockConfig` es mutable para que cada test pueda simular un valor distinto
// de los flags de ConfiguracionSistema (adelantos_requieren_usd es
// independiente de abonos_parciales_requieren_usd — ver backend
// cobranza/tests.py::AbonoParcialRequiereUSDFlagTest). `vi.hoisted` lo saca
// del scope del factory de vi.mock, que corre antes que el resto del módulo.
const { mockConfig } = vi.hoisted(() => ({
    mockConfig: { adelantos_requieren_usd: true, abonos_parciales_requieren_usd: true },
}));

// Único punto de acceso a la API en toda la app (apiClient.js) — mockearlo
// aquí controla también getBancos(), useConfiguracion() y useTasaBCV(),
// que lo reexportan/reutilizan.
vi.mock('../api/apiClient', () => {
    const ALUMNO = {
        id: 1,
        nombre: 'Berta Bello',
        grado: '5to',
        estatus: 'Activo',
        nombre_completo: 'Berta Bello',
        mensualidades_pendientes: [
            { id: 10, mes: 'Enero', anio: 2026, monto_usd: '40.00', saldo: '40.00' },
        ],
        mensualidades_futuras: [],
        cuotas_inscripcion_pendientes: [],
        cuotas_solvencia_pendientes: [],
        cuotas_proyecto_inversion_pendientes: [],
    };

    const get = vi.fn((url) => {
        if (url.startsWith('cobranza/buscar/')) {
            return Promise.resolve({
                data: {
                    representante: { cedula: '12345678', nombre_completo: 'Rep Test' },
                    alumnos: [ALUMNO],
                },
            });
        }
        if (url === 'cobranza/bancos/') return Promise.resolve({ data: [] });
        if (url === 'secretaria/configuracion/') {
            return Promise.resolve({ data: { ...mockConfig } });
        }
        if (url === 'cobranza/stats/') return Promise.resolve({ data: { tasa_bcv: 40 } });
        if (url === 'cobranza/pagos/lista/') return Promise.resolve({ data: { results: [] } });
        return Promise.resolve({ data: {} });
    });

    return { default: { get, post: vi.fn(() => Promise.resolve({ data: {} })) }, API_BASE: 'http://test' };
});

const renderCobranza = () => render(
    <MemoryRouter>
        <AuthContext.Provider value={{ user: { username: 'cajera1' } }}>
            <Cobranza />
        </AuthContext.Provider>
    </MemoryRouter>
);

describe('Cobranza — abono parcial fuerza pago en divisas', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockConfig.adelantos_requieren_usd = true;
        mockConfig.abonos_parciales_requieren_usd = true;
    });

    it('convierte automáticamente una línea "Efectivo Bs." a USD en cuanto se escribe un monto parcial', async () => {
        const user = userEvent.setup();
        renderCobranza();

        // Step 1: buscar representante y esperar auto-selección del único alumno.
        fireEvent.change(screen.getByLabelText('Cédula del representante'), {
            target: { value: '12345678' },
        });
        await waitFor(() => screen.getByText('Rep Test'), { timeout: 2000 });
        const checkboxMens = await screen.findByLabelText('Mensualidad Enero 2026');
        await user.click(checkboxMens);

        // Ir a Step 2 sin parcial todavía (monto completo) y elegir Efectivo Bs.
        await user.click(screen.getByLabelText('Ir a registrar pago'));
        const botonEfectivoBs = screen.getByRole('button', { name: /Efectivo Bs\./ });
        expect(botonEfectivoBs).not.toBeDisabled();
        await user.click(botonEfectivoBs);
        expect(screen.getByText(/Monto en Bolívares/)).toBeInTheDocument();

        // Volver a Step 1 y escribir un abono parcial (20 de 40).
        // Nota: DecimalInput no reenvía `aria-label` al <input> real (ver
        // NOTAS_TECNICAS.md), así que se ubica por su valor mostrado en vez
        // de por accesibilidad.
        await user.click(screen.getByLabelText('Volver a buscar alumno'));
        const inputParcial = screen.getByDisplayValue('40.00');
        fireEvent.change(inputParcial, { target: { value: '2000' } }); // DecimalInput: centavos -> 20.00

        // Volver a Step 2: la línea debe haberse forzado a USD y el botón de
        // Efectivo Bs. debe quedar bloqueado mientras la restricción esté activa.
        await user.click(screen.getByLabelText('Ir a registrar pago'));
        expect(screen.getByText(/Monto en USD/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Efectivo Bs\./ })).toBeDisabled();
    });

    it('con "abonos_parciales_requieren_usd" desactivado, un abono parcial NO fuerza divisas', async () => {
        mockConfig.abonos_parciales_requieren_usd = false;
        const user = userEvent.setup();
        renderCobranza();

        fireEvent.change(screen.getByLabelText('Cédula del representante'), {
            target: { value: '12345678' },
        });
        await waitFor(() => screen.getByText('Rep Test'), { timeout: 2000 });
        const checkboxMens = await screen.findByLabelText('Mensualidad Enero 2026');
        await user.click(checkboxMens);

        const inputParcial = screen.getByDisplayValue('40.00');
        fireEvent.change(inputParcial, { target: { value: '2000' } }); // 20.00 de 40.00 -> parcial

        await user.click(screen.getByLabelText('Ir a registrar pago'));
        // Con el flag apagado, Efectivo Bs. debe seguir disponible y elegible.
        const botonEfectivoBs = screen.getByRole('button', { name: /Efectivo Bs\./ });
        expect(botonEfectivoBs).not.toBeDisabled();
        await user.click(botonEfectivoBs);
        expect(screen.getByText(/Monto en Bolívares/)).toBeInTheDocument();
    });
});
