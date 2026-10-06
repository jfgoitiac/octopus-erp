import { useState, useEffect, useRef, useId } from 'react';
import { Search, Users } from 'lucide-react';
import { toast } from 'react-toastify';
import { buscarRepresentantesCxc } from '../../../api/cantina.service';
import { fmtUsd, nombreCompleto, num, listaDe, esCancelacion, mensajeError } from './utilsCxc';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

// Buscador de representante por nombre, apellido, cédula o datos de su alumno
// (GET cxc/buscar/). Props fijas del contrato: { onSelect, autoFocus, placeholder }.
const BuscadorRepresentanteCxc = ({
  onSelect,
  autoFocus = false,
  placeholder = 'Buscar representante o alumno…',
}) => {
  const [texto, setTexto] = useState('');
  const [encontrados, setEncontrados] = useState({ para: '', lista: [] });
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const contenedorRef = useRef(null);
  const listaId = useId();

  const consulta = texto.trim();
  const buscable = consulta.length >= MIN_CHARS;
  // Resultados viejos (de otra consulta) no se muestran durante el debounce.
  const vigente = encontrados.para === consulta;
  const resultados = vigente ? encontrados.lista : [];

  useEffect(() => {
    if (!buscable) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCargando(true);
      buscarRepresentantesCxc(consulta, controller.signal)
        .then(res => {
          setEncontrados({ para: consulta, lista: listaDe(res.data) });
          setActivo(-1);
          setAbierto(true);
        })
        .catch(async err => {
          if (esCancelacion(err)) return;
          setEncontrados({ para: consulta, lista: [] });
          toast.error(await mensajeError(err, 'No se pudo buscar representantes.'));
        })
        .finally(() => {
          if (!controller.signal.aborted) setCargando(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [consulta, buscable]);

  // Cierra la lista al hacer click fuera del buscador.
  useEffect(() => {
    const handler = (e) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const elegir = (rep) => {
    setAbierto(false);
    setTexto('');
    setEncontrados({ para: '', lista: [] });
    onSelect?.(rep);
  };

  const mostrarLista = abierto && buscable;
  const buscando = cargando || !vigente;

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setAbierto(false); return; }
    if (!mostrarLista || buscando || resultados.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActivo(i => (i + 1) % resultados.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo(i => (i <= 0 ? resultados.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activo >= 0) {
      e.preventDefault();
      elegir(resultados[activo]);
    }
  };

  return (
    <div ref={contenedorRef} className="relative w-full">
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--ash)' }}
        />
        <input
          type="text"
          value={texto}
          autoFocus={autoFocus}
          onChange={e => { setTexto(e.target.value); setAbierto(true); }}
          onFocus={() => setAbierto(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={mostrarLista}
          aria-controls={listaId}
          aria-autocomplete="list"
          aria-activedescendant={activo >= 0 ? `${listaId}-${activo}` : undefined}
          placeholder={placeholder}
          aria-label="Buscar representante"
          className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none min-h-[40px]"
          style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
        />
      </div>

      {mostrarLista && (
        <div
          id={listaId}
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 rounded-xl shadow-lg overflow-y-auto max-h-[50dvh]"
          style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}
        >
          {buscando && (
            <div className="p-3 flex flex-col gap-2" aria-busy="true">
              {[0, 1].map(i => (
                <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: 'var(--border)' }} />
              ))}
            </div>
          )}
          {!buscando && resultados.length === 0 && (
            <p className="p-4 text-sm text-center" style={{ color: 'var(--ash)' }}>
              Sin resultados para «{consulta}».
            </p>
          )}
          {!buscando && resultados.map((rep, idx) => (
            <button
              key={rep.id}
              id={`${listaId}-${idx}`}
              role="option"
              aria-selected={idx === activo}
              tabIndex={-1}
              type="button"
              onClick={() => elegir(rep)}
              className={`w-full text-left px-3 py-2.5 flex flex-col gap-1 hover:bg-black/5 focus:bg-black/5 outline-none ${idx === activo ? 'bg-black/5' : ''}`}
              style={{ borderBottom: '0.5px solid var(--border)' }}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate" style={{ color: 'var(--jet)' }}>
                    {nombreCompleto(rep)}
                  </span>
                  <span className="block text-xs" style={{ color: 'var(--ash)' }}>
                    C.I. {rep.cedula || '—'}
                  </span>
                </span>
                <span
                  className="text-sm font-semibold shrink-0"
                  style={{ color: num(rep.saldo_usd) > 0 ? '#dc2626' : 'var(--jet)' }}
                >
                  {fmtUsd(rep.saldo_usd)}
                </span>
              </span>
              {Array.isArray(rep.alumnos) && rep.alumnos.length > 0 && (
                <span className="flex items-start gap-1.5 text-xs" style={{ color: 'var(--ash)' }}>
                  <Users size={12} className="mt-0.5 shrink-0" />
                  <span className="min-w-0 break-words">
                    {rep.alumnos
                      .map(a => `${nombreCompleto(a)}${a.grado_seccion ? ` (${a.grado_seccion})` : ''}`)
                      .join(' · ')}
                  </span>
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default BuscadorRepresentanteCxc;
