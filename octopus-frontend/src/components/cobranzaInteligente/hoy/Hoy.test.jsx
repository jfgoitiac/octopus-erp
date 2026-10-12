import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Hoy from './Hoy';

const m = vi.hoisted(() => ({ hoy: vi.fn(), accion: vi.fn(), hecha: vi.fn(), toastError: vi.fn(), toastOk: vi.fn() }));

vi.mock('../../../api/cobranza.service', () => ({
    getHoyInteligente: (...a) => m.hoy(...a),
    marcarTarjetaHecha: (...a) => m.hecha(...a),
    accionCicloInteligente: (...a) => m.accion(...a),
    crearConvenioInteligente: vi.fn(),
}));
vi.mock('../../../context/SedeContext', () => ({ useSede: () => ({ sedeActiva: { id: 1 }, sedes: [{ id: 1 }] }) }));
vi.mock('../../../hooks/usePolling', () => ({ usePolling: vi.fn() }));
vi.mock('react-toastify', () => ({ toast: { success: (...a) => m.toastOk(...a), error: (...a) => m.toastError(...a) } }));
// recharts no mide nada en jsdom: el contenedor responsivo se sustituye por un div.
vi.mock('recharts', async (orig) => ({ ...(await orig()), ResponsiveContainer: ({ children }) => <div>{children}</div> }));

const tarjeta = {
    clave: 'caso_prioritario:7', tipo: 'caso_prioritario', prioridad: 85, urgente: true,
    titulo: 'Maria Perez: caso crítico sin gestión reciente',
    por_que: [{ texto: 'Mora de 19 días', puntos: 19 }],
    representante: { id: 7, nombre: 'Maria Perez', cedula: 'V1', telefono: '0412' },
    ciclos: [3, 4],
    acciones: [
        { accion: 'abrir_chat', etiqueta: 'Abrir chat', disponible: false },
        { accion: 'llamada', etiqueta: 'Registrar llamada', disponible: true, ciclo: 3 },
        { accion: 'pausar', etiqueta: 'Pausar', disponible: true, ciclo: 3 },
    ],
    desde: '2026-07-20T00:00:00-04:00', sede: 1, detalle: { saldo_total_usd: '50.00' },
};
const pago = {
    clave: 'pago_en_revision:pago:4', tipo: 'pago_en_revision', prioridad: 40, urgente: false,
    titulo: 'Pago de $25.00 esperando revisión', por_que: [], representante: null, ciclos: [],
    acciones: [{ accion: 'conciliar', etiqueta: 'Ir a conciliar', disponible: true, tipo: 'pago', id: 4 }],
    desde: '2026-07-18T00:00:00-04:00', sede: 1, detalle: {},
};
const datos = {
    fecha: '2026-07-20',
    resumen: { frase: 'Hoy: 2 casos requieren acción. El sistema enviará 41 recordatorios a las 8:00.' },
    tarjetas: [tarjeta, pago],
    kpis: {
        cartera_mes: { facturado_usd: '1000.00', cobrado_usd: '400.00', pendiente_usd: '600.00', cobrado_pct: 40 },
        mora_por_antiguedad: { por_vencer: 4, '1_7': 3, '8_15': 2, '16_30': 1, mas_30: 0 },
        pagos_por_conciliar: 5, envios_7_dias: { enviado: 20, omitido: 3, fallido: 1 },
    },
    actividad: [{
        id: 1, estado: 'enviado', canal: 'whatsapp', regla: 'Seguimiento cordial',
        enviado_en: '2026-07-20T10:00:00-04:00', representante: { id: 7, nombre: 'Juan Soto' },
    }],
};

const montar = () => render(<MemoryRouter><Hoy /></MemoryRouter>);

describe('Hoy', () => {
    beforeEach(() => Object.values(m).forEach(f => f.mockReset()));

    it('muestra la frase, la tarjeta con su por qué, los KPIs y la actividad', async () => {
        m.hoy.mockResolvedValue({ data: datos });
        montar();
        expect(await screen.findByText(/El sistema enviará 41 recordatorios/)).toBeInTheDocument();
        expect(screen.getByText('Maria Perez: caso crítico sin gestión reciente')).toBeInTheDocument();
        expect(screen.getByText('Mora de 19 días (+19)')).toBeInTheDocument();
        expect(screen.getByText('Cobrado del mes')).toBeInTheDocument();
        expect(screen.getByText('Juan Soto')).toBeInTheDocument();
    });

    it('si está apagada (409) lo dice sin error', async () => {
        m.hoy.mockRejectedValue({ response: { status: 409 } });
        montar();
        expect(await screen.findByText(/está apagada/)).toBeInTheDocument();
        expect(m.toastError).not.toHaveBeenCalled();
    });

    it('ante otro error muestra un toast', async () => {
        m.hoy.mockRejectedValue({ response: { status: 500, data: { detail: 'Falla' } } });
        montar();
        await waitFor(() => expect(m.toastError).toHaveBeenCalledWith('Falla'));
    });

    it('abrir_chat no disponible queda deshabilitado con tooltip', async () => {
        m.hoy.mockResolvedValue({ data: datos });
        montar();
        const boton = await screen.findByRole('button', { name: 'Abrir chat' });
        expect(boton).toBeDisabled();
        expect(boton).toHaveAttribute('title', 'Disponible con Conversaciones');
    });

    it('registrar una llamada llama a la API por la deuda de la acción', async () => {
        m.hoy.mockResolvedValue({ data: datos });
        m.accion.mockResolvedValue({});
        montar();
        await userEvent.click(await screen.findByRole('button', { name: 'Registrar llamada' }));
        await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));
        await waitFor(() => expect(m.accion).toHaveBeenCalledWith(3, expect.objectContaining({ accion: 'llamada' })));
    });

    it('pausar abre el modal con la acción preseleccionada y manda el motivo', async () => {
        m.hoy.mockResolvedValue({ data: datos });
        m.accion.mockResolvedValue({});
        montar();
        await userEvent.click(await screen.findByRole('button', { name: 'Pausar' }));
        expect(screen.getByLabelText('Acción')).toHaveValue('pausar');
        await userEvent.type(screen.getByLabelText(/Motivo/), 'Acuerdo verbal');
        await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));
        await waitFor(() => expect(m.accion).toHaveBeenCalledWith(
            3, expect.objectContaining({ accion: 'pausar', motivo: 'Acuerdo verbal' }),
        ));
    });

    it('marcar hecha llama a la API con la clave y recarga', async () => {
        m.hoy.mockResolvedValue({ data: datos });
        m.hecha.mockResolvedValue({});
        montar();
        const art = (await screen.findByText(tarjeta.titulo)).closest('article');
        await userEvent.click(within(art).getByRole('button', { name: /Marcar hecha/ }));
        await waitFor(() => expect(m.hecha).toHaveBeenCalledWith('caso_prioritario:7', {}));
        await waitFor(() => expect(m.hoy).toHaveBeenCalledTimes(2));
    });

    it('la tarjeta de pago en revisión enlaza al conciliador', async () => {
        m.hoy.mockResolvedValue({ data: datos });
        montar();
        expect(await screen.findByRole('link', { name: 'Ir a conciliar' })).toHaveAttribute('href', '/conciliador');
    });
});
