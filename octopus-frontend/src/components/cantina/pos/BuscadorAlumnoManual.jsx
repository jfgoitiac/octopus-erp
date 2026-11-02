import { useState, useRef } from 'react';
import { toast } from 'react-toastify';
import { Search, Loader2 } from 'lucide-react';
import { buscarTarjetaActiva } from '../../../api/cantina.service';

// Serial impreso en la tarjeta: L003-0007. Todo lo demás que no sea código
// CANT-... se interpreta como nombre del alumno.
const ES_SERIAL = /^L\d+-\d+$/i;

/**
 * Búsqueda manual de respaldo del alumno/tarjeta (§6 cantina.md) — por si
 * el QR está dañado y no hay tiempo/forma de escanearlo. Acepta el código
 * (CANT-XXXXXXXXXX, aunque venga con texto extra), el serial impreso o el
 * nombre/cédula del titular o de su representante. Por nombre siempre se
 * listan las coincidencias (flechas + Enter) y el cajero elige; QR y serial
 * seleccionan directo. La tarjeta elegida sigue el mismo flujo de
 * confirmación de identidad y cobro que una tarjeta escaneada.
 */
export default function BuscadorAlumnoManual({ onTarjetaResuelta, disabled = false, autoFocus = false }) {
  const [valor, setValor] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [coincidencias, setCoincidencias] = useState([]);
  const [hayMas, setHayMas] = useState(false);
  const [activo, setActivo] = useState(0);
  const abortRef = useRef(null);

  const elegir = (tarjeta) => {
    onTarjetaResuelta(tarjeta);
    setValor('');
    setCoincidencias([]);
    setHayMas(false);
  };

  const buscar = async () => {
    const entrada = valor.trim();
    if (!entrada) {
      toast.warning('Escribe el código, el serial o el nombre del alumno o representante.');
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setBuscando(true);
    setCoincidencias([]);
    setHayMas(false);
    try {
      if (/CANT-/i.test(entrada)) {
        const res = await buscarTarjetaActiva({ codigo: entrada }, controller.signal);
        elegir(res.data);
      } else if (ES_SERIAL.test(entrada)) {
        const res = await buscarTarjetaActiva({ serial: entrada }, controller.signal);
        elegir(res.data);
      } else {
        const res = await buscarTarjetaActiva({ nombre: entrada }, controller.signal);
        const lista = res.data?.resultados || [];
        if (lista.length === 0) {
          toast.error(`No se encontró ninguna persona con tarjeta activa para "${entrada}".`);
        } else {
          setCoincidencias(lista);
          setHayMas(Boolean(res.data?.hay_mas));
          setActivo(0);
        }
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      if (err.response?.status === 404) {
        toast.error(`No se encontró ninguna tarjeta activa con ese código/serial ("${entrada}").`);
      } else {
        toast.error(err.response?.data?.detail || err.response?.data?.error || 'No se pudo buscar la tarjeta.');
      }
    } finally {
      setBuscando(false);
    }
  };

  const handleKeyDown = (e) => {
    const total = coincidencias.length;
    if (total && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setActivo(i => (i + (e.key === 'ArrowDown' ? 1 : total - 1)) % total);
    } else if (e.key === 'Escape' && total) {
      setCoincidencias([]);
    } else if (e.key === 'Enter') {
      if (total) elegir(coincidencias[activo]);
      else buscar();
    }
  };

  return (
    <div>
      <label htmlFor="buscadoralumnomanual-busqueda-manual-si-el-qr-no-" className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
        Búsqueda manual (código, serial o nombre)
      </label>
      <div className="flex gap-2">
        <input id="buscadoralumnomanual-busqueda-manual-si-el-qr-no-"
          type="text"
          autoFocus={autoFocus}
          disabled={disabled || buscando}
          value={valor}
          onChange={e => { setValor(e.target.value); setCoincidencias([]); }}
          onKeyDown={handleKeyDown}
          placeholder="Código, serial, alumno o representante"
          aria-label="Búsqueda manual de tarjeta por código, serial o nombre del alumno o del representante"
          className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
          style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
        />
        <button
          type="button"
          onClick={buscar}
          disabled={disabled || buscando}
          className="px-4 rounded-xl text-sm font-medium text-white flex items-center gap-1.5 disabled:opacity-50 min-h-[44px]"
          style={{ background: 'var(--pb)' }}
        >
          {buscando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Buscar
        </button>
      </div>
      {coincidencias.length > 0 && (
        <ul className="mt-2 rounded-xl overflow-hidden max-h-60 overflow-y-auto" style={{ border: '0.5px solid var(--border-md)' }}>
          {coincidencias.map((t, i) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => elegir(t)}
                onMouseEnter={() => setActivo(i)}
                aria-current={i === activo}
                className={`w-full text-left px-3 py-2.5 min-h-[44px] ${i === activo ? 'bg-black/5' : 'bg-white'}`}
              >
                <span className="block text-sm font-medium" style={{ color: 'var(--jet)' }}>{t.alumno_nombre}</span>
                <span className="block text-xs" style={{ color: 'var(--ash)' }}>
                  {[t.alumno_grado_seccion, t.representante_nombre && `Repr.: ${t.representante_nombre}`, t.serial].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hayMas && (
        <p className="mt-1.5 text-xs" style={{ color: 'var(--ash)' }}>
          Se muestran las primeras {coincidencias.length} coincidencias. Escribe más datos para afinar.
        </p>
      )}
    </div>
  );
}
