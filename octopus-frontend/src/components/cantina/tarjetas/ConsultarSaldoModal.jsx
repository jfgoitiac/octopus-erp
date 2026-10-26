import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import ScannerTarjeta from '../pos/ScannerTarjeta';
import BuscadorAlumnoManual from '../pos/BuscadorAlumnoManual';

/**
 * Consulta de saldo de una tarjeta prepago sin hacer una venta: el cajero
 * escanea el QR (o busca al alumno) y ve saldo, límite de crédito y crédito
 * disponible. Solo lectura; reutiliza los buscadores del POS.
 */
export default function ConsultarSaldoModal({ onClose }) {
  const [tarjeta, setTarjeta] = useState(null);

  const saldo = Number(tarjeta?.saldo ?? 0);
  const limite = Number(tarjeta?.limite_credito ?? 0);
  const nombre = tarjeta?.alumno_nombre || (tarjeta ? `Tarjeta ${tarjeta.serial}` : '');

  return (
    <Modal open onClose={onClose} titulo="Consultar saldo de tarjeta" size="md">
      <div className="p-4 sm:p-5 space-y-3 overflow-y-auto">
        {!tarjeta ? (
          <>
            <ScannerTarjeta onTarjetaResuelta={setTarjeta} />
            <BuscadorAlumnoManual onTarjetaResuelta={setTarjeta} />
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold truncate" style={{ color: 'var(--jet)' }}>{nombre}</p>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>
                  {tarjeta.alumno_grado_seccion || 'Grado/sección no disponible'}
                </p>
                <p className="text-xs font-mono" style={{ color: 'var(--ash)' }}>{tarjeta.serial}</p>
              </div>
              <button
                type="button"
                onClick={() => setTarjeta(null)}
                className="shrink-0 flex items-center gap-1 text-xs px-2 py-2 rounded-lg min-h-[44px]"
                style={{ color: 'var(--pb-mid)' }}
              >
                <RotateCcw size={12} /> Otra tarjeta
              </button>
            </div>

            <div className="rounded-xl p-4 text-center" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
              <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Saldo actual</p>
              <p className="text-3xl font-bold" style={{ color: saldo < 0 ? 'var(--red)' : 'var(--jet)' }}>
                ${saldo.toFixed(2)}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg px-3 py-2" style={{ background: '#fff' }}>
                <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Límite de crédito</p>
                <p className="font-semibold" style={{ color: 'var(--jet)' }}>${limite.toFixed(2)}</p>
              </div>
              <div className="rounded-lg px-3 py-2" style={{ background: '#fff' }}>
                <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Disponible para gastar</p>
                <p className="font-semibold" style={{ color: 'var(--jet)' }}>${(saldo + limite).toFixed(2)}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
