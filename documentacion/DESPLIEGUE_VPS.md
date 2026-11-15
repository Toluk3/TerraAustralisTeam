# Despliegue de la web en una VPS

El despliegue publica el frontend científico de `web/` en la raíz del sitio, como web estática (EduAustralis es una sección de esa app, en `/#/edu`); no necesita PostgreSQL ni un backend. Nginx sirve los archivos compilados para `www.terraaustralis.space`; no se abre ningun puerto de aplicacion. La demo independiente de `frontend/map/` no se publica.

## Preparacion previa

1. En Cloudflare, crea un **Origin Certificate** para `www.terraaustralis.space`. Guarda el certificado y su clave privada.
2. En la VPS, instala ambos archivos en estas rutas:

   - Certificado: `/etc/ssl/cloudflare/terraaustralis-origin.pem`
   - Clave privada: `/etc/ssl/cloudflare/terraaustralis-origin.key`

   ```bash
   sudo install -d -m 700 /etc/ssl/cloudflare
   sudo nano /etc/ssl/cloudflare/terraaustralis-origin.pem
   sudo nano /etc/ssl/cloudflare/terraaustralis-origin.key
   sudo chown root:root /etc/ssl/cloudflare/terraaustralis-origin.*
   sudo chmod 644 /etc/ssl/cloudflare/terraaustralis-origin.pem
   sudo chmod 600 /etc/ssl/cloudflare/terraaustralis-origin.key
   ```

   Pega el certificado en el primer archivo y la clave privada en el segundo. No guardes la clave en el repositorio ni la compartas.
3. En Cloudflare DNS, apunta el registro `www` a la IP de la VPS con proxy habilitado (nube naranja) y configura **SSL/TLS → Full (strict)**.
4. Permite conexiones entrantes al origen en los puertos 80 y 443. No hace falta abrir 8080.

La VPS necesita Git, Nginx, Node.js `^22.18.0` o `>=24.12.0` y npm. El script instala `rsync` si hace falta. No requiere GitHub CLI ni Python.

**Datos del mapa:** la pantalla Análisis lee la carpeta `mock-s1/` del release [`datos-s1-2026-11-15`](https://github.com/Toluk3/TerraAustralisTeam/releases/tag/datos-s1-2026-11-15) (`S1_mapa_mock-s1.zip`, 2,2 GB descomprimido). Descomprimirla antes en `web/public/mock-s1/` o en `frontend/map/public/mock-s1/`, o indicar otra ubicación con `MOCK_DIR=/ruta/mock-s1`. Sin ella el sitio se publica igual y Análisis muestra "sin datos".

## Clonar y desplegar

Desde `/opt/terra`, clona con la llave SSH y ejecuta el despliegue:

```bash
git clone git@github.com:Toluk3/TerraAustralisTeam.git
cd TerraAustralisTeam
bash scripts/deploy_vps.sh
```

El script:

1. Compila `web/` con `VITE_MOCK_BASE=mock-s1` y publica `web/dist/` en `/var/www/terra-australis` (`rsync --delete`, sin tocar `/mock-s1/`; si quedó un `/edu/` de un despliegue anterior, lo borra).
2. Copia `mock-s1/` a `/var/www/terra-australis/mock-s1/` (primera que encuentre entre `MOCK_DIR`, `web/public/mock-s1` y `frontend/map/public/mock-s1`).
3. Configura Nginx para redirigir HTTP a HTTPS y servir el contenido (con caché de una hora para `/mock-s1/`), y lo habilita al iniciar el sistema.

La app usa rutas con `#` (`/#/analisis`), así que `try_files $uri $uri/ =404` alcanza. La web queda disponible en `https://www.terraaustralis.space/` y EduAustralis en `https://www.terraaustralis.space/#/edu`. La app vieja de `frontend/` ya no se publica.

```bash
MOCK_DIR=/opt/terra/datos/mock-s1 bash scripts/deploy_vps.sh   # si los datos están en otra carpeta
```
