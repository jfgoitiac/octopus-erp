import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModalLapso } from './ModalLapso';

const formulario = {
  nombre: 'Primer Lapso',
  periodo_escolar: '2026-2027',
  fecha_inicio: '2026-09-15',
  fecha_fin: '2026-12-12',
  activo: true,
};

const propsBase = {
  formLapso: formulario,
  setFormLapso: vi.fn(),
  guardando: false,
  cerrando: false,
  reabriendo: false,
  confirmCerrar: false,
  checklist: null,
  loadingChecklist: false,
  impactoCierre: null,
  onConfirmCerrar: vi.fn(),
  onCancelCerrar: vi.fn(),
  onGuardar: vi.fn(),
  onCerrarLapso: vi.fn(),
  onReabrirLapso: vi.fn(),
  onClose: vi.fn(),
};

describe('ModalLapso', () => {
  it('asocia los campos principales con etiquetas accesibles', () => {
    render(<ModalLapso {...propsBase} lapsoEditando={null} />);
    expect(screen.getByLabelText(/nombre del lapso/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/período escolar/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fecha inicio/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fecha fin/i)).toBeInTheDocument();
  });

  it('exige justificación para cerrar un lapso incompleto con excepción', () => {
    const onCerrarLapso = vi.fn();
    render(
      <ModalLapso
        {...propsBase}
        lapsoEditando={{ id: 1, ...formulario }}
        confirmCerrar
        checklist={{
          puede_cerrar: false,
          planes_configurados: false,
          notas_completas: false,
          inconsistencias: ['Falta el plan de Matemática'],
          resumen: { materias_total: 4, materias_sin_plan: 1, notas_pendientes: 3 },
        }}
        onCerrarLapso={onCerrarLapso}
      />,
    );

    const cerrar = screen.getByRole('button', { name: /cerrar definitivamente/i });
    expect(cerrar).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /cerrar excepcionalmente/i }));
    expect(cerrar).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/justificación obligatoria/i), { target: { value: 'Cierre aprobado por dirección' } });
    expect(cerrar).toBeEnabled();
    fireEvent.click(cerrar);
    expect(onCerrarLapso).toHaveBeenCalledWith({ override: true, justificacion: 'Cierre aprobado por dirección' });
  });

  it('exige un motivo para reabrir un lapso cerrado', () => {
    const onReabrirLapso = vi.fn();
    render(
      <ModalLapso
        {...propsBase}
        lapsoEditando={{ id: 2, ...formulario, activo: false }}
        formLapso={{ ...formulario, activo: false }}
        onReabrirLapso={onReabrirLapso}
      />,
    );

    const reabrir = screen.getByRole('button', { name: /reabrir con auditoría/i });
    expect(reabrir).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/motivo obligatorio/i), { target: { value: 'Corrección autorizada' } });
    expect(reabrir).toBeEnabled();
    fireEvent.click(reabrir);
    expect(onReabrirLapso).toHaveBeenCalledWith('Corrección autorizada');
  });
});
