import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const fmtN = n =>
  isNaN(n) || n === '' || n === null
    ? ''
    : Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtZ = n =>
  isNaN(n) ? '0,00' : Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const NAVY   = '#003366';
const RED    = '#CC0000';
const BORDER = '#CCCCCC';
const TEXT   = '#000000';

const cell = {
  border: `0.5px solid ${BORDER}`,
  padding: '5px 10px',
  fontSize: '8px',
  fontFamily: '"Arial", sans-serif',
  verticalAlign: 'middle',
  color: TEXT,
};
const c   = { ...cell, textAlign: 'center' };
const l   = { ...cell, textAlign: 'left' };
const r   = { ...cell, textAlign: 'right' };
const lb  = { ...l, fontWeight: '700', textTransform: 'uppercase' };
const rb  = { ...r, fontWeight: '700' };

const secH = {
  ...c,
  background: '#FFFFFF',
  color: NAVY,
  fontWeight: '700',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontSize: '8.5px',
  padding: '7px 10px',
  border: `0.5px solid ${BORDER}`,
};

const colH = {
  ...c,
  background: '#FFFFFF',
  color: TEXT,
  fontWeight: '400',
  textTransform: 'uppercase',
  fontSize: '7.5px',
};

const ReciboCobranzaDoc = ({ data }) => {
  const {
    nroControl, mes, año, fechaPago,
    nombreEstudiante, grado, representante, ciRepresentante,
    tasa, items = [], observaciones,
    logoColegio, logoAvec,
  } = data;

  const tasaNum = parseFloat(tasa) || 0;
  const totalVes = items.reduce((s, it) => {
    const ves = parseFloat(it.monto_ves) || 0;
    const usd = parseFloat(it.monto_usd) || 0;
    return s + (ves > 0 ? ves : (tasaNum > 0 ? usd * tasaNum : 0));
  }, 0);

  const emptyRows = Math.max(0, 3 - items.length);

  return (
    <div style={{
      width: '100%', minHeight: '842px',
      fontFamily: '"Arial", sans-serif',
      background: '#fff',
      padding: '18px 26px',
      boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column',
    }}>

      {/* Encabezado institucional */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <tbody>
          <tr>
            <td style={{ width: '12%', border: 'none', textAlign: 'center', verticalAlign: 'middle' }}>
              {logoColegio
                ? <img src={logoColegio} alt="logo" style={{ maxWidth: 64, maxHeight: 64 }} />
                : <div style={{ width: 64, height: 64, border: `1.5px dashed ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: '7px', color: '#888', flexDirection: 'column', gap: 2, borderRadius: '4px' }}>
                    <span>Logo</span><span>Colegio</span>
                  </div>
              }
            </td>
            <td style={{ border: 'none', textAlign: 'center', verticalAlign: 'middle', lineHeight: 1.4 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5px' }}>
                <span style={{ fontSize: '7.5px', color: TEXT }}>REPÚBLICA BOLIVARIANA DE VENEZUELA</span>
                <span style={{ fontSize: '7.5px', color: TEXT }}>MINISTERIO DEL PODER POPULAR PARA LA EDUCACIÓN</span>
                <span style={{ fontSize: '8px', fontWeight: '700', color: TEXT }}>U.E. COLEGIO LOS HIJOS DE MARÍA AUXILIADORA</span>
                <span style={{ fontSize: '7px', color: TEXT }}>AFILIADO A LA ASOCIACIÓN VENEZOLANA DE EDUCACIÓN CATÓLICA</span>
                <span style={{ fontSize: '7px', color: TEXT }}>YARACAL ESTADO FALCÓN</span>
                <span style={{ fontSize: '7px', color: TEXT }}>TELÉFONO 0259 938 1347 - 0426 563 1569</span>
                <span style={{ fontSize: '7px', color: TEXT }}>CÓDIGO DEA PD00131104</span>
                <span style={{ fontSize: '7px', color: TEXT }}>RIF-J-085222910</span>
              </div>
            </td>
            <td style={{ width: '12%', border: 'none', textAlign: 'center', verticalAlign: 'middle' }}>
              {logoAvec
                ? <img src={logoAvec} alt="avec" style={{ maxWidth: 64, maxHeight: 64 }} />
                : <div style={{ width: 64, height: 64, border: `1.5px dashed ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: '7px', color: '#888', flexDirection: 'column', gap: 2, borderRadius: '4px' }}>
                    <span>Logo</span><span>AVEC</span>
                  </div>
              }
            </td>
          </tr>
        </tbody>
      </table>

      {/* Título + N° Recibo */}
      <div style={{
        display: 'flex', alignItems: 'stretch',
        border: `1px solid ${BORDER}`, borderRadius: '4px',
        overflow: 'hidden', marginBottom: '12px',
      }}>
        <div style={{ flex: 1, padding: '10px 14px' }}>
          <div style={{ fontWeight: '800', fontSize: '11px', textTransform: 'uppercase', color: TEXT }}>
            RECIBO DE PAGO - COBRANZA ESCOLAR
          </div>
          <div style={{ fontSize: '8px', color: TEXT, marginTop: '3px' }}>
            Periodo: {mes} {año}&nbsp;&nbsp;&nbsp;Fecha: {fechaPago || ''}
          </div>
        </div>
        <div style={{
          borderLeft: `1px solid ${BORDER}`,
          padding: '10px 18px',
          display: 'flex', flexDirection: 'column',
          alignItems: 'flex-end', justifyContent: 'center',
          minWidth: '130px',
        }}>
          <div style={{ fontSize: '7px', color: TEXT, fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            N° RECIBO
          </div>
          <div style={{ fontSize: '15px', fontWeight: '900', color: NAVY, letterSpacing: '0.02em', lineHeight: 1.2 }}>
            {nroControl || '—'}
          </div>
        </div>
      </div>

      {/* Datos del estudiante */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <tbody>
          <tr><td colSpan={4} style={secH}>DATOS DEL ESTUDIANTE Y REPRESENTANTE</td></tr>
          <tr>
            <td style={{ ...colH, width: '36%' }}>NOMBRES Y APELLIDOS DEL ESTUDIANTE</td>
            <td style={{ ...colH, width: '18%' }}>GRADO</td>
            <td style={{ ...colH, width: '28%' }}>REPRESENTANTE</td>
            <td style={{ ...colH, width: '18%' }}>C.I. REPRESENTANTE</td>
          </tr>
          <tr>
            <td style={c}>{nombreEstudiante || ''}</td>
            <td style={c}>{grado || ''}</td>
            <td style={c}>{representante || ''}</td>
            <td style={c}>{ciRepresentante || ''}</td>
          </tr>
        </tbody>
      </table>

      {/* Detalle de conceptos */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <tbody>
          <tr><td colSpan={3} style={secH}>DETALLE DE CONCEPTOS PAGADOS</td></tr>
          <tr>
            <td style={{ ...colH, width: '30%' }}>CONCEPTO</td>
            <td style={{ ...colH, width: '45%' }}>PERIODO</td>
            <td style={{ ...colH, width: '25%' }}>MONTO BS.</td>
          </tr>
          {items.map((it, i) => (
            <tr key={i}>
              <td style={lb}>{it.concepto}</td>
              <td style={l}>{it.descripcion || ''}</td>
              <td style={r}>
                {it.monto_ves
                  ? `Bs. ${fmtN(it.monto_ves)}`
                  : (it.monto_usd && tasaNum > 0 ? `Bs. ${fmtN(parseFloat(it.monto_usd) * tasaNum)}` : '')}
              </td>
            </tr>
          ))}
          {Array.from({ length: emptyRows }).map((_, i) => (
            <tr key={`e${i}`}>
              <td style={l}>&nbsp;</td>
              <td style={l}>&nbsp;</td>
              <td style={r}>&nbsp;</td>
            </tr>
          ))}
          <tr>
            <td colSpan={2} style={{ ...rb, color: RED, textAlign: 'right', paddingRight: '14px', fontSize: '9px', border: `0.5px solid ${BORDER}` }}>
              TOTAL PAGADO
            </td>
            <td style={{ ...rb, color: RED, fontSize: '9px', border: `0.5px solid ${BORDER}` }}>
              {fmtZ(totalVes)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Observaciones + Sello PAGADO */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <tbody>
          <tr>
            <td style={{ ...cell, width: '65%', verticalAlign: 'top', minHeight: '70px' }}>
              <div style={{ fontWeight: '700', fontSize: '8px', textTransform: 'uppercase', color: NAVY, marginBottom: '5px' }}>
                OBSERVACIONES:
              </div>
              <div style={{ fontSize: '7.5px', color: TEXT, minHeight: '40px' }}>
                {observaciones || ''}
              </div>
            </td>
            <td style={{ ...cell, width: '35%', textAlign: 'center', verticalAlign: 'middle' }}>
              {/* Sello circular PAGADO */}
              <div style={{
                display: 'inline-flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                width: '80px', height: '80px',
                border: `3px dashed ${RED}`,
                borderRadius: '50%',
                transform: 'rotate(-15deg)',
              }}>
                <span style={{
                  fontSize: '14px', fontWeight: '900', color: RED,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  transform: 'rotate(0deg)',
                }}>
                  PAGADO
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Footer */}
      <div style={{
        marginTop: 'auto',
        textAlign: 'center',
        fontSize: '7px',
        color: TEXT,
        borderTop: `1px solid ${BORDER}`,
        paddingTop: '8px',
      }}>
        Calle el Samán, detrás de la Guardia Nacional en el Municipio Cacique Manaure, Yaracal, Estado Falcon.
      </div>

    </div>
  );
};

export const printReciboCobranza = (data) => {
  const storedLogos = (() => {
    try { return JSON.parse(localStorage.getItem('octopus_logos_recibo') || '{}'); } catch { return {}; }
  })();

  const fullData = {
    ...data,
    logoColegio: storedLogos.logoColegio || null,
    logoAvec:    storedLogos.logoAvec    || null,
  };

  try {
    const html = renderToStaticMarkup(<ReciboCobranzaDoc data={fullData} />);

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8"/>
      <title>Recibo – ${data.nombreEstudiante || 'estudiante'} – ${data.mes} ${data.año}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#fff;}
        @media print{@page{size:A4;margin:10mm;}body{margin:0;}}
      </style>
    </head><body style="width:595px;margin:0 auto;">${html}</body></html>`);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 400);
  } catch {
    // error silencioso — el iframe falla solo si el documento está vacío
  }
};
