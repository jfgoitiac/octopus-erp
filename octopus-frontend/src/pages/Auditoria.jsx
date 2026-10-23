import { useState, useEffect, useMemo } from 'react';
import {
    Calendar, RefreshCcw, Search, Clock, ArrowUpRight, Wallet, Banknote,
    ListChecks, Download, AlertCircle, Loader2, ChevronLeft, ChevronRight,
    ArrowRight, Plus, Pencil, Trash2, LogIn, Activity, SearchX, X, SlidersHorizontal,
} from 'lucide-react';
import SmartDateInput from '../components/SmartDateInput';
import { toast } from 'react-toastify';
import { parse, format, isValid } from 'date-fns';
import { useAuditoria } from '../hooks/useAuditoria';
import {
    fmt, formatLogDate, badgeClass, humanizarAccion, accionCategoria, extraerCambio,
} from '../utils/auditoria.utils';
import { nombreUsuario, inicialesUsuario } from '../utils/nombreUsuario';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Tabla } from '../components/ui/Tabla';

function parseISODate(str) {
    if (!str) return null;
    const parsed = parse(str, 'yyyy-MM-dd', new Date());
    return isValid(parsed) ? parsed : null;
}

const PAGE_SIZE = 25;

const AUDITORIA_COLUMNAS = [
    { key: 'fecha_hora', label: 'Fecha y hora' },
    { key: 'usuario', label: 'Usuario' },
    { key: 'accion', label: 'Acción' },
    { key: 'detalles', label: 'Detalles' },
];

const MODULOS = [
    { value: 'TODOS', label: 'Todos los módulos' },
    { value: 'COBRANZA', label: 'Cobranza' },
    { value: 'SECRETARIA', label: 'Secretaría' },
    { value: 'SEGURIDAD', label: 'Seguridad' },
    { value: 'FINANZAS', label: 'Finanzas' },
];

const CAMPO_CLASS =
    'w-full min-h-[44px] sm:min-h-[40px] px-3 rounded-xl text-base sm:text-sm outline-none transition-shadow focus:ring-2 focus:ring-[var(--pb)]/30';
const CAMPO_STYLE = { border: '1px solid var(--border-md)', background: '#fff', color: 'var(--jet)' };

// ─── Badge de acción ──────────────────────────────────────────────────────────

const ICONO_ACCION = {
    alta: Plus,
    baja: Trash2,
    sesion: LogIn,
    cambio: Pencil,
    otro: Activity,
};

const AccionBadge = ({ accion }) => {
    const Icon = ICONO_ACCION[accionCategoria(accion)];
    return (
        <span
            title={accion || ''}
            className={`inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded-lg border text-[11px] font-semibold ${badgeClass(accion)}`}
        >
            <Icon size={11} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{humanizarAccion(accion)}</span>
        </span>
    );
};

// ─── DetallesLog ──────────────────────────────────────────────────────────────

// Un array "plano" (ids, strings) se listea con join(); un array de objetos
// (p.ej. `alumnos: [{alumno_id, nombre, ...}]`) necesita su propio bloque
// anidado — join() en un array de objetos produce "[object Object]".
const esArrayDeObjetos = (v) => Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null;
const esArrayPlano = (v) => Array.isArray(v) && !esArrayDeObjetos(v);
const esObjetoAnidado = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const vacio = (v) => v === null || v === undefined || v === '';
const etiqueta = (k) => String(k).replace(/_/g, ' ');

const textoValor = (v) => {
    if (vacio(v)) return '—';
    if (typeof v === 'boolean') return v ? 'Sí' : 'No';
    if (esArrayPlano(v)) return v.length > 0 ? v.join(', ') : '—';
    if (typeof v === 'object') {
        try { return JSON.stringify(v); } catch { return String(v); }
    }
    return String(v);
};

