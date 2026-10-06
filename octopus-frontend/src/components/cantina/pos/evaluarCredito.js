// Regla de "Cargar a cuenta" del POS (D6 del prompt CxC): la venta se bloquea
// si la cuenta del representante está bloqueada o si deuda + venta supera el
// límite. Es una guarda de UX — el backend vuelve a validar al registrar.
export function evaluarCredito(representante, totalUsd) {
  if (!representante) return { ok: false, motivo: 'Busca al representante que asumirá el cargo.' };
  const saldo = Number(representante.saldo_usd ?? 0);
  const limite = Number(representante.limite_usd ?? 0);
  if (representante.bloqueado) {
    return { ok: false, motivo: 'La cuenta de este representante está bloqueada para crédito.', saldo, limite };
  }
  const saldoDespues = saldo + Number(totalUsd || 0);
  if (saldoDespues > limite) {
    return {
      ok: false,
      motivo: `La venta excede el límite de crédito ($${limite.toFixed(2)}). Disponible: $${Math.max(limite - saldo, 0).toFixed(2)}.`,
      saldo, limite, saldoDespues,
    };
  }
  return { ok: true, motivo: '', saldo, limite, saldoDespues };
}
