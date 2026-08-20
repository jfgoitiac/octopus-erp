# Fase 4 — Infra/deploy del sitio institucional

Pasos de una sola vez para poner `octopus-sitio/` en producción en el dominio
raíz (`clhma.com`), sin tocar el subdominio existente (`app.clhma.com`, panel
admin + API Django).

## 1. DNS

Apuntar en el proveedor de DNS (una sola vez, antes de todo lo demás):

| Registro | Tipo | Valor |
|---|---|---|
| `clhma.com` | A | IP del servidor |
| `www.clhma.com` | A (o CNAME a `clhma.com`) | IP del servidor |

## 2. Carpeta del sitio en el servidor

```bash
sudo mkdir -p /var/www/octopus/octopus-sitio
sudo chown $USER:$USER /var/www/octopus/octopus-sitio
```

(`/var/www/octopus/octopus-api` y `/var/www/octopus/octopus-frontend` ya
existen — ver `deploy.sh`. `octopus-sitio` es un tercer proyecto dentro del
mismo repo/checkout, mismo patrón.)

## 3. CORS en el backend (Django)

El sitio público (`octopus-sitio`) llama a la API real (`https://app.clhma.com`)
desde otro origen (`https://clhma.com`), así que hay que agregarlo a la
variable de entorno ya existente `DJANGO_CORS_ORIGINS` (ver
`octopus-api/config/settings.py` — no requiere cambio de código, es 100% por
variable de entorno). En el `.env` del backend en el servidor:

```
DJANGO_CORS_ORIGINS="https://app.clhma.com https://clhma.com https://www.clhma.com"
```

Luego reiniciar el backend (`sudo systemctl restart octopus`, ya lo hace
`deploy.sh`).

## 4. Primer certificado SSL (certbot, modo webroot)

Nginx necesita poder responder en el puerto 80 **antes** de pedir el
certificado (el bloque HTTP de `clhma.com.conf` ya sirve
`/.well-known/acme-challenge/` desde `/var/www/certbot`):

```bash
sudo mkdir -p /var/www/certbot

# Copiar y habilitar el server block (el bloque HTTPS falla hasta tener el
# certificado — nginx -t señala eso, es esperado en este punto).
sudo cp deploy/nginx/clhma.com.conf /etc/nginx/sites-available/clhma.com
sudo ln -s /etc/nginx/sites-available/clhma.com /etc/nginx/sites-enabled/clhma.com

# Comentar temporalmente los dos server{} de 443 si nginx -t falla por
# certificado inexistente, recargar solo con el bloque :80, y ahí sí:
sudo certbot certonly --webroot -w /var/www/certbot -d clhma.com -d www.clhma.com

# Descomentar los bloques 443, luego:
sudo nginx -t && sudo systemctl reload nginx
```

Certbot instala su propio timer de renovación automática (`certbot.timer`) —
no requiere ningún paso periódico manual ni entra en `deploy.sh`.

## 5. Variables de entorno del sitio (build)

`octopus-sitio/.env.production` (no versionado, igual que
`octopus-frontend/.env.production`) ya apunta a la API real:

```
VITE_API_BASE_URL=https://app.clhma.com
```

## 6. Deploy

A partir de acá, `deploy.sh` (raíz del repo) ya incluye el build de
`octopus-sitio` — correrlo normalmente hace `git pull` + build de los tres
proyectos + reload de nginx.
