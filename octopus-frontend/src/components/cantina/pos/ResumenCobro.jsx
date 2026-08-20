import { UserRound, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';

/**
 * Bloque de confirmación de identidad — solo aparece con pago por tarjeta
 * prepago (§7.2 cantina.md, "Verificación visual obligatoria"). Muestra
 * foto (si existe) + nombre + grado/sección + saldo actual/después, y
 * exige que el cajero confirme explícitamente antes de habilitar "Cobrar":
 * la responsabilidad de verificar que la foto coincide con quien tiene
 * enfrente es del cajero, no del sistema (no hay hardware NFC que lo evite).
 *
 * BuscarTarjetaView (TarjetaPrepagoSerializer) devuelve `alumno_foto`
 * (URL absoluta o null) y `alumno_grado_seccion` además de `alumno_nombre`.
 * Este componente sigue buscando formas alternativas por compatibilidad,
 * pero mientras esos campos no estén, siempre muestra el placeholder
 * visible de "sin foto" y "grado no disponible" — nunca los oculta
 * silenciosamente.
 */
export default function ResumenCobro({
  tarjeta,
  totalUsd,
  onCambiarTarjeta,
  identidadConfirmada,
  onCambiarIdentidadConfirmada,
  confirmarSaldoNegativo,
  onCambiarConfirmarSaldoNegativo,
}) {
  const nombre = tarjeta.alumno_nombre
    || (tarjeta.alumno?.nombre ? `${tarjeta.alumno.nombre} ${tarjeta.alumno.apellido || ''}`.trim() : null)
    || `Tarjeta ${tarjeta.serial}`;

  const grado = tarjeta.alumno_grado_seccion || tarjeta.alumno?.grado_seccion || tarjeta.alumno?.grado || tarjeta.grado_seccion || null;
  const foto = tarjeta.alumno_foto || tarjeta.alumno?.foto || tarjeta.foto || null;

  const saldoActual = Number(tarjeta.saldo ?? 0);
  const limiteCredito = Number(tarjeta.limite_credito ?? 0);
  const saldoDespues = saldoActual - Number(totalUsd || 0);
  const excedeLimite = saldoDespues < -limiteCredito;
  const quedaNegativo = saldoDespues < 0 && !excedeLimite;
  const creditoDisponible = saldoActual + limiteCredito;

  return (
    <div className="space-y-3 rounded-xl p-4" style={{ border: '1.5px solid var(--pb, #0fa3b1)', background: 'var(--pb-light, #e6f7f9)' }}>
      <div className="flex items-start gap-3">
        {foto ? (
          <img
            src={foto}
            alt={`Foto de ${nombre}`}
            className="w-16 h-16 rounded-xl object-cover shrink-0"
            style={{ border: '0.5px solid var(--border-md)' }}
          />
        ) : (
          <div
            className="w-16 h-16 rounded-xl shrink-0 flex flex-col items-center justify-center text-center gap-0.5"
            style={{ border: '1.5px dashed var(--ash)', background: '#fff', color: 'var(--ash)' }}
            aria-label="Sin foto registrada"
          >
            <UserRound size={20} />
            <span className="text-[9px] leading-none font-medium">SIN FOTO</span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate" style={{ color: 'var(--jet)' }}>{nombre}</p>
          <p className="text-xs" style={{ color: 'var(--ash)' }}>
            {grado || 'Grado/sección no disponible'}
          </p>
          <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--ash)' }}>{tarjeta.serial}</p>
        </div>

        <button
          type="button"
          onClick={onCambiarTarjeta}
          className="shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
          style={{ color: 'var(--pb-mid, #0c7a86)' }}
        >
          <RotateCcw size={12} /> Cambiar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg px-3 py-2" style={{ background: '#fff' }}>
          <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Saldo actual</p>
          <p className="font-semibold" style={{ color: saldoActual < 0 ? 'var(--red, #dc2626)' : 'var(--jet)' }}>
            ${saldoActual.toFixed(2)}
          </p>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ background: '#fff' }}>
          <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Saldo después</p>
          <p className="font-semibold" style={{ color: saldoDespues < 0 ? 'var(--red, #dc2626)' : 'var(--jet)' }}>
            ${saldoDespues.toFixed(2)}
          </p>
        </div>
      </div>

      {excedeLimite && (
        <p className="flex items-start gap-1.5 text-sm font-medium rounded-lg px-3 py-2" style={{ color: 'var(--red, #dc2626)', background: '#fef2f2' }}>
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          Saldo insuficiente: el crédito disponible de este alumno es ${creditoDisponible.toFixed(2)} (límite ${limiteCredito.toFixed(2)}). No se puede cobrar esta venta con tarjeta.
        </p>
      )}

      {quedaNegativo && (
        <div className="space-y-2 rounded-lg px-3 py-2" style={{ background: '#fffbeb' }}>
          <p className="flex items-start gap-1.5 text-sm font-medium" style={{ color: '#b45309' }}>
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            El saldo quedará en negativo (${saldoDespues.toFixed(2)}), dentro del crédito permitido. Confirma para continuar.
          </p>
          <label className="flex items-center gap-2 text-sm" style={{ color: '#b45309' }}>
            <input
              type="checkbox"
              checked={confirmarSaldoNegativo}
              onChange={e => onCambiarConfirmarSaldoNegativo(e.target.checked)}
            />
            Confirmo que el saldo quedará en negativo y autorizo la venta.
          </label>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm pt-1" style={{ borderTop: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
        <input
          type="checkbox"
          checked={identidadConfirmada}
          onChange={e => onCambiarIdentidadConfirmada(e.target.checked)}
        />
        <CheckCircle2 size={14} style={{ color: 'var(--pb-mid, #0c7a86)' }} />
        Confirmo que la foto/nombre coincide con el estudiante frente a mí.
      </label>
    </div>
  );
}
