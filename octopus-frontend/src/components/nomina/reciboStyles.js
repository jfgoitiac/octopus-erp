export const NAVY   = '#1e3a5f';
export const NAVY_L = '#e8eff7';
export const RED    = '#b91c1c';
export const BORDER = '#b0bec5';

const cell = {
  border: `0.5px solid ${BORDER}`,
  padding: '5px 10px',
  fontSize: '8px',
  fontFamily: '"Arial", sans-serif',
  verticalAlign: 'middle',
  color: '#1e293b',
};

export const c   = { ...cell, textAlign: 'center' };
export const l   = { ...cell, textAlign: 'left' };
export const r   = { ...cell, textAlign: 'right' };
export const lb  = { ...l,   fontWeight: '700', textTransform: 'uppercase' };
export const rb  = { ...r,   fontWeight: '700' };

export const secH = {
  ...c,
  background: NAVY,
  color: '#fff',
  fontWeight: '700',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontSize: '8.5px',
  padding: '7px 10px',
};

export const subH = {
  ...c,
  background: NAVY_L,
  color: NAVY,
  fontWeight: '700',
  textTransform: 'uppercase',
  fontSize: '7.5px',
};

export const redCell  = { ...rb, color: RED };
export const redLCell = { ...lb, color: RED };
export const cell_    = cell;

export const stripe = (i) => ({ background: i % 2 === 0 ? '#fff' : '#f8fafc' });