const CampoDetalle = ({ label, value }) => (
    <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-1.5 min-w-0">
        <span className="font-medium capitalize shrink-0 text-[11px] sm:text-xs" style={{ color: 'var(--ash)' }}>
            {etiqueta(label)}
        </span>
        <span className="break-words min-w-0 text-xs" style={{ color: 'var(--jet)' }}>
            {textoValor(value)}
        </span>
    </div>
);

const BloqueObjeto = ({ obj }) => {
    const campos = Object.entries(obj).filter(([, v]) => !vacio(v));
    return (
        <div className="space-y-1">
            {campos.map(([k, v]) => (
                esObjetoAnidado(v) || esArrayDeObjetos(v)
                    ? (
                        <div key={k}>
                            <span className="font-medium capitalize text-[11px] sm:text-xs" style={{ color: 'var(--ash)' }}>
                                {etiqueta(k)}
                            </span>
                            <div className="mt-0.5 pl-2 space-y-1" style={{ borderLeft: '2px solid var(--border-md)' }}>
                                {esArrayDeObjetos(v)
                                    ? v.map((item, i) => <BloqueObjeto key={i} obj={item} />)
                                    : <BloqueObjeto obj={v} />}
                            </div>
                        </div>
                    )
                    : <CampoDetalle key={k} label={k} value={v} />
            ))}
        </div>
    );
};

// Antes → Después. Si ambos lados son objetos se comparan campo a campo y solo
// se muestran los que cambiaron; si son valores simples se muestran en un par.
const CambiosDiff = ({ antes, despues }) => {
    const ambosObjeto = esObjetoAnidado(antes ?? {}) && esObjetoAnidado(despues ?? {});

    if (!ambosObjeto) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-stretch gap-1.5 sm:gap-2">
                <ValorLado tipo="antes" valor={antes} />
                <ArrowRight size={14} className="self-center justify-self-center rotate-90 sm:rotate-0" style={{ color: 'var(--ash)' }} aria-hidden="true" />
                <ValorLado tipo="despues" valor={despues} />
            </div>
        );
    }

    const a = antes ?? {};
    const d = despues ?? {};
    const claves = [...new Set([...Object.keys(a), ...Object.keys(d)])];
    const cambiadas = claves.filter(k => textoValor(a[k]) !== textoValor(d[k]));
    const iguales = claves.length - cambiadas.length;

    if (cambiadas.length === 0) {
        return <span className="text-xs italic" style={{ color: 'var(--ash)' }}>Sin cambios en los valores.</span>;
    }

    return (
        <div className="space-y-2">
            {cambiadas.map(k => (
                <div key={k} className="space-y-1">
                    <span className="font-medium capitalize text-[11px] sm:text-xs" style={{ color: 'var(--ash)' }}>
                        {etiqueta(k)}
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-stretch gap-1.5 sm:gap-2">
                        <ValorLado tipo="antes" valor={a[k]} />
                        <ArrowRight size={14} className="self-center justify-self-center rotate-90 sm:rotate-0" style={{ color: 'var(--ash)' }} aria-hidden="true" />
                        <ValorLado tipo="despues" valor={d[k]} />
                    </div>
                </div>
            ))}
            {iguales > 0 && (
                <p className="text-[11px]" style={{ color: 'var(--ash)' }}>
                    {iguales} {iguales === 1 ? 'campo sin cambios' : 'campos sin cambios'}
                </p>
            )}
        </div>
    );
};

const ValorLado = ({ tipo, valor }) => {
    const esAntes = tipo === 'antes';
    return (
        <div
            className="rounded-lg px-2 py-1.5 min-w-0"
            style={{
                background: esAntes ? '#fef2f2' : '#f0fdf4',
                border: `1px solid ${esAntes ? '#fecaca' : '#bbf7d0'}`,
            }}
        >
            <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: esAntes ? '#b91c1c' : '#15803d' }}>
                {esAntes ? 'Antes' : 'Después'}
            </p>
            <p className={`text-xs break-words ${esAntes ? 'line-through decoration-red-300' : ''}`} style={{ color: 'var(--jet)' }}>
                {textoValor(valor)}
            </p>
        </div>
    );
};

