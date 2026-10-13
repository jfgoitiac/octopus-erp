import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Conversaciones from './Conversaciones';
import { Compositor } from './Compositor';
import { BannerTakeover } from './BannerTakeover';
import { BurbujaMensaje } from './BurbujaMensaje';
import { formatoRestante, segundosRestantes } from './conversacionesUtils';

const m = vi.hoisted(() => ({
    lista: vi.fn(), mensajes: vi.fn(), enviar: vi.fn(), tomar: vi.fn(), devolver: vi.fn(),
    leida: vi.fn(), plantillas: vi.fn(), plantilla: vi.fn(), rapidas: vi.fn(), toastError: vi.fn(), toastOk: vi.fn(),
}));

vi.mock('../../../api/cobranza.service', () => ({
    getConversacionesInteligente: (...a) => m.lista(...a),
    getMensajesConversacion: (...a) => m.mensajes(...a),
    enviarMensajeConversacion: (...a) => m.enviar(...a),
    tomarConversacion: (...a) => m.tomar(...a),
    devolverConversacion: (...a) => m.devolver(...a),
    marcarConversacionLeida: (...a) => m.leida(...a),
    getPlantillasConversacion: (...a) => m.plantillas(...a),
    enviarPlantillaConversacion: (...a) => m.plantilla(...a),
    getRespuestasRapidasConversacion: (...a) => m.rapidas(...a),
    crearNotaConversacion: vi.fn(),
    vincularConversacion: vi.fn(),
    buscarRepresentantesVincular: vi.fn(),
    descargarArchivoMensaje: vi.fn(),
    getMensualidadesPendientes: vi.fn(() => Promise.resolve({ data: { representante: { id: 7, nombre: 'Maria Perez' }, results: [] } })),
    getBancos: vi.fn(() => Promise.resolve({ data: [] })),
    convertirAdjuntoComprobante: vi.fn(),
    descartarAdjunto: vi.fn(),
}));
vi.mock('../../../context/SedeContext', () => ({ useSede: () => ({ sedeActiva: { id: 1 }, sedes: [{ id: 1 }] }) }));
vi.mock('../../../hooks/usePolling', () => ({ usePolling: vi.fn() }));
vi.mock('react-toastify', () => ({ toast: { success: (...a) => m.toastOk(...a), error: (...a) => m.toastError(...a) } }));

const enUnaHora = () => new Date(Date.now() + 3660 * 1000).toISOString();
const ventanaAbierta = { abierta: true, expira_en: new Date(Date.now() + 5 * 3600 * 1000 + 12 * 60 * 1000).toISOString(), segundos_restantes: 18720 };
const ventanaCerrada = { abierta: false, expira_en: null, segundos_restantes: 0 };

const base = {
    telefono: '+584121234567', nombre_contacto: 'Maria P', sede: 1, requiere_humano: false, tomada_por: null,
    tomada_en: null, ultimo_entrante_en: '2026-07-20T09:00:00-04:00', no_leidos: 0, esperando: '',
    actualizado_en: '2026-07-20T10:00:00-04:00',
};
const convMaria = {
    ...base, id: 4, estado: 'automatico', no_leidos: 2, ventana: ventanaAbierta,
    representante: { id: 7, nombre: 'Maria Perez', cedula: 'V1', telefono: '0412' },
    ultimo_mensaje: { id: 31, direccion: 'entrante', tipo: 'texto', cuerpo: 'Hola, ya pagué', estado_entrega: '', creado_en: '2026-07-20T10:00:00-04:00' },
};
const convSinVincular = {
    ...base, id: 5, telefono: '+584149999999', nombre_contacto: '', representante: null, estado: 'automatico',
    ventana: ventanaCerrada, requiere_humano: true,
    ultimo_mensaje: { id: 40, direccion: 'saliente', tipo: 'texto', cuerpo: 'Recordatorio', estado_entrega: 'leido', creado_en: '2026-07-19T10:00:00-04:00' },
};

