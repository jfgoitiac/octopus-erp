# Importación de Docentes desde Excel

## Descripción
Este script importa docentes de un archivo Excel a la base de datos del servidor, sin requerir que los datos estén completos. Solo requiere:
- **Cédula** (única)
- **Nombre y Apellido**

Los campos opcionales (correo, teléfono) se guardan si están disponibles.

## Archivo Excel requerido
**Ubicación esperada**: `C:\Users\PC\Downloads\Base de Datos Colegio\DATOS DEL PERSONAL DOCENTE.xlsx`

**Estructura requerida**:
- Los encabezados deben estar en la **fila 5**
- Debe tener estas columnas:
  - `APELLIDO Y NOMBRE` (obligatorio)
  - `CEDULA` (obligatorio)
  - `CORREO` (opcional)
  - `Telefono` (opcional)
- Los datos comienzan en la **fila 6**

## Uso desde Terminal

### Opción 1: Ruta por defecto (recomendado)
```powershell
cd C:\Octopus\octopus-api
.\venv\Scripts\python.exe import_docentes_final.py
```

### Opción 2: Especificar ruta personalizada
```powershell
cd C:\Octopus\octopus-api
.\venv\Scripts\python.exe import_docentes_final.py "C:\ruta\a\tu\archivo.xlsx"
```

### Opción 3: Script original (más detallado)
```powershell
cd C:\Octopus\octopus-api
.\venv\Scripts\python.exe import_docentes.py
```

## Ejemplo de salida

```
Importando docentes desde: C:\Users\PC\Downloads\Base de Datos Colegio\DATOS DEL PERSONAL DOCENTE.xlsx

Procesando 47 filas...

[OK] Creados: 27 | Actualizados: 0 | Errores: 0
```

## Comportamiento

- **Campos requeridos**: Cédula y Nombre/Apellido
- **Si la cédula ya existe**: Actualiza los datos existentes
- **Si falta información**: Salta la fila pero continúa con las demás
- **Cédulas**: Se normalizan removiendo puntos y guiones (V-12.345.678 → V12345678)

## Datos guardados por docente

Cuando se crea un docente, se guardan:
- `cedula` ✓ (obligatorio)
- `nombre` ✓ (obligatorio)
- `apellido` ✓ (obligatorio)
- `correo` (si está en Excel)
- `telefono` (si está en Excel)
- `tipo_personal` = 'docente'
- `cargo` = '' (vacío, se puede editar después)
- `activo` = True

Todos los demás campos quedan vacíos/null y pueden completarse manualmente después.

## Troubleshooting

### Error: "ModuleNotFoundError: No module named 'openpyxl'"
```powershell
cd C:\Octopus\octopus-api
.\venv\Scripts\pip.exe install openpyxl
```

### Error: "Archivo no encontrado"
- Verifica que el Excel esté en: `C:\Users\PC\Downloads\Base de Datos Colegio\DATOS DEL PERSONAL DOCENTE.xlsx`
- O especifica la ruta completa manualmente

### Error: "Columnas requeridas no encontradas"
- Verifica que los encabezados estén en la **fila 5**
- Los nombres deben ser exactos: "APELLIDO Y NOMBRE" y "CEDULA"
- Ejecuta primero: `python diagnosticar_excel.py` para verificar la estructura

## Verificación en Django Admin

Después de importar, puedes verificar los docentes en:
```
http://localhost:8000/admin/rrhh/empleado/
```

O consultarlos por terminal:
```powershell
cd C:\Octopus\octopus-api
.\venv\Scripts\python.exe manage.py shell
```

Luego en el shell:
```python
from rrhh.models import Empleado
Empleado.objects.filter(tipo_personal='docente').count()  # Total de docentes
Empleado.objects.filter(tipo_personal='docente').values('nombre', 'apellido', 'cedula')[:5]  # Primeros 5
```

## Notas

- Los datos incompletos SE GUARDAN. Solo saltamos filas sin cédula ni nombre.
- Si necesitas actualizar docentes existentes, puedes ejecutar el script nuevamente (no crea duplicados).
- Las cédulas deben ser únicas en la base de datos.
