import { createPortal } from 'react-dom';

// Renderiza el popover de react-datepicker directo en <body> via portal de
// React, en vez de dejarlo como descendiente del input. Evita que quede
// recortado por contenedores con overflow:hidden/auto (p.ej. Modal.jsx) sin
// tocar la estrategia de posicionamiento interna de Popper — a diferencia de
// portalId/popperProps, no rompe el anclaje del calendario a su campo.
export const datepickerPopperContainer = ({ children }) => createPortal(children, document.body);