const DetallesLog = ({ detalles }) => {
    if (!detalles) return <span className="text-xs italic" style={{ color: 'var(--ash)' }}>Sin detalles</span>;
    if (typeof detalles === 'string') return <span className="text-xs break-words" style={{ color: 'var(--jet)' }}>{detalles}</span>;
    if (typeof detalles !== 'object') return <span className="text-xs" style={{ color: 'var(--jet)' }}>{String(detalles)}</span>;

    const cambio = extraerCambio(detalles);
    const base = cambio ? cambio.resto : detalles;

    const entradas = Object.entries(base).filter(([, v]) => !vacio(v));
    const simples  = entradas.filter(([, v]) => !esObjetoAnidado(v) && !esArrayDeObjetos(v));
    const anidados = entradas.filter(([, v]) => esObjetoAnidado(v) || esArrayDeObjetos(v));

    if (!cambio && entradas.length === 0) {
        return <span className="text-xs italic" style={{ color: 'var(--ash)' }}>Sin detalles</span>;
    }

    return (
        <div className="space-y-2 min-w-0">
            {simples.length > 0 && (
                <div className="space-y-1">
                    {simples.map(([k, v]) => <CampoDetalle key={k} label={k} value={v} />)}
                </div>
            )}
            {cambio && <CambiosDiff antes={cambio.antes} despues={cambio.despues} />}
            {anidados.map(([k, v]) => (
                <div key={k}>
                    <span className="font-medium capitalize text-[11px] sm:text-xs" style={{ color: 'var(--ash)' }}>
                        {etiqueta(k)}
                    </span>
                    <div className="mt-1 pl-2 space-y-1.5" style={{ borderLeft: '2px solid var(--border-md)' }}>
                        {esArrayDeObjetos(v)
                            ? v.map((item, i) => (
                                <div
                                    key={i}
                                    className={i < v.length - 1 ? 'pb-1.5' : ''}
                                    style={{ borderBottom: i < v.length - 1 ? '1px dashed var(--border-md)' : 'none' }}
                                >
                                    <BloqueObjeto obj={item} />
                                </div>
                            ))
                            : <BloqueObjeto obj={v} />}
                    </div>
                </div>
            ))}
        </div>
    );
};

// ─── Usuario ──────────────────────────────────────────────────────────────────

const UsuarioChip = ({ usuario }) => (
    <div className="flex items-center gap-2 min-w-0">
        <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
            style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}
            aria-hidden="true"
        >
            {usuario ? inicialesUsuario(usuario) : 'S'}
        </div>
        <span className="text-xs font-medium truncate" style={{ color: 'var(--jet)' }}>
            {usuario ? nombreUsuario(usuario) : 'SISTEMA'}
        </span>
    </div>
);

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const Bloque = ({ className = '', style }) => (
    <div className={`rounded-xl ${className}`} style={{ background: 'var(--ash-light)', ...style }} />
);

const AuditoriaSkeleton = () => (
    <div className="space-y-4 animate-pulse" role="status" aria-label="Cargando auditoría">
        <div className="space-y-2">
            <Bloque className="h-7 w-40" />
            <Bloque className="h-4 w-64 max-w-full" />
        </div>
        <Bloque className="h-28 w-full" style={{ border: '1px solid var(--border)' }} />
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
                <Bloque key={i} className="h-24" style={{ border: '1px solid var(--border)' }} />
            ))}
        </div>
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <Bloque className="h-14 rounded-none" />
            <div className="p-3 sm:p-4 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Bloque key={i} className="h-16 sm:h-12" />
                ))}
            </div>
        </div>
    </div>
);

// ─── KPIs ─────────────────────────────────────────────────────────────────────

