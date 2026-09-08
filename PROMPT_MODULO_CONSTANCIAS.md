# TAREA — Módulo de Constancias parametrizables (Octopus)
## Ejecución multiagente, por fases escalonadas

Ejecuta EXACTAMENTE lo que está en este documento. No agregues funcionalidad no
listada, no refactorices código ajeno al alcance, no propongas alternativas.
Si algo del documento choca con el código real, DETENTE y repórtalo antes de
seguir; no lo resuelvas por tu cuenta.

---

# PARTE I — CÓMO SE EJECUTA ESTE DOCUMENTO

## O.1 Roles

- **Orquestador** = la sesión principal. No escribe código de producción. Lee
  este documento, abre cada fase, lanza los agentes, valida las compuertas
  (§O.4) y commitea. Es el único que habla con el usuario.
- **Agentes** = subagentes lanzados por el orquestador. Cada uno recibe su
  bloque de fase **completo y autocontenido**: un agente nunca lee este
  documento entero ni asume contexto de otro agente.

## O.2 Las dos restricciones que mandan sobre el paralelismo

1. **Nada se paraleliza antes de congelar el contrato.** Modelo de datos y
   forma exacta de cada endpoint se cierran en la Fase 1, por un solo agente.
   Cuatro agentes trabajando contra un contrato que todavía se mueve producen
   cuatro integraciones incompatibles.
2. **Las migraciones son de un solo dueño, siempre.** Solo el agente 2A crea
   migraciones. Si un agente de otra fase necesita un campo nuevo, **se detiene
   y lo reporta al orquestador**; no corre `makemigrations`. Dos cabezas de
   migración rompen el `migrate` de todos los que vengan detrás.

## O.3 Reglas de paralelismo (obligatorias para todo agente)

- **Propiedad exclusiva de archivos.** Cada agente es dueño de las rutas que su
  bloque le asigna y **no escribe una sola línea fuera de ellas**. Si necesita
  un cambio en territorio ajeno, se detiene y lo reporta.
- **Archivos compartidos: solo el orquestador.** Router raíz, `urls.py` raíz,
  `settings.py`, menú lateral y cualquier índice de exportaciones los toca
  únicamente el orquestador, en la compuerta de cierre de fase. Los agentes
  entregan el componente o la vista; no la enchufan.
- **Contrato congelado.** Ningún agente de la Fase 2 en adelante modifica el
  contrato de la Fase 1. Si el contrato está mal, se detiene y lo reporta: se
  corrige en un punto y se reparte de nuevo, no se parchea en paralelo.
- **Stubs antes que dependencias.** El frontend trabaja contra respuestas de
  ejemplo del contrato, no contra el backend real. Nadie espera a nadie.
- **Un commit por agente**, mensaje en español, alcance limitado a sus archivos.
- Cada agente entrega: qué archivos tocó, qué verificó, y qué encontró que no
  estaba previsto.

## O.4 Compuertas entre fases

Una fase **no empieza** hasta que la anterior pasa su compuerta. El orquestador
la valida; ante duda, detiene y consulta al usuario.

| Fase | Agentes | Paralelo | Compuerta de salida |
|---|---|---|---|
| 0 — Decisiones | 1 | no | Usuario aprueba D1–D4 por escrito |
| 1 — Contrato | 1 | no | Contrato y modelo de datos aprobados por el usuario |
| 2 — Construcción | 4 | **sí** | `npm run build` verde + tests del motor verdes |
| 3 — Integración | 2 | parcial | Flujo emitir→PDF funciona de punta a punta |
| 4 — Controles | 2 | **sí** | Tests de permisos y correlativo verdes |
| 5 — Cierre | 1 | no | Entrega al usuario para verificación visual |

## O.5 Reglas duras (aplican a TODO agente, en todas las fases)

- Stack cerrado: React 19 + Vite, react-router-dom v7, Tailwind v4, Axios,
  lucide-react, react-toastify, jsPDF + jspdf-autotable, xlsx, date-fns.
  Backend Django + DRF. **Prohibido instalar librerías nuevas sin aprobación
  explícita.** El editor de texto (D1) y el motor de PDF (D2) son las únicas
  excepciones candidatas y se resuelven en la Fase 0.
- Fechas visibles al usuario: `date-fns` con locale `es`.
- ESTÁNDAR DE DISEÑO RESPONSIVE de `CLAUDE.md`: mobile-first, `dvh` nunca `vh`,
  ninguna `grid-cols-N` sin breakpoint, toda tabla dentro de
  `components/ui/TablaScroll.jsx`, todo modal con `components/ui/Modal.jsx`.
