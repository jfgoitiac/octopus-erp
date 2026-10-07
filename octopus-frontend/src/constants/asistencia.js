import { CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react';

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

// Configuración visual compartida por FilaAlumno (vista Lista) y el pase de
// lista por tarjetas. `Icon` es el componente (no un elemento) para que cada
// vista elija el tamaño.
//
// Nota: color de texto activo de "Presente" oscurecido a #15803d (desde
// #16a34a) para cumplir contraste >= 4.5:1 sobre el fondo #dcfce7 en texto
// pequeño (WCAG AA). El borde puede mantenerse más claro por ser decorativo.
// `activeStyle.color` también se usa como relleno sólido bajo texto blanco:
// los cuatro superan 4.5:1 contra #fff.
export const CONFIGS_ESTADO = Object.freeze({
  [ESTADO.PRESENTE]: {
    label:       'Presente',
    Icon:        CheckCircle,
    activeStyle: { background: '#dcfce7', color: '#15803d', border: '1.5px solid #16a34a' },
  },
  [ESTADO.AUSENTE]: {
    label:       'Ausente',
    Icon:        XCircle,
    activeStyle: { background: 'var(--red-light)', color: 'var(--red)', border: '1.5px solid var(--red)' },
  },
  [ESTADO.JUSTIFICADO]: {
    label:       'Justificado',
    Icon:        AlertCircle,
    activeStyle: { background: '#fef9c3', color: '#854d0e', border: '1.5px solid #ca8a04' },
  },
  [ESTADO.RETARDADO]: {
    label:       'Retardado',
    Icon:        Clock,
    activeStyle: { background: '#fef3c7', color: '#b45309', border: '1.5px solid #f59e0b' },
  },
});

// Atajos de teclado: P/A/T/J. "T" mapea a RETARDADO porque en la UI ese
// estado se etiqueta "Tarde"/"Retardado" indistintamente.
export const TECLA_A_ESTADO = Object.freeze({
  p: ESTADO.PRESENTE,
  a: ESTADO.AUSENTE,
  t: ESTADO.RETARDADO,
  j: ESTADO.JUSTIFICADO,
});
