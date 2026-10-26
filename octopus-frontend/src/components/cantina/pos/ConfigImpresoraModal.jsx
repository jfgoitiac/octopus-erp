import { useState } from 'react';
import { toast } from 'react-toastify';
import { Bluetooth, Cable, Printer, Unplug, Loader2 } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { getAnchoPapel, setAnchoPapel } from '../../../utils/imprimirReciboCantina';
import {
  MODOS, getConfigImpresora, guardarConfigImpresora, soporteBluetooth, soporteSerial,
  conectarBluetooth, conectarSerial, desconectarImpresora, impresoraConectada, imprimirPrueba,
} from '../../../utils/impresoraTermica';

/**
 * Configuración de la impresora térmica Bluetooth (MP80-12 y compatibles ESC/POS).
 * La lógica de conexión vive en utils/impresoraTermica.js.
 */
export default function ConfigImpresoraModal({ onCerrar }) {
  const [config, setConfig] = useState(getConfigImpresora);
  const [ancho, setAncho] = useState(getAnchoPapel);
  const [ocupado, setOcupado] = useState(false);

  const configurada = config.modo !== MODOS.DIALOGO;
  const conectada = impresoraConectada();

  const ejecutar = async (fn, exito) => {
    setOcupado(true);
    try {
      const r = await fn();
      if (exito) toast.success(exito(r));
    } catch (e) {
      // Cerrar el selector del navegador sin elegir no es un error.
      if (e?.name !== 'NotFoundError' && e?.name !== 'AbortError') {
        toast.error(e?.message || 'No se pudo completar la operación con la impresora.');
      }
    } finally {
      setConfig(getConfigImpresora());
      setOcupado(false);
    }
  };

  const cambiarAncho = (mm) => { setAnchoPapel(mm); setAncho(mm); };

  const botonBase = 'w-full flex items-center justify-center gap-2 px-4 rounded-xl text-sm font-medium min-h-[44px] disabled:opacity-50';
  const botonPrimario = { background: 'var(--pb)', color: '#fff' };
  const botonLinea = { border: '1.5px solid var(--pb)', color: 'var(--pb)', background: '#fff' };

  return (
    <Modal
      open
      onClose={onCerrar}
      size="sm"
      titulo={<><Printer size={17} /> Impresora térmica</>}
      footer={(
        <button
          type="button"
          onClick={onCerrar}
          className="w-full sm:w-auto px-4 rounded-xl py-2.5 text-sm min-h-[44px]"
          style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
        >
          Cerrar
        </button>
      )}
    >
      <div className="space-y-4">
        <div className="rounded-xl px-3 py-3 text-sm" style={{ background: 'var(--pb-light)', color: 'var(--jet)' }}>
          {configurada ? (
            <>
              <p className="font-semibold break-words">{config.nombre || 'Impresora Bluetooth'}</p>
              <p className="text-xs" style={{ color: 'var(--ash)' }}>
                {config.modo === MODOS.BLE ? 'Bluetooth (BLE)' : 'Bluetooth (puerto serie)'} ·{' '}
                {conectada ? 'conectada' : 'se reconecta al imprimir'}
              </p>
            </>
          ) : (
            <p style={{ color: 'var(--ash)' }}>
              Sin impresora Bluetooth: los recibos se imprimen con el diálogo del sistema.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <button
            type="button"
            disabled={ocupado || !soporteBluetooth()}
            onClick={() => ejecutar(conectarBluetooth, n => `Conectada: ${n}`)}
            className={botonBase}
            style={botonPrimario}
          >
            {ocupado ? <Loader2 size={15} className="animate-spin" /> : <Bluetooth size={15} />}
            Buscar impresora Bluetooth
          </button>
          {!soporteBluetooth() && (
            <p className="text-xs" style={{ color: 'var(--red)' }}>Este navegador no soporta Web Bluetooth. Use Chrome o Edge.</p>
          )}

          <button
            type="button"
            disabled={ocupado || !soporteSerial()}
            onClick={() => ejecutar(conectarSerial, n => `Conectada: ${n}`)}
            className={botonBase}
            style={botonLinea}
          >
            <Cable size={15} /> Usar puerto COM Bluetooth
          </button>
          <p className="text-xs" style={{ color: 'var(--ash)' }}>
            Si el modo anterior no encuentra la MP80-12 (Bluetooth clásico), empárela primero en
            Windows → Configuración → Bluetooth y elija aquí el puerto COM que se crea.
          </p>
        </div>

        {config.modo === MODOS.SERIAL && (
          <label className="flex items-center justify-between gap-3 text-xs" style={{ color: 'var(--ash)' }}>
            Velocidad (baudios)
            <select
              value={config.baudRate}
              onChange={e => setConfig(guardarConfigImpresora({ baudRate: Number(e.target.value) }))}
              className="rounded-lg px-2 min-h-[36px]"
              style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
            >
              {[9600, 19200, 38400, 57600, 115200].map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
        )}

        <div className="flex items-center justify-between gap-3 text-xs" style={{ color: 'var(--ash)' }}>
          Papel
          <div className="flex items-center gap-1.5">
            {[58, 80].map(mm => (
              <button
                key={mm}
                type="button"
                onClick={() => cambiarAncho(mm)}
                className="px-2.5 rounded-lg min-h-[32px]"
                style={ancho === mm
                  ? { background: 'var(--pb)', color: '#fff' }
                  : { border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
              >
                {mm} mm
              </button>
            ))}
          </div>
        </div>

        {configurada && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={ocupado}
              onClick={() => ejecutar(() => imprimirPrueba(ancho), () => 'Prueba enviada')}
              className={botonBase}
              style={botonLinea}
            >
              <Printer size={15} /> Imprimir prueba
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => ejecutar(desconectarImpresora, () => 'Impresora desvinculada')}
              className={botonBase}
              style={{ border: '0.5px solid var(--border-md)', color: 'var(--red)', background: '#fff' }}
            >
              <Unplug size={15} /> Desvincular
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
