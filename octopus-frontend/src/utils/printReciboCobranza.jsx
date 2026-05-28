import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const fmtN = n =>
  isNaN(n) || n === '' || n === null
    ? ''
    : Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtZ = n =>
  isNaN(n) ? '0,00' : Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Componente del recibo (sin Tailwind — solo inline styles) ─────────────────
const ReciboCobranzaDoc = ({ data }) => {
  const {
    nroControl, mes, año, fechaPago,
    nombreEstudiante, grado, representante, ciRepresentante,
    cajero, tasa, items = [], pagos = [],
    logoColegio, logoAvec, observaciones,
  } = data;

  const TEAL   = '#0fa3b1';
  const TEAL_D = '#0c828d';
  const NAVY   = '#1e3a5f';
  const NAVY_L = '#e8eff7';
  const TEAL_L = '#e8f8fa';
  const BORDER = '#b0bec5';
  const GREEN  = '#15803d';
  const GREEN_L= '#dcfce7';

  const TEXT = '#000000';
  const cell = { border: `0.5px solid ${BORDER}`, padding: '5px 10px', fontSize: '8px', fontFamily: '"Arial", sans-serif', verticalAlign: 'middle', color: TEXT };
  const c  = { ...cell, textAlign: 'center' };
  const l  = { ...cell, textAlign: 'left' };
  const r  = { ...cell, textAlign: 'right' };
  const lb = { ...l, fontWeight: '700', textTransform: 'uppercase' };
  const rb = { ...r, fontWeight: '700' };

  const secH = { ...c, background: NAVY, color: '#fff', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '8.5px', padding: '7px 10px' };
  const subH = { ...c, background: NAVY_L, color: '#000000', fontWeight: '700', textTransform: 'uppercase', fontSize: '7.5px' };
  const tealH = { ...c, background: TEAL, color: '#fff', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '8.5px', padding: '7px 10px' };

  const stripe = i => ({ background: i % 2 === 0 ? '#fff' : '#f8fafc' });

  const tasaNum     = parseFloat(tasa) || 0;
  const totalVesShow = items.reduce((s, it) => {
    const ves = parseFloat(it.monto_ves) || 0;
    const usd = parseFloat(it.monto_usd) || 0;
    return s + (ves > 0 ? ves : (tasaNum > 0 ? usd * tasaNum : 0));
  }, 0);

  const emptyRows = Math.max(0, 3 - items.length);

  return (
    <div style={{ width: '100%', minHeight: '842px', fontFamily: '"Arial", sans-serif', background: '#fff', padding: 0, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

      {/* Banda superior */}
      <div style={{ height: '6px', background: `linear-gradient(90deg, ${NAVY} 0%, ${TEAL} 60%, ${TEAL_D} 100%)`, flexShrink: 0 }} />

      <div style={{ padding: '18px 26px', flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* Encabezado institucional */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px' }}>
          <tbody>
            <tr>
              <td style={{ width: '13%', border: 'none', textAlign: 'center', verticalAlign: 'middle' }}>
                {logoColegio
                  ? <img src={logoColegio} alt="logo" style={{ maxWidth: 62, maxHeight: 62 }} />
                  : <div style={{ width: 62, height: 62, border: `1.5px dashed ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: '7px', color: TEXT, flexDirection: 'column', gap: 2, borderRadius: '4px' }}>
                      <span>Logo</span><span>Colegio</span>
                    </div>
                }
              </td>
              <td style={{ border: 'none', textAlign: 'center', verticalAlign: 'middle', lineHeight: 1.15 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5px' }}>
                  <span style={{ fontSize: '7.5px', color: TEXT }}>REPÚBLICA BOLIVARIANA DE VENEZUELA</span>
                  <span style={{ fontSize: '7px', color: TEXT }}>MINISTERIO DEL PODER POPULAR PARA LA EDUCACIÓN</span>
                  <span style={{ fontSize: '8px', fontWeight: '700', color: '#000000', letterSpacing: '0.01em' }}>U.E. COLEGIO LOS HIJOS DE MARÍA AUXILIADORA</span>
                  <span style={{ fontSize: '7px', color: TEXT }}>AFILIADO A LA ASOCIACIÓN VENEZOLANA DE EDUCACIÓN CATÓLICA</span>
                  <span style={{ fontSize: '7px', color: TEXT }}>YARACAL ESTADO FALCÓN — TELÉFONOS 0259 938 1347 — CÓDIGO DEA PD00131104 — RIF-J-085222910</span>
                </div>
              </td>
              <td style={{ width: '13%', border: 'none', textAlign: 'center', verticalAlign: 'middle' }}>
                {logoAvec
                  ? <img src={logoAvec} alt="avec" style={{ maxWidth: 62, maxHeight: 62 }} />
                  : <div style={{ width: 62, height: 62, border: `1.5px dashed ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: '7px', color: TEXT, flexDirection: 'column', gap: 2, borderRadius: '4px' }}>
                      <span>Logo</span><span>AVEC</span>
                    </div>
                }
              </td>
            </tr>
          </tbody>
        </table>

        {/* Barra de título + número de control */}
        <div style={{ display: 'flex', alignItems: 'stretch', marginBottom: '10px', border: `1px solid ${NAVY}`, borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ flex: 1, background: `linear-gradient(135deg, ${NAVY} 0%, #2a4f7a 100%)`, padding: '9px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ color: '#fff', fontWeight: '800', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              RECIBO DE PAGO — COBRANZA ESCOLAR
            </div>
            <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: '7.5px', marginTop: '2px' }}>
              Período: {mes} {año}{fechaPago ? `  ·  Fecha: ${fechaPago}` : ''}
            </div>
          </div>
          <div style={{ background: TEAL, padding: '9px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: '110px' }}>
            <div style={{ color: 'rgba(255,255,255,0.80)', fontSize: '6.5px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase' }}>N° RECIBO</div>
            <div style={{ color: '#fff', fontSize: '13px', fontWeight: '900', letterSpacing: '0.04em', lineHeight: 1.1 }}>{nroControl || '—'}</div>
          </div>
        </div>

        {/* Datos del estudiante */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
          <tbody>
            <tr><td colSpan={4} style={secH}>DATOS DEL ESTUDIANTE Y REPRESENTANTE</td></tr>
            <tr>
              <td style={{ ...subH, width: '38%' }}>Apellidos y Nombres del Estudiante</td>
              <td style={{ ...subH, width: '18%' }}>Grado / Sección</td>
              <td style={{ ...subH, width: '26%' }}>Representante</td>
              <td style={{ ...subH, width: '18%' }}>C.I. Representante</td>
            </tr>
            <tr>
              <td style={{ ...c, fontWeight: '600' }}>{nombreEstudiante || ''}</td>
              <td style={c}>{grado || ''}</td>
              <td style={c}>{representante || ''}</td>
              <td style={c}>{ciRepresentante || ''}</td>
            </tr>
          </tbody>
        </table>

        {/* Detalle de conceptos */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
          <tbody>
            <tr><td colSpan={3} style={tealH}>DETALLE DE CONCEPTOS PAGADOS</td></tr>
            <tr>
              <td style={{ ...subH, width: '30%' }}>Concepto</td>
              <td style={{ ...subH, width: '45%' }}>Descripción / Período</td>
              <td style={{ ...subH, width: '25%' }}>Monto Bs.</td>
            </tr>
            {items.map((it, i) => (
              <tr key={i} style={stripe(i)}>
                <td style={lb}>{it.concepto}</td>
                <td style={l}>{it.descripcion}</td>
                <td style={r}>{it.monto_ves ? `Bs. ${fmtN(it.monto_ves)}` : (it.monto_usd && tasaNum > 0 ? `Bs. ${fmtN(parseFloat(it.monto_usd) * tasaNum)}` : '')}</td>
              </tr>
            ))}
            {Array.from({ length: emptyRows }).map((_, i) => (
              <tr key={`e${i}`} style={stripe(items.length + i)}>
                <td style={l}>&nbsp;</td><td style={l}>&nbsp;</td><td style={r}>&nbsp;</td>
              </tr>
            ))}
            <tr style={{ background: TEAL_L }}>
              <td colSpan={2} style={{ ...lb, color: '#000000', textAlign: 'right', paddingRight: '12px' }}>TOTAL PAGADO</td>
              <td style={{ ...rb, color: '#000000', fontSize: '9px' }}>Bs. {fmtZ(totalVesShow)}</td>
            </tr>
          </tbody>
        </table>

        {/* Observaciones + Sello + Firma */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
          <tbody>
            <tr>
              <td style={{ ...cell, width: '50%', verticalAlign: 'top', minHeight: '56px' }}>
                <div style={{ fontWeight: '700', fontSize: '7px', textTransform: 'uppercase', color: NAVY, marginBottom: '4px' }}>Observaciones:</div>
                <div style={{ fontSize: '7.5px', color: TEXT, minHeight: '32px' }}>{observaciones || ''}</div>
              </td>
              <td style={{ ...cell, width: '22%', textAlign: 'center', verticalAlign: 'middle' }}>
                <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: `2.5px solid ${GREEN}`, borderRadius: '6px', padding: '5px 10px', transform: 'rotate(-4deg)', opacity: 0.92 }}>
                  <span style={{ fontSize: '9px', fontWeight: '900', color: GREEN, letterSpacing: '0.12em', textTransform: 'uppercase' }}>CANCELADO</span>
                  <span style={{ fontSize: '6px', color: GREEN, letterSpacing: '0.06em' }}>{fechaPago || ''}</span>
                </div>
              </td>
              <td style={{ ...cell, width: '28%', textAlign: 'center', verticalAlign: 'bottom' }}>
                <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '5px', marginTop: '32px' }}>
                  <div style={{ fontSize: '7px', color: TEXT, fontWeight: '700', textTransform: 'uppercase' }}>{cajero || 'Cajero / Operador'}</div>
                  <div style={{ fontSize: '6.5px', color: TEXT, marginTop: '1px' }}>Firma y Sello</div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Resumen financiero final */}
        <div style={{ display: 'flex', marginBottom: '12px', border: `1px solid ${BORDER}`, borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ flex: 2, background: '#f8fafc', padding: '8px 12px', textAlign: 'center', borderRight: `0.5px solid ${BORDER}` }}>
            <div style={{ fontSize: '6.5px', color: TEXT, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Total en Bolívares</div>
            <div style={{ fontSize: '11px', fontWeight: '900', color: '#000000' }}>Bs. {fmtZ(totalVesShow)}</div>
          </div>
          <div style={{ flex: 1, background: GREEN_L, padding: '8px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: '6.5px', color: '#000000', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Estado del Pago</div>
            <div style={{ fontSize: '9px', fontWeight: '900', color: '#000000', letterSpacing: '0.06em' }}>PAGADO</div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 'auto', textAlign: 'center', fontSize: '6.5px', color: TEXT, lineHeight: 2, borderTop: `1.5px solid ${TEAL}`, paddingTop: '8px' }}>
          <span style={{ fontWeight: '700', color: '#000000', fontSize: '7px' }}>U.E. COLEGIO LOS HIJOS DE MARÍA AUXILIADORA</span>
          <br />
          Calle el Samán, detrás de la Guardia Nacional en el Municipio Cacique Manaure, Yaracal, Estado Falcón.
          <br />
          Teléfonos: 0259 938 1347 &nbsp;&nbsp; 0426 563 1569 &nbsp;&nbsp;
          <span style={{ color: '#000000' }}>Este recibo es el comprobante oficial de pago. Consérvelo.</span>
        </div>

      </div>

      {/* Banda inferior */}
      <div style={{ height: '4px', background: `linear-gradient(90deg, ${TEAL_D} 0%, ${TEAL} 40%, ${NAVY} 100%)`, flexShrink: 0 }} />
    </div>
  );
};

// ── Función pública ───────────────────────────────────────────────────────────
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
        @media print{@page{size:A4;margin:8mm;}body{margin:0;}}
      </style>
    </head><body style="width:595px;margin:0 auto;">${html}</body></html>`);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 400);
  } catch (err) {
    console.error('Error generando recibo de cobranza:', err);
  }
};