- **Ningún agente hace verificación visual en navegador. Las pruebas visuales
  las hace el usuario.** La verificación es estática: `npm run build` en verde,
  `python manage.py test constancias` en verde, sin imports sin usar.
- Deuda técnica encontrada de paso: se anota en `NOTAS_TECNICAS.md`, no se
  arregla.

---

# PARTE II — CONTEXTO YA VERIFICADO

No lo re-investigues. Está confirmado sobre el código real.

**Encabezado y pie institucionales.** `src/utils/logosInstitucionales.js` →
`getLogosInstitucionales()` devuelve `{ logoColegio, afiliacionNombre,
encabezadoPersonalizado, piePaginaPersonalizado }` como data-URIs desde
`secretaria/configuracion/`, cacheados por sesión de pestaña e invalidados con
`invalidateLogosInstitucionalesCache()`. **Las constancias usan exactamente
esta misma fuente**, igual que los recibos. No se sube un membrete aparte.

**Generadores PDF existentes a imitar en márgenes y estilo:**
`src/utils/boletinPdf.js`, `src/utils/nominaPDF.js`,
`src/utils/printReciboCobranza.jsx`, `src/utils/printComprobanteCompacto.jsx`.

**Componentes obligatorios:** `src/components/ui/Modal.jsx`,
`src/components/ui/TablaScroll.jsx`.

## Formatos reales de referencia (ya analizados)

Los cuatro documentos que el colegio usa hoy en Word — *Constancia de Estudio,
Buena Conducta, Retiro, Trabajo* — comparten esta anatomía:

```
[ encabezado institucional = imagen de membrete ]

              CONSTANCIA DE <TIPO>            ← título, centrado, mayúsculas

Quien suscribe, <FIRMANTE>, titular de la Cédula de Identidad Nº <CI FIRMANTE>,
en mi carácter de <CARGO FIRMANTE> del Colegio "<NOMBRE>", que funciona en
<DIRECCIÓN COMPLETA>, hace constar que <CUERPO VARIABLE POR TIPO>.

Constancia que se expide a petición de parte interesada en <CIUDAD>,
<ESTADO> el día <FECHA>.

              __________________________       ← bloque de firma
                    <FIRMANTE>
                     <CARGO>

[ anexo opcional: REFERENCIA DEL ALUMNO — solo Constancia de Estudio ]
[ pie de página institucional = imagen ]
```

Hallazgos que **determinan el diseño** y que ningún agente puede ignorar:

1. **El párrafo "Quien suscribe…" es constante para todo el colegio**, no parte
   del texto libre de cada plantilla. Firmante, su cédula, su cargo, nombre del
   colegio, dirección, ciudad y estado salen de la configuración institucional.
   Si cambia la directora, se cambia en UN lugar y las cuatro constancias
   quedan actualizadas.
2. **Ya existe una convención de tokens** en los Word actuales:
   `❴❴apellidos❵❵ ❴❴nombres❵❵ ❴❴CI❵❵ ❴❴CIE❵❵ ❴❴edad❵❵ ❴❴grado❵❵ ❴❴nivel❵❵
   ❴❴gradoa❵❵ ❴❴nivela❵❵ ❴❴añoescolara❵❵ ❴❴gradop❵❵ ❴❴nivelp❵❵ ❴❴horario❵❵
   ❴❴fecha❵❵ ❴❴fechanac❵❵ ❴❴cargo❵❵ ❴❴fechaingreso❵❵ ❴❴sueldo❵❵ ❴❴bono❵❵
   ❴❴apellidosmadre❵❵ ❴❴nombresmadre❵❵ ❴❴cimadre❵❵ ❴❴apellidospadre❵❵
   ❴❴nombrespadre❵❵ ❴❴cipadre❵❵`.
   El catálogo debe **cubrir todos estos casos**. La sintaxis nueva es
   `{{grupo.campo}}`, pero al pegar un texto con `❴❴campo❵❵` el editor lo
   reconoce y lo convierte solo: el personal ya tiene sus textos escritos así.
3. **El género está escrito a mano y por eso está mal en la práctica:** el Word
   de Trabajo dice fijo "la ciudadana" y los de alumno "el estudiante".
4. **Retiro necesita datos derivados:** grado y nivel *cursados* frente a grado
   y nivel *al que fue promovido*, más el año escolar de ese cursado.
