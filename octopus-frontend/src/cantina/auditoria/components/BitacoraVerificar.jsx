import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { parseApiError } from '../../../utils/apiError';
import { verificarBitacora } from '../api/auditoriaApi';
import { esCancelacion } from './CierreFormato';
import { ESTILO_BOTON_SECUNDARIO } from './BitacoraFormato';

// Botón "Verificar integridad" (§5 GET bitacora/verificar/) y su aviso.
// La cadena de hashes se recorre completa en el servidor; aquí solo se
// muestra si está íntegra o en qué evento se rompió.
export default function BitacoraVerificar() {
  const [verificando, setVerificando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const controllerRef = useRef(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const verificar = async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setVerificando(true);
    try {
      const { data } = await verificarBitacora(controller.signal);
      setResultado(data);
      if (data.ok) toast.success('La bitácora está íntegra.');
      else toast.error(`La bitácora fue alterada (evento #${data.primer_error_id ?? '?'}).`);
    } catch (err) {
      if (esCancelacion(err)) return;
      toast.error(`No se pudo verificar la bitácora: ${parseApiError(err)}`);
    } finally {
      if (controllerRef.current === controller) setVerificando(false);
    }
  };

  const total = Number(resultado?.total ?? 0);

  return (
    <div className="flex flex-col gap-2 w-full sm:w-auto">
      <button
        type="button"
        onClick={verificar}
        disabled={verificando}
        className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-sm font-semibold w-full sm:w-auto disabled:opacity-60"
        style={ESTILO_BOTON_SECUNDARIO}
      >
        {verificando
          ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          : <ShieldCheck size={16} aria-hidden="true" style={{ color: 'var(--pb-mid)' }} />}
        {verificando ? 'Verificando…' : 'Verificar integridad'}
      </button>

      {resultado && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl p-3 text-sm sm:max-w-md"
          style={resultado.ok
            ? { background: 'var(--green-light)', color: 'var(--green)', border: '0.5px solid var(--green)' }
            : { background: 'var(--red-light)', color: 'var(--red)', border: '0.5px solid var(--red)' }}
        >
          {resultado.ok
            ? <ShieldCheck size={20} aria-hidden="true" className="shrink-0" />
            : <ShieldAlert size={20} aria-hidden="true" className="shrink-0" />}
          <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            <p className="font-semibold">
              {resultado.ok ? 'Bitácora íntegra' : 'Bitácora alterada'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--jet-mid)' }}>
              {resultado.ok
                ? `Se verificaron ${total.toLocaleString('es')} evento${total === 1 ? '' : 's'}; ninguno fue modificado.`
                : `El primer evento alterado es el #${resultado.primer_error_id ?? '—'}. Los eventos desde ese punto no son confiables.`}
            </p>
            {!resultado.ok && resultado.motivo && (
              <p className="text-xs mt-1" style={{ color: 'var(--jet-mid)' }}>Detalle: {resultado.motivo}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setResultado(null)}
            aria-label="Cerrar aviso"
            className="shrink-0 -m-1 inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-white/60"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