const mensajes = [
    { id: 30, direccion: 'saliente', tipo: 'plantilla', cuerpo: 'Recordatorio de pago', payload: { origen: 'motor' }, estado_entrega: 'leido', adjunto: null, enviado_por: null, creado_en: '2026-07-20T08:00:00-04:00' },
    { id: 31, direccion: 'entrante', tipo: 'texto', cuerpo: 'Hola, ya pagué', payload: {}, estado_entrega: '', adjunto: null, enviado_por: null, creado_en: '2026-07-20T09:00:00-04:00' },
    { id: 32, direccion: 'nota', tipo: 'texto', cuerpo: 'Verificar el comprobante', payload: {}, estado_entrega: '', adjunto: null, enviado_por: { id: 2, nombre: 'Ana Cobranza' }, creado_en: '2026-07-20T09:05:00-04:00' },
    { id: 33, direccion: 'saliente', tipo: 'texto', cuerpo: 'Gracias, lo reviso', payload: {}, estado_entrega: 'entregado', adjunto: null, enviado_por: { id: 2, nombre: 'Ana Cobranza' }, creado_en: '2026-07-20T09:10:00-04:00' },
    { id: 34, direccion: 'saliente', tipo: 'texto', cuerpo: 'No llegó', payload: { errores: [{ code: 131026, title: 'Mensaje no entregable' }] }, estado_entrega: 'fallido', adjunto: null, enviado_por: null, creado_en: '2026-07-20T09:11:00-04:00' },
];

const montar = (ruta = '/cobranza/inteligente/conversaciones') => render(
    <MemoryRouter initialEntries={[ruta]}>
        <Routes>
            <Route path="/cobranza/inteligente/conversaciones/:conversacionId?" element={<Conversaciones />} />
        </Routes>
    </MemoryRouter>,
);

