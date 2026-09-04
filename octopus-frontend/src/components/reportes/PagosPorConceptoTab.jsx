import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { useConceptosCobrables } from '../../hooks/useConceptosCobrables';
import { useResumenPorConcepto } from '../../hooks/useResumenPorConcepto';
import { copiarResumen } from '../../utils/copiarResumen';
import FiltrosConcepto from './pagos-concepto/FiltrosConcepto';
import LineasConcepto from './pagos-concepto/LineasConcepto';
import DetalleConceptoModal from './pagos-concepto/DetalleConceptoModal';
import PagosConceptoSkeleton from './pagos-concepto/PagosConceptoSkeleton';

/**
 * Pestaña "Pagos por concepto" de Reportes: elige un concepto cobrable
 * (poblado 100% por el backend), lista sus líneas (una por mes si es
 * periódico, una sola si no) y abre el detalle por nombre en un modal.
 *
 * `deepLink` llega desde Reportes.jsx cuando la URL trae
 * ?tab=concepto&concepto=…&mes=…&anio=…&grado=… (lo que manda la tarjeta
 * del dashboard) — precarga esos filtros y abre el modal directamente.
 */
const PagosPorConceptoTab = ({ deepLink, onDeepLinkConsumido }) => {
    const { conceptos, loading: loadingConceptos } = useConceptosCobrables();

    const [concepto, setConcepto] = useState(deepLink?.concepto ?? null);
    const [vista, setVista] = useState('global');
    const [mostrarAlDia, setMostrarAlDia] = useState(false);
    const [modalFiltro, setModalFiltro] = useState(null);

    // Selecciona el primer concepto disponible una vez cargados, si no vino
    // ya fijado por deep-link.
    useEffect(() => {
        if (!concepto && conceptos.length > 0) setConcepto(conceptos[0].clave);
    }, [conceptos, concepto]);

    // Deep-link: al llegar filtros desde la tarjeta del dashboard, abrir el
    // modal de detalle directamente sobre el concepto/mes/grado indicados.
    useEffect(() => {
        if (!deepLink || conceptos.length === 0) return;
        setConcepto(deepLink.concepto);
        setModalFiltro({
            mes: deepLink.mes ? Number(deepLink.mes) : undefined,
            anio: deepLink.anio ? Number(deepLink.anio) : undefined,
            gradoSeccion: deepLink.grado || undefined,
        });
        onDeepLinkConsumido?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deepLink, conceptos.length]);

    const conceptoActual = useMemo(
        () => conceptos.find(c => c.clave === concepto) || null,
        [conceptos, concepto]
    );

    const { conceptoNombre, lineas, totales, loading: loadingLineas } = useResumenPorConcepto({
        concepto,
        vista,
    });

    const lineasVisibles = useMemo(
        () => mostrarAlDia ? lineas : lineas.filter(l => l.pendientes > 0 || l.parciales > 0),
        [lineas, mostrarAlDia]
    );

    const handleClickLinea = (linea) => {
        setModalFiltro({
            mes: linea.mes ?? undefined,
            anio: linea.anio ?? undefined,
            numeroCuota: linea.numero_cuota ?? undefined,
            etiqueta: linea.etiqueta || undefined,
        });
    };

    const handleClickGrado = (linea, grado) => {
        setModalFiltro({
            mes: linea.mes ?? undefined,
            anio: linea.anio ?? undefined,
            numeroCuota: linea.numero_cuota ?? undefined,
            gradoSeccion: grado.grado_seccion,
            etiqueta: linea.etiqueta ? `${linea.etiqueta} — ${grado.grado_seccion}` : grado.grado_seccion,
        });
    };

    const handleCopiarResumen = async () => {
        if (!conceptoNombre || lineasVisibles.length === 0) return;
        const lineasTexto = lineasVisibles.map(l => {
            const etiqueta = l.etiqueta || 'Total';
            return `${etiqueta} — ${l.pendientes} pendientes de ${l.total} (${l.porcentaje.toFixed(1)}% cobrado)`;
        });
        const encabezado = totales
            ? [`Total: ${totales.pagados} de ${totales.total} cobrados (${totales.porcentaje.toFixed(1)}%)`, '']
            : [];
        const ok = await copiarResumen(conceptoNombre, [...encabezado, ...lineasTexto]);
        if (ok) toast.success('Resumen copiado al portapapeles.');
        else toast.error('No se pudo copiar el resumen.');
    };

    if (loadingConceptos) return <PagosConceptoSkeleton />;

    if (conceptos.length === 0) {
        return (
            <p className="text-sm text-center py-12" style={{ color: 'var(--ash)' }}>
                No hay conceptos cobrables configurados.
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <FiltrosConcepto
                conceptos={conceptos}
                concepto={concepto}
                onConceptoChange={setConcepto}
                vista={vista}
                onVistaChange={setVista}
                mostrarAlDia={mostrarAlDia}
                onMostrarAlDiaChange={setMostrarAlDia}
                onCopiarResumen={handleCopiarResumen}
                copiarDisabled={lineasVisibles.length === 0}
            />

            {loadingLineas ? (
                <PagosConceptoSkeleton />
            ) : (
                <LineasConcepto
                    lineas={lineasVisibles}
                    vista={vista}
                    onClickLinea={handleClickLinea}
                    onClickGrado={handleClickGrado}
                    vacioMensaje={
                        lineas.length === 0
                            ? 'Sin datos para este concepto.'
                            : 'Todo está al día para este concepto.'
                    }
                />
            )}

            {modalFiltro && (
                <DetalleConceptoModal
                    open={!!modalFiltro}
                    onClose={() => setModalFiltro(null)}
                    concepto={concepto}
                    conceptoNombre={conceptoNombre || conceptoActual?.nombre}
                    admitePartial={conceptoActual?.admite_parcial ?? true}
                    filtro={modalFiltro}
                />
            )}
        </div>
    );
};

export default PagosPorConceptoTab;
