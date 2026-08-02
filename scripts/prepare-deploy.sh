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
# 5. Тайпчек ВСЕГО проекта, включая tests/ (аудит 2026-08-01, P1).
# `next build` проверяет типы только того, что попадает в бандл, — тесты и
# скрипты не проверялись ничем. Ошибка типа в тесте всплывала бы лишь при
# падении рантайма, а тип-уровневые проверки (задел на en.ts) вообще не имели
# исполнителя. tsc --noEmit покрывает include из tsconfig целиком.
echo "→ npm run typecheck"
npm run typecheck --silent || say "Ошибки типов (tsc --noEmit)"

echo "→ npm test"
npm test --silent || say "Тесты падают"
# Билд БЕЗ DATABASE_URL — как реальный Docker-билд в CI (урок 2026-07-14:
# страница со static/ISR, лезущая в БД, падает на пререндере; локальный .env
# это маскировал). Ловим класс ошибки здесь, а не в пайплайне.
# 7. E2E-батарея (2026-08-02). Её гонял только CI, поэтому изменение
# trust-модели прошло гейт зелёным и упало на раннере: локально «всё хорошо»,
# а деплой красный. Гейт обязан ловить то же, что CI, иначе он даёт ложное
# чувство готовности. Без DATABASE_URL батарея сама пропускается.
echo "→ npm run e2e"
npm run e2e --silent || say "E2E-батарея падает"

echo "→ npm run build (без DATABASE_URL, как в Docker)"
env -u DATABASE_URL npm run build >/dev/null 2>&1 || say "Билд падает (проверь static-страницы, лезущие в БД → force-dynamic)"

# Аудит выдач: обход живых страниц собранного приложения. Ловит то, что не
# видят ни типы, ни тесты, — непереведённый статус, `undefined` в фразе,
# невыведенный ключ словаря, битую картинку, soft-404. Требует базы: без неё
# нечего рендерить, поэтому шаг пропускается (правило (c), env-зависимость).
if [ -n "${DATABASE_URL:-}" ] || grep -qs '^DATABASE_URL=' .env; then
  echo "→ npm run audit:pages (обход страниц собранного приложения)"
  npm run audit:pages --silent || say "Аудит выдач нашёл замечания на страницах"
else
  echo "→ аудит выдач пропущен: нет DATABASE_URL"
fi

# 6. Деструктивные миграции (аудит 2026-08-01, P1).
# Авто-откат деплоя поднимает ПРЕЖНИЙ образ, а миграции forward-only — то есть
# старый код встречает новую схему. При аддитивных (expand-contract) правках
# это безопасно, а вот DROP COLUMN/TABLE или переименование ломают откат:
# откатились — и прод падает на отсутствующей колонке. Здесь не запрещаем, а
# требуем ОСОЗНАННОСТИ: пометить миграцию комментарием -- SAFE-TO-ROLLBACK
# после того, как убедились, что прежний образ переживёт новую схему.
NEW_MIGRATIONS=$(git status --porcelain prisma/migrations 2>/dev/null | awk '{print $2}' | grep -E 'migration\.sql$' || true)
if [ -n "$NEW_MIGRATIONS" ]; then
  for m in $NEW_MIGRATIONS; do
    [ -f "$m" ] || continue
    if grep -qiE '(DROP TABLE|DROP COLUMN|RENAME COLUMN|RENAME TO|ALTER COLUMN .* TYPE)' "$m"; then
      grep -qi 'SAFE-TO-ROLLBACK' "$m" \
        || say "Миграция $m деструктивна (DROP/RENAME/ALTER TYPE) — откат деплоя на прежний образ сломает прод. Проверь совместимость и добавь в файл строку: -- SAFE-TO-ROLLBACK: <почему прежний код переживёт эту схему>"
    fi
  done
fi

if [ "$FAIL" -eq 1 ]; then
  echo ""; echo "⛔ prepare-deploy: НЕ ПРОШЁЛ. Чинить до коммита/деплоя."; exit 1
fi
echo "✅ prepare-deploy: чисто."
