import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePolling } from './usePolling';

const m = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('react-toastify', () => ({ toast: { error: (...a) => m.error(...a) } }));

const ocultar = (oculta) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => oculta });
    document.dispatchEvent(new Event('visibilitychange'));
};
const avanzar = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('usePolling', () => {
    beforeEach(() => { vi.useFakeTimers(); m.error.mockReset(); ocultar(false); });
    afterEach(() => { vi.useRealTimers(); ocultar(false); });

    it('consulta cada 12 s y no consulta al montar', async () => {
        const fn = vi.fn().mockResolvedValue(null);
        renderHook(() => usePolling(fn));
        expect(fn).not.toHaveBeenCalled();
        await avanzar(12_000);
        expect(fn).toHaveBeenCalledTimes(1);
        await avanzar(12_000);
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('no consulta con la pestaña oculta y refresca al volver', async () => {
        const fn = vi.fn().mockResolvedValue(null);
        renderHook(() => usePolling(fn));
        ocultar(true);
        await avanzar(60_000);
        expect(fn).not.toHaveBeenCalled();
        ocultar(false);
        await avanzar(0);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('aplica backoff 12, 30 y 60 s y muestra un solo toast', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('caido'));
        renderHook(() => usePolling(fn));
        await avanzar(12_000);
        expect(fn).toHaveBeenCalledTimes(1);
        await avanzar(29_000);
        expect(fn).toHaveBeenCalledTimes(1);
        await avanzar(1_000);
        expect(fn).toHaveBeenCalledTimes(2);
        await avanzar(59_000);
        expect(fn).toHaveBeenCalledTimes(2);
        await avanzar(1_000);
        expect(fn).toHaveBeenCalledTimes(3);
        await avanzar(60_000);
        expect(fn).toHaveBeenCalledTimes(4);
        expect(m.error).toHaveBeenCalledTimes(1);
    });

    it('vuelve a 12 s tras una consulta exitosa', async () => {
        const fn = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(null);
        renderHook(() => usePolling(fn));
        await avanzar(12_000);
        await avanzar(30_000);
        expect(fn).toHaveBeenCalledTimes(2);
        await avanzar(12_000);
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('deja de consultar al desmontar', async () => {
        const fn = vi.fn().mockResolvedValue(null);
        const { unmount } = renderHook(() => usePolling(fn));
        unmount();
        await avanzar(60_000);
        expect(fn).not.toHaveBeenCalled();
    });
});
