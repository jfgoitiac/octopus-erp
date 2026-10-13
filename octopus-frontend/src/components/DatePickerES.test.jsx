import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DatePickerES from './DatePickerES';

describe('DatePickerES', () => {
    it('no ofrece limpiar la fecha por defecto', () => {
        render(<DatePickerES value="2026-07-20" onChange={vi.fn()} />);
        expect(screen.getByDisplayValue('20/07/2026')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Quitar fecha' })).toBeNull();
    });

    it('con clearable permite vaciar la fecha y avisa con value vacío', async () => {
        const onChange = vi.fn();
        render(<DatePickerES clearable name="desde" value="2026-07-20" onChange={onChange} />);
        await userEvent.click(screen.getByRole('button', { name: 'Quitar fecha' }));
        expect(onChange).toHaveBeenCalledWith({ target: { name: 'desde', value: '' } });
    });

    it('con clearable no muestra la "x" cuando no hay fecha', () => {
        render(<DatePickerES clearable value="" onChange={vi.fn()} />);
        expect(screen.queryByRole('button', { name: 'Quitar fecha' })).toBeNull();
    });
});
