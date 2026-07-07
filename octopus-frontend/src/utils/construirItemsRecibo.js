const fmtMesAnio = (mes, anio) => {
    const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const n = parseInt(mes);
    const nombre = !isNaN(n) && n >= 1 && n <= 12 ? MESES_ES[n - 1] : String(mes);
    return `${nombre} ${anio}`;
};

export const construirItemsRecibo = ({
    selectedMens,
    selectedFuturas,
    selectedCuotas,
    selectedSolvencias,
    mensualidades,
    mensualidadesFuturas,
    cuotasInscripcion,
    cuotasSolvencia,
    montosParciales,
    tasa,
    CONCEPTOS,
    totalUSD,
    totalVES,
}) => {
    const itemsRecibo = [];

    selectedMens.forEach(id => {
        const m = mensualidades.find(x => x.id === id);
        if (!m) return;
        const ov = montosParciales[id];
        const monto = ov !== undefined && ov !== '' ? parseFloat(ov) || 0 : parseFloat(m.monto_usd) || 0;
        const parcial = ov !== undefined && ov !== '' && parseFloat(ov) < parseFloat(m.monto_usd) - 0.01;
        itemsRecibo.push({
            concepto: 'MENSUALIDAD',
            descripcion: `${fmtMesAnio(m.mes, m.anio)}${parcial ? ' (PARCIAL)' : ''}`,
            monto_usd: monto.toFixed(2),
            monto_ves: tasa > 0 ? (monto * tasa).toFixed(2) : '',
        });
    });

    selectedFuturas.forEach(id => {
        const m = mensualidadesFuturas.find(x => x.id === id);
        if (!m) return;
        const ov = montosParciales[id];
        const monto = ov !== undefined && ov !== '' ? parseFloat(ov) || 0 : parseFloat(m.monto_usd) || 0;
        const parcial = ov !== undefined && ov !== '' && parseFloat(ov) < parseFloat(m.monto_usd) - 0.01;
        itemsRecibo.push({
            concepto: 'ADELANTO',
            descripcion: `${fmtMesAnio(m.mes, m.anio)}${parcial ? ' (PARCIAL)' : ''}`,
            monto_usd: monto.toFixed(2),
            monto_ves: tasa > 0 ? (monto * tasa).toFixed(2) : '',
        });
    });

    selectedCuotas.forEach(id => {
        const c = cuotasInscripcion.find(x => x.id === id);
        if (c) itemsRecibo.push({
            concepto: 'INSCRIPCIÓN',
            descripcion: `Período ${c.periodo_escolar}`,
            monto_usd: c.monto_usd,
            monto_ves: tasa > 0 ? (parseFloat(c.monto_usd) * tasa).toFixed(2) : '',
        });
    });

    (selectedSolvencias || []).forEach(id => {
        const c = cuotasSolvencia?.find(x => x.id === id);
        if (c) itemsRecibo.push({
            concepto: 'SOLVENCIA',
            descripcion: c.concepto || `Período ${c.periodo_escolar}`,
            monto_usd: c.monto_usd,
            monto_ves: tasa > 0 ? (parseFloat(c.monto_usd) * tasa).toFixed(2) : '',
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
        });
    }

    return itemsRecibo;
};