5. **Trabajo expone sueldo y bono de alimentación en Bs.** Dato sensible de
   nómina: restringido por rol y formateado con la utilidad de moneda que ya
   usa nómina, no con un `toFixed` nuevo.
6. **Estudio lleva un anexo** ("REFERENCIA DEL ALUMNO", con fecha de nacimiento
   y datos de madre y padre) separado del cuerpo. La plantilla soporta un
   bloque anexo opcional; no se fuerza todo en un párrafo.
7. El prefijo `V-` aparece a veces en texto fijo y a veces dentro del token. Se
   normaliza en un solo lugar: el placeholder de cédula devuelve el valor ya
   formateado con su nacionalidad.

---

# FASE 0 — DECISIONES · 1 agente · sin código

**Nadie escribe código en esta fase.** Un agente de exploración (solo lectura)
investiga y responde. El usuario aprueba antes de abrir la Fase 1.

- **D1 — Editor de texto rico.** Hoy no hay ninguno en el stack. UNA opción con
  justificación y peso en KB: (a) editor propio sobre `contentEditable` +
  Selection API, cero dependencias; (b) TipTap; (c) Quill. Requisitos:
  negrita/cursiva/subrayado, alineación, listas, familia y tamaño de fuente,
  interlineado, y **un control en la misma barra que inserte placeholders**.
  Salida HTML serializable y estable.
- **D2 — Dónde se renderiza el PDF.** Backend (WeasyPrint / ReportLab) frente a
  frontend (jsPDF). Criterios: la constancia es documento legal, lleva
  correlativo y debe re-emitirse idéntica meses después; y si el render es
  frontend, **la imagen de la firma del director viaja al navegador de
  secretaría en cada emisión**. Nombra la dependencia Python si aplica y
  explica cómo sirve el mismo membrete de `secretaria/configuracion/` sin
  duplicar la fuente de verdad.
- **D3 — Numeración y verificación.** ¿Correlativo por tipo de constancia y
  período escolar, o global por sede? ¿Se imprime código de verificación?
- **D4 — Datos faltantes.** Lista de placeholders **sin** origen en la BD
  actual (candidatos: horario, grado promovido, bono de alimentación, madre y
  padre por separado). Por cada uno: existe / se captura al emitir / requiere
  migración. Incluye el archivo y modelo exactos donde vive cada dato que sí
  existe.

**Compuerta 0 → 1:** aprobación escrita del usuario a las cuatro. Sin eso, no
se abre la Fase 1.

---

# FASE 1 — CONTRATO CONGELADO · 1 agente · sin código de producción

Un solo agente, secuencial. Produce el contrato del que dependerán los cuatro
agentes paralelos de la Fase 2. Entrega en la respuesta, no en archivos nuevos.

1. **Modelo de datos completo**, con nombres de campo definitivos:
   - Configuración del firmante por sede.
   - Plantilla de constancia.
   - Constancia emitida (histórico).
2. **Contrato de endpoints congelado**: método, ruta, parámetros, y un **JSON
   de ejemplo de respuesta para cada uno**. Estos ejemplos son los que usará el
   frontend como stub en la Fase 2.
   - `GET/POST/PUT/DELETE /constancias/plantillas/`
   - `GET /constancias/placeholders/?destinatario=alumno|trabajador|representante`
   - `POST /constancias/previsualizar/`
   - `POST /constancias/emitir/`
   - `GET /constancias/emitidas/`
   - `GET/PUT /constancias/firmante/`
3. **Catálogo canónico de placeholders**, cerrado, con `token`, `etiqueta`,
   `grupo`, `ejemplo` para cada uno. Grupos mínimos:
   - **Alumno:** nombres, apellidos, cédula escolar, cédula, fecha de
     nacimiento, edad, grado, nivel, sección, año escolar, horario, grado y
     nivel de promoción, estatus.
   - **Familia:** nombres, apellidos y cédula de madre; ídem padre; ídem
     representante y su parentesco.
   - **Trabajador:** nombres, apellidos, cédula, cargo, fecha de ingreso,
     antigüedad, tipo de contrato, sueldo, bono de alimentación.
   - **Institución:** nombre del colegio, firmante, su cédula y cargo,
     dirección, ciudad, estado, sede, RIF.
   - **Documento:** número de constancia, fecha de emisión en números y letras.
