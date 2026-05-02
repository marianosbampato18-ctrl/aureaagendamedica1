#!/bin/bash
# ═══════════════════════════════════════════════════════
# Genera el backup completo de Aurea Agenda
# ═══════════════════════════════════════════════════════

export PATH="$HOME/.npm-global/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        Backup de Aurea Agenda            ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Verificar que node esté disponible
if ! command -v node &> /dev/null; then
  echo "❌ Error: Node.js no está instalado."
  echo "   Instalalo desde https://nodejs.org"
  exit 1
fi

# Instalar dependencias si hace falta
if [ ! -d "node_modules" ]; then
  echo "→ Instalando dependencias..."
  npm install
  echo ""
fi

# Ejecutar el backup
node generar-backup.js

echo ""
