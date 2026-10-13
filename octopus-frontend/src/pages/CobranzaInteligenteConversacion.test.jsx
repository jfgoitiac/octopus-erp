import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CobranzaInteligenteConversacion from './CobranzaInteligenteConversacion';

const m = vi.hoisted(() => ({ get: vi.fn(), accion: vi.fn() }));

vi.mock('../api/cobranza.service', () => ({
    getConversacionInteligente: (...a) => m.get(...a),
    accionConversacionInteligente: (...a) => m.accion(...a),
    accionCicloInteligente: vi.fn(),
    crearConvenioInteligente: vi.fn(),
}));
vi.mock('../context/SedeContext', () => ({ useSede: () => ({ sedeActiva: null, sedes: [] }) }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const conversacion = (activa) => ({
    representante: { id: 7, nombre: 'Maria Perez', cedula: 'V1', telefono: '0412-1234567', correo: 'm@t.com' },
    saldo_total_usd: '50.00', ciclos_abiertos: [3], deudas_abiertas: ['Ana · Julio 2026'],
    gestion_humana: { activa, responsable: activa ? 'ana' : null }, bot_pausado: activa,
    accion_sugerida: { codigo: 'llamar', texto: 'Llamar al representante' },
    razones: [{ texto: 'Mora de 19 días', puntos: 19 }], puntaje: 19,
    whatsapp: { api: true, ventana_abierta: false },
    linea_de_tiempo: [
        { id: 'log-1', clase: 'mensaje', autor: 'bot', canal: 'whatsapp', texto: 'Hola Maria, sigue pendiente…',
            estado: 'enviado', fecha: '2026-10-10T09:00:00Z' },
        { id: 'evento-2', clase: 'evento', tipo: 'llamada_registrada', autor: 'personal', usuario: 'ana',
            texto: 'Prometió pagar el viernes', detalle: {}, fecha: '2026-10-11T10:00:00Z', deudas: ['Ana · Julio 2026'] },
        { id: 'evento-3', clase: 'evento', tipo: 'ciclo_pausado', autor: 'personal', usuario: 'ana',
            texto: 'gestion_humana', detalle: { motivo: 'gestion_humana' }, fecha: '2026-10-11T10:05:00Z', deudas: [] },
        { id: 'log-4', clase: 'mensaje', autor: 'representante', canal: 'whatsapp', texto: 'Pago el viernes sin falta',
            estado: 'recibido', fecha: '2026-10-11T11:00:00Z' },
    ],
});

const montar = () => render(
    <MemoryRouter initialEntries={['/cobranza/inteligente/representantes/7']}>
        <Routes>
            <Route path="/cobranza/inteligente/representantes/:id" element={<CobranzaInteligenteConversacion />} />
        </Routes>
    </MemoryRouter>,
);

describe('CobranzaInteligenteConversacion', () => {
    beforeEach(() => Object.values(m).forEach(f => f.mockReset()));

    it('muestra mensajes del bot, notas internas y avisos del sistema', async () => {
        m.get.mockResolvedValue({ data: conversacion(false) });
        montar();
        expect(await screen.findByText('Hola Maria, sigue pendiente…')).toBeInTheDocument();
        expect(screen.getByText('Bot de cobranza')).toBeInTheDocument();
        expect(screen.getByText('Prometió pagar el viernes')).toBeInTheDocument();
        expect(screen.getByText(/ana tomó la conversación/)).toBeInTheDocument();
        expect(screen.getByText('Pago el viernes sin falta')).toBeInTheDocument();
        expect(m.get).toHaveBeenCalledWith('7', expect.anything());
    });

    it('tomar la conversación llama a la API y recarga', async () => {
        m.get.mockResolvedValueOnce({ data: conversacion(false) }).mockResolvedValue({ data: conversacion(true) });
        m.accion.mockResolvedValue({});
        montar();
        await userEvent.click((await screen.findAllByRole('button', { name: /Tomar conversación/ }))[0]);
        await waitFor(() => expect(m.accion).toHaveBeenCalledWith('7', 'tomar'));
        expect(await screen.findByText(/Atendido por ana/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Enviar WhatsApp' })).toBeInTheDocument();
    });

    it('la acción sugerida abre el registro de llamada', async () => {
        m.get.mockResolvedValue({ data: conversacion(true) });
        montar();
        await userEvent.click(await screen.findByRole('button', { name: 'Llamar al representante' }));
        expect(await screen.findByLabelText('Acción')).toHaveValue('llamada');
    });

    it('fuera de la ventana de 24 h responde abriendo WhatsApp y lo registra', async () => {
        m.get.mockResolvedValue({ data: conversacion(true) });
        m.accion.mockResolvedValue({});
        const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
        montar();
        await userEvent.type(await screen.findByLabelText('Mensaje para el representante'), 'Gracias, quedamos atentos');
        await userEvent.click(screen.getByRole('button', { name: 'Enviar WhatsApp' }));
        await waitFor(() => expect(m.accion).toHaveBeenCalledWith('7', 'responder', { texto: 'Gracias, quedamos atentos', modo: 'manual' }));
        expect(abrir).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/584121234567?text=Gracias'), '_blank', 'noopener,noreferrer');
        abrir.mockRestore();
    });

    it('dentro de la ventana responde por la API sin abrir WhatsApp', async () => {
        const datos = conversacion(true);
        datos.whatsapp.ventana_abierta = true;
        m.get.mockResolvedValue({ data: datos });
        m.accion.mockResolvedValue({});
        const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
        montar();
        await userEvent.type(await screen.findByLabelText('Mensaje para el representante'), 'Recibido{Enter}');
        await waitFor(() => expect(m.accion).toHaveBeenCalledWith('7', 'responder', { texto: 'Recibido', modo: 'api' }));
        expect(abrir).not.toHaveBeenCalled();
        abrir.mockRestore();
    });
});