4. **Especificación de la sintaxis de plantilla**, cerrada:
   - Sustitución: `{{grupo.campo}}`.
   - Género, dos variantes: `{{sexo:portador|portadora}}`. Pares disponibles:
     `el/la`, `alumno/alumna`, `ciudadano/ciudadana`, `portador/portadora`,
     `inscrito/inscrita`, `trabajador/trabajadora`, `nacido/nacida`,
     `promovido/promovida`, `representado/representada`, `hijo/hija`.
   - Sin sexo cargado: usa la primera variante y registra el caso en el log.
     **No revienta ni inventa.**
   - **Prohibido** un motor de plantillas genérico con condicionales
     arbitrarias o lógica ejecutable dentro de la plantilla: es un vector de
     inyección de plantilla.
5. **Identificación de los archivos compartidos** que habrá que tocar en las
   compuertas (router raíz, `urls.py` raíz, menú lateral), por ruta exacta.

**Compuerta 1 → 2:** el usuario aprueba modelo y contrato. A partir de aquí el
contrato está congelado.

---

# FASE 2 — CONSTRUCCIÓN EN PARALELO · 4 agentes simultáneos

Los cuatro arrancan a la vez. Sus conjuntos de archivos son disjuntos: ninguno
lee ni escribe los del otro. Ninguno enchufa nada al router ni al menú.

### Agente 2A — Datos y migraciones *(único dueño de migraciones)*
**Dueño de:** `octopus-api/constancias/models.py`, `admin.py`, `migrations/`,
`fixtures/`.
- Modelos de la Fase 1: firmante por sede, plantilla, constancia emitida.
- Campo de **firma digital y sello del firmante, ambos opcionales**, en
  **almacenamiento privado**: nunca una URL pública adivinable. Una firma
  servida en `/media/firmas/1.png` sin autenticación es una firma robada.
- Las cuatro plantillas reales de la Parte II como fixture de semilla.
- Verifica: `makemigrations --check` limpio y `migrate` en verde.

### Agente 2B — Motor de render *(sin BD, puro y testeable)*
**Dueño de:** `octopus-api/constancias/render.py`, `tests/test_render.py`.
- Sustitución de `{{grupo.campo}}` y resolución de `{{sexo:a|b}}`.
- Importador de la notación vieja `❴❴campo❵❵` → `{{grupo.campo}}`.
- Normalización de cédula con nacionalidad (hallazgo 7).
- Recibe un diccionario de datos ya resuelto; **no consulta modelos**. Por eso
  puede construirse antes que el backend de datos y probarse solo.
- Tests obligatorios: token inexistente, persona sin sexo, texto con notación
  vieja, HTML con intento de inyección.

### Agente 2C — Estructura frontend *(contra los stubs del contrato)*
**Dueño de:** `src/pages/constancias/`, `src/services/constancias.js`.
- Pantallas: lista de plantillas, emisión, histórico, configuración del
  firmante. Con skeleton loaders, no spinners genéricos.
- Cliente Axios contra los endpoints del contrato, con manejo de error vía
  `react-toastify` en todas las llamadas.
- Trabaja contra los JSON de ejemplo de la Fase 1. **No espera al backend.**
- Verifica: `npm run build` en verde.

### Agente 2D — Editor de texto y placeholders
**Dueño de:** `src/components/editor/`.
- Editor según la decisión D1. Redactar dentro **y** pegar texto ya redactado y
  darle formato.
- En la misma barra de fuente y tamaño, el **selector de placeholders**
  agrupado por entidad, que inserta en la posición del cursor.