const KPI_CONFIG = [
    { key: 'total_usd',         label: 'Ingreso USD',  cur: 'USD', icon: ArrowUpRight, color: '#15803d',     bg: '#dcfce7' },
    { key: 'efectivo_usd',      label: 'Efectivo USD', cur: 'USD', icon: Wallet,       color: 'var(--jet)',  bg: 'var(--ash-light)' },
    { key: 'transferencia_ves', label: 'Total VES',    cur: 'VES', icon: Banknote,     color: 'var(--pb)',   bg: 'var(--pb-light)' },
    { key: 'conteo_pagos',      label: 'Pagos',        cur: null,  icon: ListChecks,   color: 'var(--jet)',  bg: 'var(--porcelain)' },
];

const AuditoriaKPIs = ({ reporte, refreshing }) => (
    <div
        className={`grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-4 sm:mb-6 transition-opacity ${refreshing ? 'opacity-60' : ''}`}
        aria-busy={refreshing}
    >
        {KPI_CONFIG.map(({ key, label, cur, icon: Icon, color, bg }) => (
            <Card key={key} className="min-w-0">
                <div className="flex items-center gap-2 mb-2 sm:mb-3">
                    <div className="p-1.5 rounded-xl shrink-0" style={{ background: bg, color }}>
                        <Icon size={16} aria-hidden="true" />
                    </div>
                    <p className="text-[10px] sm:text-[11px] uppercase tracking-wider leading-tight min-w-0" style={{ color: 'var(--ash)' }}>
                        {label}
                    </p>
                </div>
                <p
                    className="text-lg sm:text-xl font-bold tabular-nums truncate"
                    style={{ color }}
                    title={cur ? fmt(reporte?.[key], cur) : String(reporte?.[key] ?? 0)}
                >
                    {cur ? fmt(reporte?.[key], cur) : (reporte?.[key] ?? 0)}
                </p>
            </Card>
        ))}
    </div>
);

// ─── Filtros ──────────────────────────────────────────────────────────────────

const EtiquetaCampo = ({ children, htmlFor }) => (
    <label htmlFor={htmlFor} className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--ash)' }}>
        {children}
    </label>
);

const AuditoriaFiltros = ({
    fechaInicioDate, fechaFinDate, setFechaInicio, setFechaFin,
    searchInput, setSearchInput, filtroModulo, setFiltroModulo,
    hayFiltros, onLimpiar,
}) => (
    <Card className="mb-4 sm:mb-6">
        <div className="flex items-center gap-2 mb-3">
            <SlidersHorizontal size={15} style={{ color: 'var(--pb)' }} aria-hidden="true" />
            <h2 className="text-sm" style={{ color: 'var(--jet)', fontWeight: 'var(--fw-semibold)' }}>Filtros</h2>
            {hayFiltros && (
                <button
                    type="button"
                    onClick={onLimpiar}
                    className="ml-auto inline-flex items-center gap-1 px-2.5 min-h-[36px] rounded-lg text-xs font-medium transition-colors hover:bg-[var(--ash-light)]"
                    style={{ color: 'var(--ash)' }}
                >
                    <X size={13} aria-hidden="true" />
                    Limpiar
                </button>
            )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)] gap-3">
            <div className="flex flex-col gap-1 min-w-0">
                <EtiquetaCampo htmlFor="aud-desde">Desde</EtiquetaCampo>
                <SmartDateInput
                    id="aud-desde"
                    value={fechaInicioDate}
                    onChange={date => setFechaInicio(date ? format(date, 'yyyy-MM-dd') : '')}
                    className={CAMPO_CLASS}
                    style={CAMPO_STYLE}
                    aria-label="Fecha de inicio"
                />
            </div>
            <div className="flex flex-col gap-1 min-w-0">
                <EtiquetaCampo htmlFor="aud-hasta">Hasta</EtiquetaCampo>
                <SmartDateInput
                    id="aud-hasta"
                    value={fechaFinDate}
                    onChange={date => setFechaFin(date ? format(date, 'yyyy-MM-dd') : '')}
                    className={CAMPO_CLASS}
                    style={CAMPO_STYLE}
                    aria-label="Fecha de fin"
                />
            </div>
            <div className="flex flex-col gap-1 min-w-0 col-span-2 lg:col-span-1">
                <EtiquetaCampo htmlFor="aud-modulo">Módulo</EtiquetaCampo>
                <select
                    id="aud-modulo"
                    value={filtroModulo}
                    onChange={e => setFiltroModulo(e.target.value)}
                    className={`${CAMPO_CLASS} cursor-pointer`}
                    style={CAMPO_STYLE}
                >
                    {MODULOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
            </div>
            <div className="flex flex-col gap-1 min-w-0 col-span-2 lg:col-span-1">
                <EtiquetaCampo htmlFor="aud-buscar">Buscar</EtiquetaCampo>
                <div className="relative">
                    <Search
                        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: 'var(--ash)' }}
                        size={15}
                        aria-hidden="true"
                    />
                    <input
                        id="aud-buscar"
                        type="search"
                        placeholder="Usuario, acción o detalle…"
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                        className={`${CAMPO_CLASS} pl-9`}
                        style={CAMPO_STYLE}
                    />
                </div>
            </div>
        </div>
    </Card>
);

