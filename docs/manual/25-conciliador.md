# 25 · Conciliador Bancario

## Para qué sirve

Sube el estado de cuenta que te da el banco y busca dentro de él una transacción
por sus últimos dígitos de referencia. Sirve para verificar rápido si un pago que
dice la familia realmente entró a la cuenta del colegio.

## Quién puede usarlo

**Director**, **Sistemas**, **Administrador** y **Cobranza**.

## Cómo llegar

Menú lateral → **Finanzas** → **"Conciliador"**.

---

## 1. Qué muestra la pantalla

El título **"Conciliador Bancario"** con la descripción **"Carga tu estado de
cuenta para verificar transacciones por los últimos 4 a 6 dígitos de
referencia."**.

A la izquierda, el paso **"1 · Selecciona el banco"** con tres opciones:

- **"Bancaribe"**
- **"Banesco"**
- **"Banco del Tesoro"**

A la derecha, la zona de carga: **"Arrastra tu estado de cuenta"**, *"o presiona
Enter para seleccionar · Excel (.xlsx, .xls), CSV o PDF"*.

Una vez cargado, aparece la tabla de transacciones con **"Fecha"**,
**"Referencia"**, **"Monto"** y **"Descripción"**, paginada de 20 en 20.

[CAPTURA: pantalla "Conciliador Bancario" con el banco seleccionado y la tabla de transacciones cargadas]

---

## 2. Paso a paso

### Cargar el estado de cuenta

1. Elige el banco en **"1 · Selecciona el banco"**. **Esto va primero**: sin
   banco elegido, el archivo no se puede leer.
2. Arrastra el archivo a la zona de carga, o haz clic para elegirlo. Se aceptan
   `.xlsx`, `.xls`, `.csv` y `.pdf`.
3. Mientras trabaja verás **"Procesando archivo…"**.

Al terminar verás **"143 transacciones cargadas correctamente."**.

### Buscar una transacción

1. Haz clic en **"Buscar por referencia"**.
2. Escribe los últimos dígitos de la referencia (*"ej. 1234 a 123456"*): entre
   **4 y 6 dígitos**.
3. Haz clic en **"Buscar"**.
4. Revisa el resultado: fecha, referencia completa, monto y descripción.

### Moverte por la tabla

Usa **"Página anterior"** y **"Página siguiente"**. Arriba se indica en qué
página estás y cuántas transacciones hay en total.

### Quitar el archivo cargado

1. Haz clic en **"Limpiar"** (*"Limpiar archivo cargado"*).
2. Confirma.

Para cargar otro archivo directamente, arrástralo encima: verás **"Arrastra otro
archivo para reemplazar"**.

---

## 3. Campos del formulario

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Banco | Sí | Bancaribe / Banesco / Banco del Tesoro | De qué banco es el estado de cuenta. Cada uno tiene su propio formato |
| Archivo | Sí | `.xlsx`, `.xls`, `.csv` o `.pdf` | El estado de cuenta que descargaste del banco |
| Buscar transacción | Sí, para buscar | Entre 4 y 6 dígitos | Los últimos dígitos de la referencia |

---

## 4. Qué pasa después

- El archivo **se lee dentro de tu navegador**. No se guarda en el sistema, no se
  registra ningún pago y no se modifica ninguna deuda.
- Al salir de la pantalla o limpiar el archivo, las transacciones desaparecen.
- Si con esta verificación confirmas que el pago sí entró, regístralo en
  [Cobranza](20-cobranza.md) o cárgalo como pago retroactivo desde
  [Reportes](04-reportes.md).

> Esta pantalla es distinta de la pestaña **"Conciliación"** de
> [Reportes](04-reportes.md), donde sí se guardan lotes conciliados en el
> sistema.

---

## 5. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Selecciona un banco antes de cargar el archivo." | Cargaste el archivo sin elegir banco. | Elige el banco y vuelve a cargarlo. |
| "No se detectaron transacciones. Verifica que el banco seleccionado coincida con el archivo." | El formato no corresponde al banco elegido. | Revisa que el banco sea el correcto. |
| "Error al leer el archivo. Verifica que sea un Excel o CSV válido." | El archivo está dañado o tiene otro formato. | Vuelve a descargarlo del banco. |
| "Error al leer el PDF. Verifica que no esté dañado o protegido con contraseña." | El PDF tiene clave o está corrupto. | Descárgalo sin protección. |
| "No se pudo procesar el PDF. Verifica que no esté dañado o protegido con contraseña." | Lo mismo, informado por el sistema. | Usa la versión en Excel si el banco la ofrece. |
| "Primero carga un estado de cuenta." | Buscaste sin haber cargado archivo. | Carga el archivo primero. |
| El botón "Buscar" está apagado | Escribiste menos de 4 o más de 6 dígitos. | Usa entre 4 y 6 dígitos. |
| No aparece la transacción esperada | El pago puede no haber entrado, o estar en otro período del estado de cuenta. | Descarga un rango de fechas más amplio. |

---

## 6. Advertencias

Esta pantalla no modifica nada en el sistema: solo lee el archivo que cargas.

⚠️ **Encontrar la transacción no registra el pago.** Después de verificarla,
todavía tienes que cargarla en Cobranza.

⚠️ El estado de cuenta contiene información financiera del colegio. No lo dejes
cargado en una computadora compartida: usa **"Limpiar"** al terminar.
