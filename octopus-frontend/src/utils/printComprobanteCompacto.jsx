import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const fmt = n =>
  isNaN(n) || n === '' || n === null
    ? '—'
    : Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const NAVY  = '#003366';
const GREEN = '#15803d';
const GRAY  = '#666666';
const LIGHT = '#F5F5F5';
const BORDER = '#CCCCCC';
const TEXT  = '#000000';

const ComprobanteCard = ({ data }) => {
  const {
    nroControl, fechaPago,
    nombreEstudiante, grado, representante,
    items = [], pagos = [],
    observaciones,
  } = data;

  const total = items.reduce((s, it) => s + (parseFloat(it.monto_ves) || 0), 0);

  return (
    <div style={{ width: '380px', margin: '24px auto', fontFamily: '"Segoe UI", Arial, sans-serif' }}>

      {/* Card */}
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: '10px', overflow: 'hidden', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>

        {/* Header */}
        <div style={{ background: LIGHT, borderBottom: `1px solid ${BORDER}`, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: NAVY }}>U.E. Colegio Los Hijos de María Auxiliadora</p>
            <p style={{ margin: '2px 0 0', fontSize: '10px', color: GRAY }}>Yaracal, Edo. Falcón · RIF J-085222910</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '10px', fontWeight: '700', color: GREEN, background: '#dcfce7', padding: '3px 9px', borderRadius: '20px', display: 'inline-block' }}>
              PAGADO
            </span>
            <p style={{ margin: '4px 0 0', fontSize: '10px', color: GRAY, fontFamily: 'monospace' }}>{nroControl || '—'}</p>
          </div>
        </div>

        {/* Alumno + Fecha */}
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ margin: 0, fontSize: '12px', fontWeight: '600', color: TEXT }}>{nombreEstudiante || '—'}</p>
            <p style={{ margin: '1px 0 0', fontSize: '10px', color: GRAY }}>{grado || ''}{representante ? ` · Rep: ${representante}` : ''}</p>
          </div>
          <p style={{ margin: 0, fontSize: '10px', color: GRAY, whiteSpace: 'nowrap' }}>{fechaPago || ''}</p>
        </div>

        {/* Conceptos */}
        <div style={{ padding: '10px 16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ color: GRAY }}>
                <th style={{ textAlign: 'left', fontWeight: '600', paddingBottom: '6px' }}>Concepto</th>
                <th style={{ textAlign: 'right', fontWeight: '600', paddingBottom: '6px', width: '90px' }}>Monto Bs.</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${BORDER}` }}>
                  <td style={{ padding: '5px 0', color: TEXT }}>
                    {it.concepto}
                    {it.descripcion ? <span style={{ color: GRAY, fontSize: '10px' }}> · {it.descripcion}</span> : ''}
                  </td>
                  <td style={{ textAlign: 'right', color: TEXT, fontFamily: 'monospace' }}>
                    {fmt(it.monto_ves)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Total */}
        <div style={{ padding: '8px 16px', background: LIGHT, borderTop: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '700', color: NAVY }}>
            <span>Total</span>
            <span style={{ fontFamily: 'monospace' }}>Bs. {fmt(total)}</span>
          </div>
        </div>

        {/* Observaciones */}
        {observaciones && (
          <div style={{ padding: '9px 16px', borderTop: `1px solid ${BORDER}` }}>
            <p style={{ margin: 0, fontSize: '10px', color: GRAY, fontStyle: 'italic' }}>{observaciones}</p>
          </div>
        )}

        {/* Footer */}
        <div style={{ background: LIGHT, borderTop: `1px solid ${BORDER}`, padding: '7px 16px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '10px', color: GRAY }}>
            Tel: 0259 938 1347 · 0426 563 1569
          </p>
        </div>

      </div>

      {/* Pie de página */}
      <p style={{ textAlign: 'center', fontSize: '10px', color: GRAY, marginTop: '10px' }}>
        Comprobante digital · Este documento es el comprobante oficial de pago
      </p>

    </div>
  );
};

export const printComprobanteCompacto = (data) => {
  try {
    const html = renderToStaticMarkup(<ComprobanteCard data={data} />);

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8"/>
      <title>Comprobante ${data.nroControl || ''}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#fff;}
        @media print{
          @page{size:100mm auto;margin:4mm;}
          body{margin:0;}
        }
      </style>
    </head><body style="padding:0;">${html}</body></html>`);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 400);
  } catch (err) {
    console.error('Error generando comprobante compacto:', err);
  }
};
