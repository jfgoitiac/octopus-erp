const fmtMesAnio = (mes, anio) => {
    const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const n = parseInt(mes);
    const nombre = !isNaN(n) && n >= 1 && n <= 12 ? MESES_ES[n - 1] : String(mes);
    return `${nombre} ${anio}`;
};

/**
 * Construye las líneas del recibo. `bloques` trae una entrada por cada
 * alumno incluido en la operación (puede ser uno o varios hermanos pagados
 * en una misma transacción); cada línea del recibo queda etiquetada con el
 * nombre del alumno al que corresponde para que el recibo muestre el
 * desglose por estudiante.
 */
export const construirItemsRecibo = ({
    bloques = [],
    selectedProyectos = [],
    cuotasProyectoInversion = [],
    montosParcialesProyectos = {},
    tasa,
    CONCEPTOS,
    totalUSD,
    totalVES,
}) => {
    const itemsRecibo = [];

    // Las claves de montosParciales van prefijadas por categoría (mens_, futura_,
    // cuota_, solv_) porque cada una sale de una tabla distinta en el backend y
    // sus IDs autoincrementales pueden coincidir entre sí.
    bloques.forEach(({ nombreAlumno, mensualidades, mensualidadesFuturas, cuotasInscripcion, cuotasSolvencia,
                       selectedMens, selectedFuturas, selectedCuotas, selectedSolvencias, montosParciales }) => {

        (selectedMens || []).forEach(id => {
            const m = (mensualidades || []).find(x => x.id === id);
            if (!m) return;
            const ov = montosParciales?.[`mens_${id}`];
            const monto = ov !== undefined && ov !== '' ? parseFloat(ov) || 0 : parseFloat(m.monto_usd) || 0;
            const parcial = ov !== undefined && ov !== '' && parseFloat(ov) < parseFloat(m.monto_usd) - 0.01;
            itemsRecibo.push({
                concepto: 'MENSUALIDAD',
                descripcion: `${fmtMesAnio(m.mes, m.anio)}${parcial ? ' (PARCIAL)' : ''}`,
                monto_usd: monto.toFixed(2),
                monto_ves: tasa > 0 ? (monto * tasa).toFixed(2) : '',
                alumno: nombreAlumno,
            });
        });

        (selectedFuturas || []).forEach(id => {
            const m = (mensualidadesFuturas || []).find(x => x.id === id);
            if (!m) return;
            const ov = montosParciales?.[`futura_${id}`];
            const monto = ov !== undefined && ov !== '' ? parseFloat(ov) || 0 : parseFloat(m.monto_usd) || 0;
            const parcial = ov !== undefined && ov !== '' && parseFloat(ov) < parseFloat(m.monto_usd) - 0.01;
            itemsRecibo.push({
                concepto: 'ADELANTO',
                descripcion: `${fmtMesAnio(m.mes, m.anio)}${parcial ? ' (PARCIAL)' : ''}`,
                monto_usd: monto.toFixed(2),
                monto_ves: tasa > 0 ? (monto * tasa).toFixed(2) : '',
                alumno: nombreAlumno,
            });
        });

        (selectedCuotas || []).forEach(id => {
            const c = (cuotasInscripcion || []).find(x => x.id === id);
            if (!c) return;
            const ov = montosParciales?.[`cuota_${id}`];
            const monto = ov !== undefined && ov !== '' ? parseFloat(ov) || 0 : parseFloat(c.monto_usd) || 0;
            const parcial = ov !== undefined && ov !== '' && parseFloat(ov) < parseFloat(c.monto_usd) - 0.01;
            itemsRecibo.push({
                concepto: 'INSCRIPCIÓN',
                descripcion: `Período ${c.periodo_escolar}${parcial ? ' (PARCIAL)' : ''}`,
                monto_usd: monto.toFixed(2),
                monto_ves: tasa > 0 ? (monto * tasa).toFixed(2) : '',
                alumno: nombreAlumno,
            });
        });

        (selectedSolvencias || []).forEach(id => {
            const c = (cuotasSolvencia || []).find(x => x.id === id);
            if (!c) return;
            const ov = montosParciales?.[`solv_${id}`];
            const monto = ov !== undefined && ov !== '' ? parseFloat(ov) || 0 : parseFloat(c.monto_usd) || 0;
            const parcial = ov !== undefined && ov !== '' && parseFloat(ov) < parseFloat(c.monto_usd) - 0.01;
            itemsRecibo.push({
                concepto: 'SOLVENCIA',
                descripcion: `${c.concepto || `Período ${c.periodo_escolar}`}${parcial ? ' (PARCIAL)' : ''}`,
                monto_usd: monto.toFixed(2),
                monto_ves: tasa > 0 ? (monto * tasa).toFixed(2) : '',
                alumno: nombreAlumno,
            });
        });
    });

    (selectedProyectos || []).forEach(id => {
        const c = cuotasProyectoInversion?.find(x => x.id === id);
        if (!c) return;
        const ov = montosParcialesProyectos?.[id];
        const saldo = c.saldo !== undefined ? c.saldo : c.monto_usd;
        const monto = ov !== undefined && ov !== '' ? parseFloat(ov) || 0 : parseFloat(saldo) || 0;
        const parcial = ov !== undefined && ov !== '' && parseFloat(ov) < parseFloat(saldo) - 0.01;
        itemsRecibo.push({
            concepto: 'PROYECTO DE INVERSIÓN',
            descripcion: `Período ${c.periodo_escolar}${parcial ? ' (PARCIAL)' : ''}`,
            monto_usd: monto.toFixed(2),
            monto_ves: tasa > 0 ? (monto * tasa).toFixed(2) : '',
            alumno: null, // cuota del representante, no de un alumno puntual
        });
    });

    if (itemsRecibo.length === 0) {
        const ahora = new Date();
        const conceptoLabel = CONCEPTOS.find(c => c.value === CONCEPTOS[0]?.value)?.label.toUpperCase() || 'OTRO';
        itemsRecibo.push({
            concepto: conceptoLabel,
            descripcion: fmtMesAnio(ahora.getMonth() + 1, ahora.getFullYear()),
            monto_usd: totalUSD.toFixed(2),
            monto_ves: totalVES.toFixed(2),
            alumno: bloques[0]?.nombreAlumno || null,
        });
    }

    return itemsRecibo;
};
