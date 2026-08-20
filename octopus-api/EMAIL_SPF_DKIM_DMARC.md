# SPF, DKIM y DMARC — correos de cobranza

Los correos automáticos (día 0/5/10/15, bienvenida al portal, recuperación
de contraseña, recibos) se envían por SMTP configurado en `.env`
(`EMAIL_HOST`, `EMAIL_HOST_USER`, etc. — ver `config/settings.py`). Sin los
tres registros DNS de abajo, buena parte de esos correos termina en spam o
se rechaza directamente, sin que el sistema se entere (el log en
`NotificacionLog` los marca como "enviado" porque el SMTP los aceptó — el
destino final ya no depende del código).

Esto es configuración de **DNS del dominio remitente**, no del código — no
se puede aplicar desde el repo. Pasos para quien administre el DNS del
dominio (Cloudflare, el panel del registrador, etc.):

## 1. Identificar el dominio remitente real

Es el dominio de `PORTAL_EMAIL_FROM` / `DEFAULT_FROM_EMAIL` en el `.env` de
producción (ej. `noreply@tucolegio.edu.ve`), **no** necesariamente el mismo
dominio que `EMAIL_HOST` (ej. Gmail SMTP puede enviar "en nombre de" otro
dominio, pero SPF/DKIM se validan contra el dominio del `From:`).

## 2. SPF (Sender Policy Framework)

Registro TXT en el dominio remitente que dice qué servidores tienen permiso
de enviar correo "de parte" de ese dominio.

- Si el envío es vía Gmail/Google Workspace:
  ```
  TXT  @  "v=spf1 include:_spf.google.com ~all"
  ```
- Si es otro proveedor SMTP, usar el `include:` que ese proveedor documente.
- Solo puede existir **un** registro SPF por dominio — si ya hay uno, agregar
  el `include:` nuevo al existente en vez de crear un segundo registro.

## 3. DKIM (DomainKeys Identified Mail)

Firma criptográfica que confirma que el correo no fue alterado en tránsito.

- Se genera un par de claves en el proveedor SMTP (Google Workspace Admin →
  Apps → Gmail → Autenticación de correo electrónico, u opción equivalente).
- El proveedor da un registro TXT tipo `google._domainkey.tudominio.com` con
  la clave pública — se publica tal cual en el DNS.
- Sin esto, SPF solo valida el servidor de envío, no el contenido.

## 4. DMARC (Domain-based Message Authentication)

Le dice a los servidores receptores qué hacer si un correo falla SPF o
DKIM, y a dónde mandar reportes.

```
TXT  _dmarc  "v=DMARC1; p=quarantine; rua=mailto:director@tucolegio.edu.ve; pct=100"
```

- Empezar con `p=quarantine` (spam, no rechazo total) durante las primeras
  semanas mientras se confirma que SPF/DKIM están bien configurados.
- Subir a `p=reject` una vez que los reportes (`rua`) no muestren fallos
  legítimos — a partir de ahí, un correo que falle la validación se
  descarta directamente en vez de llegar a spam.

## 5. Verificar

- [mail-tester.com](https://www.mail-tester.com) (gratis, sin cuenta): envía
  un correo de prueba desde el sistema (ej. un "olvidé mi contraseña" de
  prueba) a la dirección que da la herramienta, y muestra el puntaje SPF/DKIM/DMARC.
- `dig TXT tudominio.com` / `dig TXT _dmarc.tudominio.com` para confirmar
  que los registros ya propagaron (puede tardar hasta 48h).

## Nota sobre multi-colegio

Si distintos colegios (clientes de Octopus) envían desde **su propio**
dominio (`PerfilEmailRemitente` por área, ver `notificaciones/models.py`),
estos tres pasos hay que repetirlos por cada dominio remitente distinto —
no es una configuración única a nivel de la plataforma.
