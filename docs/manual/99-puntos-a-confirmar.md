# 99 · Puntos a confirmar

Lo que no se pudo verificar con certeza leyendo el código, o donde se detectaron
diferencias que conviene aclarar antes de dar el manual por definitivo.

---

## 1. Aprobación de comprobantes del portal: no hay pantalla

**Qué se encontró.** El sistema tiene la operación para **aprobar o rechazar** los
comprobantes que suben las familias desde el portal, con todo su comportamiento
definido: al aprobar, marca la mensualidad como pagada y crea el pago
correspondiente. Está reservada a Director, Sistemas, Administrador y Cobranza.

**El problema.** No se encontró ninguna pantalla en el panel administrativo que
use esa operación. El módulo **"Comprobantes"** del menú es otra cosa: la consulta
y reimpresión de recibos de pagos ya registrados.

**Pregunta concreta.** ¿Desde dónde aprueba hoy el colegio los comprobantes que
suben las familias? ¿Existe una pantalla que no se localizó, se hace desde el
administrador de Django, o el flujo todavía no está en uso?

---

## 2. El menú lateral y los permisos no coinciden en varios módulos

**Qué se encontró.** En algunos módulos, el menú lateral es más restrictivo o más
amplio que el permiso real de la ruta:

| Módulo | Ve el menú | Permite la ruta |
|--------|------------|-----------------|
| Nómina | Director, Administrador | Director, Sistemas, Administrador |
| Pagos | Director, Administrador | Director, Sistemas, Administrador |
| Alumnos | Director, Sistemas, Administrador, Cobranza | Además Cajero y Secretaria |
| Comprobantes | Además Sistemas | Director, Sistemas, Administrador, Cobranza, Cajero |
| Dashboard de Cobranza | No aparece en el menú | Director, Sistemas, Administrador, Cobranza |

**Pregunta concreta.** ¿Cuál es la intención en cada caso: que el menú mande, o
que mande el permiso? El manual documentó ambos y lo dejó anotado, pero conviene
alinearlos.

---

## 3. El Dashboard de Cobranza no está en el menú

**Qué se encontró.** Es la pantalla de inicio del rol **Sistemas**, pero no
aparece como opción en el menú lateral: solo se llega escribiendo la dirección o
al iniciar sesión con ese rol.

**Pregunta concreta.** ¿Debería agregarse al grupo "Finanzas" del menú?

---

## 4. Métricas del sitio: pantalla suelta

**Qué se encontró.** Existe una pantalla de métricas del sitio institucional, pero
no tiene ruta propia en el sistema de navegación: las métricas se ven dentro de la
pestaña **"Métricas"** del módulo "Sitio Institucional".

**Pregunta concreta.** ¿La pantalla independiente quedó sin usar, o se accede de
alguna forma que no se localizó?

---

## 5. Anulación de pagos con Proyecto de Inversión

**Qué se encontró.** El sistema no puede anular automáticamente un pago vinculado
a una cuota de Proyecto de Inversión, porque los abonos son parciales y no queda
registrado cuánto aportó cada pago a la cuota. El propio código lo documenta como
una limitación conocida.

**Pregunta concreta.** ¿Cuál es el procedimiento oficial del colegio cuando esto
ocurre? El manual dice "contactar a Sistemas para un ajuste manual", pero
convendría documentar los pasos reales.

---

## 6. Respaldos: dónde quedan y con qué frecuencia

**Qué se encontró.** Existe la operación de generar un respaldo de la base de
datos, restringida por permisos.

**Preguntas concretas.** ¿Dónde se guarda el archivo? ¿Se hace de forma
automática con alguna periodicidad, o siempre a mano? ¿Quién es responsable?

---

## 7. Moneda y formato de montos

**Qué se encontró.** El sistema trabaja con dólares (`$`) como moneda de
referencia y bolívares (`Bs.`) convertidos con la tasa BCV. Los ejemplos del
manual usan ese criterio.

**Pregunta concreta.** ¿Hay alguna pantalla donde se use otra moneda o un formato
distinto que convenga reflejar?

---

## 8. Capturas de pantalla

**Qué falta.** El manual marca con `[CAPTURA: …]` cada punto donde debe ir una
imagen, describiendo qué debe mostrar. Las capturas no están tomadas.

**Pregunta concreta.** ¿Se toman sobre datos reales o sobre un ambiente de
prueba? Recomendación: usar datos ficticios, porque varias pantallas muestran
cédulas, montos y nombres de menores.

---

## 9. Textos que dependen del colegio

Algunos textos del sistema se leen desde la configuración de cada colegio y por
lo tanto cambian de instalación en instalación: el nombre del colegio, los logos
del recibo, los colores del portal, los bancos disponibles y los métodos de pago
aceptados. El manual los describe de forma genérica.

**Pregunta concreta.** ¿El manual debe personalizarse con los valores de un
colegio en particular, o quedarse genérico para toda la red?

---

## 10. Datos de ejemplo usados en el manual

Todos los valores que aparecen como ejemplo (`V-12345678`, `202605270001`,
`0042`, `Bs. 45,20`, `SLV-2025-0001`, nombres de personas) son **inventados**. No
corresponden a ningún registro real del sistema.
