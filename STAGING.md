# Ambiente de Staging

Hoy el flujo es local → producción directo (`git pull` + `deploy.sh` en el
VPS de producción). Esto documenta cómo montar un ambiente intermedio —
requiere acceso al VPS (o a uno nuevo), que este asistente no tiene, así que
son los pasos a seguir manualmente, no algo que se pueda ejecutar desde el repo.

## Opción recomendada: mismo VPS, segundo subdominio

Más barato que un servidor nuevo, y suficiente para un colegio-cliente
(el volumen de staging es bajo). Aislar bien BD y servicio es lo que importa,
no la máquina física.

1. **Base de datos separada**: crear un `octopus_staging` en el mismo
   Postgres del servidor (`CREATE DATABASE octopus_staging;`), nunca
   apuntar staging a la BD de producción.

2. **Segundo checkout del repo**:
   ```bash
   sudo mkdir -p /var/www/octopus-staging
   git clone <repo> /var/www/octopus-staging
   ```

3. **`.env` propio** en `/var/www/octopus-staging/octopus-api/.env` —
   mismo formato que producción pero con `DB_NAME=octopus_staging`,
   `DJANGO_ALLOWED_HOSTS` apuntando al subdominio de staging (ej.
   `staging.tudominio.com`), y **credenciales SMTP/WhatsApp de prueba**
   (no las reales — evita mandar recordatorios de mora reales a
   representantes reales desde staging).

4. **Servicio systemd propio** (`octopus-staging.service`), copiando el
   `octopus.service` existente y apuntando `WorkingDirectory`/`ExecStart`
   al checkout de staging, puerto interno distinto (ej. 8001 en vez de 8000).

5. **Bloque nginx propio** para `staging.tudominio.com` → proxy al puerto
   interno de staging, con su propio certificado SSL (certbot lo emite
   aparte, es un subdominio distinto).

6. **Deploy a staging** con el mismo script parametrizado (ver `deploy.sh`,
   ya ajustado para aceptar overrides):
   ```bash
   REPO=/var/www/octopus-staging SERVICE=octopus-staging ./deploy.sh
   ```

## Flujo de trabajo sugerido

```
local → push a una rama → deploy manual a staging → probar →
merge a main → deploy a producción
```

El CI (`.github/workflows/ci.yml`) ya corre tests/build en cada push/PR a
`main` — staging es el paso siguiente, antes de que el cambio llegue a
producción, no un reemplazo del CI.

## Qué NO hacer

- No apuntar staging a la BD de producción "para probar con datos reales" —
  cualquier bug en un script de staging (ej. un comando de gestión con
  `--confirm` corrido sin querer) se lleva los datos reales.
- No usar las credenciales SMTP/WhatsApp reales en staging — un test mal
  hecho no debe mandarle un recordatorio de mora a un representante real.
