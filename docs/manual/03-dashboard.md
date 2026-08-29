# 03 · Dashboard (Panel de control)

## Para qué sirve

Es la primera pantalla que ves al entrar. En un vistazo muestra cuántos alumnos
hay, cuántos están al día y cuántos deben, cuánto se cobró hoy y qué tan llenos
están los grados. Sirve para saber cómo va el colegio sin abrir ningún informe.

## Quién puede usarlo

**Director**, **Administrador** y **Cobranza**.

## Cómo llegar

Menú lateral → **Principal** → **"Dashboard"**.

---

## 1. Qué muestra la pantalla

Arriba verás el título **"Panel de control"** y debajo la fecha de hoy escrita
en español (por ejemplo, `viernes, 15 de mayo de 2026`). A la derecha está el
botón **"Actualizar"**.

[CAPTURA: pantalla completa del "Panel de control" con las seis tarjetas de indicadores arriba]

### Las seis tarjetas de indicadores

| Tarjeta | Qué cuenta |
|---------|------------|
| **"Alumnos activos"** | Estudiantes inscritos y cursando. Debajo indica cuántos hay retirados. |
| **"Solventes"** | Alumnos sin deuda vencida. |
| **"En mora"** | Alumnos con al menos un cobro vencido sin pagar. |
| **"Becados"** | Alumnos con beca total; no se les cuenta deuda. |
| **"Retirados"** | Alumnos dados de baja. |
| **"Tasa BCV"** | La tasa de cambio vigente que usa el sistema para convertir a bolívares. |

### Estado financiero

Una gráfica que reparte a los alumnos entre solventes, en mora y becados.

### Distribución por género

Una rueda con la cantidad de estudiantes por género. Si aún no hay datos, dirá
**"Sin datos"**.

### Cobranza hoy

Tres cifras del día en curso:

- **"Total USD cobrado"** — lo recibido en dólares.
- **"Total VES cobrado"** — lo recibido en bolívares.
- **"Pagos procesados"** — cuántas operaciones se registraron.

### Ocupación por grado

Una barra por cada grado y sección, con el formato `18/25 (72%)`: alumnos
inscritos sobre cupos máximos, y el porcentaje de ocupación. Si todavía no
configuraste grados, dirá **"Sin grados configurados"**.

[CAPTURA: sección "Ocupación por grado" con las barras de cupos por sección]

---

## 2. Paso a paso

### Refrescar los números

1. Haz clic en **"Actualizar"**, arriba a la derecha.
2. Las tarjetas vuelven a cargarse con la información del momento.

### Revisar la mora del día

1. Mira la tarjeta **"En mora"**.
2. Si el número subió, entra al módulo [Morosos](22-morosos.md) para ver quiénes
   son.

### Ver si un grado está lleno

1. Baja hasta **"Ocupación por grado"**.
2. Busca la sección. Si la barra está completa, ya no quedan cupos y no podrás
   inscribir más alumnos ahí sin ampliar el cupo desde [Grados](12-grados.md).

---

## 3. Campos del formulario

Esta pantalla no tiene formularios: solo muestra información.

---

## 4. Qué pasa después

Nada cambia en el sistema. El Dashboard solo lee: no genera correos, ni PDFs, ni
modifica datos. Si tu cuenta tiene acceso a varias sedes, todos los números
corresponden a la sede seleccionada en el menú lateral.

---

## 5. Errores frecuentes y qué hacer

| Qué ves | Qué significa | Qué hacer |
|---------|---------------|-----------|
| Las tarjetas quedan en gris | Los datos todavía están cargando. | Espera unos segundos. |
| La tasa BCV aparece en rojo o con guion | No se pudo consultar la tasa del día. | Haz clic en el botón "BCV" de la barra superior para volver a intentar. Si sigue fallando, avisa a Sistemas. |
| "Sin grados configurados" | Nadie ha creado grados ni secciones. | Entra a "Grados" y créalos. |
| "Sin datos" en la rueda de género | No hay alumnos activos cargados. | Registra inscripciones. |
| Los números no cuadran con lo que esperas | Puede que estés viendo otra sede. | Revisa el selector de sede arriba del menú. |

---

## 6. Advertencias

Esta pantalla no realiza ninguna acción irreversible.
