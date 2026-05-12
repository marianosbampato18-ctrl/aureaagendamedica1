#!/bin/bash
# Backup automático diario — Áurea Agenda
export PATH="$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export BACKUP_DEST="$HOME/Desktop/Aurea Backup"

cd "$(dirname "$0")"

# Chequear si ya existe un backup de hoy
HOY=$(date +%Y-%m-%d)
if ls "$BACKUP_DEST"/backup_${HOY}_* 1>/dev/null 2>&1; then
  # Ya hay backup de hoy, no hacer nada
  exit 0
fi

# Instalar dependencias si hace falta
if [ ! -d "node_modules" ]; then
  npm install --silent
fi

echo "[$(date '+%Y-%m-%d %H:%M')] Iniciando backup..." >> "$BACKUP_DEST/backup.log"
node generar-backup.js >> "$BACKUP_DEST/backup.log" 2>&1
