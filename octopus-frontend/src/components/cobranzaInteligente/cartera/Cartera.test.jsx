import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Cartera from './Cartera';
import { agruparCartera, filtrarCartera, FILTROS_INICIALES } from './carteraUtils';

const m = vi.hoisted(() => ({
    cartera: vi.fn(), pagos: vi.fn(), convenios: vi.fn(), expediente: vi.fn(), pagarCuota: vi.fn(), cancelar: vi.fn(),
}));

vi.mock('./carteraApi', () => ({
    getCarteraCompleta: (...a) => m.cartera(...a),
    getExpedienteRepresentante: (...a) => m.expediente(...a),
}));
vi.mock('../../../api/cobranza.service', () => ({
    getPagosRevisionInteligente: (...a) => m.pagos(...a),
    getConveniosInteligente: (...a) => m.convenios(...a),
    pagarCuotaConvenio: (...a) => m.pagarCuota(...a),
    cancelarConvenioInteligente: (...a) => m.cancelar(...a),
    crearConvenioInteligente: vi.fn(),
    accionCicloInteligente: vi.fn(),
}));
vi.mock('../../../context/SedeContext', () => ({ useSede: () => ({ sedeActiva: { id: 1 }, sedes: [{ id: 1 }] }) }));
vi.mock('../../../hooks/usePolling', () => ({ usePolling: vi.fn() }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ciclo = (id, rep, extra = {}) => ({
    id, alumno: { id, nombre: `Alumno ${id}`, grado: '1A' }, representante: rep,
    periodo: { mes: 9, anio: 2026 }, saldo_usd: '25.00', fecha_vencimiento: '2026-09-05',
    dias_mora: 10, estado: 'seguimiento', proxima_accion: 'Recordatorio', proxima_accion_fecha: '2026-10-15', ...extra,
});
const maria = { id: 7, nombre: 'María Pérez', cedula: 'V1' };
const jose = { id: 8, nombre: 'José Gómez', cedula: 'V2' };
const ciclos = [ciclo(1, maria), ciclo(2, maria), ciclo(3, jose, { estado: 'critica', dias_mora: 40, saldo_usd: '80.00' })];
const convenio = {
    id: 90, estado: 'vigente', representante: 7, ciclos: [1],
    cuotas: [{ id: 501, numero: 1, fecha: '2026-10-30', monto_usd: '50.00', pagada: false }],
};
const pagoRev = { tipo: 'pago', id: 4, dias_espera: 3, monto_usd: '25.00', alumno: 'Alumno 3', representante: jose };

describe('carteraUtils', () => {
    it('agrupa por representante y suma saldos', () => {
        const filas = agruparCartera(ciclos, [pagoRev], [convenio]);
        expect(filas).toHaveLength(2);
        const f = filas.find(x => x.representante.id === 7);
        expect(f.saldo_total_usd).toBe('50.00');
        expect(f.ciclos).toEqual([1, 2]);
        expect(f.convenios_vigentes).toBe(1);
        expect(filas.find(x => x.representante.id === 8).pagos_revision).toBe(1);
        expect(filas[0].representante.id).toBe(8); // más mora primero
    });

    it('propaga el perfil de pagador al renglón del representante', () => {
        const perfil = { codigo: 'cronico', etiqueta: 'Crónico' };
        const filas = agruparCartera([ciclo(1, maria, { perfil_pagador: perfil }), ciclo(2, jose)], [], []);
        expect(filas.find(x => x.representante.id === 7).perfil_pagador).toEqual(perfil);
        expect(filas.find(x => x.representante.id === 8).perfil_pagador).toBeNull();
    });

    it('la búsqueda ignora tildes y mayúsculas, y los filtros combinan', () => {
        const filas = agruparCartera(ciclos, [pagoRev], [convenio]);
        expect(filtrarCartera(filas, { ...FILTROS_INICIALES, buscar: 'maria perez' })).toHaveLength(1);
        expect(filtrarCartera(filas, { ...FILTROS_INICIALES, buscar: 'JOSE' })).toHaveLength(1);
        expect(filtrarCartera(filas, { ...FILTROS_INICIALES, conConvenio: true })[0].representante.id).toBe(7);
        expect(filtrarCartera(filas, { ...FILTROS_INICIALES, conPagoRevision: true })[0].representante.id).toBe(8);
        expect(filtrarCartera(filas, { ...FILTROS_INICIALES, etapa: 'critica' })).toHaveLength(1);
    });
});

describe('Cartera', () => {
    beforeEach(() => {
        Object.values(m).forEach(f => f.mockReset());
        m.cartera.mockResolvedValue(ciclos);
        m.pagos.mockResolvedValue({ data: { results: [pagoRev] } });
        m.convenios.mockResolvedValue({ data: { results: [convenio] } });
        m.expediente.mockResolvedValue({ data: { representante: maria, ciclos: [ciclo(1, maria)], eventos: [] } });
    });

    it('muestra un skeleton y luego un renglón por representante', async () => {
        render(<Cartera />);
        expect(screen.getByRole('status', { name: /cargando cartera/i })).toBeInTheDocument();
        expect(await screen.findByText('María Pérez')).toBeInTheDocument();
        expect(screen.getByText('José Gómez')).toBeInTheDocument();
        expect(screen.getByText('$50.00')).toBeInTheDocument();
    });

    it('muestra el perfil de pagador en la cartera y en la ficha', async () => {
        const user = userEvent.setup();
        m.cartera.mockResolvedValue([ciclo(1, maria, { perfil_pagador: { codigo: 'paga_tarde', etiqueta: 'Paga tarde pero paga' } }), ciclos[2]]);
        m.expediente.mockResolvedValue({ data: { representante: maria, perfil_pagador: { codigo: 'moroso_nuevo', etiqueta: 'Moroso nuevo' }, ciclos: [], eventos: [] } });
        render(<Cartera />);
        await screen.findByText('María Pérez');
        expect(screen.getAllByTestId('perfil-pagador')[0]).toHaveTextContent('Paga tarde pero paga');
        await user.click(screen.getByRole('button', { name: /abrir ficha de maría pérez/i }));
        const dialogo = await screen.findByRole('dialog');
        expect(await within(dialogo).findByText('Moroso nuevo')).toBeInTheDocument();
    });

    it('filtra por texto sin tildes y por "Con pago en revisión"', async () => {
        const user = userEvent.setup();
        render(<Cartera />);
        await screen.findByText('María Pérez');
        await user.type(screen.getByLabelText(/buscar representante/i), 'jose');
        expect(screen.queryByText('María Pérez')).not.toBeInTheDocument();
        await user.clear(screen.getByLabelText(/buscar representante/i));
        await user.click(screen.getByLabelText('Con convenio'));
        expect(screen.queryByText('José Gómez')).not.toBeInTheDocument();
        expect(screen.getByText('María Pérez')).toBeInTheDocument();
        await user.click(screen.getByLabelText('Con convenio'));
        await user.click(screen.getByLabelText('Con pago en revisión'));
        expect(screen.queryByText('María Pérez')).not.toBeInTheDocument();
        expect(screen.getByText('José Gómez')).toBeInTheDocument();
    });

    it('abre la ficha y marca una cuota como pagada', async () => {
        const user = userEvent.setup();
        m.pagarCuota.mockResolvedValue({ data: {} });
        render(<Cartera />);
        await user.click(await screen.findByRole('button', { name: /abrir ficha de maría pérez/i }));
        const dialogo = await screen.findByRole('dialog');
        expect(within(dialogo).getByText(/ficha · maría pérez/i)).toBeInTheDocument();
        await user.click(await within(dialogo).findByRole('button', { name: /marcar cuota 1 como pagada/i }));
        await waitFor(() => expect(m.pagarCuota).toHaveBeenCalledWith(501));
    });

    it('si está apagada (409) muestra la pantalla de módulo apagado', async () => {
        m.cartera.mockRejectedValue({ response: { status: 409 } });
        render(<Cartera />);
        expect(await screen.findByText(/está apagada/i)).toBeInTheDocument();
    });
});
