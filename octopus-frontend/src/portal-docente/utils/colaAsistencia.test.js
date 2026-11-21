import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enviarPendientes, esErrorDeRed } from './colaAsistencia';
import { claveBorrador, encolarEnvio, leerCola, purgarDatosAsistenciaLocal } from './asistenciaLocal';
import { saveAsistencia } from '../api/academico.service';
import { toast } from 'react-toastify';

vi.mock('../api/academico.service', () => ({ saveAsistencia: vi.fn() }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ENVIO = { gradoSeccion: '3A', fecha: '2026-10-07', registros: [{ alumno_id: 1, estado: 'P', observacion: '' }] };
const SIN_RED = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });

describe('colaAsistencia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('clasifica errores de red', () => {
    expect(esErrorDeRed(SIN_RED)).toBe(true);
    expect(esErrorDeRed({ code: 'ECONNABORTED' })).toBe(true);
    expect(esErrorDeRed({ code: 'ERR_CANCELED' })).toBe(false);
    expect(esErrorDeRed({ response: { status: 400 } })).toBe(false);
  });

  it('un nuevo guardado de la misma sección y fecha reemplaza al anterior', () => {
    encolarEnvio(ENVIO);
    encolarEnvio({ ...ENVIO, registros: [{ alumno_id: 1, estado: 'A', observacion: '' }] });
    expect(leerCola()).toHaveLength(1);
    expect(leerCola()[0].registros[0].estado).toBe('A');
  });

  it('al enviar con éxito saca de la cola y borra el borrador', async () => {
    saveAsistencia.mockResolvedValue({});
    localStorage.setItem(claveBorrador('3A', '2026-10-07'), '{"guardadoEn":1,"registros":[]}');
    encolarEnvio(ENVIO);

    await enviarPendientes();
    expect(saveAsistencia).toHaveBeenCalledWith(
      { grado_seccion: '3A', jornada_id: null, version: 0 },
      '2026-10-07',
      ENVIO.registros,
    );
    expect(leerCola()).toHaveLength(0);
    expect(localStorage.getItem(claveBorrador('3A', '2026-10-07'))).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Asistencia de 3A del 7 de octubre enviada.');
  });

  it('sin red sigue en la cola para el próximo intento', async () => {
    saveAsistencia.mockRejectedValue(SIN_RED);
    encolarEnvio(ENVIO);
    await enviarPendientes();
    expect(leerCola()).toHaveLength(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('si el servidor rechaza, sale de la cola, avisa y conserva el borrador', async () => {
    saveAsistencia.mockRejectedValue({ response: { status: 403, data: { error: 'Sin permisos' } } });
    localStorage.setItem(claveBorrador('3A', '2026-10-07'), '{"guardadoEn":1,"registros":[]}');
    encolarEnvio(ENVIO);

    await enviarPendientes();
    expect(leerCola()).toHaveLength(0);
    expect(localStorage.getItem(claveBorrador('3A', '2026-10-07'))).not.toBeNull();
    expect(toast.error.mock.calls[0][0]).toMatch(/Sin permisos/);
  });

  it('purga borradores, cola vigente y claves legacy al cerrar sesión', () => {
    localStorage.setItem(claveBorrador('3A', '2026-10-07'), '{"guardadoEn":1,"registros":[]}');
    localStorage.setItem('docente_asistencia_borrador:legacy', '{}');
    localStorage.setItem('docente_asistencia_cola', '[]');
    encolarEnvio(ENVIO);

    purgarDatosAsistenciaLocal();

    expect(leerCola()).toHaveLength(0);
    expect([...Array(localStorage.length)].map((_, i) => localStorage.key(i)))
      .not.toEqual(expect.arrayContaining([expect.stringMatching(/^docente_asistencia/)]));
  });
});