describe('Conversaciones', () => {
    beforeEach(() => {
        Object.values(m).forEach(f => f.mockReset());
        m.lista.mockResolvedValue({ data: { ahora: '2026-07-20T10:00:00-04:00', count: 2, results: [convMaria, convSinVincular] } });
        m.mensajes.mockResolvedValue({ data: { ahora: '2026-07-20T10:00:00-04:00', hay_mas: false, count: mensajes.length, conversacion: convMaria, results: mensajes } });
        m.leida.mockResolvedValue({ data: { ...convMaria, no_leidos: 0 } });
        m.rapidas.mockResolvedValue({ data: { results: [] } });
    });

    it('lista las conversaciones con no leídos, "Sin vincular" y "Pide una persona"', async () => {
        montar();
        const lista = await screen.findByRole('list', { name: 'Conversaciones' });
        expect(within(lista).getByText('Maria Perez')).toBeInTheDocument();
        expect(within(lista).getByText('Tú: Recordatorio')).toBeInTheDocument();
        expect(within(lista).getByText('Hola, ya pagué')).toBeInTheDocument();
        expect(within(lista).getByLabelText('2 sin leer')).toBeInTheDocument();
        expect(within(lista).getByText('Sin vincular')).toBeInTheDocument();
        expect(within(lista).getByText('Pide una persona')).toBeInTheDocument();
        expect(m.lista).toHaveBeenCalledWith({ sede: 1 }, expect.anything());
    });

    it('abre el hilo: burbujas, nota interna, estados de entrega y marca leída', async () => {
        montar('/cobranza/inteligente/conversaciones/4');
        const hilo = await screen.findByRole('log', { name: 'Mensajes' });
        expect(within(hilo).getByText('Gracias, lo reviso')).toBeInTheDocument();
        expect(within(hilo).getByText('Verificar el comprobante')).toBeInTheDocument();
        expect(within(hilo).getByText(/Nota interna · solo el equipo/)).toBeInTheDocument();
        expect(within(hilo).getByText('Recordatorio automático')).toBeInTheDocument();
        expect(within(hilo).getByRole('img', { name: 'Leído' })).toBeInTheDocument();
        expect(within(hilo).getByRole('img', { name: 'Entregado' })).toBeInTheDocument();
        expect(within(hilo).getByText(/No se pudo entregar: Mensaje no entregable/)).toBeInTheDocument();
        await waitFor(() => expect(m.leida).toHaveBeenCalledWith(4));
        expect(m.mensajes).toHaveBeenCalledWith(4, null, expect.anything());
    });

    it('envía un texto con inserción optimista y reconcilia con la respuesta', async () => {
        const real = { ...mensajes[3], id: 99, cuerpo: 'Buenas tardes', creado_en: '2026-07-20T10:30:00-04:00' };
        let resolver;
        m.enviar.mockReturnValue(new Promise(r => { resolver = r; }));
        const user = userEvent.setup();
        montar('/cobranza/inteligente/conversaciones/4');
        await screen.findByRole('log', { name: 'Mensajes' });

        await user.type(screen.getByLabelText('Mensaje'), 'Buenas tardes');
        await user.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
        expect(await screen.findByText('Buenas tardes')).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Enviando' })).toBeInTheDocument();

        resolver({ data: { mensaje: real, conversacion: { ...convMaria, estado: 'humano', tomada_por: { id: 2, nombre: 'Ana Cobranza' } } } });
        await waitFor(() => expect(screen.queryByRole('img', { name: 'Enviando' })).not.toBeInTheDocument());
        expect(screen.getAllByText('Buenas tardes')).toHaveLength(1);
        expect(m.enviar).toHaveBeenCalledWith(4, { cuerpo: 'Buenas tardes' });
        expect(await screen.findByText('Atendido por Ana Cobranza')).toBeInTheDocument();
    });

    it('si el envío falla, quita el mensaje optimista, avisa y conserva el texto', async () => {
        m.enviar.mockRejectedValue({ response: { status: 502, data: { detail: 'Meta rechazó el mensaje.' } } });
        const user = userEvent.setup();
        montar('/cobranza/inteligente/conversaciones/4');
        await screen.findByRole('log', { name: 'Mensajes' });
        await user.type(screen.getByLabelText('Mensaje'), 'Hola de nuevo');
        await user.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
        await waitFor(() => expect(m.toastError).toHaveBeenCalledWith('Meta rechazó el mensaje.'));
        expect(screen.getByLabelText('Mensaje')).toHaveValue('Hola de nuevo');
        expect(screen.queryByRole('img', { name: 'Enviando' })).not.toBeInTheDocument();
    });

    it('takeover: "Tomar conversación" llama a la API y el banner pasa a "Atendido por"', async () => {
        const tomada = { ...convMaria, no_leidos: 0, estado: 'humano', tomada_por: { id: 2, nombre: 'Ana Cobranza' }, tomada_en: new Date().toISOString() };
        m.tomar.mockImplementation(async () => {
            // El servidor ya devuelve la conversación tomada también en la consulta del hilo.
            m.mensajes.mockResolvedValue({ data: { ahora: 'x', hay_mas: false, count: 0, conversacion: tomada, results: [] } });
            return { data: tomada };
        });
        const user = userEvent.setup();
        montar('/cobranza/inteligente/conversaciones/4');
        await screen.findByRole('log', { name: 'Mensajes' });
        expect(within(screen.getByRole('status')).getByText('Automático')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Tomar conversación' }));
        expect(await screen.findByText('Atendido por Ana Cobranza')).toBeInTheDocument();
        expect(m.tomar).toHaveBeenCalledWith(4);
        expect(screen.getByRole('button', { name: 'Devolver al automático' })).toBeInTheDocument();
    });

    it('conversación sin vincular fuera de ventana: el compositor ofrece enviar plantilla', async () => {
        m.mensajes.mockResolvedValue({ data: { ahora: 'x', hay_mas: false, count: 0, conversacion: convSinVincular, results: [] } });
        m.plantillas.mockResolvedValue({ data: { results: [{ id: 3, nombre: 'Recordatorio amable', nombre_meta: 'cobro_pendiente', idioma: 'es', cuerpo: 'Hola {{nombre}}, tiene un saldo pendiente.', orden_parametros: ['nombre'] }] } });
        m.plantilla.mockResolvedValue({ data: { mensaje: { ...mensajes[0], id: 70, cuerpo: 'Hola Ana, tiene un saldo pendiente.' }, conversacion: convSinVincular } });
        const user = userEvent.setup();
        montar('/cobranza/inteligente/conversaciones/5');
        await screen.findByRole('log', { name: 'Mensajes' });
        expect(screen.queryByLabelText('Mensaje')).not.toBeInTheDocument();
        await user.click(screen.getAllByRole('button', { name: 'Enviar plantilla' })[0]);
        const dialogo = await screen.findByRole('dialog');
        await user.type(await within(dialogo).findByLabelText(/\{\{1\}\}/), 'Ana');
        expect(within(dialogo).getByText('Hola Ana, tiene un saldo pendiente.')).toBeInTheDocument();
        await user.click(within(dialogo).getByRole('button', { name: 'Enviar plantilla' }));
        await waitFor(() => expect(m.plantilla).toHaveBeenCalledWith(5, {
            plantilla_id: 3, parametros: ['Ana'], cuerpo: 'Hola Ana, tiene un saldo pendiente.',
        }));
    });

    it('muestra el aviso cuando el módulo está apagado (409)', async () => {
        m.lista.mockRejectedValue({ response: { status: 409, data: { apagada: true } } });
        montar();
        expect(await screen.findByText(/está apagada/)).toBeInTheDocument();
    });
});

describe('Compositor', () => {
    const props = { onEnviar: vi.fn(), onNota: vi.fn(), onAbrirPlantilla: vi.fn() };

    it('dentro de la ventana de 24 h permite texto libre y muestra el tiempo restante', () => {
        render(<Compositor {...props} conversacion={{ ...convMaria, ventana: { abierta: true, expira_en: enUnaHora() } }} />);
        expect(screen.getByLabelText('Mensaje')).toBeInTheDocument();
        expect(screen.getByText(/Ventana de 24 h: quedan 1 h/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Enviar plantilla' })).not.toBeInTheDocument();
    });

    it('fuera de la ventana cambia a "Enviar plantilla" y no ofrece texto libre', async () => {
        const user = userEvent.setup();
        const onAbrirPlantilla = vi.fn();
        render(<Compositor {...props} onAbrirPlantilla={onAbrirPlantilla} conversacion={{ ...convMaria, ventana: ventanaCerrada }} />);
        expect(screen.getByText('Ventana de 24 h cerrada')).toBeInTheDocument();
        expect(screen.queryByLabelText('Mensaje')).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Enviar plantilla' }));
        expect(onAbrirPlantilla).toHaveBeenCalled();
    });

    it('fuera de la ventana todavía permite guardar una nota interna', async () => {
        const user = userEvent.setup();
        const onNota = vi.fn().mockResolvedValue(true);
        render(<Compositor {...props} onNota={onNota} conversacion={{ ...convMaria, ventana: ventanaCerrada }} />);
        await user.click(screen.getByRole('tab', { name: 'Nota interna' }));
        await user.type(screen.getByLabelText('Nota interna', { selector: 'textarea' }), 'Llamar mañana');
        await user.click(screen.getByRole('button', { name: 'Guardar nota' }));
        await waitFor(() => expect(onNota).toHaveBeenCalledWith('Llamar mañana'));
    });

    it('inserta una respuesta rápida con las variables ya resueltas por el servidor', async () => {
        m.rapidas.mockResolvedValue({ data: { results: [{ id: 1, titulo: 'Saldo', cuerpo: 'Hola {nombre}', cuerpo_renderizado: 'Hola Maria, su saldo es $50.00' }] } });
        const user = userEvent.setup();
        render(<Compositor {...props} conversacion={{ ...convMaria, ventana: { abierta: true, expira_en: enUnaHora() } }} />);
        await user.click(screen.getByRole('button', { name: 'Respuestas rápidas' }));
        await user.click(await screen.findByRole('button', { name: /Saldo/ }));
        expect(screen.getByLabelText('Mensaje')).toHaveValue('Hola Maria, su saldo es $50.00');
        expect(m.rapidas).toHaveBeenCalledWith(4);
    });
});

describe('BannerTakeover', () => {
    it('automático: ofrece tomar; humano: muestra quién la atiende y ofrece devolver', async () => {
        const user = userEvent.setup();
        const onTomar = vi.fn();
        const onDevolver = vi.fn();
        const { rerender } = render(<BannerTakeover conversacion={convMaria} onTomar={onTomar} onDevolver={onDevolver} />);
        await user.click(screen.getByRole('button', { name: 'Tomar conversación' }));
        expect(onTomar).toHaveBeenCalled();

        rerender(<BannerTakeover conversacion={{ ...convMaria, estado: 'humano', tomada_por: { id: 2, nombre: 'Ana Cobranza' } }} onTomar={onTomar} onDevolver={onDevolver} />);
        expect(screen.getByText('Atendido por Ana Cobranza')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Devolver al automático' }));
        expect(onDevolver).toHaveBeenCalled();
    });

    it('avisa cuando la familia pidió hablar con una persona', () => {
        render(<BannerTakeover conversacion={{ ...convMaria, requiere_humano: true }} />);
        expect(screen.getByRole('alert')).toHaveTextContent(/pidió hablar con una persona/);
    });
});

describe('BurbujaMensaje', () => {
    it('muestra los avisos del sistema centrados y discretos', () => {
        render(<BurbujaMensaje mensaje={{ id: 1, direccion: 'nota', tipo: 'sistema', cuerpo: 'Conversación tomada por Ana', payload: {}, creado_en: '2026-07-20T10:00:00-04:00' }} />);
        expect(screen.getByText('Conversación tomada por Ana')).toBeInTheDocument();
        expect(screen.queryByText(/Nota interna/)).not.toBeInTheDocument();
    });
});

describe('ventana de 24 h', () => {
    it('calcula y formatea el tiempo restante', () => {
        const ahora = Date.parse('2026-07-20T10:00:00Z');
        const conv = { ventana: { abierta: true, expira_en: '2026-07-20T15:12:00Z' } };
        expect(segundosRestantes(conv, ahora)).toBe(5 * 3600 + 12 * 60);
        expect(formatoRestante(5 * 3600 + 12 * 60)).toBe('5 h 12 min');
        expect(formatoRestante(40 * 60)).toBe('40 min');
        expect(formatoRestante(30)).toBe('menos de 1 min');
        expect(segundosRestantes({ ventana: { abierta: false } }, ahora)).toBe(0);
        expect(segundosRestantes({ ventana: { abierta: true, expira_en: '2026-07-20T09:00:00Z' } }, ahora)).toBe(0);
    });
});

describe('BurbujaMensaje: comprobantes, listas y botones', () => {
    const adjunto = { url: '/x', nombre: 'pago.pdf', tipo: 'application/pdf' };
    const entrante = (extra) => ({
        id: 50, direccion: 'entrante', tipo: 'documento', cuerpo: '', payload: {}, adjunto,
        creado_en: '2026-07-20T09:00:00-04:00', ...extra,
    });

    it('pendiente: muestra el estado y las acciones asignar y descartar', async () => {
        const convertir = vi.fn();
        const descartar = vi.fn();
        const msg = entrante({ estado_adjunto: 'pendiente' });
        render(<BurbujaMensaje mensaje={msg} onConvertir={convertir} onDescartar={descartar} />);
        expect(screen.getByText('Comprobante por asignar')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Asignar a mensualidad' }));
        await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
        expect(convertir).toHaveBeenCalledWith(msg);
        expect(descartar).toHaveBeenCalledWith(msg);
    });

    it('convertido y descartado: muestran el resultado sin acciones', () => {
        const { rerender } = render(<BurbujaMensaje mensaje={entrante({ estado_adjunto: 'convertido', payload: { comprobantes: [1, 2], resuelto_en: '2026-07-20T11:05:00-04:00' } })}
            onConvertir={vi.fn()} onDescartar={vi.fn()} />);
        expect(screen.getByText('Convertido en comprobante de pago')).toBeInTheDocument();
        expect(screen.getByText('2 comprobantes en revisión')).toBeInTheDocument();
        expect(screen.getByText(/Resuelto el 20 de julio/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Asignar a mensualidad' })).not.toBeInTheDocument();
        rerender(<BurbujaMensaje mensaje={entrante({ estado_adjunto: 'descartado', payload: { motivo_descarte: 'Foto borrosa' } })} />);
        expect(screen.getByText('Comprobante descartado')).toBeInTheDocument();
        expect(screen.getByText('Motivo: Foto borrosa')).toBeInTheDocument();
    });

    it('lista saliente muestra las fechas ofrecidas; plantilla muestra sus botones', () => {
        const { rerender } = render(<BurbujaMensaje mensaje={{
            id: 51, direccion: 'saliente', tipo: 'lista', cuerpo: '¿Cuándo podrás pagar?',
            payload: { origen: 'bot', filas: [{ id: 'FECHA_ACUERDO:2026-07-23', title: 'jueves 23 de julio', description: 'En 3 días' }] },
            creado_en: '2026-07-20T09:00:00-04:00',
        }} />);
        expect(screen.getByText('jueves 23 de julio')).toBeInTheDocument();
        expect(screen.queryByText('Respondió con una opción')).not.toBeInTheDocument();
        rerender(<BurbujaMensaje mensaje={{
            id: 52, direccion: 'saliente', tipo: 'plantilla', cuerpo: 'Hola', payload: { origen: 'motor', plantilla: 'cobro_seguimiento', botones: ['YA_PAGUE', 'HABLAR'] },
            creado_en: '2026-07-20T09:00:00-04:00',
        }} />);
        expect(screen.getByText('Ya pagué')).toBeInTheDocument();
        expect(screen.getByText('Hablar con alguien')).toBeInTheDocument();
    });
});
