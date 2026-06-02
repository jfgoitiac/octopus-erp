export const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];

export const TIPO_RECIBO_DEFAULT = 'I, II QUINCENA Y BONO DE ALIMENTACION';

// IDs fijos para las filas predeterminadas. El hook parte el contador en 10 para evitar colisiones.
export const DEFAULT_ASIGNACIONES = [
  { id: 1, label: 'SUELDO BASE',         value: '' },
  { id: 2, label: 'OTRAS ASIGNACIONES',  value: '' },
];

export const DEFAULT_RETENCIONES = [
  { id: 1, label: 'F.A.O.V',      value: '' },
  { id: 2, label: 'S.S.O',        value: '' },
  { id: 3, label: 'S.P.F',        value: '' },
  { id: 4, label: 'DEDUCCIONES',  value: '' },
];

export const LOGO_MAX_BYTES = 512_000;
