import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Automatizaciones from './Automatizaciones';
import { reemplazarVariables, mensajeDeRegla } from './automatizacionesUtils';

const m = vi.hoisted(() => ({
    reglas: vi.fn(), config: vi.fn(), sim: vi.fn(), rapidas: vi.fn(), crearRapida: vi.fn(),
    elimRapida: vi.fn(), actRegla: vi.fn(), crearRegla: vi.fn(), copiar: vi.fn(), toastError: vi.fn(), toastOk: vi.fn(),
}));

vi.mock('../../../api/cobranza.service', () => ({
    getReglasCobranza: (...a) => m.reglas(...a),
    crearReglaCobranza: (...a) => m.crearRegla(...a),
    copiarReglasGlobales: (...a) => m.copiar(...a),
    actualizarReglaCobranza: (...a) => m.actRegla(...a),
    getCobranzaInteligente: (...a) => m.config(...a),
    getSimulacionMotor: (...a) => m.sim(...a),
    getRespuestasRapidas: (...a) => m.rapidas(...a),
    crearRespuestaRapida: (...a) => m.crearRapida(...a),
    actualizarRespuestaRapida: vi.fn(),
    eliminarRespuestaRapida: (...a) => m.elimRapida(...a),
}));
vi.mock('../../../context/useSede', () => ({ useSede: () => ({ sedeActiva: { id: 1 }, sedes: [{ id: 1 }] }) }));
vi.mock('react-toastify', () => ({ toast: { success: (...a) => m.toastOk(...a), error: (...a) => m.toastError(...a) } }));

const regla = { id: 3, nombre: 'Seguimiento cordial', dia_relativo: 3, etapa: 'temprana', canal: 'whatsapp', plantilla: 'seguimiento_1', destinatario: 'representante', activa: true, saldo_minimo: '0.01' };
const montar = () => render(<MemoryRouter><Automatizaciones /></MemoryRouter>);

beforeEach(() => {
    vi.clearAllMocks();
    m.reglas.mockResolvedValue({ data: [regla, { ...regla, id: 1, nombre: 'Preventivo', dia_relativo: -5 }] });
    m.config.mockResolvedValue({ data: { activo: true, modo_sombra: false } });
    m.rapidas.mockResolvedValue({ data: { count: 1, results: [{ id: 1, titulo: 'Saldo', cuerpo: 'Hola {nombre}, su saldo es ${saldo_usd}', activa: true }] } });
});

describe('utilidades', () => {
    it('reemplaza variables conocidas y deja las desconocidas', () => {
        expect(reemplazarVariables('Hola {nombre} {x}')).toBe('Hola María Pérez {x}');
    });
    it('el mensaje de una regla no deja variables sin reemplazar', () => {
        expect(mensajeDeRegla(regla)).not.toMatch(/\{\w+\}/);
    });
});

