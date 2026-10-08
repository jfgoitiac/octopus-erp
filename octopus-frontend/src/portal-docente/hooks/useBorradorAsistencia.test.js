import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBorradorAsistencia } from './useBorradorAsistencia';
import { claveBorrador } from '../utils/asistenciaLocal';
import { ESTADO } from '../../constants/asistencia';

const FECHA = new Date(2026, 9, 7);
const CLAVE = claveBorrador('3A', '2026-10-07');
const SERVIDOR = [
  { alumno_id: 1, alumno_nombre: 'Ana', estado: null, observacion: '' },
  { alumno_id: 2, alumno_nombre: 'Luis', estado: null, observacion: '' },
];
const BASE = { gradoSeccion: '3A', fecha: FECHA, registros: SERVIDOR, dirty: false, loading: false };

const montar = (props) => renderHook((p) => useBorradorAsistencia(p), {
  initialProps: { ...BASE, onAplicar: vi.fn(), ...props },
});

describe('useBorradorAsistencia', () => {
  beforeEach(() => localStorage.clear());

  it('escribe el borrador solo mientras hay cambios sin guardar', () => {
    const onAplicar = vi.fn();
    const { rerender } = montar({ onAplicar });
    expect(localStorage.getItem(CLAVE)).toBeNull();

    const marcados = [{ ...SERVIDOR[0], estado: ESTADO.AUSENTE, observacion: 'Enfermo' }, SERVIDOR[1]];
    rerender({ ...BASE, registros: marcados, dirty: true, onAplicar });
    const guardado = JSON.parse(localStorage.getItem(CLAVE));
    expect(guardado.registros[0]).toEqual({ alumno_id: 1, estado: ESTADO.AUSENTE, observacion: 'Enfermo' });
  });

  it('ofrece recuperar un borrador distinto al servidor y lo aplica', () => {
    localStorage.setItem(CLAVE, JSON.stringify({
      guardadoEn: Date.now() - 60_000,
      registros: [{ alumno_id: 2, estado: ESTADO.PRESENTE, observacion: '' }],
    }));
    const onAplicar = vi.fn();
    const { result } = montar({ onAplicar });
    expect(result.current.pendiente.registros).toHaveLength(1);

    act(() => result.current.recuperar());
    expect(onAplicar).toHaveBeenCalledWith([{ alumno_id: 2, estado: ESTADO.PRESENTE, observacion: '' }]);
    expect(result.current.pendiente).toBeNull();
  });

  it('no avisa si el borrador coincide con el servidor, ni mientras carga', () => {
    localStorage.setItem(CLAVE, JSON.stringify({ guardadoEn: Date.now(), registros: [{ alumno_id: 1, estado: null, observacion: '' }] }));
    expect(montar().result.current.pendiente).toBeNull();

    localStorage.setItem(CLAVE, JSON.stringify({ guardadoEn: Date.now(), registros: [{ alumno_id: 1, estado: ESTADO.AUSENTE, observacion: '' }] }));
    expect(montar({ loading: true }).result.current.pendiente).toBeNull();
  });

  it('descarta borradores vencidos (más de 3 días)', () => {
    localStorage.setItem(CLAVE, JSON.stringify({
      guardadoEn: Date.now() - 4 * 24 * 60 * 60 * 1000,
      registros: [{ alumno_id: 1, estado: ESTADO.AUSENTE, observacion: '' }],
    }));
    expect(montar().result.current.pendiente).toBeNull();
    expect(localStorage.getItem(CLAVE)).toBeNull();
  });

  it('limpiar borra el borrador', () => {
    localStorage.setItem(CLAVE, JSON.stringify({ guardadoEn: Date.now(), registros: [{ alumno_id: 1, estado: ESTADO.AUSENTE, observacion: '' }] }));
    const { result } = montar();
    act(() => result.current.limpiar());
    expect(localStorage.getItem(CLAVE)).toBeNull();
    expect(result.current.pendiente).toBeNull();
  });
});
