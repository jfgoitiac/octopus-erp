import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Horarios from './Horarios';

// Auditoría 2026-09-15 — módulo Horarios (H1/H2, corregido).
//
// HorariosView.get ahora devuelve una lista plana (mismo contrato que
// DocenteMiHorarioView), con `dia_semana` en el string del backend
// ('lunes'..'viernes'). `DIA_MAP` (constants/horarios.js) fue actualizado
// para mapear a ese mismo string en vez de a un índice numérico 1-5.
// Este test es la regresión que evita que el contrato se vuelva a romper:
// confirma que una clase devuelta por la API aparece en la celda correcta
// de la grilla.
vi.mock('../api/apiClient', () => {
  const get = vi.fn((url) => {
    if (url.startsWith('secretaria/configuracion-grados/')) {
      return Promise.resolve({ data: [{ id: 1, grado_seccion: '5to A' }] });
    }
    if (url.startsWith('secretaria/configuracion/')) {
      return Promise.resolve({ data: {} });
    }
    if (url.startsWith('academico/horarios/')) {
      // Forma real devuelta por HorariosView.get: lista plana.
      return Promise.resolve({
        data: [{
          id: 1,
          materia: { id: 10, nombre: 'Matemáticas' },
          dia_semana: 'lunes',
          dia_semana_label: 'Lunes',
          hora_inicio: '07:00',
          hora_fin: '08:00',
          aula: 'Aula 1',
        }],
      });
    }
    if (url.startsWith('academico/materias/')) {
      return Promise.resolve({
        data: [{ id: 10, nombre: 'Matemáticas', horas_academicas: 5 }],
      });
    }
    return Promise.resolve({ data: {} });
  });
  return { default: { get, post: vi.fn(), put: vi.fn(), delete: vi.fn() }, API_BASE: 'http://test' };
});

const renderHorarios = () => render(
  <MemoryRouter>
    <Horarios />
  </MemoryRouter>
);

describe('Horarios — contrato de dia_semana entre useHorarios y HorariosView.get', () => {
  it('muestra en la grilla una clase devuelta por el backend para el grado seleccionado', async () => {
    renderHorarios();

    const select = await screen.findByDisplayValue('Seleccionar grado...');
    fireEvent.change(select, { target: { value: '5to A' } });

    // Ya no debe mostrarse el estado vacío...
    await waitFor(() => {
      expect(screen.queryByText('Este grado aún no tiene clases.')).not.toBeInTheDocument();
    });

    // ...y la clase debe aparecer en su celda (lunes 07:00) con su aula.
    // (el nombre de la materia también aparece en PanelMaterias, así que se
    // ubica la celda por su aria-label, que es específico de la grilla).
    expect(await screen.findByLabelText('Editar Matemáticas — Lunes 07:00')).toBeInTheDocument();
    expect(screen.getByText('Aula 1')).toBeInTheDocument();
  });
});
