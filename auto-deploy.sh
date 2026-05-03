#!/bin/bash
# ─── ÁUREA CLINIC — Deploy automático (v2) ─────────────────────────
# Uso:
#   ./auto-deploy.sh                      → mensaje por defecto + timestamp
#   ./auto-deploy.sh "mi mensaje"         → mensaje custom
#
# Qué hace:
#   1) Copia archivos desde ~/Desktop/Aurea agenda/ al repo ~/aureaagendamedica1/
#      (index.html, js/*.js, aurea-monogram.png).
#   2) Asegura que .gitignore excluya .DS_Store.
#   3) Limpia .git/index.lock viejo si quedó stale.
#   4) git add -A → commit → push origin main.
#   5) Idempotente: si no hay cambios, sale limpio sin commitear.
# ───────────────────────────────────────────────────────────────────

set -euo pipefail

SRC="$HOME/Desktop/Aurea agenda"
REPO="$HOME/aureaagendamedica1"
MSG="${1:-Update agenda — $(date '+%Y-%m-%d %H:%M')}"

echo "🔄 Deploy: $SRC → $REPO"

# ── 0) Sanity checks ──────────────────────────────────────────────
[ -d "$SRC" ]      || { echo "❌ No existe carpeta fuente: $SRC"; exit 1; }
[ -d "$REPO/.git" ] || { echo "❌ $REPO no es un repo git válido"; exit 1; }

# ── 1) Limpiar index.lock stale ───────────────────────────────────
LOCK="$REPO/.git/index.lock"
if [ -f "$LOCK" ]; then
  if pgrep -x git >/dev/null 2>&1; then
    echo "❌ Hay un proceso git corriendo. Esperá a que termine y reintentá."
    exit 1
  fi
  # macOS: stat -f %m ; Linux: stat -c %Y. Probamos ambos.
  LOCK_MTIME=$(stat -f %m "$LOCK" 2>/dev/null || stat -c %Y "$LOCK" 2>/dev/null || echo 0)
  AGE=$(( $(date +%s) - LOCK_MTIME ))
  if [ "$AGE" -gt 30 ]; then
    echo "🧹 Removiendo index.lock viejo (${AGE}s sin uso)"
    rm -f "$LOCK"
  else
    echo "⏳ index.lock reciente (${AGE}s), esperando 5s..."
    sleep 5
    rm -f "$LOCK" 2>/dev/null || { echo "❌ No se pudo remover $LOCK"; exit 1; }
  fi
fi

# ── 2) .gitignore con .DS_Store ───────────────────────────────────
GITIGNORE="$REPO/.gitignore"
if [ ! -f "$GITIGNORE" ] || ! grep -qx '.DS_Store' "$GITIGNORE"; then
  echo "📝 Asegurando .gitignore"
  printf '.DS_Store\n**/.DS_Store\n' > "$GITIGNORE"
fi

# ── 3) Copiar archivos ────────────────────────────────────────────
echo "📂 Copiando archivos..."
cp "$SRC/index.html" "$REPO/index.html"
mkdir -p "$REPO/js"
# Copiamos todos los .js (sin .DS_Store)
shopt -s nullglob
js_files=( "$SRC"/js/*.js )
shopt -u nullglob
if [ "${#js_files[@]}" -eq 0 ]; then
  echo "⚠️  No hay .js en $SRC/js/"
else
  cp "${js_files[@]}" "$REPO/js/"
fi
[ -f "$SRC/aurea-monogram.png" ] && cp "$SRC/aurea-monogram.png" "$REPO/aurea-monogram.png"

# ── 4) Git add + commit + push ────────────────────────────────────
cd "$REPO"
git add -A

if git diff --cached --quiet; then
  echo "✅ Sin cambios pendientes — nada para deployar."
  exit 0
fi

echo "📝 Commit: $MSG"
git commit -m "$MSG"

echo "🚀 Push origin main..."
git push origin main

echo ""
echo "✅ Deploy OK — $(date '+%Y-%m-%d %H:%M:%S')"
echo "🌐 https://marianosbampato18-ctrl.github.io/aureaagendamedica1"
