export const ESTADO = Object.freeze({
  PRESENTE:    'presente',
  AUSENTE:     'ausente',
  JUSTIFICADO: 'justificado',
  RETARDADO:   'retardado',
  SIN_MARCAR:  null,
});

// Mapeo entre el enum de UI y la letra que espera/devuelve el backend (campo `estado`)
export const ESTADO_A_BACKEND = Object.freeze({
  [ESTADO.PRESENTE]:    'P',
  [ESTADO.AUSENTE]:     'A',
  [ESTADO.JUSTIFICADO]: 'J',
  [ESTADO.RETARDADO]:   'R',
});

export const BACKEND_A_ESTADO = Object.freeze({
  P: ESTADO.PRESENTE,
  A: ESTADO.AUSENTE,
  J: ESTADO.JUSTIFICADO,
  R: ESTADO.RETARDADO,
});
