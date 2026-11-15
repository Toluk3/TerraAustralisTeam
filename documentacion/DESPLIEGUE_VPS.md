# Despliegue de la web en una VPS

El despliegue publica la nueva interfaz Vue de `frontend/` como una web estatica; no necesita PostgreSQL ni un backend. Nginx sirve los archivos compilados para `www.terraaustralis.space`; no se abre ningun puerto de aplicacion. La demo científica independiente de `frontend/map/` no es la interfaz que publica este script.

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

La VPS necesita Git, Nginx, Node.js `^22.18.0` o `>=24.12.0` y npm. El script instala `rsync` si hace falta. No requiere GitHub CLI, Python, unzip ni descargar el archivo de datos.

## Clonar y desplegar

Desde `/opt/terra`, clona con la llave SSH y ejecuta el despliegue:

```bash
git clone git@github.com:Toluk3/TerraAustralisTeam.git
cd TerraAustralisTeam
bash scripts/deploy_vps.sh
```

El script instala las dependencias de `frontend/`, compila esa app Vue y publica `frontend/dist/` en `/var/www/terra-australis`. Luego configura Nginx para redirigir HTTP a HTTPS y servir el contenido, y habilita Nginx al iniciar el sistema. La web queda disponible en `https://www.terraaustralis.space/`.

## Pendiente: publicar el frontend científico (`web/`)

El frontend científico vive en `web/` (ver [`../web/README.md`](../web/README.md)). **El script todavía no lo publica**: sigue compilando `frontend/` (EduAustralis). El cambio previsto, sin aplicar porque `scripts/` queda fuera del alcance de la rama `feature/frontend-cientifico` hasta que el equipo lo apruebe:

1. Compilar `web/` con `VITE_MOCK_BASE=mock-s1 VITE_EDU_URL=/edu/ npm run build` y publicar `web/dist/` en la raíz (`/var/www/terra-australis`), con `rsync --delete --exclude '/edu/' --exclude '/mock-s1/'` para no borrar lo que se publica aparte.
2. Si existe `frontend/`, compilar EduAustralis con `npm run build -- --base=/edu/` y publicarlo en `/var/www/terra-australis/edu/`.
3. Copiar la carpeta `mock-s1/` (release `datos-s1-2026-11-15`, `S1_mapa_mock-s1.zip`) a `/var/www/terra-australis/mock-s1/`; sin ella la pantalla Análisis muestra "sin datos".
4. Nginx no cambia: la app usa historial con `#`, así que `try_files $uri $uri/ =404` alcanza. Opcional: `Cache-Control` para `/mock-s1/`.