- El token se ve como **píldora no editable** con etiqueta legible ("Nombre del
  alumno"), no como texto crudo.
- El catálogo se consume del endpoint; **prohibido duplicar la lista en el
  frontend**.
- Al pegar texto con `❴❴campo❵❵`, lo convierte a píldoras automáticamente.
- Verifica: `npm run build` en verde.

**Compuerta 2 → 3:** los cuatro entregaron, `npm run build` verde, tests del
motor verdes. El orquestador commitea y enchufa rutas y menú.

---

# FASE 3 — INTEGRACIÓN · 2 agentes · paralelo parcial

### Agente 3A — Endpoints DRF *(depende de 2A y 2B)*
**Dueño de:** `octopus-api/constancias/views.py`, `serializers.py`, `urls.py`.
- Implementa el contrato completo de la Fase 1 sobre los modelos de 2A usando
  el motor de 2B.
- Emisión guarda **snapshot del HTML ya renderizado**. Re-emitir una constancia
  histórica reproduce el snapshot: **no vuelve a resolver los datos actuales**.
  Un documento emitido en 2024 debe seguir mostrando a quien firmaba en 2024.

### Agente 3B — Generación del PDF *(depende de D2)*
**Dueño de:** el módulo de render PDF, según D2.
- Encabezado y pie **de `getLogosInstitucionales()`**, idénticos al resto del
  sistema.
- Anexo opcional (hallazgo 6) y bloque de firma.
- Emisión en lote: indica si genera un PDF por persona o uno con salto de
  página.

**Compuerta 3 → 4:** elegir plantilla → seleccionar persona → previsualizar →
PDF funciona de punta a punta, con datos reales.

---

# FASE 4 — CONTROLES · 2 agentes · paralelo

Se aplican **sobre un flujo que ya funciona**. Ponerlos antes hace imposible
distinguir un permiso mal puesto de un endpoint roto.

### Agente 4A — Permisos y datos sensibles
- Restringe por rol **copiando la tupla de una vista existente del backend**;
  no inventa roles.
- Separa **editar plantillas** de **solo emitir**.
- Constancias de trabajador con sueldo y bono: solo roles de nómina.
- Permiso **independiente**: *"puede emitir con la firma del director"*. Quien
  emite suele ser secretaría, no el director; sin ese permiso emite igual, pero
  sin firma estampada. La firma se delega explícitamente, no se hereda del rol.

### Agente 4B — Firma, correlativo y auditoría
- **Interruptor de estampado por plantilla**, no global: unas constancias se
  entregan firmadas y otras se firman a mano con sello.
- Se estampa solo si concurren las tres: plantilla con estampado activo,
  firmante con imagen cargada, usuario con el permiso de 4A. Si falta
  cualquiera, sale la línea en blanco. **Nunca abortes la emisión por falta de
  firma:** una constancia sin firmar se firma a mano; una emisión bloqueada
  deja al representante sin su documento.
- Correlativo según D3, a prueba de emisiones simultáneas.
- El histórico registra si salió firmada, qué usuario la emitió y cuándo.
- Si necesita un campo nuevo: **se detiene y lo reporta**. No corre
  `makemigrations` (§O.2).

**Compuerta 4 → 5:** `python manage.py test constancias` en verde, con casos de
permiso denegado y correlativo concurrente.

---

# FASE 5 — CIERRE · 1 agente

- Las cuatro plantillas de la Parte II cargadas y reproduciendo el formato
  original.
- `npm run build` verde, tests verdes, sin imports sin usar.
- Deuda técnica acumulada por todos los agentes, consolidada en
  `NOTAS_TECNICAS.md`.
- **Entrega al usuario para la verificación visual en los cuatro tamaños de
  referencia.** Ningún agente la hace por él.

---

# ANEXO — Mapa de propiedad de archivos

Ningún agente escribe fuera de su fila. Ante necesidad de hacerlo: detenerse y
reportar.

| Agente | Fase | Archivos propios |
|---|---|---|
| 2A | 2 | `constancias/models.py`, `admin.py`, `migrations/`, `fixtures/` |
| 2B | 2 | `constancias/render.py`, `tests/test_render.py` |
| 2C | 2 | `src/pages/constancias/`, `src/services/constancias.js` |
| 2D | 2 | `src/components/editor/` |
| 3A | 3 | `constancias/views.py`, `serializers.py`, `urls.py` |
| 3B | 3 | módulo de render PDF (según D2) |
| 4A | 4 | permisos en `views.py` + `permissions.py` |
| 4B | 4 | firma, correlativo y auditoría en `constancias/` |
| Orquestador | todas | router raíz, `urls.py` raíz, `settings.py`, menú lateral |

---

# ENTREGABLES

- [ ] F0: D1–D4 respondidas y aprobadas por el usuario.
- [ ] F1: modelo de datos, contrato de endpoints con JSON de ejemplo, catálogo
      de placeholders y sintaxis de plantilla, aprobados y congelados.
- [ ] F2: modelos y migraciones (dueño único); motor de render con tests;
      pantallas contra stub; editor con píldoras e importación de `❴❴campo❵❵`.
- [ ] F3: endpoints completos con snapshot del HTML; PDF con el membrete
      institucional del sistema.
- [ ] F4: permisos por rol, permiso delegado de firma, estampado condicionado,
      correlativo y auditoría.
- [ ] F5: cuatro plantillas semilla, build y tests verdes, `NOTAS_TECNICAS.md`
      actualizado, entrega para verificación visual.
