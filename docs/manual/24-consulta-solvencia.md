# 24 · Solvencia

## Para qué sirve

Consulta si un representante tiene su constancia de solvencia del período y, si
no la tiene, permite al Director emitirla manualmente. La solvencia certifica que
la familia no debía nada al momento de completar sus pagos.

## Quién puede usarlo

**Todos los roles** pueden consultar. Solo el **Director** puede emitir una
solvencia manualmente.

## Cómo llegar

Menú lateral → **Finanzas** → **"Solvencia"**.

---

## 1. Qué muestra la pantalla

Un campo *"Cédula del representante"* y el botón **"Buscar"**.

Al buscar aparece un recuadro con el resultado:

- **Verde: "Posee solvencia"**, con **"Representante:"**, **"N.º de
  solvencia:"**, **"Período:"**, **"Origen:"** y **"Fecha de emisión:"**
  (por ejemplo, `15 de mayo de 2026`).
- **Rojo: "No posee solvencia"**. Si eres Director, aparece además el botón
  **"Emitir solvencia manualmente"**.

[CAPTURA: resultado verde "Posee solvencia" con el número, el período, el origen y la fecha de emisión]

---

## 2. Paso a paso

### Consultar la solvencia de una familia

1. Escribe la cédula en *"Cédula del representante"*.
2. Haz clic en **"Buscar"**.
3. Lee el resultado.

### Emitir una solvencia manualmente (solo Director) ⚠️

1. Busca al representante y confirma que dice **"No posee solvencia"**.
2. Escribe el motivo en *"Motivo de la emisión manual (opcional)"*.
3. Haz clic en **"Emitir solvencia manualmente"**. Mientras trabaja dirá
   **"Emitiendo..."**.

Verás **"Solvencia emitida correctamente."**. Si ya la tenía, verás
**"El representante ya poseía solvencia."**.

---

## 3. Campos del formulario

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Cédula del representante | Sí | `V-12345678` o solo números | A quién consultas |
| Motivo de la emisión manual | No | Texto | Por qué se emite a mano. Queda guardado en la constancia |

---

## 4. Cómo se emite la solvencia

### Automática

El sistema la genera solo cuando se registra el pago que completa el **Proyecto
de Inversión**, siempre que en ese momento el representante cumpla **las tres
condiciones**:

1. Tiene el Proyecto de Inversión del período **pagado**.
2. **Ninguno** de sus alumnos activos tiene cuota de inscripción impaga en ese
   período.
3. **Ninguno** de sus alumnos activos está en mora.

Además, debe tener al menos un alumno activo.

En ese caso el **"Origen:"** dice `Automática`.

### Manual

Cuando el criterio automático no aplica pero el colegio decide emitirla igual, el
Director la genera a mano. El **"Origen:"** dice `Manual (Director)`.

### Número de solvencia

El sistema asigna un número correlativo con el formato `SLV-2025-0001`: el año
del período y un consecutivo de cuatro dígitos.

---

## 5. Qué pasa después

- La constancia queda guardada con su número, su período, su origen y la fecha.
- **Cada representante tiene una sola solvencia.** No se emite una por hijo ni
  una por año adicional: es única e intransferible.
- Queda registro de quién la emitió, si fue manual.

---

## 6. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "Ingrese la cédula del representante." | El campo está vacío. | Escribe la cédula. |
| "No existe ningún representante con esa cédula." | Esa cédula no está registrada. | Verifica el número. |
| "No posee solvencia" | La familia no cumple las condiciones, o aún no completó el Proyecto de Inversión. | Revisa sus deudas en "Cobranza". |
| "El representante ya poseía solvencia." | Ya estaba emitida. | No hace falta emitirla otra vez. |
| "No hay período escolar activo configurado." | Falta definir el período. | Configúralo en "Configuración". |
| "Sin permiso." | Tu rol no puede emitir solvencias. | Solo el Director puede. |
| "Debe indicar la cédula del representante." | Faltó el dato al consultar. | Escríbelo. |

---

## 7. Advertencias

⚠️ **Una solvencia emitida no se puede anular desde la pantalla.** Es única por
representante: si se emite por error, hay que corregirla desde Sistemas.

⚠️ **Emitir una solvencia manual es un acto de la Dirección.** Certifica que la
familia no debe nada, aunque el sistema diga lo contrario. Escribe siempre el
motivo.

⚠️ **La solvencia es intransferible.** Pertenece al representante, no al alumno ni
a la inscripción.
