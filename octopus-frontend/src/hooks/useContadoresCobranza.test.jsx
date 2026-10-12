import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { useContadoresCobranza } from './useContadoresCobranza';

const m = vi.hoisted(() => ({ contadores: vi.fn() }));
vi.mock('../api/cobranza.service', () => ({ getContadoresInteligente: (...a) => m.contadores(...a) }));
vi.mock('../context/SedeContext', () => ({ useSede: () => ({ sedeActiva: { id: 1 } }) }));
vi.mock('./usePolling', () => ({ usePolling: vi.fn() }));

describe('useContadoresCobranza', () => {
    beforeEach(() => { m.contadores.mockReset(); });
    afterEach(cleanup);

    it('devuelve el total del endpoint', async () => {
        m.contadores.mockResolvedValue({ data: { total: 4 } });
        const { result } = renderHook(() => useContadoresCobranza());
        await waitFor(() => expect(result.current.total).toBe(4));
    });

    it('si el módulo está apagado (409) el total es 0', async () => {
        m.contadores.mockImplementation(() => Promise.reject({ response: { status: 409 } }));
        const { result } = renderHook(() => useContadoresCobranza());
        await waitFor(() => expect(m.contadores.mock.calls.length).toBeGreaterThan(0));
        expect(result.current.total).toBe(0);
    });
});
