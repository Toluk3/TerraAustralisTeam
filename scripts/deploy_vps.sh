#!/usr/bin/env bash
set -Eeuo pipefail

REPO="Toluk3/TerraAustralisTeam"
RELEASE_TAG="datos-s1-2026-11-15"
ASSET_NAME="S1_mapa_mock-s1.zip"
WEB_ROOT="/var/www/terra-australis"
DOMAIN="www.terraaustralis.space"
CERT_FILE="/etc/ssl/cloudflare/terraaustralis-origin.pem"
KEY_FILE="/etc/ssl/cloudflare/terraaustralis-origin.key"
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
MAP_DIR="$ROOT_DIR/frontend/map"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf -- "$TMP_DIR"
}
trap cleanup EXIT

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

for command in sudo apt-get gh npm node; do
  command -v "$command" >/dev/null 2>&1 || fail "Falta '$command'. Instala el requisito y vuelve a ejecutar el script."
done

sudo -v
gh auth status --hostname github.com >/dev/null 2>&1 ||
  fail "GitHub CLI no esta autenticado. Ejecuta 'gh auth login' con acceso a $REPO."

sudo test -r "$CERT_FILE" || fail "No se puede leer el certificado Origin: $CERT_FILE."
sudo test -r "$KEY_FILE" || fail "No se puede leer la clave privada Origin: $KEY_FILE."

if ! command -v nginx >/dev/null 2>&1; then
  fail "Nginx no esta instalado. Instala nginx antes de ejecutar el despliegue."
fi

if ! command -v unzip >/dev/null 2>&1; then
  fail "unzip no esta instalado. Instala unzip antes de ejecutar el despliegue."
fi

if ! command -v rsync >/dev/null 2>&1; then
  sudo apt-get update
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y rsync
fi

node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
(( node_major >= 18 )) || fail "Se requiere Node.js 18 o posterior (actual: $(node --version))."

printf 'Descargando los datos publicados (%s)...\n' "$RELEASE_TAG"
gh release download "$RELEASE_TAG" \
  --repo "$REPO" \
  --pattern "$ASSET_NAME" \
  --dir "$TMP_DIR"

mkdir -p "$TMP_DIR/unpacked"
unzip -q "$TMP_DIR/$ASSET_NAME" -d "$TMP_DIR/unpacked"
[[ -f "$TMP_DIR/unpacked/mock-s1/meta.json" ]] ||
  fail "El archivo publicado no contiene mock-s1/meta.json."

printf 'Instalando dependencias y compilando el frontend...\n'
(
  cd "$MAP_DIR"
  npm ci
  VITE_MOCK_BASE=mock-s1 npm run build
)

printf 'Publicando los archivos en %s...\n' "$WEB_ROOT"
sudo install -d -m 755 "$WEB_ROOT"
sudo rsync -a --delete "$MAP_DIR/dist/" "$WEB_ROOT/"
sudo rsync -a --delete --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
  "$TMP_DIR/unpacked/mock-s1/" "$WEB_ROOT/mock-s1/"

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
