import { useState, useRef } from 'react';
import { toast } from 'react-toastify';
import { Loader2, CreditCard } from 'lucide-react';
import { generarLoteTarjetas } from '../../../api/cantina.service';
import { Modal } from '../../ui/Modal';

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const LABEL_STYLE = { color: 'var(--ash)' };

// Extrae el nombre de archivo del header Content-Disposition, si el backend
// lo manda (ej. `attachment; filename="lote-tarjetas-3.zip"`). Si no viene,
// cae a un nombre genérico — nunca bloquea la descarga por esto.
function nombreArchivoDesdeHeader(headers, fallback) {
  const disposition = headers?.['content-disposition'];
  if (!disposition) return fallback;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return match?.[1] ? decodeURIComponent(match[1]) : fallback;
}

export default function GenerarLoteModal({ onClose }) {
  const [cantidad, setCantidad] = useState('');
  const [generando, setGenerando] = useState(false);
  const abortRef = useRef(null);

  const validar = () => {
    const n = Number(cantidad);
    if (cantidad === '' || Number.isNaN(n) || !Number.isInteger(n) || n <= 0) {
      toast.warning('Ingresa una cantidad entera mayor a 0.');
      return false;
    }
    if (n > 500) {
      toast.warning('Máximo 500 tarjetas por lote.');
      return false;
    }
    return true;
  };

  const handleGenerar = async () => {
    if (!validar()) return;
    if (generando) return; // evita doble submit

    setGenerando(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await generarLoteTarjetas(Number(cantidad), controller.signal);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/zip' }));
      const nombre = nombreArchivoDesdeHeader(res.headers, `lote-tarjetas-${cantidad}.zip`);
      const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Lote de ${cantidad} tarjetas generado y descargado.`);
      onClose();
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      let msg = 'No se pudo generar el lote de tarjetas.';
      // Con responseType: 'blob' el cuerpo del error llega como Blob, no JSON.
      if (err.response?.data instanceof Blob) {
        try {
          const texto = await err.response.data.text();
          const data = JSON.parse(texto);
          msg = data?.detail || data?.cantidad?.[0] || msg;
        } catch {
          // no era JSON parseable, se queda con el mensaje genérico
        }
      } else {
        msg = err.response?.data?.detail || msg;
      }
      toast.error(msg);
    } finally {
      setGenerando(false);
    }
  };

  const handleClose = () => { if (!generando) onClose(); };

  const footer = (
    <>
      <button
        onClick={handleClose}
        disabled={generando}
        className="w-full sm:w-auto rounded-xl py-2.5 text-sm min-h-[44px] disabled:opacity-40"
        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
      >
        Cancelar
      </button>
      <button
        onClick={handleGenerar}
        disabled={generando}
        className="w-full sm:w-auto text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
        style={{ background: 'var(--pb)' }}
      >
        {generando ? <><Loader2 size={14} className="animate-spin" /> Generando...</> : 'Generar lote'}
      </button>
    </>
  );

  return (
    <Modal
      open
      onClose={handleClose}
      titulo={(
        <>
          <CreditCard size={17} />
          Generar lote de tarjetas
        </>
      )}
      footer={footer}
      size="sm"
    >
      <p className="text-sm mb-4" style={{ color: 'var(--ash)' }}>
        Se generarán N tarjetas nuevas sin asignar y se descargará un archivo .zip con un PNG por tarjeta, listo para imprimir.
      </p>

      <div>
        <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>
          Cantidad de tarjetas
        </label>
        <input
          type="number"
          min="1"
          max="500"
          step="1"
          autoFocus
          className="w-full px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
          style={FIELD_STYLE}
          value={cantidad}
          onChange={e => setCantidad(e.target.value)}
          placeholder="Ej. 50"
          disabled={generando}
        />
      </div>
    </Modal>
  );
}