// ─── Lista de eventos ─────────────────────────────────────────────────────────

const EventoCard = ({ log }) => (
    <li
        className="rounded-xl p-3 space-y-2.5"
        style={{ background: '#fff', border: '1px solid var(--border)' }}
    >
        <div className="flex items-start justify-between gap-2">
            <AccionBadge accion={log.accion} />
            <span className="inline-flex items-center gap-1 text-[11px] font-mono whitespace-nowrap shrink-0" style={{ color: 'var(--ash)' }}>
                <Clock size={11} aria-hidden="true" />
                {formatLogDate(log.fecha_hora || log.fecha)}
            </span>
        </div>
        <UsuarioChip usuario={log.usuario} />
        <div className="pt-2.5" style={{ borderTop: '1px dashed var(--border-md)' }}>
            <DetallesLog detalles={log.detalles} />
        </div>
    </li>
);

const EstadoVacio = ({ hayFiltros, onLimpiar }) => (
    <div className="py-12 sm:py-16 px-4 flex flex-col items-center text-center gap-3">
        <div className="p-3 rounded-2xl" style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}>
            <SearchX size={26} aria-hidden="true" />
        </div>
        <div>
            <p className="text-sm" style={{ color: 'var(--jet)', fontWeight: 'var(--fw-semibold)' }}>
                {hayFiltros ? 'Ningún registro coincide con los filtros' : 'Sin actividad en este período'}
            </p>
            <p className="text-xs mt-1 max-w-xs" style={{ color: 'var(--ash)' }}>
                {hayFiltros
                    ? 'Prueba con otro rango de fechas, otro módulo o una búsqueda distinta.'
                    : 'Amplía el rango de fechas para ver operaciones anteriores.'}
            </p>
        </div>
        {hayFiltros && (
            <button
                type="button"
                onClick={onLimpiar}
                className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-xl text-sm font-medium w-full sm:w-auto"
                style={{ border: '1px solid var(--border-md)', color: 'var(--jet)' }}
            >
                <X size={14} aria-hidden="true" />
                Limpiar búsqueda y módulo
            </button>
        )}
    </div>
);

