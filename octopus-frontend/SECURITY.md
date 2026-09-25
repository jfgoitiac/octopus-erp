# Seguridad del frontend

## Importación de estados de cuenta (SheetJS/XLSX)

El paquete `xlsx` (SheetJS Community Edition) 0.18.5 sigue teniendo avisos de
seguridad sin una versión corregida distribuida por npm. No se debe aceptar
como solución `npm audit fix --force`, porque no existe un parche compatible
publicado para esa dependencia.

Mientras se sustituye el importador, el conciliador debe tratar los archivos
Excel, XLS y CSV como contenido no confiable:

- El acceso al conciliador debe quedar limitado a roles autorizados; no deben
  exponerse rutas públicas de carga para estos archivos.
- Se deben importar exclusivamente estados de cuenta obtenidos directamente del
  banco. No se deben abrir archivos recibidos por correo, mensajería o terceros.
- El análisis ocurre en el navegador y el archivo Excel no se transmite al
  backend. Los PDF siguen el flujo independiente del backend.
- Si se requiere importar archivos de terceros, conviértelos primero a CSV en
  una estación aislada y revísalos antes de cargarlos.
- La interfaz limita las cargas a PDF, XLS, XLSX o CSV de hasta 10 MiB;
  cualquier aumento requiere revisión de seguridad.

Antes del lanzamiento, se debe decidir entre sustituir SheetJS por un parser
con soporte de seguridad vigente o mantener este riesgo aceptado, documentado
y limitado a exportaciones bancarias de personal autorizado. Revisar `npm
audit` en cada despliegue: cuando npm publique una versión corregida de
`xlsx`, actualizarla, probar el conciliador y eliminar esta excepción.
