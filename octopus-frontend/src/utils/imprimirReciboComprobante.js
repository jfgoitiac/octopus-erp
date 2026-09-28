import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { printReciboCobranza } from './printReciboCobranza';

/**
 * Imprime el recibo de cobranza a partir de un comprobante serializado por el
 * backend (ComprobanteSerializer). Lo usan la reimpresión del panel
 * (Comprobantes) y el portal de representantes, para que ambos emitan
 * exactamente el mismo modelo de recibo.
 *
 * `membrete` es opcional: el portal lo recibe embebido en la respuesta porque
 * no puede pedir la configuración del colegio con su token.
 */
export const imprimirReciboComprobante = (c, membrete) => {
    const fecha = new Date(c.fecha_pago);
    const tasa = parseFloat(c.tasa_bcv || 0);
    const toVes = (ves, usd) => {
        const v = parseFloat(ves) || 0;
        return v > 0 ? v : (parseFloat(usd) || 0) * tasa;
    };

    // Periodo legible: "Julio 2026"
    const mesStr = format(fecha, 'MMMM', { locale: es });
    const periodoLabel = `${mesStr.charAt(0).toUpperCase() + mesStr.slice(1)} ${fecha.getFullYear()}`;

    const items = c.desglose_conceptos && c.desglose_conceptos.length > 0
        ? c.desglose_conceptos.map(dc => ({
            concepto:    dc.concepto_display || dc.concepto || c.concepto_display,
            descripcion: dc.descripcion || periodoLabel,
            monto_usd:   0,
            monto_ves:   toVes(dc.monto_ves, dc.monto_usd),
            alumno:      dc.alumno || null,
        }))
        : [{
            concepto:    c.concepto_display || '',
            descripcion: periodoLabel,
            monto_usd:   0,
            monto_ves:   toVes(c.total_ves || c.monto_ves, c.total_usd || c.monto_usd),
        }];

    // Abono parcial: el backend no guarda a qué línea se aplicó cada abono, así
    // que se detecta comparando lo realmente pagado contra lo que suman las
    // líneas. Con una sola línea se muestra el monto abonado; con varias se
    // deja constancia en observaciones.
    const totalLineasUsd = (c.desglose_conceptos || [])
        .reduce((s, dc) => s + (parseFloat(dc.monto_usd) || 0), 0);
    const pagadoUsd = parseFloat(c.total_usd || c.monto_usd) || 0;
    const esAbono = totalLineasUsd > 0 && pagadoUsd > 0 && pagadoUsd < totalLineasUsd - 0.05;
    const saldoUsd = Math.max(0, totalLineasUsd - pagadoUsd);
    let notaAbono = '';
    if (esAbono) {
        const montoAbonoVes = toVes(c.total_ves, pagadoUsd);
        if (items.length === 1) {
            items[0].monto_ves = montoAbonoVes;
            items[0].descripcion = `${items[0].descripcion} (ABONO — saldo pendiente: $${saldoUsd.toFixed(2)})`;
        } else {
            notaAbono = `ABONO PARCIAL: se abonaron $${pagadoUsd.toFixed(2)} de $${totalLineasUsd.toFixed(2)}. Saldo pendiente: $${saldoUsd.toFixed(2)}.`;
        }
    }

    const pagos = c.desglose_pagos && c.desglose_pagos.length > 0
        ? c.desglose_pagos.map(dp => ({
            metodo:     dp.metodo_pago_display || dp.metodo_pago || '',
            banco:      dp.banco_nombre || '',
            referencia: dp.referencia   || '',
            monto:      toVes(dp.monto_ves, dp.monto_usd),
        }))
        : [{
            metodo:     c.metodo_pago_display || c.metodo_pago || '',
            banco:      c.banco_nombre || '',
            referencia: c.referencia   || '',
            monto:      toVes(c.total_ves || c.monto_ves, c.total_usd || c.monto_usd),
        }];

    // Igual que al cobrar: si la operación cubrió a varios hermanos, el recibo
    // lista a todos (y muestra la columna ESTUDIANTE por línea).
    const alumnosOperacion = [...new Set(items.map(it => it.alumno).filter(Boolean))];
    const nombreEstudiante = alumnosOperacion.length > 1
        ? alumnosOperacion.join(', ')
        : `${c.nombre_alumno || ''} ${c.apellido_alumno || ''}`.trim();

    return printReciboCobranza({
        nroControl:       c.factura_id || `#${c.id}`,
        mes:              mesStr.toUpperCase(),
        año:              fecha.getFullYear(),
        fechaPago:        format(fecha, 'dd/MM/yyyy', { locale: es }),
        nombreEstudiante,
        grado:            c.grado || '',
        representante:    c.representante_nombre ||
                          c.nombre_completo_representante ||
                          `${c.nombre_representante || ''} ${c.apellido_representante || ''}`.trim() ||
                          c.representante || '',
        ciRepresentante:  c.cedula_representante || c.representante_documento || c.cedula_escolar || '',
        cajero:           c.cajero || '',
        tasa:             0,
        items,
        pagos,
        observaciones:    [c.observaciones, notaAbono].filter(Boolean).join(' '),
        numeroSolvencia:  c.numero_solvencia || null,
        membrete,
    });
};