const Paginacion = ({ currentPage, totalPages, totalLogs, setCurrentPage }) => {
    const desde = (currentPage - 1) * PAGE_SIZE + 1;
    const hasta = Math.min(currentPage * PAGE_SIZE, totalLogs);
    const btn = 'inline-flex items-center justify-center gap-1 min-h-[44px] px-3 rounded-xl text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors enabled:hover:bg-[var(--ash-light)]';
    return (
        <nav
            aria-label="Paginación del historial"
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3 sm:px-4 py-3"
            style={{ borderTop: '1px solid var(--border)', background: 'var(--porcelain)' }}
        >
            <span className="text-xs text-center sm:text-left" style={{ color: 'var(--ash)' }}>
                Mostrando <strong style={{ color: 'var(--jet)' }}>{desde}–{hasta}</strong> de {totalLogs} registros
            </span>
            <div className="grid grid-cols-[1fr_auto_1fr] sm:flex items-center gap-1">
                <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    aria-label="Página anterior"
                    className={btn}
                    style={{ border: '1px solid var(--border-md)', color: 'var(--jet)' }}
                >
                    <ChevronLeft size={16} aria-hidden="true" />
                    <span>Anterior</span>
                </button>
                <span className="px-3 text-xs tabular-nums text-center" style={{ color: 'var(--ash)' }} aria-live="polite">
                    {currentPage} / {totalPages}
                </span>
                <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    aria-label="Página siguiente"
                    className={btn}
                    style={{ border: '1px solid var(--border-md)', color: 'var(--jet)' }}
                >
                    <span>Siguiente</span>
                    <ChevronRight size={16} aria-hidden="true" />
                </button>
            </div>
        </nav>
    );
};

const AuditoriaLista = ({
    logs, totalLogs, totalPages, currentPage, setCurrentPage,
    refreshing, hayFiltros, onLimpiar,
}) => (
    <Card padding="none" className="overflow-hidden">
        <div
            className="px-3 sm:px-4 py-3 flex items-center gap-2"
            style={{ background: 'var(--porcelain)', borderBottom: '1px solid var(--border)' }}
        >
            <Calendar size={16} style={{ color: 'var(--pb)' }} aria-hidden="true" />
            <h2 className="text-sm" style={{ color: 'var(--jet)', fontWeight: 'var(--fw-semibold)' }}>
                Historial de operaciones
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full tabular-nums" style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}>
                {totalLogs}
            </span>
            {refreshing && <Loader2 size={14} className="animate-spin ml-auto" style={{ color: 'var(--ash)' }} aria-label="Actualizando" />}
        </div>

        {logs.length === 0 ? (
            <EstadoVacio hayFiltros={hayFiltros} onLimpiar={onLimpiar} />
        ) : (
            <div className={`transition-opacity ${refreshing ? 'opacity-60' : ''}`} aria-busy={refreshing}>
                {/* Móvil y tablet angosta: tarjetas */}
                <ul className="md:hidden p-3 space-y-2.5" style={{ background: 'var(--surface-sunken)' }}>
                    {logs.map(log => <EventoCard key={log.id} log={log} />)}
                </ul>

                {/* md en adelante: tabla con scroll contenido */}
                <div className="hidden md:block">
                    <Tabla columnas={AUDITORIA_COLUMNAS} minWidth={720}>
                        {logs.map(log => (
                            <tr key={log.id} className="align-top">
                                <td className="px-4 py-3 font-mono text-xs whitespace-nowrap" style={{ color: 'var(--ash)' }}>
                                    <div className="flex items-center gap-1.5">
                                        <Clock size={12} aria-hidden="true" />
                                        {formatLogDate(log.fecha_hora || log.fecha)}
                                    </div>
                                </td>
                                <td className="px-4 py-3"><UsuarioChip usuario={log.usuario} /></td>
                                <td className="px-4 py-3"><AccionBadge accion={log.accion} /></td>
                                <td className="px-4 py-3 w-full max-w-md"><DetallesLog detalles={log.detalles} /></td>
                            </tr>
                        ))}
                    </Tabla>
                </div>
            </div>
        )}

        {totalPages > 1 && (
            <Paginacion
                currentPage={currentPage}
                totalPages={totalPages}
                totalLogs={totalLogs}
                setCurrentPage={setCurrentPage}
            />
        )}
    </Card>
);

// ─── Página principal ──────────────────────────────────────────────────────────

