# Despliegue de la web en una VPS

La demo actual es una web estatica: no necesita PostgreSQL ni un backend. Los datos no estan en Git; el script descarga los JSON S1 ya generados desde el release privado `datos-s1-2026-11-15` y **no ejecuta el pipeline ni vuelve a crear la base DuckDB**. Nginx sirve los archivos directamente para `www.terraaustralis.space`; no se abre ningun puerto de aplicacion.

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

La VPS debe tener lo indicado en la preparacion inicial del servidor, incluido Git, Nginx, Node.js 20, npm, Python y `unzip`. También necesita GitHub CLI (`gh`) autenticado con acceso al repo y su release: la llave SSH permite clonar el repo, pero no descargar el release privado mediante la API.

```bash
sudo apt install -y gh rsync
gh auth login --hostname github.com --git-protocol ssh
```

La descarga y descompresion requieren espacio libre suficiente (el ZIP ocupa varios cientos de MB y los datos descomprimidos aproximadamente 2,2 GB).

## Clonar y desplegar

Desde `/opt/terra`, clona con la llave SSH y ejecuta el despliegue:

```bash
git clone git@github.com:Toluk3/TerraAustralisTeam.git
cd TerraAustralisTeam
bash scripts/deploy_vps.sh
```

El script descarga los datos, instala dependencias npm, compila el sitio con `mock-s1`, configura Nginx para redirigir HTTP a HTTPS y servir el contenido en `/var/www/terra-australis`. Habilita Nginx al iniciar el sistema. La web queda disponible en `https://www.terraaustralis.space/`.
