#!/bin/bash
# ═══════════════════════════════════════════════════════
# Configura las reglas de Firebase Storage en 1 paso
# ═══════════════════════════════════════════════════════

export PATH="$HOME/.npm-global/bin:$PATH"
cd "$(dirname "$0")"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Configuración de Firebase Storage Rules ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "→ Se va a abrir el browser para que inicies sesión con Google."
echo "  Usá la cuenta que administra el proyecto Firebase (agenda-bruna-nara)."
echo ""

firebase login

echo ""
echo "→ Publicando reglas de Storage..."
echo ""

firebase deploy --only storage

echo ""
echo "✅ Listo. Las reglas fueron publicadas correctamente."
echo "   Ya podés subir archivos desde la app."
echo ""
