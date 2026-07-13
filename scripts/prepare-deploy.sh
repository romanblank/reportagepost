#!/usr/bin/env bash
# Gate перед каждым git add результатов и каждым деплоем.
# exit 1 = деплой/коммит запрещён. Причины печатаются.
set -euo pipefail
cd "$(dirname "$0")/.."

FAIL=0
say() { echo "❌ $1"; FAIL=1; }

# 1. Секреты в отслеживаемых файлах
if git ls-files --cached --others --exclude-standard | grep -E '(^|/)\.env(\..*)?$' | grep -v '\.env\.example$' >/dev/null 2>&1; then
  say "В git попали .env-файлы"
fi
PATTERNS='(api[_-]?key|secret|password|token)["'"'"']?\s*[:=]\s*["'"'"'][A-Za-z0-9_\-]{16,}'
if git ls-files --cached --others --exclude-standard -z | xargs -0 grep -lEi "$PATTERNS" 2>/dev/null | grep -v 'prepare-deploy.sh' >/dev/null; then
  say "Похоже на захардкоженный секрет (api key/password/token) в трекаемых файлах:"
  git ls-files --cached --others --exclude-standard -z | xargs -0 grep -lEi "$PATTERNS" 2>/dev/null | grep -v 'prepare-deploy.sh' || true
fi

# 2. Внутренние доки vault в трекинге
if git ls-files --cached --others --exclude-standard | grep -Ei '(docs-vault|credentials)' >/dev/null 2>&1; then
  say "Внутренние документы (vault/credentials) в трекинге"
fi

# 3. Dev-мусор
if git ls-files --cached --others --exclude-standard | grep -E '(\.DS_Store|\.log$|~$|\.tmp$|scratch|TODO-local)' >/dev/null 2>&1; then
  say "Dev-мусор в трекинге (.DS_Store/логи/tmp)"
fi

# 4. Тесты и билд
echo "→ npm test"
npm test --silent || say "Тесты падают"
echo "→ npm run build"
npm run build >/dev/null 2>&1 || say "Билд падает"

if [ "$FAIL" -eq 1 ]; then
  echo ""; echo "⛔ prepare-deploy: НЕ ПРОШЁЛ. Чинить до коммита/деплоя."; exit 1
fi
echo "✅ prepare-deploy: чисто."
