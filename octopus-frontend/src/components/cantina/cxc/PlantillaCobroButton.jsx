import { useState } from 'react';
import { FileText, Printer, Download, MessageCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { Modal } from '../../ui/Modal';
import { plantillaCobroPdf, plantillaCobroWhatsApp } from '../../../api/plantillaCobro.service';
import { AREA_LABELS, descargarBlob, mensajeError } from './utilsCxc';

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm outline-none min-h-[40px]';
const inputStyle = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' };

// Genera la plantilla de cobro (PDF en Bs a la tasa vigente) del titular:
// se puede imprimir (abre el PDF), descargar o enviar por WhatsApp al titular,
// con rango de fechas opcional.
// El área sale del filtro de la pantalla que lo contiene.
const PlantillaCobroButton = ({ titular, area, disabled = false }) => {
  const [abierto, setAbierto] = useState(false);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [telefono, setTelefono] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  const rangoInvalido = Boolean(fechaInicio && fechaFin && fechaInicio > fechaFin);

  const generar = async (modo) => {
    if (rangoInvalido) {
      toast.warning('La fecha final no puede ser anterior a la inicial.');
      return;
    }
    setTrabajando(true);
    try {
      const res = await plantillaCobroPdf(titular, { area, fechaInicio, fechaFin });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const nombre = `Plantilla_Cobro_${titular.tipo}_${titular.id}.pdf`;
      if (modo === 'descargar') {
        descargarBlob(blob, nombre);
        toast.success('Plantilla de cobro descargada.');
      } else {
        const url = URL.createObjectURL(blob);
        const ventana = window.open(url, '_blank');
        if (!ventana) descargarBlob(blob, nombre);
        window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
      setAbierto(false);
    } catch (err) {
      toast.error(await mensajeError(err, 'No se pudo generar la plantilla de cobro.'));
    } finally {
      setTrabajando(false);
    }
  };

  const enviarWhatsApp = async () => {
    if (rangoInvalido) {
      toast.warning('La fecha final no puede ser anterior a la inicial.');
      return;
    }
    setTrabajando(true);
    try {
      const res = await plantillaCobroWhatsApp(titular, { area, fechaInicio, fechaFin }, telefono);
      toast.success(`Plantilla de cobro enviada por WhatsApp al ${res.data?.telefono || 'titular'}.`);
      setAbierto(false);
    } catch (err) {
      toast.error(await mensajeError(err, 'No se pudo enviar la plantilla por WhatsApp.'));
    } finally {
      setTrabajando(false);
    }
  };

  const btnSec = 'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm min-h-[40px] w-full sm:w-auto disabled:opacity-60';

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        disabled={disabled}
        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm min-h-[40px] w-full sm:w-auto disabled:opacity-60"
        style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
      >
        <FileText size={15} /> Plantilla de cobro
      </button>

      <Modal
        open={abierto}
        onClose={() => !trabajando && setAbierto(false)}
        titulo="Plantilla de cobro"
        size="sm"
        footer={(
          <>
            <button type="button" onClick={() => generar('descargar')} disabled={trabajando || rangoInvalido} className={btnSec} style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
              <Download size={15} /> Descargar
            </button>
            <button type="button" onClick={() => generar('imprimir')} disabled={trabajando || rangoInvalido} className={`${btnSec} font-medium text-white`} style={{ background: 'var(--pb)' }}>
              <Printer size={15} /> {trabajando ? 'Generando…' : 'Imprimir'}
            </button>
          </>
        )}
      >
        <p className="text-sm mb-4" style={{ color: 'var(--ash)' }}>
          Estado de cuenta a cobrar en bolívares, a la tasa vigente de cantina, con el detalle de cada cargo pendiente.
          {area ? ` Solo ${AREA_LABELS[area] || area}.` : ' Incluye cantina y librería.'}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="plantilla-desde" className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Desde (opcional)</label>
            <input id="plantilla-desde" type="date" value={fechaInicio} max={fechaFin || undefined} onChange={e => setFechaInicio(e.target.value)} className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="plantilla-hasta" className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Hasta (opcional)</label>
            <input id="plantilla-hasta" type="date" value={fechaFin} min={fechaInicio || undefined} onChange={e => setFechaFin(e.target.value)} className={inputCls} style={inputStyle} />
          </div>
        </div>
        {rangoInvalido && (
          <p className="text-xs mt-2" role="alert" style={{ color: 'var(--red)' }}>La fecha final no puede ser anterior a la inicial.</p>
        )}

        <div className="mt-4 pt-4" style={{ borderTop: '0.5px solid var(--border-md)' }}>
          <label htmlFor="plantilla-telefono" className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Enviar por WhatsApp</label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <input
              id="plantilla-telefono"
              type="tel"
              inputMode="tel"
              value={telefono}
              onChange={e => setTelefono(e.target.value)}
              placeholder="Teléfono (vacío: el del titular)"
              className={inputCls}
              style={inputStyle}
            />
            <button type="button" onClick={enviarWhatsApp} disabled={trabajando || rangoInvalido} className={`${btnSec} sm:shrink-0`} style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
              <MessageCircle size={15} /> {trabajando ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default PlantillaCobroButton;