const Auditoria = () => {
    const today = (() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    })();
    const [fechaInicio, setFechaInicio] = useState(today);
    const [fechaFin, setFechaFin]       = useState(today);
    const [filtroModulo, setFiltroModulo] = useState('TODOS');
    const [currentPage, setCurrentPage] = useState(1);
    const [searchInput, setSearchInput] = useState('');
    const [busqueda, setBusqueda]       = useState('');

    const fechaInicioDate = useMemo(() => parseISODate(fechaInicio), [fechaInicio]);
    const fechaFinDate    = useMemo(() => parseISODate(fechaFin), [fechaFin]);

    // Debounce del texto de búsqueda antes de pedirlo al backend
    useEffect(() => {
        const id = setTimeout(() => setBusqueda(searchInput.trim()), 350);
        return () => clearTimeout(id);
    }, [searchInput]);

    // Volver a la página 1 cuando cambian los filtros que afectan el resultado
    useEffect(() => {
        setCurrentPage(1);
    }, [fechaInicio, fechaFin, filtroModulo, busqueda]);

    const {
        loading, refreshing, exporting, exportingPagos, reporte, logs,
        totalLogs, totalPages, error,
        refetch, exportarExcel, exportarPagosExcel,
    } = useAuditoria(fechaInicio, fechaFin, filtroModulo, currentPage, busqueda);

    const hayFiltros = filtroModulo !== 'TODOS' || searchInput.trim() !== '';
    const limpiarFiltros = () => {
        setSearchInput('');
        setBusqueda('');
        setFiltroModulo('TODOS');
    };

    const handleRefresh = () => {
        if (fechaFin < fechaInicio) {
            toast.warn('La fecha final no puede ser anterior a la fecha de inicio.');
            return;
        }
        refetch(true);
    };

    if (loading) return <AuditoriaSkeleton />;

    const btnBase = 'inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[44px] sm:min-h-[40px] rounded-xl text-sm font-medium transition-colors w-full sm:w-auto disabled:opacity-50';

    return (
        <div className="anim-fade-up min-w-0">

            <PageHeader
                titulo="Auditoría"
                descripcion="Control de ingresos y actividad del sistema."
                acciones={
                    <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                        <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className={`${btnBase} hover:bg-[var(--ash-light)]`}
                            style={{ border: '1px solid var(--border-md)', color: 'var(--jet)' }}
                        >
                            <RefreshCcw size={14} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
                            {refreshing ? 'Actualizando…' : 'Recargar'}
                        </button>
                        <button
                            type="button"
                            onClick={exportarPagosExcel}
                            disabled={exportingPagos}
                            className={`${btnBase} hover:bg-[var(--ash-light)]`}
                            style={{ border: '1px solid var(--border-md)', color: 'var(--jet)' }}
                        >
                            {exportingPagos ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
                            Exportar pagos
                        </button>
                        <button
                            type="button"
                            onClick={exportarExcel}
                            disabled={exporting}
                            className={`${btnBase} text-white hover:opacity-90`}
                            style={{ background: 'var(--jet)' }}
                        >
                            {exporting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
                            Exportar Excel
                        </button>
                    </div>
                }
            />

            {/* Error banner */}
            {error && (
                <div
                    role="alert"
                    className="mb-4 flex items-start gap-2 p-3 rounded-xl text-sm"
                    style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}
                >
                    <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="min-w-0 break-words">{error}</span>
                </div>
            )}

            <AuditoriaFiltros
                fechaInicioDate={fechaInicioDate}
                fechaFinDate={fechaFinDate}
                setFechaInicio={setFechaInicio}
                setFechaFin={setFechaFin}
                searchInput={searchInput}
                setSearchInput={setSearchInput}
                filtroModulo={filtroModulo}
                setFiltroModulo={setFiltroModulo}
                hayFiltros={hayFiltros}
                onLimpiar={limpiarFiltros}
            />

            <AuditoriaKPIs reporte={reporte} refreshing={refreshing} />

            <AuditoriaLista
                logs={logs}
                totalLogs={totalLogs}
                totalPages={totalPages}
                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
                refreshing={refreshing}
                hayFiltros={hayFiltros}
                onLimpiar={limpiarFiltros}
            />
        </div>
    );
};

export default Auditoria;
