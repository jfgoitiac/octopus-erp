import { useState, useEffect, useRef, useId } from 'react';
import { Search, Users, UserPlus } from 'lucide-react';
import { toast } from 'react-toastify';
import { buscarRepresentantesCxc } from '../../../api/cantina.service';
import {
  fmtUsd, nombreCompleto, num, listaDe, esCancelacion, mensajeError, TIPO_LABELS, claveCuenta,
} from './utilsCxc';
import ClienteFormModal from './ClienteFormModal';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

// Buscador de representante por nombre, apellido, cédula o datos de su alumno
// (GET cxc/buscar/). También devuelve clientes generales (personal/otro): cada
// resultado trae `tipo`. Props: { onSelect, autoFocus, placeholder, paraVenta,
// permitirAgregarCliente }. `paraVenta` oculta clientes inactivos; con
// `permitirAgregarCliente` se muestra "Agregar cliente" y el nuevo se selecciona solo.
const BuscadorRepresentanteCxc = ({
  onSelect,
  autoFocus = false,
  placeholder = 'Buscar representante, cliente o alumno…',
  paraVenta = false,
  permitirAgregarCliente = false,
}) => {
  const [texto, setTexto] = useState('');
  const [agregando, setAgregando] = useState(false);
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
      buscarRepresentantesCxc(consulta, controller.signal, { paraVenta })
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
  }, [consulta, buscable, paraVenta]);

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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="relative flex-1 min-w-0">
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
      {permitirAgregarCliente && (
        <button
          type="button"
          onClick={() => setAgregando(true)}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium min-h-[40px] w-full sm:w-auto shrink-0"
          style={{ border: '0.5px solid var(--pb)', color: 'var(--pb)' }}
        >
          <UserPlus size={15} /> Agregar cliente
        </button>
      )}
      </div>

      {agregando && (
        <ClienteFormModal
          open
          onClose={() => setAgregando(false)}
          onGuardado={nuevo => elegir(nuevo)}
        />
      )}

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
              key={claveCuenta(rep)}
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
                  <span className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: 'var(--ash)' }}>
                    <span
                      className="px-1.5 py-0.5 rounded-full font-medium"
                      style={{ color: 'var(--pb)', background: 'var(--pb-light)' }}
                    >
                      {TIPO_LABELS[rep.tipo] || TIPO_LABELS.representante}
                    </span>
                    {rep.activo === false && (
                      <span className="px-1.5 py-0.5 rounded-full font-medium" style={{ color: 'var(--ash)', background: 'var(--surface-sunken)' }}>
                        Inactivo
                      </span>
                    )}
                    <span>C.I. {rep.cedula || '—'}</span>
                  </span>
                </span>
                <span
                  className="text-sm font-semibold shrink-0"
                  style={{ color: num(rep.saldo_usd) > 0 ? 'var(--red)' : 'var(--jet)' }}
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
