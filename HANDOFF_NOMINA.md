# HANDOFF — Módulo de Nómina con Recibos AVEC/MPPE
**Fecha:** 02 de junio de 2026  
**Archivo modificado:** `octopus-frontend/src/pages/Nomina.jsx`  
**Estado:** ✅ Build limpio — listo para pruebas con datos reales

---

## 1. Contexto

El usuario entregó dos documentos:
- **`PRD_Automatizacion_Recibo_Pago.docx`** — requisitos del sistema de nómina AVEC/MPPE para la U.E. Colegio Los Hijos de María Auxiliadora.
- **`Recibo de REVILLA NELLY ABRIL V-7.572.937 -.docx`** — recibo real de referencia para replicar el formato del PDF.

El objetivo fue automatizar la generación de recibos de pago del personal docente (convenio MPPE-AVEC) directamente desde el sistema, eliminando el proceso manual en Word/Excel.

---

## 2. Cambios implementados

### 2.1 División del personal en tres secciones (Tabs)

El módulo de nómina ahora muestra tres pestañas:

| Tab | Icono | Filtro |
|---|---|---|
| **Docente** | `GraduationCap` | `emp.tipo_personal === 'docente'` |
| **Administrativo** | `Briefcase` | `emp.tipo_personal === 'administrativo'` |
| **Personal de Apoyo** | `Wrench` | `emp.tipo_personal === 'apoyo'` |

El campo `tipo_personal` se agrega a los formularios de registro y edición de empleados. Los empleados sin el campo asignado caen en la tab Docente por defecto.

> **⚠ Pendiente backend:** El modelo `Empleado` en Django debe aceptar y persistir el campo `tipo_personal` y todos los campos AVEC listados en §2.2.

---

### 2.2 Campos nuevos en la ficha del empleado

Se agregaron al formulario de registro/edición (solo visibles cuando `tipo_personal === 'docente'`):

| Campo | Nombre en API | Tipo | Descripción |
|---|---|---|---|
| N° H/Sem | `horas_semanales` | number | Horas semanales asignadas — **clave para calcular el sueldo base** |
| Categoría Docente | `categoria_docente` | string | D-I S/C, D-I, D-II, D-III, D-IV, D-V, D-VI |
| Título Académico | `titulo` | string | LEM, TSU, PROF, MSC, DR… |
| Fecha de Ingreso | `fecha_ingreso` | string | Formato DD/MM/AAAA |
| Años de Servicio | `anos_servicio` | number | Para cálculo de prima antigüedad (4A) |
| N° Hijos | `numero_hijos` | number | Para prima por hijo (4F) |
| Nivel que dicta | `nivel` | string | TODAS / Primaria / Secundaria |

---

### 2.3 Lógica de cálculo AVEC implementada en frontend

Toda la lógica vive en `Nomina.jsx` — no requiere endpoint nuevo para el cálculo.

#### Fórmula del Sueldo Base
```
Sueldo Base = Costo/Hora[categoría] × N° H/Sem
```
- `Costo/Hora` varía por categoría (D-I al D-VI) — se configura en el modal **Cesta Ticket**.
- `N° H/Sem` viene de la ficha del docente.

#### Tabla de primas (función `calcAVEC`)

| Concepto | Código | Fórmula |
|---|---|---|
| Prima Antigüedad | 4A | `años_servicio% × sueldo_base` (1% por año) |
| Prima Docente | 4B | `PRIMA_DOCENTE_PCT[categoría] × sueldo_base` |
| Prima Geográfica | 4C | Igual a 4B |
| Prima Postgrado / Comp. Académica | 4D | `POSTGRADO_PCT[título] × sueldo_base` |
| Prima Ayuda Asistencial | 4E | Fijo **17,50 Bs** |
| Prima por Hijo | 4F | `número_hijos × 12,50 Bs` |

#### Tabla `PRIMA_DOCENTE_PCT` (% sobre sueldo base por categoría)
```js
'D-I S/C': 0.00
'D-I':     0.025
'D-II':    0.04
'D-III':   0.055
'D-IV':    0.07
'D-V':     0.085
'D-VI':    0.10
```
> **⚠ Deuda técnica:** Estos porcentajes son aproximaciones basadas en el ejemplo del PRD (Revilla, D-VI → 10%). Deben validarse con la tabla oficial AVEC vigente y ajustarse en las constantes del archivo.

#### Tabla `POSTGRADO_PCT` (% sobre sueldo base por título)
```js
'DR'/'PHD': 0.40
'MSC':      0.35
'ESP':      0.30
'LEM':      0.30
'LIC':      0.25
'PROF':     0.20
'TSU':      0.10
'BACH':     0.00
```

