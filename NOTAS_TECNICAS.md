# NOTAS TÉCNICAS — OCTOPUS FRONTEND

Deuda técnica detectada durante auditorías y refactorings.

## MÓDULO COBRANZA

### 🔴 CRÍTICO

1. **Componente Monolítico (1100+ líneas)**
   - Lógica Step 1 y Step 2 mezclada
   - ✅ Solución en progreso: CobranzaStep1, CobranzaStep2, ResumenPago extraídos

2. **Manejo de Estado Fragmentado**
   - 12+ useState calls, cascadas de re-renders
   - Solución: useReducer para transiciones

### 🟡 MEDIO

3. Sticky sidebar sin max-height (móvil pequeño)
4. Grid 3 columnas se comprime en 360px
5. Falta validación de tasa BCV (división por cero)
6. Errores genéricos en catch
7. Búsqueda sin feedback visual completo

### 🟢 MENOR

8. Duplicación de fmt/fmtN/fmtZ - centralizar en utils/formato.js
9. Sin skeleton loaders en Step 1
10. Casos edge sin testing

## FASE 2 — SMARTDATEINPUT ✅ 

Componente SmartDateInput.jsx con máscara, autocorrección, validación.

Aplicar a: Auditoria, Inscripciones, Boletín, Asistencia

## CHECKLIST

✅ DecimalInput extraído
✅ maxForLine memoizado
✅ aria-label agregado
✅ construirItemsRecibo helper
✅ Componentes de pasos extraídos
⏳ Actualizar Cobranza.jsx
⏳ Hooks personalizados
⏳ Centralizar formato

Actualización: 2026-07-02
