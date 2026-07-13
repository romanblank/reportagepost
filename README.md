# Reportage Post

Платформа-сообщество репортажных (событийных) фотографов: каталог, портфолио, рейтинги, заявки, PRO-подписка. reportagepost.com.

Внутренние документы: `VISION.md` (что и зачем), `CLAUDE.md` (правила работы), план и решения — в docs-vault вне репо.

## Запуск локально

```bash
docker compose up -d        # PostgreSQL 17 (порт 5434)
cp .env.example .env        # заполнить DATABASE_URL (для локали уже совпадает)
npm install
npx prisma migrate dev      # миграции + генерация клиента
npm run dev                 # http://localhost:3000 (сборка webpack)
```

## Проверки

```bash
npm test                    # Vitest (эталон — в CLAUDE.md)
npm run build               # прод-сборка
./scripts/prepare-deploy.sh # gate перед коммитом/деплоем
```