#### Retenciones obligatorias

| Retención | % | Tope |
|---|---|---|
| SSO | 4% del total asignaciones | 26,00 Bs |
| SPF | 0,5% del total asignaciones | Sin tope |
| FAOV | 1% del total asignaciones | Sin tope |

```
Neto a Depositar = Total Asignaciones − (SSO + SPF + FAOV)
1ra Quincena = Neto / 2
2da Quincena = Neto / 2
```

#### Beneficio de Alimentación (Cesta Ticket)
```
Total Cesta (Bs) = Monto_USD[estamento] × Tasa_BCV
Descuento inasistencia = Horas_ausentes × Tarifa_hora_cesta
Total a Recibir = Total Cesta − Descuento
```

---

### 2.4 Configuración global del período — Modal "Cesta Ticket"

Guardada en `localStorage` con clave `nomina_cesta_config`. Se actualiza una vez por período de nómina.

**Estructura del objeto guardado:**
```json
{
  "categorias": {
    "D-I S/C": { "costo_hora": "" },
    "D-I":     { "costo_hora": "" },
    "D-II":    { "costo_hora": "" },
    "D-III":   { "costo_hora": "" },
    "D-IV":    { "costo_hora": "" },
    "D-V":     { "costo_hora": "" },
    "D-VI":    { "costo_hora": "12.52" }
  },
  "tasa_bcv":    "91.50",
  "tarifa_hora": "0.20",
  "docente":         { "monto_usd": "200" },
  "administrativo":  { "monto_usd": "150" },
  "apoyo":           { "monto_usd": "120" }
}
```

**Campos configurables:**

| Campo | Descripción |
|---|---|
| **Costo/Hora por categoría** | Publicado por el MPPE cada período. Diferente para D-I … D-VI. |
| **Tasa BCV (Bs/USD)** | Del día que se procesa la nómina. |
| **Tarifa/Hora Cesta (Bs)** | Para calcular descuento por inasistencia. Default `0.20`. |
| **Monto USD por estamento** | Cesta ticket en USD para Docente / Administrativo / Apoyo. |

---

### 2.5 Modal de generación de recibos

Al presionar **"Recibo"** en la fila de cualquier empleado, se abre un modal con:

**Docentes (AVEC):**
- Banner automático: `Costo/Hora[categoría] × H/Sem = Sueldo Base Bs` — sin input manual.
- **Solo 3 campos editables:** Período · H/Mens Inasistencia · Cesta (USD + Tasa, pre-llenados).
- Desglose calculado en tiempo real con todas las primas y retenciones.

**Administrativo / Apoyo:**
- Sueldo bruto + otras deducciones → calcula SSO/SPF/FAOV automáticamente → neto.

**Validaciones antes de generar:**
1. Período (mes) obligatorio.
2. El docente debe tener `categoria_docente` en su ficha.
3. La categoría del docente debe tener `costo_hora` configurado.
4. El docente debe tener `horas_semanales` en su ficha.

---

### 2.6 PDF generado — Formato recibo AVEC

La función `generarReciboAVECPDF()` replica el formato del recibo de referencia:

```
┌─────────────────────────────────────────────────────┐
│ U.E. COLEGIO LOS HIJOS DE MARÍA AUXILIADORA         │
│ RECIBO DE PAGO I, II QUINCENA Y BONO DE ALIMENTACIÓN│
│ Mes: ABRIL 2026                                     │
├──────────────────┬────────┬──────────┬──────────────┤
│ Apellidos/Nombre │ C.I Nº │ Nº H/Sem │ Cargo        │
├──────────────────┴────────┴──────────┴──────────────┤
│ Fecha Ingreso │ Título │ Categoría │ Nivel          │
├───────────────────────────┬─────────────────────────┤
│ ASIGNACIONES MENSUALES    │ RETENCIONES             │
│ Sueldo Base               │ FAOV                    │
│ Otras Asignaciones        │ SSO                     │
│ Total Asignaciones        │ SPF                     │
│ Monto 1ra Quincena        │ Total Retenciones       │
│ Monto 2da Quincena        │ Neto a Depositar        │
├───────────────────────────┴─────────────────────────┤
│ PRIMA POR DISCAPACIDAD PARA EL PERSONAL E HIJOS     │
├─────────────────────────────────────────────────────┤
│ PROGRAMA ALIMENTARIO                                │
│ Monto beneficio por hora: 0,20                      │
│ Costo diario: 1,33                                  │
│ Total beneficio: XX.XXX,00 Bs                       │
├──────────────┬────────────────┬─────────────────────┤
│ H/Mens Inaist│ Descuento      │ Total a Recibir     │
├──────────────┴────────────────┴─────────────────────┤
│              ___________________________            │
│              Firma del Empleado                     │
└─────────────────────────────────────────────────────┘
```

