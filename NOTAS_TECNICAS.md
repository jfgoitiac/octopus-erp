# NOTAS TÉCNICAS — OCTOPUS FRONTEND

Deuda técnica detectada durante auditorías y refactorings.

## MÓDULO COBRANZA

### 🔴 CRÍTICO

1. **Componente Monolítico (1100+ líneas)** — ✅ RESUELTO
   - Cobranza.jsx reducido a ~470 líneas (solo orquestación/lógica)
   - CobranzaStep1.jsx, CobranzaStep2.jsx, ResumenPago.jsx extraídos e integrados

2. **Manejo de Estado Fragmentado** — ⏳ PENDIENTE
   - 12+ useState calls, cascadas de re-renders (11 setXxx en serie tras registrar pago)
   - Solución propuesta: `useReducer` para agrupar transiciones de reset/selección
   - No implementado: cambio de mayor riesgo, requiere pruebas de regresión más profundas

### 🟡 MEDIO

3. ✅ Sticky sidebar sin max-height — corregido (`maxHeight: calc(100vh - 82px)` + scroll)
4. ✅ Grid 3 columnas se comprime en 360px — corregido (`grid-cols-2 sm:grid-cols-3`)
5. ✅ Validación de tasa BCV — ya estaba guardada con `tasa > 0` en todos los puntos de división
6. ✅ Errores genéricos en catch — mensaje específico para error de red sin respuesta
7. ✅ Búsqueda sin feedback visual completo — borde azul en input mientras `loadingBusqueda`

### 🟢 MENOR

8. ✅ Duplicación de fmt/fmtN/fmtZ — centralizado en `utils/formato.js`
9. ⏳ Sin skeleton loaders en Step 1 — pendiente (spinner simple es aceptable por ahora)
10. ⏳ Casos edge sin testing — pendiente (no hay suite de tests en el proyecto)

## FASE 2 — SMARTDATEINPUT ✅

Componente SmartDateInput.jsx con máscara, autocorrección, validación.
Lint limpio, patrón de sincronización de estado corregido (sin `useEffect`+`setState`).

Aplicar a otros módulos (pendiente, fuera de alcance de esta auditoría):
Auditoria, Inscripciones, Boletín, Asistencia

## CHECKLIST

✅ DecimalInput extraído
✅ maxForLine memoizado
✅ aria-label agregado
✅ construirItemsRecibo helper
✅ Componentes de pasos extraídos e integrados en Cobranza.jsx
✅ Correcciones responsive (grid móvil, sticky sidebar)
✅ Centralizar formato (fmt/fmtN/fmtZ)
✅ Build y lint verificados sin errores nuevos
⏳ Hooks personalizados (useCobranzaBusqueda, useCobranzaPago) — no implementado
⏳ useReducer para estado fragmentado — no implementado
⏳ Verificación en navegador — no realizada (requiere backend + datos de prueba)

**Nota de verificación**: Esta refactorización solo reorganiza JSX/lógica existente
en componentes; no cambia comportamiento. Validado con `eslint` y `vite build`
exitosos. No se ejecutó prueba end-to-end en navegador por falta de backend
corriendo con datos de prueba en este entorno.

Actualización: 2026-07-02
