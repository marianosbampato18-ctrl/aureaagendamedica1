#!/bin/bash
# ── ÁUREA CLINIC — Deploy automático ──────────────────────
# Uso: ./deploy.sh
# Copia los archivos de Claude desde Descargas y sube a GitHub

REPO="$HOME/aureaagendamedica1"
DOWNLOADS="$HOME/Downloads"

echo "🔄 Iniciando deploy..."

# Copiar archivos JS si existen en Descargas
if ls "$DOWNLOADS"/*.js 2>/dev/null | head -1 > /dev/null; then
  echo "📂 Copiando archivos JS..."
  cp "$DOWNLOADS"/*.js "$REPO/js/"
fi

# Copiar index.html si existe en Descargas
if [ -f "$DOWNLOADS/index.html" ]; then
  echo "📄 Copiando index.html..."
  cp "$DOWNLOADS/index.html" "$REPO/"
fi

# Copiar ZIP si existe y descomprimirlo
if [ -f "$DOWNLOADS/aurea-deploy.zip" ]; then
  echo "📦 Descomprimiendo ZIP..."
  unzip -o "$DOWNLOADS/aurea-deploy.zip" -d "$DOWNLOADS/aurea-deploy-tmp"
  cp -r "$DOWNLOADS/aurea-deploy-tmp/"* "$REPO/"
  rm -rf "$DOWNLOADS/aurea-deploy-tmp"
  rm "$DOWNLOADS/aurea-deploy.zip"
fi

# Git push
cd "$REPO"
git add .
FECHA=$(date '+%Y-%m-%d %H:%M')
git commit -m "Deploy automático — $FECHA"
git push origin main

echo "✅ Deploy completado — $(date '+%H:%M:%S')"
echo "🌐 https://marianosbampato18-ctrl.github.io/aureaagendamedica1"
