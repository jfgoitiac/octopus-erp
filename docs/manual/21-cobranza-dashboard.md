# 21 · Dashboard de Cobranza

## Para qué sirve

Es la pantalla de entrada del área de cobranza. Muestra cuántos alumnos están al
día y cuántos deben, y permite buscar a un representante por cédula para ver su
deuda total y pasar directo a cobrarle.

## Quién puede usarlo

**Director**, **Sistemas**, **Administrador** y **Cobranza**.

## Cómo llegar

Escribe la dirección `/cobranza/dashboard`. Es también la pantalla de inicio
automática del rol **Sistemas**.

---

## 1. Qué muestra la pantalla

Arriba, el encabezado **"Octopus Finance"** con la descripción **"Control de
cobranza y mensualidades"** y la tasa **"BCV:"** del día.

Debajo, tres tarjetas de resumen:

| Tarjeta | Qué cuenta |
|---------|------------|
| **"Solventes"** | Alumnos sin deuda vencida |
| **"En Mora"** | Alumnos con al menos una cuota vencida |
| **"Total"** | La suma de los dos anteriores |

Al centro, el buscador *"Buscar cédula (Enter)..."*. Al buscar un representante
aparece su **"Total Deuda"** y el botón **"Registrar Pago"**.

A un lado, el bloque **"Acciones"** con dos accesos rápidos:

- **"Corte de Caja Diaria"**
- **"Consultar Auditoría"**

[CAPTURA: pantalla "Octopus Finance" con las tres tarjetas de resumen y el buscador de cédula]

---

## 2. Paso a paso

### Consultar la deuda de una familia

1. Escribe la cédula del representante en *"Buscar cédula (Enter)..."*.
2. Presiona **Enter**.
3. Verás el **"Total Deuda"** de esa familia.

### Cobrar desde aquí

1. Busca la cédula.
2. Haz clic en **"Registrar Pago"**.
3. El sistema te lleva al módulo [Cobranza](20-cobranza.md) con esa cédula ya
   cargada.

---

## 3. Campos del formulario

Esta pantalla no guarda información.

| Campo | Obligatorio | Formato | Qué significa |
|-------|:-----------:|---------|---------------|
| Buscar cédula | No | Números de la cédula, y luego Enter | El representante que quieres consultar |

---

## 4. Qué pasa después

Nada cambia en el sistema: es una pantalla de consulta y de atajos. El cobro real
ocurre en el módulo **Cobranza**.

---

## 5. Errores frecuentes y qué hacer

| Qué ves | Qué significa | Qué hacer |
|---------|---------------|-----------|
| No aparece nada al buscar | Esa cédula no está registrada. | Verifica el número o registra al representante. |
| El "Total Deuda" no coincide con lo que espera la familia | Puede haber cuotas de varios hijos o del Proyecto de Inversión. | Abre "Cobranza" y revisa el detalle concepto por concepto. |
| La tasa "BCV:" aparece vacía o desactualizada | No se pudo consultar la tasa. | Actualízala con el botón "BCV" de la barra superior. |
| Los totales no cuadran con el Dashboard general | Puedes estar viendo otra sede. | Revisa el selector de sede. |

---

## 6. Advertencias

Esta pantalla no realiza ninguna acción irreversible.
