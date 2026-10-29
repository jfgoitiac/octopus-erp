import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import CobranzaInteligenteDashboard from './CobranzaInteligenteDashboard';

const m = vi.hoisted(() => ({ resumen: vi.fn(), estado: vi.fn(), dashboard: vi.fn(), bandeja: vi.fn() }));

vi.mock('../api/cobranza.service', () => ({
    getResumenPorConcepto: (...a) => m.resumen(...a),
    getEstadoPorConcepto: (...a) => m.estado(...a),
    exportarEstadoPorConceptoExcel: vi.fn(),
    getDashboardInteligente: (...a) => m.dashboard(...a),
    getBandejaInteligente: (...a) => m.bandeja(...a),
    accionCicloInteligente: vi.fn(),
    crearConvenioInteligente: vi.fn(),
    guardarLineaBaseInteligente: vi.fn(),
}));
vi.mock('../context/SedeContext', () => ({ useSede: () => ({ sedeActiva: null, sedes: [] }) }));
vi.mock('../components/GradoSelect', () => ({ default: () => <select aria-label="Filtrar por grado" /> }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const linea = (mes, anio, etiqueta) => ({
    etiqueta, mes, anio, total: 4, pagados: 2, parciales: 1, pendientes: 1, porcentaje: 50, monto_pendiente_usd: '75.00',
});
const resumen = {
    total_filas: 4, pagados: 2, parciales: 1, pendientes: 1, monto_cobrado_usd: '125.00', monto_pendiente_usd: '75.00',
};
const fila = {
    nivel: 'alumno', alumno_id: 1, nombre: 'Ana Rojas', cedula_escolar: 'E1', grado_seccion: '1A',
    representante: { id: 9, nombre: 'Luis Rojas', cedula: 'V9', telefono: '0414' },
    monto_usd: '50.00', monto_pagado_usd: '0.00', saldo_usd: '50.00', estado: 'pendiente', fecha_pago: null, dias_atraso: 12,
};
const dashboard = {
    efectividad: { cobrado_al_vencimiento_pct: 80, mora_15_pct: 12, base_meses: 3 },
    comparacion_linea_base: { delta_cobrado_al_vencimiento_pp: 5, delta_mora_15_pp: -2 },
    distribucion_por_etapa: {
        vencida: { casos: 2, saldo_usd: '100.00' }, seguimiento: { casos: 1, saldo_usd: '30.00' },
        preventiva: { casos: 3, saldo_usd: '90.00' },
    },
    ventana_preventiva_dias: 30,
    bandeja: { casos_abiertos: 7, antiguedad_max_dias: 20, casos_mas_de_15_dias: 3 },
    pagos_por_conciliar: 2,
    envios_7_dias: { enviado: 11, pendiente: 4 },
    recuperado: { total_recuperado_usd: '300.00', atribuido_usd: '120.00', casos_atribuidos: 2, casos_totales: 5 },
};

const caso = {
    representante: { id: 9, nombre: 'Luis Rojas', cedula: 'V9', telefono: '0414' },
    puntaje: 64, razones: [{ texto: 'Mora de 40 días', puntos: 30 }], saldo_total_usd: '150.00', dias_mora_max: 40,
    ciclos: [1, 2], estados: ['critica'], responsable: null, gestion_humana: false,
    accion_sugerida: { codigo: 'ofrecer_convenio', texto: 'Ofrecer un convenio de pago' },
};

const montar = (rol) => render(
    <MemoryRouter>
        <AuthContext.Provider value={{ user: { rol } }}>
            <CobranzaInteligenteDashboard />
        </AuthContext.Provider>
    </MemoryRouter>,
);

describe('CobranzaInteligenteDashboard', () => {
    beforeEach(() => {
        Object.values(m).forEach(f => f.mockReset());
        m.resumen.mockResolvedValue({ data: { lineas: [linea(9, 2025, 'Septiembre 2025'), linea(10, 2025, 'Octubre 2025')], totales: {} } });
        m.estado.mockResolvedValue({ data: { count: 1, results: [fila], resumen } });
        m.dashboard.mockResolvedValue({ data: dashboard });
        m.bandeja.mockResolvedValue({ data: { count: 1, results: [caso] } });
    });

    it('muestra KPIs del mes, la tabla y los indicadores de gestión', async () => {
        montar('director');
        expect(await screen.findByText('$200,00')).toBeInTheDocument();
        expect(screen.getByText('$125,00')).toBeInTheDocument();
        expect(screen.getByText('63% del total')).toBeInTheDocument();
        expect((await screen.findAllByText('Ana Rojas')).length).toBeGreaterThan(0);
        expect(screen.getAllByText('Con deuda · 12 d').length).toBeGreaterThan(0);
        expect(await screen.findByText('Casos por atender')).toBeInTheDocument();
        expect(screen.getByText('11')).toBeInTheDocument();
        expect(await screen.findByText('Casos críticos')).toBeInTheDocument();
        expect(screen.getByText('64 pts')).toBeInTheDocument();
        expect(m.estado).toHaveBeenCalledWith(expect.objectContaining({ concepto: 'mensualidad', mes: 10, anio: 2025 }), expect.anything());
    });

    it('la cartera usa las etapas reales del ciclo y separa lo que aún no vence', async () => {
        montar('director');
        expect(await screen.findByText('Cartera por etapa · 3 en mora · 3 por vencer en 30 días')).toBeInTheDocument();
        expect(screen.getByText('Seguimiento')).toBeInTheDocument();
        expect(screen.getByText('1 · $30')).toBeInTheDocument();
    });

    it('una mensualidad con saldo que aún no vence se muestra "Por vencer", no "Con deuda"', async () => {
        m.estado.mockResolvedValue({
            data: { count: 1, results: [{ ...fila, dias_atraso: null, vencida: false }], resumen },
        });
        montar('cajero');
        expect((await screen.findAllByText('Por vencer')).length).toBeGreaterThan(0);
        expect(screen.queryByText(/^Con deuda ·/)).not.toBeInTheDocument();
    });

    it('avisa cuando el motor de recordatorios (Celery Beat) no está corriendo', async () => {
        m.dashboard.mockResolvedValue({ data: { ...dashboard, motor: { activo: false, ultima_ejecucion: null } } });
        montar('director');
        expect(await screen.findByText('Los recordatorios automáticos no están saliendo')).toBeInTheDocument();
        expect(screen.getByText(/No se ha ejecutado nunca/)).toBeInTheDocument();
    });

    it('no muestra el aviso si el motor corrió recientemente', async () => {
        m.dashboard.mockResolvedValue({
            data: { ...dashboard, motor: { activo: true, ultima_ejecucion: '2026-10-28T12:05:00Z' } },
        });
        montar('director');
        expect(await screen.findByText('Gestión inteligente')).toBeInTheDocument();
        expect(screen.queryByText('Los recordatorios automáticos no están saliendo')).not.toBeInTheDocument();
    });

    it('la acción sugerida de un caso crítico abre su modal', async () => {
        montar('cobranza');
        await userEvent.click(await screen.findByRole('button', { name: 'Ofrecer un convenio de pago' }));
        expect(await screen.findByText('Convenio · Luis Rojas')).toBeInTheDocument();
    });

    it('para cajero no pide los resultados de gestión (solo dirección)', async () => {
        montar('cajero');
        expect((await screen.findAllByText('Ana Rojas')).length).toBeGreaterThan(0);
        await waitFor(() => expect(m.estado).toHaveBeenCalled());
        expect(m.dashboard).not.toHaveBeenCalled();
        expect(screen.queryByText('Gestión inteligente')).not.toBeInTheDocument();
        expect(screen.queryByText('Recordatorios')).not.toBeInTheDocument();
    });
});
