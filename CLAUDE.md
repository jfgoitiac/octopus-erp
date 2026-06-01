# CONTEXTO DEL PROYECTO
Software SaaS de gestión escolar para colegios privados en Latinoamérica.
El sistema actual maneja: inscripciones, facturación, cobros y reportes básicos en PDF.

## Stack Frontend (existente — no cambiar sin consultarme):
- React 19 + Vite 8
- react-router-dom v7 (routing)
- Tailwind CSS v4 (estilos)
- Axios (HTTP client)
- lucide-react (íconos)
- react-toastify (notificaciones)
- jsPDF + jspdf-autotable (generación de PDFs)
- xlsx (exportación Excel)
- date-fns + react-datepicker (manejo de fechas)
- jwt-decode (auth local)

## Preguntas que debes hacerme antes de empezar:
1. ¿Cuál es el stack del backend/API? (necesito saberlo para las rutas, modelos y jobs)
2. ¿Dónde vive el estado global hoy? (Context API, Zustand, Redux, etc.)
3. ¿Existe ya un sistema de rutas protegidas por rol? ¿Cómo están estructurados los roles actuales?
4. ¿Hay variables de entorno (.env) ya configuradas para la API base URL y JWT secret?

---

# FASE 1 — PORTAL DE REPRESENTANTES (prioridad máxima)

## Plan antes de codificar
Antes de escribir una sola línea de código, preséntame:
- Árbol de carpetas y archivos nuevos a crear
- Nuevas rutas en react-router-dom v7 (con lazy loading si aplica)
- Componentes nuevos y cuáles existentes reutilizar
- Decisiones de arquitectura (manejo de estado, autenticación separada)
- Cambios necesarios en el backend/BD
Espera mi aprobación antes de continuar.

## Requerimientos funcionales:

### 1. Autenticación separada para representantes
- Login propio en ruta `/portal` con cédula/email + contraseña
- JWT distinto al del panel administrativo — decodificar con jwt-decode
- Rutas protegidas: si no está autenticado, redirigir a `/portal/login`
- Guardar token en localStorage con clave `portal_token` (separado del admin)

### 2. Dashboard del representante
Página principal del portal mostrando:
- Saldo actual y deuda pendiente (resaltado en rojo si hay mora)
- Lista de facturas vencidas con días de atraso
- Próximos vencimientos (usar date-fns para calcular y formatear fechas)
- Historial de pagos paginado con fecha, monto y estado
- Si tiene varios hijos en el colegio: tabs o selector para cambiar entre estudiantes

### 3. Pago online
- Integrar Stripe Checkout (redirect a hosted page de Stripe)
- Al retornar, webhook del backend actualiza el estado de la factura
- Alternativa manual: botón "Pagar por transferencia" que abre un modal con datos bancarios + uploader de comprobante (imagen o PDF)
- Mostrar estado del comprobante: Pendiente / Aprobado / Rechazado
- Usar react-toastify para confirmar acciones al usuario

### 4. Notificaciones automáticas de cobranza (backend)
Implementar en el backend el siguiente flujo automático por cada factura impaga:
- Día 0: email al generar la factura
- Día 5: recordatorio por email al representante
- Día 10: segundo aviso por email
- Día 15: alerta al director del colegio
Dejar el código preparado con comentarios para conectar WhatsApp 
(Twilio o Meta Business API) en el futuro — sin implementarlo aún.

### 5. Diseño y UX
- Mobile-first obligatorio — el representante abre esto desde su celular
- Usar Tailwind CSS v4 con los colores del colegio (leer desde perfil del colegio en la API)
- Íconos de lucide-react consistentes con el resto del sistema
- Skeleton loaders mientras cargan los datos (no spinners genéricos)
- Manejo de errores con react-toastify en todas las llamadas Axios

## Entregables de la Fase 1:
- [ ] Módulo `/portal` completo con rutas protegidas en react-router-dom v7
- [ ] Componentes de autenticación separada para representantes
- [ ] Dashboard con estado financiero del estudiante
- [ ] Flujo de pago Stripe end-to-end (frontend + instrucciones backend)
- [ ] Uploader de comprobante con preview
- [ ] Jobs de recordatorio automático en el backend
- [ ] Archivo `NOTAS_TECNICAS.md` con deuda técnica detectada (solo anotar, no implementar)

---

# FASE 2 — MÓDULO ACADÉMICO (después de aprobar Fase 1)
- Registro de notas por materia y lapso
- Boletines en PDF automáticos usando jsPDF + jspdf-autotable (ya en el stack)
- Control de asistencia diaria con react-datepicker para filtros
- Horarios de clases por grado

---

# FASE 3 — MULTI-SEDE (después de aprobar Fase 2)
- Un directivo gestiona varios planteles desde una cuenta
- Dashboard consolidado con métricas por sede
- Permisos granulares por sede

---

# REGLAS DE TRABAJO
- No cambies librerías del stack sin consultarme — si necesitas algo nuevo, propónlo primero
- Commitea en pasos pequeños y lógicos con mensajes descriptivos en español
- Si encuentras deuda técnica o código mejorable, anótalo en NOTAS_TECNICAS.md sin tocarlo
- Usa los patrones que ya existen en el proyecto (revisa primero cómo están hechos otros módulos)
- Toda fecha visible al usuario debe formatearse con date-fns en español (es locale)