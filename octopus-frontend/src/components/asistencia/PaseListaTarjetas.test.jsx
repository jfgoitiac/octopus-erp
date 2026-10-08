import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect, useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PaseListaTarjetas from './PaseListaTarjetas';
import { ESTADO } from '../../constants/asistencia';

const ROSTER = [
  { alumno_id: 1, alumno_nombre: 'Ana Pérez', estado: null, observacion: '' },
  { alumno_id: 2, alumno_nombre: 'Luis Gómez', estado: null, observacion: '' },
  { alumno_id: 3, alumno_nombre: 'Sofía Ruiz', estado: null, observacion: '' },
];

// Último estado de `registros` del Harness, para aserciones.
const espia = { registros: [] };
function Harness({ inicial = ROSTER }) {
  const [registros, setRegistros] = useState(inicial);
  useEffect(() => { espia.registros = registros; });
  const set = (id, cambios) => setRegistros(p => p.map(r => (r.alumno_id === id ? { ...r, ...cambios } : r)));
  return (
    <PaseListaTarjetas
      registros={registros}
      loading={false}
      titulo="Matemática"
      subtitulo="3er año A"
      fecha={new Date(2026, 9, 7)}
      dirty
      saving={false}
      onMarcar={(id, estado) => set(id, { estado })}
      onObservacion={(id, observacion) => set(id, { observacion })}
      onRestaurar={(previo) => set(previo.alumno_id, previo)}
      onGuardar={async () => true}
    />
  );
}

const anuncio = () => document.querySelector('[aria-live="polite"]').textContent;

describe('PaseListaTarjetas', () => {
  beforeEach(() => vi.clearAllMocks());

  it('muestra el inicio con la fecha en español y el total de alumnos', () => {
    render(<Harness />);
    expect(screen.getByText('Miércoles, 7 de octubre')).toBeInTheDocument();
    expect(screen.getByText('3 en la sección')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Comenzar a pasar lista/ })).toBeInTheDocument();
  });

  it('con asistencia previa ofrece revisar y arranca en el primer alumno sin marcar', () => {
    render(<Harness inicial={[{ ...ROSTER[0], estado: ESTADO.PRESENTE }, ROSTER[1], ROSTER[2]]} />);
    fireEvent.click(screen.getByRole('button', { name: /Revisar asistencia/ }));
    expect(anuncio()).toBe('Alumno 2 de 3: Luis Gómez');
  });

  it('Presente marca y avanza solo; Ausente abre la observación y espera', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Comenzar/ }));
    expect(anuncio()).toBe('Alumno 1 de 3: Ana Pérez');

    fireEvent.click(screen.getByRole('button', { name: 'Presente' }));
    expect(espia.registros[0].estado).toBe(ESTADO.PRESENTE);
    await waitFor(() => expect(anuncio()).toBe('Alumno 2 de 3: Luis Gómez'));

    fireEvent.click(screen.getByRole('button', { name: 'Ausente' }));
    const obs = screen.getByLabelText(/Observación/);
    fireEvent.change(obs, { target: { value: 'Avisó la mamá' } });
    expect(anuncio()).toBe('Alumno 2 de 3: Luis Gómez');
    expect(espia.registros[1]).toMatchObject({ estado: ESTADO.AUSENTE, observacion: 'Avisó la mamá' });

    fireEvent.click(screen.getAllByRole('button', { name: /^Siguiente/ })[0]);
    expect(anuncio()).toBe('Alumno 3 de 3: Sofía Ruiz');
  });

  it('atajos de teclado: T marca retardado y al terminar muestra el resumen', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Comenzar/ }));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(anuncio()).toBe('Alumno 3 de 3: Sofía Ruiz');

    fireEvent.keyDown(window, { key: 't' });
    expect(espia.registros[2].estado).toBe(ESTADO.RETARDADO);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Resumen del pase' })).toBeInTheDocument());
    expect(screen.getByText(/2 sin marcar/)).toBeInTheDocument();
  });

  it('Deshacer revierte el último marcado y vuelve a esa tarjeta', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Comenzar/ }));
    expect(screen.getByRole('button', { name: /Deshacer/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Presente' }));
    await waitFor(() => expect(anuncio()).toBe('Alumno 2 de 3: Luis Gómez'));

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer: Ana Pérez, Presente' }));
    expect(espia.registros[0].estado).toBe(null);
    expect(anuncio()).toBe('Alumno 1 de 3: Ana Pérez');
  });

  it('Ctrl+Z deshace varios pasos en orden', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Comenzar/ }));
    fireEvent.keyDown(window, { key: 'p' });
    await waitFor(() => expect(anuncio()).toBe('Alumno 2 de 3: Luis Gómez'));
    fireEvent.keyDown(window, { key: 'a' });
    expect(espia.registros[1].estado).toBe(ESTADO.AUSENTE);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(espia.registros[1].estado).toBe(null);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(espia.registros[0].estado).toBe(null);
    expect(anuncio()).toBe('Alumno 1 de 3: Ana Pérez');
  });

  it('la barra de progreso es un slider navegable con teclado', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Comenzar/ }));
    const slider = screen.getByRole('slider', { name: 'Ir a un alumno' });
    expect(slider).toHaveAttribute('aria-valuetext', 'Alumno 1 de 3: Ana Pérez');

    fireEvent.keyDown(slider, { key: 'End' });
    expect(anuncio()).toBe('Alumno 3 de 3: Sofía Ruiz');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(anuncio()).toBe('Alumno 2 de 3: Luis Gómez');
  });

  it('modo rápido: todos presentes y un toque marca ausente', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Todos presentes/ }));
    expect(espia.registros.every(r => r.estado === ESTADO.PRESENTE)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /^Luis Gómez: Presente/ }));
    expect(espia.registros[1].estado).toBe(ESTADO.AUSENTE);
    expect(screen.getByText('1 ausente')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Listo, ver resumen/ }));
    expect(screen.getByRole('button', { name: /Editar a Luis Gómez: Ausente/ })).toBeInTheDocument();
  });

  it('el resumen sin pendientes lista las novedades editables', () => {
    render(<Harness inicial={[{ ...ROSTER[0], estado: ESTADO.PRESENTE }, { ...ROSTER[1], estado: ESTADO.PRESENTE }, { ...ROSTER[2], estado: ESTADO.AUSENTE }]} />);
    fireEvent.click(screen.getByRole('button', { name: /Ver resumen/ }));
    expect(screen.queryByText(/sin marcar/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Editar a Sofía Ruiz: Ausente/ }));
    expect(anuncio()).toBe('Alumno 3 de 3: Sofía Ruiz');
  });
});
