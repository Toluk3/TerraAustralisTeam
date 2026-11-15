#!/usr/bin/env bash
set -Eeuo pipefail

WEB_ROOT="/var/www/terra-australis"
DOMAIN="www.terraaustralis.space"
CERT_FILE="/etc/ssl/cloudflare/terraaustralis-origin.pem"
KEY_FILE="/etc/ssl/cloudflare/terraaustralis-origin.key"
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

for command in sudo apt-get npm node; do
  command -v "$command" >/dev/null 2>&1 || fail "Falta '$command'. Instala el requisito y vuelve a ejecutar el script."
done

sudo -v

sudo test -r "$CERT_FILE" || fail "No se puede leer el certificado Origin: $CERT_FILE."
sudo test -r "$KEY_FILE" || fail "No se puede leer la clave privada Origin: $KEY_FILE."

if ! command -v nginx >/dev/null 2>&1; then
  fail "Nginx no esta instalado. Instala nginx antes de ejecutar el despliegue."
fi

if ! command -v rsync >/dev/null 2>&1; then
  sudo apt-get update
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y rsync
fi

node_version="$(node --version)"
node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  const supported = (major === 22 && minor >= 18) || major > 24 || (major === 24 && minor >= 12);
  process.exit(supported ? 0 : 1);
' || fail "Se requiere Node.js ^22.18.0 o >=24.12.0 (actual: $node_version)."

printf 'Instalando dependencias y compilando el frontend...\n'
(
  cd "$FRONTEND_DIR"
  npm ci
  npm run build
)

printf 'Publicando los archivos en %s...\n' "$WEB_ROOT"
sudo install -d -m 755 "$WEB_ROOT"
sudo rsync -a --delete "$FRONTEND_DIR/dist/" "$WEB_ROOT/"

sudo tee /etc/nginx/sites-available/terra-australis >/dev/null <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $DOMAIN;

    ssl_certificate $CERT_FILE;
    ssl_certificate_key $KEY_FILE;
    ssl_protocols TLSv1.2 TLSv1.3;

    root $WEB_ROOT;
    index index.html;

    location / {
        try_files \$uri \$uri/ =404;
    }
}
NGINX

sudo ln -sfn /etc/nginx/sites-available/terra-australis /etc/nginx/sites-enabled/terra-australis
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx

printf '\nDespliegue listo: https://%s/\n' "$DOMAIN"
printf 'Nginx atiende en 80/443; no se expone ningun puerto de aplicacion.\n'
