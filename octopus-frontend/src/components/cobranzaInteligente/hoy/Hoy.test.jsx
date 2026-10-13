import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import Hoy from './Hoy';

const m = vi.hoisted(() => ({ mens: vi.fn(), convertir: vi.fn(), descartar: vi.fn(), hoy: vi.fn(), accion: vi.fn(), hecha: vi.fn(), iniciar: vi.fn(), toastError: vi.fn(), toastOk: vi.fn() }));

vi.mock('../../../api/cobranza.service', () => ({
    getHoyInteligente: (...a) => m.hoy(...a),
    marcarTarjetaHecha: (...a) => m.hecha(...a),
    iniciarConversacionInteligente: (...a) => m.iniciar(...a),
    accionCicloInteligente: (...a) => m.accion(...a),
    crearConvenioInteligente: vi.fn(),
    getMensualidadesPendientes: (...a) => m.mens(...a),
    convertirAdjuntoComprobante: (...a) => m.convertir(...a),
    descartarAdjunto: (...a) => m.descartar(...a),
    getBancos: () => Promise.resolve({ data: [] }),
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
        { accion: 'abrir_chat', etiqueta: 'Abrir chat', disponible: true, conversacion: null },
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
const comprobante = {
    clave: 'comprobante_whatsapp:88', tipo: 'comprobante_whatsapp', prioridad: 60, urgente: true,
    titulo: 'Comprobante de Maria Perez por asignar', por_que: [],
    representante: { id: 7, nombre: 'Maria Perez', cedula: 'V1', telefono: '0412' }, ciclos: [],
    acciones: [
        { accion: 'convertir_comprobante', etiqueta: 'Asignar a mensualidad', disponible: true, mensaje: 88, conversacion: 4 },
        { accion: 'abrir_chat', etiqueta: 'Abrir chat', disponible: true, conversacion: 4 },
        { accion: 'descartar_comprobante', etiqueta: 'Descartar', disponible: true, mensaje: 88, conversacion: 4 },
    ],
    desde: '2026-07-19T00:00:00-04:00', sede: 1,
    detalle: { conversacion: 4, mensaje: 88, telefono: '0412', vinculado: true, horas_sin_asignar: 30 },
};
const mensualidades = { data: {
    representante: { id: 7, nombre: 'Maria Perez' }, count: 2,
    results: [
        { id: 123, alumno: 'Ana Perez', periodo: 'Julio 2026', saldo_usd: '50.00', tiene_comprobante_pendiente: false },
        { id: 124, alumno: 'Luis Perez', periodo: 'Julio 2026', saldo_usd: '50.00', tiene_comprobante_pendiente: true },
    ],
} };
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

const Ruta = () => <p data-testid="ruta">{useLocation().pathname}</p>;
const montar = () => render(
    <MemoryRouter>
        <Routes>
            <Route path="/" element={<Hoy />} />
            <Route path="/cobranza/inteligente/conversaciones/:id" element={<Ruta />} />
        </Routes>
    </MemoryRouter>,
);

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

    it('muestra el resumen de proyección de caja solo si el contrato lo trae', async () => {
        m.hoy.mockResolvedValue({ data: datos });
        const { unmount } = montar();
        await screen.findByText(/El sistema enviará 41 recordatorios/);
        expect(screen.queryByTestId('proyeccion-resumen')).not.toBeInTheDocument();
        unmount();
        m.hoy.mockResolvedValue({ data: { ...datos, proyeccion_caja: {
            semana: { desde: '2026-07-20', hasta: '2026-07-26' }, casos: 3, comprometido_usd: '80.00', esperado_usd: '37.50',
            por_fuente: { promesas: { casos: 1 }, convenios: { casos: 2 } },
        } } });
        montar();
        const r = await screen.findByTestId('proyeccion-resumen');
        expect(r).toHaveTextContent('$37.50 esperados de $80.00 comprometidos');
        expect(r).toHaveTextContent('20 jul – 26 jul 2026');
        expect(r).toHaveTextContent('1 de promesas · 2 de convenios');
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

    it('abrir_chat sin conversación la inicia y navega a la devuelta', async () => {
        m.hoy.mockResolvedValue({ data: datos });
        m.iniciar.mockResolvedValue({ data: { id: 55 } });
        montar();
        await userEvent.click(await screen.findByRole('button', { name: 'Abrir chat' }));
        expect(m.iniciar).toHaveBeenCalledWith(7);
        expect(await screen.findByTestId('ruta')).toHaveTextContent('/cobranza/inteligente/conversaciones/55');
    });

    it('abrir_chat con conversación navega directo sin iniciar', async () => {
        const t = { ...tarjeta, acciones: [{ accion: 'abrir_chat', etiqueta: 'Abrir chat', disponible: true, conversacion: 9 }] };
        m.hoy.mockResolvedValue({ data: { ...datos, tarjetas: [t] } });
        montar();
        await userEvent.click(await screen.findByRole('button', { name: 'Abrir chat' }));
        expect(m.iniciar).not.toHaveBeenCalled();
        expect(await screen.findByTestId('ruta')).toHaveTextContent('/cobranza/inteligente/conversaciones/9');
    });

    it('abrir_chat muestra el error si no se puede iniciar la conversación', async () => {
        m.hoy.mockResolvedValue({ data: datos });
        m.iniciar.mockRejectedValue({ response: { status: 400, data: { detail: 'Sin teléfono válido' } } });
        montar();
        await userEvent.click(await screen.findByRole('button', { name: 'Abrir chat' }));
        await waitFor(() => expect(m.toastError).toHaveBeenCalledWith('Sin teléfono válido'));
        expect(screen.queryByTestId('ruta')).not.toBeInTheDocument();
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
    it('la tarjeta de comprobante por WhatsApp convierte el adjunto en comprobante de la mensualidad elegida', async () => {
        m.hoy.mockResolvedValue({ data: { ...datos, tarjetas: [comprobante] } });
        m.mens.mockResolvedValue(mensualidades);
        m.convertir.mockResolvedValue({ data: { comprobantes: [{ id: 9 }] } });
        montar();
        await userEvent.click(await screen.findByRole('button', { name: 'Asignar a mensualidad' }));
        expect(m.mens).toHaveBeenCalledWith(4, expect.anything());
        const bloqueada = await screen.findByRole('checkbox', { name: /Luis Perez/ });
        expect(bloqueada).toBeDisabled();
        const convertir = screen.getByRole('button', { name: 'Convertir en comprobante' });
        expect(convertir).toBeDisabled();
        await userEvent.click(screen.getByRole('checkbox', { name: /Ana Perez/ }));
        await userEvent.type(screen.getByLabelText(/Referencia bancaria/), 'ab 123');
        await userEvent.click(convertir);
        await waitFor(() => expect(m.convertir).toHaveBeenCalledWith(88, {
            mensualidades: [123], metodo_pago: 'transferencia', referencia_bancaria: 'ab 123',
        }));
        expect(m.toastOk).toHaveBeenCalled();
        await waitFor(() => expect(m.hoy).toHaveBeenCalledTimes(2));
    });

    it('descartar exige un motivo y llama a la API', async () => {
        m.hoy.mockResolvedValue({ data: { ...datos, tarjetas: [comprobante] } });
        m.descartar.mockResolvedValue({ data: { mensaje: { id: 88 } } });
        montar();
        await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
        const confirmar = within(screen.getByRole('dialog')).getByRole('button', { name: 'Descartar' });
        expect(confirmar).toBeDisabled();
        await userEvent.type(screen.getByLabelText('Motivo'), 'Foto borrosa');
        await userEvent.click(confirmar);
        await waitFor(() => expect(m.descartar).toHaveBeenCalledWith(88, { motivo: 'Foto borrosa' }));
    });

    it('muestra el error del backend al convertir y deja el modal abierto', async () => {
        m.hoy.mockResolvedValue({ data: { ...datos, tarjetas: [comprobante] } });
        m.mens.mockResolvedValue(mensualidades);
        m.convertir.mockRejectedValue({ response: { status: 400, data: { detail: 'Ese archivo ya fue presentado.' } } });
        montar();
        await userEvent.click(await screen.findByRole('button', { name: 'Asignar a mensualidad' }));
        await userEvent.click(await screen.findByRole('checkbox', { name: /Ana Perez/ }));
        await userEvent.click(screen.getByRole('button', { name: 'Convertir en comprobante' }));
        await waitFor(() => expect(m.toastError).toHaveBeenCalledWith('Ese archivo ya fue presentado.'));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
});
