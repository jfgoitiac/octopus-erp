# 35 · Multi-Sede

## Para qué sirve

Sirve cuando una misma organización maneja varios planteles. Reúne los números de
todas las sedes en un solo tablero, permite entrar al detalle de cada una y
administra qué persona tiene acceso a qué sede.

## Quién puede usarlo

- **"Dashboard Sedes"**: **Directivo de Red** y **Director**.
- **"Gestión de Sedes"**: solo el **Directivo de Red**.

## Cómo llegar

Menú lateral → **Multi-Sede** → **"Dashboard Sedes"** o **"Gestión de Sedes"**.

El **Directivo de Red** entra directo al **"Dashboard Sedes"** al iniciar sesión.

---

## 1. El selector de sede

En todo el panel administrativo, encima del menú lateral, hay un selector con el
nombre de la **"Sede activa"** y la opción **"Todas las sedes"**.

**Todo lo que ves en pantalla corresponde a la sede seleccionada**: alumnos,
pagos, morosos, reportes. Si un dato no aparece donde lo esperas, revisa primero
este selector.

[CAPTURA: selector de sede desplegado con la lista de planteles y la opción "Todas las sedes"]

---

## 2. Dashboard Sedes

Muestra el consolidado de la red: las **"Sedes registradas"**, los indicadores de
cada una y los **"Usuarios por sede"**.

Al hacer clic en una sede entras a su detalle, con sus alumnos, su cobranza y sus
morosos. Si una sede no tiene deudores, dirá **"Sin morosos"**; si no tiene
información cargada, **"Sin datos"**.

---

## 3. Gestión de Sedes

### Crear una sede

1. Entra a **"Gestión de Sedes"**.
2. Completa **"Nombre"**, **"RIF"**, **"Dirección"**, **"Teléfono"**,
   **"Correo"**, **"Municipio"** y **"Estado"**.
3. Guarda. Verás **"Sede creada"**.

### Editar una sede

1. Ábrela desde el listado.
2. Cambia lo que necesites y guarda. Verás **"Sede actualizada"**.

### Dar acceso a un usuario ⚠️

1. Abre **"Asignar usuario a sede"**.
2. Escribe el **"Username o email"** de la persona.
3. Elige el **"Rol *"** que tendrá en esa sede.
4. Confirma.

### Quitarle el acceso a un usuario

1. Abre **"Revocar acceso a la sede"** sobre esa persona.
2. Confirma. Verás **"Acceso revocado correctamente."**.

### Eliminar una sede ⚠️

1. Abre **"Eliminar sede"**.
2. Confirma.

---

## 4. Campos del formulario

### Sede

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Nombre | Sí | Texto único | Cómo se llama el plantel. No puede repetirse |
| RIF | No | Texto | Identificación fiscal |
| Dirección | No | Texto | Dónde queda |
| Teléfono | No | Texto | Contacto |
| Correo | No | `correo@ejemplo.com` | Correo de la sede |
| Municipio, Estado | No | Texto | Ubicación |

### Permiso de sede

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Username o email | Sí | Texto | A quién le das acceso |
| Rol | Sí | Directivo de Red / Director de Sede / Sistemas / Administrador / Cajero / Secretaria / Cobranza | Qué podrá hacer en esa sede |

> El rol **"Directivo de Red (todas las sedes)"** da acceso a la red completa,
> no a un plantel.

---

## 5. Qué pasa después

- Una sede nueva queda disponible en el selector para quienes tengan permiso
  sobre ella.
- Cada sede tiene su propia configuración escolar: su período activo, sus grados
  y sus montos.
- Al asignar un usuario a una sede, esa persona empieza a ver esa sede en su
  selector.
- Al revocar el acceso, deja de verla de inmediato.
- Los alumnos, pagos y docentes quedan asociados a la sede en la que se cargaron.

---

## 6. Errores frecuentes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---------|---------------|-----------|
| "No tiene acceso a esta sede." | Tu cuenta no tiene permiso sobre ese plantel. | Pídelo al Directivo de Red. |
| "No tiene permisos para crear sedes." | Solo el Directivo de Red puede. | Pídeselo. |
| "No tiene permisos para editar esta sede." | Tu rol no puede modificarla. | Pídeselo al Directivo de Red. |
| "No tiene permisos para desactivar esta sede." | Igual, al eliminarla. | Pídeselo al Directivo de Red. |
| "No tiene permisos para asignar usuarios en esta sede." | Tu rol no puede dar accesos. | Pídeselo al Directivo de Red. |
| "No tiene permisos para revocar usuarios en esta sede." | Igual, al quitar accesos. | Pídeselo al Directivo de Red. |
| "Se requieren user_id (o username) y rol." | Faltó un dato al asignar. | Complétalos. |
| "Sede no encontrada." | Esa sede ya no existe. | Recarga el listado. |
| "Permiso no encontrado." | Ese acceso ya fue revocado. | Recarga la pantalla. |
| "Error al cargar el dashboard consolidado" | Falló la consulta. | Recarga la página. |
| "Error al cargar las sedes" | Falló la consulta. | Recarga la página. |
| "Error al eliminar la sede" | No se pudo eliminar. | Verifica que no tenga datos activos. |
| "Sede no identificada" | No se pudo determinar la sede. | Vuelve a elegirla en el selector. |
| "No tiene acceso a este alumno." | El alumno pertenece a otra sede. | Cambia de sede en el selector. |
| Los números no coinciden con lo esperado | Puedes estar viendo una sede distinta. | Revisa el selector de sede. |

---

## 7. Advertencias

⚠️ **Eliminar una sede afecta a todos sus datos.** Alumnos, pagos y personal
quedan atados a ella. No la elimines si tiene operación activa.

⚠️ **Asignar un usuario a una sede le da acceso a los datos de esa sede** con el
rol que elijas: alumnos, pagos y reportes incluidos. Piensa bien el rol.

⚠️ **El rol "Directivo de Red" ve todas las sedes.** Asígnalo solo a quien
realmente coordina la red completa.

⚠️ **Revisa siempre el selector de sede antes de cobrar o inscribir.** Cargar un
pago en la sede equivocada obliga a anularlo.
