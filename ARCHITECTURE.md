# Карта кода — Reportage Post

Одностраничник «где что лежит» (оценка 2026-09-10: README в 24 строки на ~150
модулей `src/lib`). Что и зачем — `VISION.md`; правила работы — `CLAUDE.md`;
план — `../docs-vault/Проект/GLOBAL-PLAN.md`. Здесь — только география.

## Слои

- `src/app/ru/**` — страницы (App Router, серверные по умолчанию). Роут —
  тонкий: авторизация + вызов lib + рендер. `src/app/api/**` — 90 HTTP-роутов,
  та же дисциплина.
- `src/lib/**` — вся бизнес-логика (~150 модулей). Правка поведения почти
  всегда здесь.
- `src/components/**` — UI; client-компоненты только при реальной
  интерактивности. `src/i18n/ru.ts` — ВСЕ строки интерфейса (зашитых нет,
  тест стережёт).
- `prisma/schema.prisma` — схема; миграции через `migrate diff` (см. CLAUDE.md).
- `deploy/**` — VM: `setup-server.sh` генерирует nginx-конфиги и 8 cron-скриптов
  (`rp-*.sh`), прогоняется КАЖДЫМ деплоем; `smoke.sh` — пост-деплой проверка
  кодами ответа. `.github/workflows/deploy.yml` — blue-green.

## Три критических пути (по модулям)

**1. Автор: регистрация → каталог**
`api/auth/register|login|yandex/*` (+`lib/auth.ts`, `lib/oauth-link.ts`) →
`app/ru/onboarding` → `lib/photos.ts` (sharp-каскад, EXIF, dHash-дедуп
`photo-dedup.ts`, премодерация `premoderation.ts` фоном) → `lib/moderation.ts`
(очередь админа `app/ru/admin/moderation`) → APPROVED → каталог
`lib/catalog.ts` + кэш `catalog-cache.ts` (тег `catalog`, сброс —
`cache-invalidate.ts`). Рейтинг: `lib/rating.ts` (merit; лайк взводит
`needsRescore`, дренаж `rescoreMarked` в jobs/inquiries). Воронка по шагам —
`lib/funnel.ts` → `app/ru/admin/funnel`.

**2. Заказчик: заявка → отклик**
`app/ru/inquiry` (+`/ru/match` — подбор `lib/matching.ts`) →
`lib/inquiries.ts`: createInquiry (маскировка контактов
`maskContactsInText`, первая волна по высшему уровню подписки) →
уведомления `lib/notifications.ts` (in-app — долговечно; email `email.ts` /
telegram `telegram.ts` — best-effort) → волны `releaseInquiries`
(15-мин cron `rp-inquiries.sh` → `api/jobs/inquiries`) → кабинет автора
`inquiriesForPhotographer` → «беру в работу» = раскрытие контактов (лимит,
аудит-лог). Личка: `lib/messages.ts` + SSE `lib/realtime.ts` (в памяти
процесса — второй инстанс запрещён, см. CLAUDE.md).

**3. Деньги: заявка на подписку → зачисление**
`app/ru/pro` (витрина, цены `lib/pricing.ts` — тест `plan-promises` сверяет
тексты с константами) → заявка `proRequestedTier` → `app/ru/admin/billing` →
ручные деньги: `recordManualPayment` (`lib/billing.ts`) из карточки
фотографа админки (Payment + зачисление тем же контуром) ИЛИ Т-Касса:
`prepareCheckout` → вебхук `api/payments/tinkoff` (`lib/tinkoff.ts`, подпись
Token) → `applyPaymentStatus` (идемпотентно, REFUNDED отматывает) →
`lib/subscription.ts` (tierOf/proRank; сверка — джоб maintenance).

## Доверие (ядро продукта)

`lib/shoots.ts` — подтверждённые съёмки: инициирует фотограф, двусторонность;
инвайт-путь `lib/shoot-invite.ts` (JWT 30 дней) → `needsReview` ВСЕГДА →
очередь `app/ru/admin/queue` + тихий выпуск чистых `releaseShootConfirmations`
(72ч, флаги, `viaInvite`-дискриминатор). Отзывы `lib/reviews.ts` (verified
только при съёмке; в рейтинг — только verified). Модерация текстов:
`text-moderation-rules.ts` (чистые правила) + `text-moderation.ts` (модель+guard)
+ человек `lib/moderation-queue.ts`; лестница эскалации `publish-guard.ts`
(RESTRICT 5 → BAN 12).

## Наблюдаемость и фоновые задачи

`/health` (`app/health/route.ts`) — единственное окно: БД, `dbConn`
(pg_stat_activity), storage, 8 интеграций, задачи из `lib/job-thresholds.ts`
(heartbeat `api/jobs/heartbeat`, записи `lib/job-run.ts`). Cron на VM
(генерирует setup-server.sh): watchdog 5м, uptime 10м, inquiries 15м,
maintenance ночью (`api/jobs/maintenance` — изолированные шаги),
latency-отчёт 03:15 (p95 + MISS-доля + tookMs-тренд), restore-drill пн 03:10,
heartbeat-сторож, diskclean вс. Фидбэк из продукта: `api/feedback` →
телеграм + таблица Feedback.

## Хранилище и медиа

`lib/storage.ts` — абстракция (S3/диск), раздача через `/files/[...]` (nginx
proxy_cache 30д). Фото: максимум 2048px (`photoBase()`/`photoStorageKeys()` —
ЕДИНСТВЕННЫЙ список вариантов). Видео: воркер-контейнер
(`scripts/video-worker.ts` → `lib/video-pipeline.ts`, claim по `claimedAt`,
`attempts`≤3).

## Что где НЕ трогать без чтения CLAUDE.md

Секреты (только Lockbox/.env), noindex (`PUBLIC_LAUNCH` — ДВЕ копии + nginx),
merit-порядок (подписка не двигает), словарь (только через `ru.ts`),
миграции (деструктив — маркер contract), Turbopack (запрещён — кириллица пути).
