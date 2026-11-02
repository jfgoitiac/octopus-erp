import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VisorComprobante from './VisorComprobante';

const m = vi.hoisted(() => ({ descargar: vi.fn() }));

vi.mock('../../services/comprobantesRevisionService', () => ({
  descargarArchivoComprobante: (...a) => m.descargar(...a),
}));
vi.mock('react-toastify', () => ({ toast: { error: vi.fn() } }));

describe('VisorComprobante', () => {
  beforeEach(() => {
    m.descargar.mockReset();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });

  it('muestra la imagen descargada', async () => {
    m.descargar.mockResolvedValue({ data: new Blob(['png'], { type: 'image/png' }) });
    render(<VisorComprobante archivoUrl="/api/x/" archivoTipo="imagen" />);
    expect(await screen.findByAltText('Comprobante de pago')).toHaveAttribute('src', 'blob:x');
  });

  it('una respuesta HTML (index.html del SPA) se muestra como error, no como imagen rota', async () => {
    m.descargar.mockResolvedValue({ data: new Blob(['<html>'], { type: 'text/html' }) });
    render(<VisorComprobante archivoUrl="/api/x/" archivoTipo="imagen" />);
    expect(await screen.findByText(/No se pudo cargar el archivo del comprobante/)).toBeInTheDocument();
    expect(screen.queryByAltText('Comprobante de pago')).not.toBeInTheDocument();
  });

  it('404 explica que el archivo no está disponible', async () => {
    m.descargar.mockRejectedValue({ response: { status: 404 } });
    render(<VisorComprobante archivoUrl="/api/x/" archivoTipo="imagen" />);
    expect(await screen.findByText(/no está disponible en el servidor/)).toBeInTheDocument();
  });

  it('PDF sin tipo declarado se entrega al iframe como application/pdf', async () => {
    m.descargar.mockResolvedValue({ data: new Blob(['%PDF']) });
    render(<VisorComprobante archivoUrl="/api/x/" archivoTipo="pdf" />);
    expect(await screen.findByTitle('Comprobante en PDF')).toBeInTheDocument();
    expect(URL.createObjectURL.mock.calls[0][0].type).toBe('application/pdf');
  });

  it('imagen que el navegador no decodifica muestra mensaje y permite abrirla', async () => {
    m.descargar.mockResolvedValue({ data: new Blob(['heic'], { type: 'image/heic' }) });
    render(<VisorComprobante archivoUrl="/api/x/" archivoTipo="imagen" />);
    fireEvent.error(await screen.findByAltText('Comprobante de pago'));
    expect(await screen.findByText(/no se puede mostrar como imagen/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Abrir archivo/ })).toBeInTheDocument();
  });
});
