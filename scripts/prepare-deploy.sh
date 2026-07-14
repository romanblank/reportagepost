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

# 4. Lint (аудит №5: раньше не в гейте → ошибки react-hooks копились незаметно
# при зелёных сборках). eslint падает только на errors, warnings не блокируют.
# БЕЗ пайпа — иначе exit-код маскируется (урок про gate-пайп в CLAUDE.md).
echo "→ npm run lint"
npm run lint >/dev/null 2>&1 || say "Lint падает (ошибки ESLint — прогони: npm run lint)"

# 5. Тесты и билд
echo "→ npm test"
npm test --silent || say "Тесты падают"
# Билд БЕЗ DATABASE_URL — как реальный Docker-билд в CI (урок 2026-07-14:
# страница со static/ISR, лезущая в БД, падает на пререндере; локальный .env
# это маскировал). Ловим класс ошибки здесь, а не в пайплайне.
echo "→ npm run build (без DATABASE_URL, как в Docker)"
env -u DATABASE_URL npm run build >/dev/null 2>&1 || say "Билд падает (проверь static-страницы, лезущие в БД → force-dynamic)"

if [ "$FAIL" -eq 1 ]; then
  echo ""; echo "⛔ prepare-deploy: НЕ ПРОШЁЛ. Чинить до коммита/деплоя."; exit 1
fi
echo "✅ prepare-deploy: чисто."
