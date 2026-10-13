import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProyeccionCaja from './ProyeccionCaja';
import ComparacionAB from './ComparacionAB';
import { lecturaAB, moverSemana, rangoSemana } from './reportesUtils';

const m = vi.hoisted(() => ({ proy: vi.fn(), ab: vi.fn(), toastError: vi.fn() }));

vi.mock('../../../api/cobranza.service', () => ({
    getProyeccionCaja: (...a) => m.proy(...a),
    getReporteAB: (...a) => m.ab(...a),
}));
vi.mock('../../../context/useSede', () => ({ useSede: () => ({ sedeActiva: { id: 1 }, sedes: [{ id: 1 }] }) }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: (...a) => m.toastError(...a) } }));

const cero = { casos: 0, comprometido_usd: '0.00', esperado_usd: '0.00' };
const proyeccion = {
    semana: { desde: '2026-07-20', hasta: '2026-07-26' }, casos: 1, comprometido_usd: '30.00', esperado_usd: '7.50',
    por_fuente: { promesas: { casos: 1, comprometido_usd: '30.00', esperado_usd: '7.50' }, convenios: cero },
    por_perfil: {
        cronico: { etiqueta: 'Crónico', casos: 1, comprometido_usd: '30.00', esperado_usd: '7.50', probabilidad: { valor: '0.25', fuente: 'por_defecto', muestra: 0 } },
        puntual: { etiqueta: 'Puntual', ...cero, probabilidad: { valor: '0.95', fuente: 'historica', muestra: 14 } },
    },
    por_dia: Array.from({ length: 7 }, (_, i) => ({ fecha: `2026-07-${20 + i}`, ...cero, ...(i === 2 ? { casos: 1, comprometido_usd: '30.00', esperado_usd: '7.50' } : {}) })),
    detalle: [{
        cuota: 9, convenio: 4, tipo: 'promesa', numero: 1, fecha: '2026-07-22', monto_usd: '30.00',
        representante: { id: 7, nombre: 'Luis Gil', cedula: 'V2' }, perfil_pagador: { codigo: 'cronico', etiqueta: 'Crónico' },
        probabilidad: '0.25', esperado_usd: '7.50',
    }],
    regla: 'Texto explicativo del backend',
};
const variante = (plantilla, extra = {}) => ({
    plantilla, enviados: 40, medidos: 34, por_medir: 6, pagaron: 21, tasa_pago_pct: 61.76,
    saldo_medido_usd: '1700.00', recuperado_usd: '1050.00', recuperado_pct: 61.76, ...extra,
});
const filaAB = (extra = {}) => ({
    regla: { id: 3, nombre: 'Seguimiento cordial', dia_relativo: 3, sede: 1, ab_activo: true },
    A: variante('cobro_seguimiento'), B: variante('cobro_seguimiento_v2'),
    muestra_suficiente: false, ganadora: null, diferencia_recuperado_pp: null, ...extra,
});

beforeEach(() => Object.values(m).forEach(f => f.mockReset()));

describe('reportesUtils', () => {
    it('mueve la semana y formatea el rango en español', () => {
        expect(moverSemana('2026-07-20', 1)).toBe('2026-07-27');
        expect(moverSemana('2026-07-20', -1)).toBe('2026-07-13');
        expect(rangoSemana({ desde: '2026-07-20', hasta: '2026-07-26' })).toBe('20 jul – 26 jul 2026');
    });
    it('lecturaAB no declara ganadora sin muestra y respeta lo que devuelve el backend', () => {
        expect(lecturaAB(filaAB()).texto).toMatch(/Muestra insuficiente/);
        expect(lecturaAB(filaAB({ muestra_suficiente: true, ganadora: null })).texto).toMatch(/Muestra insuficiente/);
        expect(lecturaAB(filaAB({ muestra_suficiente: true, ganadora: 'empate' })).texto).toMatch(/Empate/);
        expect(lecturaAB(filaAB({ muestra_suficiente: true, ganadora: 'A', diferencia_recuperado_pp: '7.40' })).texto)
            .toMatch(/variante A: 7\.4 puntos porcentuales/);
    });
});

