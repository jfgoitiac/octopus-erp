# 22 · Morosos

## Para qué sirve

Es la lista de alumnos con deuda vencida, ordenada por días de atraso. Muestra
cuánto debe cada uno y te permite ir directo a cobrarle. También puedes exportar
la lista a Excel para trabajarla fuera del sistema.

## Quién puede usarlo

**Director**, **Sistemas**, **Administrador**, **Cobranza**, **Cajero** y
**Secretaria**.

## Cómo llegar

Menú lateral → **Principal** → **"Morosos"**.

---

## 1. Qué muestra la pantalla

El título **"Alumnos en mora"**.

Arriba, cuatro tarjetas de resumen:

| Tarjeta | Qué muestra |
|---------|-------------|
| **"Alumnos en mora"** | Cuántos estudiantes tienen deuda vencida |
| **"Deuda total (USD)"** | Suma de lo adeudado en dólares |
| **"Deuda total (VES)"** | El mismo total convertido a bolívares con la tasa BCV |
| **"Solvencia adeudada (USD)"** | Lo adeudado por concepto de solvencia, contado aparte |

Debajo, el buscador *"Buscar por nombre, cédula…"* y los botones **"Ordenar por
días de atraso"**, **"Refrescar lista de morosos"** y **"Exportar morosos a
Excel"**.

Cada fila muestra al alumno, su representante, cuánto debe y desde hace cuántos
días, con un acceso directo *"Ir a cobranza de …"*.

[CAPTURA: pantalla "Alumnos en mora" con las cuatro tarjetas de resumen y la lista de deudores]

---

## 2. Paso a paso

### Buscar un moroso

1. Escribe el nombre o la cédula en *"Buscar por nombre, cédula…"*.
2. La lista se filtra mientras escribes.

### Ordenar por atraso

Haz clic en **"Ordenar por días de atraso"** para poner arriba a los que más
tiempo llevan debiendo.

### Cobrarle a un moroso

1. Haz clic en el acceso *"Ir a cobranza de …"* de su fila.
2. El sistema abre el módulo [Cobranza](20-cobranza.md) con esa familia cargada.

### Exportar la lista

1. Haz clic en **"Exportar morosos a Excel"**.
2. Verás **"Archivo Excel descargado."**.

### Actualizar la lista

Haz clic en **"Refrescar lista de morosos"**.

---

## 3. Campos del formulario

Esta pantalla no guarda información.

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Buscar | No | Texto libre | Filtra por nombre o cédula |

---

## 4. Cómo decide el sistema quién está en mora

Un alumno **activo y no becado** entra en la lista cuando tiene alguna de estas
deudas:

| Tipo de deuda | Cuándo cuenta como vencida |
|---------------|---------------------------|
| **Mensualidades de meses anteriores** | Cualquier mes previo sin pagar |
| **Mensualidad del mes en curso** | Sin pagar y ya llegó (o pasó) el día límite de pago de ese alumno |
| **Cuota de inscripción** | Cualquier cuota sin pagar. No tiene fecha límite propia: cuenta desde que se genera |
| **Cuota de solvencia** | Cualquier cuota sin pagar con monto mayor a cero. Se muestra en su propia tarjeta |
| **Proyecto de Inversión** | Cuota del **representante** sin pagar o con abono parcial. Se cuenta aparte |

Los alumnos **becados** y los **retirados** no aparecen en esta lista.

---

## 5. Qué pasa después

Esta pantalla solo consulta: no cobra, no anula y no envía correos. Un alumno
sale de la lista automáticamente en cuanto se registra el pago que salda su
deuda.

Los avisos automáticos de cobranza (día 0, 5, 10 y 15) se disparan por su cuenta,
independientemente de que abras o no esta pantalla. Ver
[Notificaciones automáticas](30-configuracion-notificaciones.md).

---

## 6. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "No se pudo cargar la lista de morosos. Intenta de nuevo." | Falló la consulta. | Usa "Refrescar lista de morosos" o recarga la página. |
| "No se pudo generar el Excel." | El archivo no se pudo armar. | Reintenta; si sigue, avisa a Sistemas. |
| "Deuda total (VES)" aparece con un guion | No hay tasa BCV registrada. | Sincroniza la tasa con el botón "BCV" de la barra superior. |
| Un alumno que debe no aparece en la lista | Puede estar marcado como "Becado Total" o retirado. | Revisa su ficha en "Alumnos". |
| Un alumno al día aparece como moroso | Puede tener inscripción, solvencia o Proyecto de Inversión pendiente. | Abre "Cobranza" con su cédula y revisa concepto por concepto. |
| La lista se ve vacía | No hay morosos, o estás en otra sede. | Revisa el selector de sede. |

---

## 7. Advertencias

Esta pantalla no realiza ninguna acción irreversible.

⚠️ El archivo de Excel contiene nombres, cédulas y montos adeudados de familias
concretas. No lo compartas fuera del personal autorizado.
