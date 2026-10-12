import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CobranzaInteligente from './CobranzaInteligente';
import { AuthContext } from '../context/AuthContextValue';

const m = vi.hoisted(() => ({ estado: vi.fn() }));
vi.mock('../hooks/useCobranzaInteligente', () => ({ useCobranzaInteligente: () => m.estado() }));

const montar = (rol = 'director') => render(
    <AuthContext.Provider value={{ user: { rol } }}>
        <MemoryRouter initialEntries={['/cobranza/inteligente']}>
            <Routes>
                <Route path="cobranza/inteligente" element={<CobranzaInteligente />}>
                    <Route index element={<p>Contenido de Hoy</p>} />
                </Route>
            </Routes>
        </MemoryRouter>
    </AuthContext.Provider>,
);

describe('CobranzaInteligente (layout)', () => {
    it('con el módulo encendido muestra la pestaña activa y solo las pestañas del rol', () => {
        m.estado.mockReturnValue({ estado: { activo: true }, loading: false, requiereSede: false });
        montar('cobranza');
        expect(screen.getByText('Contenido de Hoy')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /Hoy/ })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: 'Reportes' })).not.toBeInTheDocument();
    });

    it('si está apagada lo dice y ofrece ir a configurar al director', () => {
        m.estado.mockReturnValue({ estado: { activo: false }, loading: false, requiereSede: false });
        montar('director');
        expect(screen.getByText(/está apagada/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Ir a la configuración' })).toBeInTheDocument();
        expect(screen.queryByText('Contenido de Hoy')).not.toBeInTheDocument();
    });

    it('sin sede elegida pide seleccionar una', () => {
        m.estado.mockReturnValue({ estado: null, loading: false, requiereSede: true });
        montar();
        expect(screen.getByText(/Selecciona una sede/)).toBeInTheDocument();
    });
});
