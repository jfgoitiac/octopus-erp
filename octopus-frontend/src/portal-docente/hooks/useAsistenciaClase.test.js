import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAsistenciaClase } from './useAsistenciaClase';
import { getAsistencia, saveAsistencia } from '../api/academico.service';
import { ESTADO } from '../../constants/asistencia';

vi.mock('../api/academico.service', () => ({
  getAsistencia: vi.fn(),
  saveAsistencia: vi.fn(),
}));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const FECHA = new Date(2026, 9, 7);
const ROSTER = [
  { alumno_id: 1, alumno_nombre: 'Ana Pérez', estado: 'P', observacion: '' },
  { alumno_id: 2, alumno_nombre: 'Luis Gómez', estado: 'A', observacion: 'Enfermo' },
  { alumno_id: 3, alumno_nombre: 'Sofía Ruiz', presente: null },
];

async function montar() {
  const hook = renderHook(() => useAsistenciaClase('3A', FECHA, true));
  await waitFor(() => expect(hook.result.current.registros).toHaveLength(3));
  return hook;
}

describe('useAsistenciaClase — mismo comportamiento que tenía DocenteMateriaDetalle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getAsistencia.mockResolvedValue({ data: ROSTER });
    saveAsistencia.mockResolvedValue({});
  });

  it('no consulta la API si la pestaña no está activa', () => {
    renderHook(() => useAsistenciaClase('3A', FECHA, false));
    expect(getAsistencia).not.toHaveBeenCalled();
  });

  it('normaliza el roster y cuenta por estado', async () => {
    const { result } = await montar();
    expect(getAsistencia).toHaveBeenCalledWith('3A', '2026-10-07', expect.any(AbortSignal));
    expect(result.current.registros.map(r => r.estado)).toEqual([ESTADO.PRESENTE, ESTADO.AUSENTE, ESTADO.SIN_MARCAR]);
    expect(result.current.conteos).toEqual({ presentes: 1, ausentes: 1, justificados: 0, retardados: 0 });
  });

  it('marcar Presente limpia la observación y deja el registro sucio', async () => {
    const { result } = await montar();
    act(() => result.current.marcar(2, ESTADO.PRESENTE));
    expect(result.current.registros[1]).toMatchObject({ estado: ESTADO.PRESENTE, observacion: '', presente: true });
    expect(result.current.dirtyAsistencia).toBe(true);
  });

  it('restaurarRegistro devuelve el registro exacto previo', async () => {
    const { result } = await montar();
    const previo = result.current.registros[1];
    act(() => result.current.marcar(2, ESTADO.PRESENTE));
    act(() => result.current.restaurarRegistro(previo));
    expect(result.current.registros[1]).toBe(previo);
  });

  it('no guarda si quedan alumnos sin marcar', async () => {
    const { result } = await montar();
    expect(result.current.sinMarcar).toBe(1);
    let ok;
    await act(async () => { ok = await result.current.guardarAsistencia(); });
    expect(ok).toBe(false);
    expect(saveAsistencia).not.toHaveBeenCalled();
  });

  it('guarda con letras del backend cuando todos están marcados', async () => {
    const { result } = await montar();
    act(() => result.current.marcar(3, ESTADO.RETARDADO));
    let ok;
    await act(async () => { ok = await result.current.guardarAsistencia(); });
    expect(ok).toBe(true);
    expect(saveAsistencia).toHaveBeenCalledWith('3A', '2026-10-07', [
      { alumno_id: 1, estado: 'P', observacion: '' },
      { alumno_id: 2, estado: 'A', observacion: 'Enfermo' },
      { alumno_id: 3, estado: 'R', observacion: '' },
    ]);
    expect(result.current.dirtyAsistencia).toBe(false);
  });

  it('sin conexión deja el guardado en cola y responde "encolado"', async () => {
    saveAsistencia.mockRejectedValue(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }));
    const { result } = await montar();
    act(() => result.current.marcar(3, ESTADO.PRESENTE));
    let resultado;
    await act(async () => { resultado = await result.current.guardarAsistencia(); });
    expect(resultado).toBe('encolado');
    const cola = JSON.parse(localStorage.getItem('docente_asistencia_cola'));
    expect(cola[0]).toMatchObject({ gradoSeccion: '3A', fecha: '2026-10-07' });
    expect(cola[0].registros[2]).toEqual({ alumno_id: 3, estado: 'P', observacion: '' });
    expect(result.current.dirtyAsistencia).toBe(false);
  });

  it('devuelve false si el guardado falla', async () => {
    saveAsistencia.mockRejectedValue({ response: { data: { error: 'x' } } });
    const { result } = await montar();
    act(() => result.current.marcar(3, ESTADO.PRESENTE));
    let ok;
    await act(async () => { ok = await result.current.guardarAsistencia(); });
    expect(ok).toBe(false);
  });
});
