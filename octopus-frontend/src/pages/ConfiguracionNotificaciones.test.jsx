import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ConfiguracionNotificaciones from './ConfiguracionNotificaciones';

const { ciState } = vi.hoisted(() => ({ ciState: { estado: { activo: false } } }));

vi.mock('../hooks/useCobranzaInteligente', () => ({
    useCobranzaInteligente: () => ({ estado: ciState.estado }),
}));
vi.mock('../hooks/useConfiguracionNotificaciones', () => ({
    AREAS_EMAIL: [{ value: 'general', label: 'General' }],
    useConfiguracionNotificaciones: () => ({
        form: { dias_recordatorio_1: 5, dias_recordatorio_2: 10, dias_alerta_director: 15 },
        perfiles: { general: {} },
        loading: false,
        savingEmailArea: false, savingWhatsApp: false, savingMora: false,
        testForm: { destino: '', asunto: '', mensaje: '', canal: 'email' }, setTestForm: vi.fn(), testLoading: false, testResult: null,
        setField: vi.fn(), setPerfilField: vi.fn(),
        saveEmailArea: vi.fn(), saveWhatsApp: vi.fn(), saveMora: vi.fn(), sendTest: vi.fn(),
    }),
}));
vi.mock('../context/AuthContext', async () => {
    const { createContext } = await import('react');
    return { AuthContext: createContext({ user: { rol: 'director' } }) };
});

const montar = () => render(<MemoryRouter><ConfiguracionNotificaciones /></MemoryRouter>);

describe('ConfiguracionNotificaciones - días de recordatorio', () => {
    it('con Cobranza Inteligente apagada los días son editables y no hay aviso', () => {
        ciState.estado = { activo: false };
        montar();
        expect(screen.queryByText(/estos días no se usan/)).not.toBeInTheDocument();
        expect(document.getElementById('dias_recordatorio_1')).not.toHaveAttribute('readonly');
    });

    it('con Cobranza Inteligente encendida muestra aviso con enlace y solo lectura', () => {
        ciState.estado = { activo: true };
        montar();
        expect(screen.getByText(/estos días no se usan/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Automatizaciones/ }))
            .toHaveAttribute('href', '/cobranza/inteligente/automatizaciones');
        for (const id of ['dias_recordatorio_1', 'dias_recordatorio_2', 'dias_alerta_director']) {
            expect(document.getElementById(id)).toHaveAttribute('readonly');
        }
    });
});