describe('ProyeccionCaja', () => {
    it('muestra totales, perfiles con su probabilidad, días y detalle', async () => {
        m.proy.mockResolvedValue({ data: proyeccion });
        render(<ProyeccionCaja />);
        const raiz = await screen.findByTestId('proyeccion-caja');
        expect(raiz).toHaveTextContent('$30.00');
        expect(raiz).toHaveTextContent('$7.50');
        expect(raiz).toHaveTextContent('25% · por defecto');
        expect(raiz).toHaveTextContent('95% · histórica (14 cuotas)');
        expect(within(raiz).getByRole('table', { name: /detalle/i })).toHaveTextContent('Luis Gil');
        expect(raiz).toHaveTextContent('Texto explicativo del backend');
        expect(screen.getByTestId('rango-semana')).toHaveTextContent('20 jul – 26 jul 2026');
    });

    it('cambia de semana pidiendo la fecha desplazada', async () => {
        m.proy.mockResolvedValue({ data: proyeccion });
        render(<ProyeccionCaja />);
        await screen.findByTestId('proyeccion-caja');
        const antes = m.proy.mock.calls[0][0];
        await userEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }));
        await waitFor(() => expect(m.proy).toHaveBeenLastCalledWith(moverSemana(antes, 1), 1, expect.anything()));
    });

    it('con 409 no muestra toast', async () => {
        m.proy.mockRejectedValue({ response: { status: 409 } });
        render(<ProyeccionCaja />);
        expect(await screen.findByText(/No se pudo cargar la proyección/)).toBeInTheDocument();
        expect(m.toastError).not.toHaveBeenCalled();
    });
});

describe('ComparacionAB', () => {
    it('con muestra insuficiente muestra por medir y la leyenda, sin ganadora', async () => {
        m.ab.mockResolvedValue({ data: { count: 1, results: [filaAB()], regla: 'Nota del reporte' } });
        render(<ComparacionAB />);
        const fila = await screen.findByTestId('fila-ab');
        expect(within(screen.getByTestId('variante-A')).getByText('Por medir').nextSibling).toHaveTextContent('6');
        expect(screen.getByTestId('lectura-ab')).toHaveTextContent(/Muestra insuficiente/);
        expect(fila).not.toHaveTextContent(/Ventaja orientativa/);
        expect(m.ab).toHaveBeenCalledWith({}, 1, expect.anything());
    });

    it('las fechas se pueden quitar desde el propio selector, sin botón aparte', async () => {
        m.ab.mockResolvedValue({ data: { count: 1, results: [filaAB()] } });
        render(<ComparacionAB />);
        await screen.findByTestId('fila-ab');
        expect(screen.queryByRole('button', { name: 'Quitar fechas' })).toBeNull();
        await userEvent.type(screen.getByLabelText('Desde'), '20/07/2026');
        await waitFor(() => expect(m.ab).toHaveBeenLastCalledWith({ desde: '2026-07-20' }, 1, expect.anything()));
        await userEvent.click(screen.getByRole('button', { name: 'Quitar fecha' }));
        await waitFor(() => expect(m.ab).toHaveBeenLastCalledWith({}, 1, expect.anything()));
    });

    it('muestra la ventaja solo cuando el backend declara ganadora', async () => {
        m.ab.mockResolvedValue({ data: { count: 1, results: [filaAB({ muestra_suficiente: true, ganadora: 'B', diferencia_recuperado_pp: '-7.40' })] } });
        render(<ComparacionAB />);
        expect(await screen.findByTestId('lectura-ab')).toHaveTextContent('Ventaja orientativa de la variante B: 7.4 puntos porcentuales');
    });

    it('sin reglas A/B explica cómo empezar', async () => {
        m.ab.mockResolvedValue({ data: { count: 0, results: [] } });
        render(<ComparacionAB />);
        expect(await screen.findByText(/Ninguna regla tiene comparación A\/B/)).toBeInTheDocument();
    });
});