Nombre del archivo: `Recibo_APELLIDO_MES_AÑO.pdf`

---

## 3. Flujo de uso completo

### Paso 1 — Una vez por período (mensual)
1. Clic en botón **"Cesta Ticket"** en la barra superior.
2. Completar la tabla **Costo/Hora por categoría** con los valores publicados por el MPPE.
3. Ingresar **Tasa BCV** del día.
4. Verificar/actualizar **Monto USD de cesta ticket** por estamento.
5. Guardar → queda en `localStorage`.

### Paso 2 — Una vez por docente (al contratarlo o cuando cambia su carga)
1. Registrar o editar el empleado.
2. Asegurarse de completar: `tipo_personal`, `categoria_docente`, `horas_semanales`, `anos_servicio`, `titulo`, `numero_hijos`.

### Paso 3 — Cada mes, por cada empleado
1. Clic en **"Recibo"** en la fila del empleado.
2. Verificar el banner de sueldo base calculado automáticamente.
3. Escribir el **Período** (ej: `MAYO 2026`).
4. Ingresar **H/Mens de Inasistencia** (si aplica, default `0`).
5. Verificar la cesta ticket (pre-llenada desde config).
6. Clic en **"Descargar Recibo PDF"** → genera y descarga el PDF inmediatamente.

---

## 4. Deuda técnica pendiente

### Backend — campos nuevos en modelo `Empleado`
El frontend envía estos campos en POST/PATCH pero el backend debe aceptarlos:

```python
# models.py — agregar al modelo Empleado
tipo_personal    = models.CharField(max_length=20, choices=[...], default='docente')
horas_semanales  = models.PositiveSmallIntegerField(null=True, blank=True)
categoria_docente= models.CharField(max_length=10, blank=True)
titulo           = models.CharField(max_length=20, blank=True)
fecha_ingreso    = models.CharField(max_length=20, blank=True)  # o DateField
anos_servicio    = models.PositiveSmallIntegerField(null=True, blank=True)
numero_hijos     = models.PositiveSmallIntegerField(default=0)
nivel            = models.CharField(max_length=50, blank=True)
```

### Porcentajes AVEC — validar con tabla oficial
Los valores en `PRIMA_DOCENTE_PCT` y `POSTGRADO_PCT` son aproximaciones derivadas del ejemplo de Revilla (D-VI, LEM, 30 años). Deben confrontarse con la **Resolución Ministerial AVEC vigente** y actualizarse en las constantes al inicio de `Nomina.jsx`.

### Tope SSO — confirmar valor actual
El PRD documenta un tope de `26,00 Bs`. Este valor puede haber cambiado. Verificar con la tabla de cotizaciones IVSS vigente y actualizar la constante `SSO_TOPE`.

### Prima Asistencial (4E) — verificar monto fijo
El PRD indica `17,50 Bs`. Confirmar si este monto se actualiza con decreto o es fijo AVEC.

### Cesta Ticket — persistencia en base de datos (opcional)
Actualmente la configuración del período (costo/hora, tasa, cesta USD) vive solo en `localStorage`. Para entornos multi-usuario o multi-dispositivo, considerar guardarla en un endpoint de configuración del plantel (`/api/configuracion/nomina/`).

### Botones Admin/Apoyo — recibo simple
El recibo para personal administrativo y de apoyo usa `generarReciboSimplePDF()` con un formato básico. Pendiente: diseñar y aprobar el formato definitivo del recibo para estos estamentos.

---

## 5. Archivos relevantes

| Archivo | Descripción |
|---|---|
| `octopus-frontend/src/pages/Nomina.jsx` | Todo el módulo — constantes, lógica AVEC, modales, PDF |
| `localStorage['nomina_cesta_config']` | Config del período (costo/hora por cat., tasa BCV, cesta) |
| `C:\Users\PC\Downloads\PRD_Automatizacion_Recibo_Pago.docx` | PRD original del cliente |
| `C:\Users\PC\Downloads\Recibo de REVILLA NELLY ABRIL V-7.572.937 -.docx` | Recibo de referencia |

---

## 6. Dependencias — sin cambios al stack
Todas las funcionalidades usan librerías ya presentes en el proyecto:
- `jsPDF` + `jspdf-autotable` → generación del PDF
- `react-toastify` → notificaciones
- `lucide-react` → íconos (agregados: `Receipt`, `DollarSign`, `Settings2`, `GraduationCap`, `Briefcase`, `Wrench`)
- `localStorage` → persistencia de config del período (sin backend)
