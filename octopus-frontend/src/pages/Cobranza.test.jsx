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
// del scope del factory de vi.mock, que corre antes que el resto del módulo..
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
        mensualidades_futuras: [
            { id: 20, mes: 'Diciembre', anio: 2026, monto_usd: '40.00', saldo: '40.00' },
        ],
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

    // Desde 2026-09-17: abonos_parciales_requieren_usd YA NO aplica a
    // mensualidades VENCIDAS (mensualidad_ids) — solo a ADELANTOS
    // (mensualidad_adelanto_ids). Bloquear la recuperación de deuda real ya
    // vencida en bolívares no tiene el mismo respaldo de negocio que
    // bloquear un adelanto. Ver cobranza/serializers.py::validate y
    // NOTAS_TECNICAS.md.
    it('un abono parcial de una mensualidad YA VENCIDA no fuerza divisas aunque el flag esté activo', async () => {
        const user = userEvent.setup();
        renderCobranza();

        // Step 1: buscar representante y esperar auto-selección del único alumno.
        fireEvent.change(screen.getByLabelText('Cédula del representante'), {
            target: { value: '12345678' },
        });
        await waitFor(() => screen.getByText('Rep Test'), { timeout: 2000 });
        const checkboxMens = await screen.findByLabelText('Mensualidad Enero 2026');
        await user.click(checkboxMens);

        // Escribir un abono parcial (20 de 40) sobre la mensualidad vencida.
        // Nota: DecimalInput no reenvía `aria-label` al <input> real (ver
        // NOTAS_TECNICAS.md), así que se ubica por su valor mostrado en vez
        // de por accesibilidad.
        const inputParcial = screen.getByDisplayValue('40.00');
        fireEvent.change(inputParcial, { target: { value: '2000' } }); // DecimalInput: centavos -> 20.00

        // Al ser vencida (no adelanto), Efectivo Bs. debe seguir disponible
        // pese a que abonos_parciales_requieren_usd está activo.
        await user.click(screen.getByLabelText('Ir a registrar pago'));
        const botonEfectivoBs = screen.getByRole('button', { name: /Efectivo Bs\./ });
        expect(botonEfectivoBs).not.toBeDisabled();
        await user.click(botonEfectivoBs);
        expect(screen.getByText(/Monto en Bolívares/)).toBeInTheDocument();
    });

    it('convierte automáticamente una línea "Efectivo Bs." a USD para un ADELANTO en cuanto se escribe un monto parcial', async () => {
        // Se aísla adelantos_requieren_usd para que la conversión forzada se
        // deba exclusivamente a abonos_parciales_requieren_usd (el abono
        // parcial del adelanto), no a la restricción general de adelantos.
        mockConfig.adelantos_requieren_usd = false;
        const user = userEvent.setup();
        renderCobranza();

        fireEvent.change(screen.getByLabelText('Cédula del representante'), {
            target: { value: '12345678' },
        });
        await waitFor(() => screen.getByText('Rep Test'), { timeout: 2000 });
        const checkboxAdelanto = await screen.findByLabelText('Adelanto Diciembre 2026');
        await user.click(checkboxAdelanto);

        // Con monto completo (sin abono parcial) y adelantos_requieren_usd
        // desactivado, Efectivo Bs. debe seguir disponible.
        await user.click(screen.getByLabelText('Ir a registrar pago'));
        expect(screen.getByRole('button', { name: /Efectivo Bs\./ })).not.toBeDisabled();

        // Volver a Step 1 y escribir un abono parcial (20 de 40).
        await user.click(screen.getByLabelText('Volver a buscar alumno'));
        const inputParcial = screen.getByDisplayValue('40.00');
        fireEvent.change(inputParcial, { target: { value: '2000' } });

        // Ahora sí debe forzarse a USD por el abono parcial del adelanto.
        await user.click(screen.getByLabelText('Ir a registrar pago'));
        expect(screen.getByText(/Monto en USD/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Efectivo Bs\./ })).toBeDisabled();
    });

    it('con "abonos_parciales_requieren_usd" desactivado, un abono parcial de un adelanto NO fuerza divisas', async () => {
        mockConfig.adelantos_requieren_usd = false;
        mockConfig.abonos_parciales_requieren_usd = false;
        const user = userEvent.setup();
        renderCobranza();

        fireEvent.change(screen.getByLabelText('Cédula del representante'), {
            target: { value: '12345678' },
        });
        await waitFor(() => screen.getByText('Rep Test'), { timeout: 2000 });
        const checkboxAdelanto = await screen.findByLabelText('Adelanto Diciembre 2026');
        await user.click(checkboxAdelanto);

        const inputParcial = screen.getByDisplayValue('40.00');
        fireEvent.change(inputParcial, { target: { value: '2000' } }); // 20.00 de 40.00 -> parcial

        await user.click(screen.getByLabelText('Ir a registrar pago'));
        // Con ambos flags apagados, Efectivo Bs. debe seguir disponible y elegible.
        const botonEfectivoBs = screen.getByRole('button', { name: /Efectivo Bs\./ });
        expect(botonEfectivoBs).not.toBeDisabled();
        await user.click(botonEfectivoBs);
        expect(screen.getByText(/Monto en Bolívares/)).toBeInTheDocument();
    });
});