describe('Automatizaciones', () => {
    it('muestra las reglas ordenadas por día y el enlace a configuración', async () => {
        montar();
        const items = await screen.findAllByTestId('regla-item');
        expect(items[0]).toHaveTextContent('Preventivo');
        expect(items[1]).toHaveTextContent('Seguimiento cordial');
        expect(screen.getByRole('link', { name: /configuración/i })).toHaveAttribute('href', '/configuracion/cobranza-inteligente');
    });

    it('cae a solo lectura si el servidor no expone las reglas (404)', async () => {
        m.reglas.mockRejectedValue({ response: { status: 404 } });
        montar();
        await screen.findAllByTestId('regla-item');
        expect(screen.getByText(/solo lectura/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /nueva regla/i })).not.toBeInTheDocument();
    });

    it('edita una regla y guarda con PATCH', async () => {
        m.actRegla.mockResolvedValue({ data: regla });
        montar();
        await userEvent.click(await screen.findByRole('button', { name: /editar regla seguimiento cordial/i }));
        const nombre = screen.getByLabelText('Nombre');
        await userEvent.clear(nombre);
        await userEvent.type(nombre, 'Otro nombre');
        await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
        await waitFor(() => expect(m.actRegla).toHaveBeenCalledWith(3, expect.objectContaining({ nombre: 'Otro nombre', dia_relativo: 3 })));
        expect(m.toastOk).toHaveBeenCalled();
    });

    it('edita las plantillas de Meta A/B y el recordatorio extra', async () => {
        m.reglas.mockResolvedValue({ data: [{ ...regla, plantilla_meta: 'recordatorio_v1', plantilla_meta_b: 'recordatorio_v2', ab_activo: true }] });
        m.actRegla.mockResolvedValue({ data: regla });
        montar();
        expect(await screen.findByText('A/B')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: /editar regla/i }));
        expect(screen.getByLabelText(/plantilla de meta a/i)).toHaveValue('recordatorio_v1');
        expect(screen.getByLabelText(/plantilla de meta b/i)).toHaveValue('recordatorio_v2');
        await userEvent.click(screen.getByLabelText(/recordatorio extra a quienes pagan tarde/i));
        await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
        await waitFor(() => expect(m.actRegla).toHaveBeenCalledWith(3, expect.objectContaining({
            plantilla_meta: 'recordatorio_v1', plantilla_meta_b: 'recordatorio_v2', recordatorio_extra_paga_tarde: true,
        })));
        expect(m.actRegla.mock.calls[0][1]).not.toHaveProperty('heredada');
    });

    it('no deja guardar B sin A ni A igual a B', async () => {
        montar();
        await userEvent.click(await screen.findAllByRole('button', { name: /editar regla/i }).then(b => b[0]));
        await userEvent.type(screen.getByLabelText(/plantilla de meta b/i), 'solo_b');
        expect(screen.getByRole('alert')).toHaveTextContent(/primero define la plantilla de Meta A/i);
        expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
        await userEvent.type(screen.getByLabelText(/plantilla de meta a/i), 'solo_b');
        expect(screen.getByRole('alert')).toHaveTextContent(/distintas/i);
    });

    it('al editar una regla heredada copia las globales (endpoint idempotente) y hace PATCH a la copia', async () => {
        const heredadas = [{ ...regla, id: 10, heredada: true }, { ...regla, id: 11, dia_relativo: -5, nombre: 'Preventivo', heredada: true }];
        const copias = [{ ...regla, id: 20, heredada: false }, { ...regla, id: 21, dia_relativo: -5, heredada: false }];
        m.reglas.mockResolvedValue({ data: heredadas });
        m.copiar.mockResolvedValue({ data: { count: 2, results: copias } });
        m.actRegla.mockResolvedValue({ data: regla });
        montar();
        expect(await screen.findAllByText('Heredada de las globales')).toHaveLength(2);
        await userEvent.click(screen.getByRole('button', { name: /editar regla seguimiento cordial/i }));
        expect(screen.getByLabelText(/día relativo/i)).toBeEnabled();
        await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
        await waitFor(() => expect(m.actRegla).toHaveBeenCalledWith(20, expect.objectContaining({ dia_relativo: 3 })));
        expect(m.copiar).toHaveBeenCalledWith(1);
        expect(m.crearRegla).not.toHaveBeenCalled();
        expect(m.copiar.mock.invocationCallOrder[0]).toBeLessThan(m.actRegla.mock.invocationCallOrder[0]);
    });

    it('al cambiar el día de una regla heredada, ubica la copia por el día original', async () => {
        const heredadas = [{ ...regla, id: 10, heredada: true }];
        m.reglas.mockResolvedValue({ data: heredadas });
        m.copiar.mockResolvedValue({ data: { count: 1, results: [{ ...regla, id: 20, heredada: false }] } });
        m.actRegla.mockResolvedValue({ data: regla });
        montar();
        await userEvent.click(await screen.findByRole('button', { name: /editar regla seguimiento cordial/i }));
        const dia = screen.getByLabelText(/día relativo/i);
        await userEvent.clear(dia);
        await userEvent.type(dia, '8');
        await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
        await waitFor(() => expect(m.actRegla).toHaveBeenCalledWith(20, expect.objectContaining({ dia_relativo: 8 })));
    });

    it('el simulador lista qué saldría y por qué se omite', async () => {
        m.sim.mockResolvedValue({ data: {
            fecha: '2026-07-20', total: 2, por_estado: { saldria: 1, se_omitiria: 1, solo_simulado: 0, ya_creado: 0 },
            items: [
                { estado: 'saldria', motivos_omision: [], representante: { id: 7, nombre: 'Maria Perez' }, regla, canal: 'whatsapp', saldo_total_usd: '50.00' },
                { estado: 'se_omitiria', motivos_omision: ['conversacion_humana'], representante: { id: 8, nombre: 'Juan Gil' }, regla, canal: 'whatsapp', saldo_total_usd: '20.00' },
            ],
        } });
        montar();
        await userEvent.click(await screen.findByRole('button', { name: /simular/i }));
        const res = await screen.findByTestId('resultado-simulacion');
        expect(res).toHaveTextContent('Maria Perez');
        expect(res).toHaveTextContent('Conversación tomada por el cobrador');
        expect(m.sim).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), 1);
    });

    it('respuestas rápidas: lista, crea con vista previa y elimina', async () => {
        m.crearRapida.mockResolvedValue({ data: {} });
        m.elimRapida.mockResolvedValue({});
        montar();
        expect(await screen.findByTestId('respuesta-item')).toHaveTextContent('Saldo');

        await userEvent.click(screen.getByRole('button', { name: /nueva respuesta/i }));
        await userEvent.type(screen.getByLabelText('Título'), 'Hola');
        await userEvent.type(screen.getByLabelText('Mensaje'), 'Hola {{nombre}');
        expect(screen.getByTestId('vista-previa-texto')).toHaveTextContent('Hola María Pérez');
        await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
        await waitFor(() => expect(m.crearRapida).toHaveBeenCalledWith({ titulo: 'Hola', cuerpo: 'Hola {nombre}', activa: true }));

        await userEvent.click(await screen.findByRole('button', { name: /eliminar saldo/i }));
        await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
        await waitFor(() => expect(m.elimRapida).toHaveBeenCalledWith(1));
    });
});
