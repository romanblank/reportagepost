# Reportage Post — прод-образ. Простота > оптимальность (v1):
# полный node_modules (нужен prisma CLI для migrate deploy на старте).
FROM node:22-alpine
WORKDIR /app
# ffmpeg/ffprobe — воркер транскода видео: probe входа, web-варианты 1080p/720p,
# постер и кадры для премодерации. Ставить на лету в рантайме нельзя: пакет
# нужен каждому новому контейнеру, а сеть при старте не гарантирована.
RUN apk add --no-cache ffmpeg
# Версия сборки (git SHA из CI) — /health отдаёт её, чтобы верифицировать деплой
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
COPY package.json package-lock.json ./
# dev-зависимости нужны для next build (tailwind/postcss/ts) — NODE_ENV ставим ПОСЛЕ
RUN npm ci --include=dev
COPY . .
# CA Яндекса для TLS к Managed PostgreSQL (verify-full)
ADD https://storage.yandexcloud.net/cloud-certs/CA.pem /app/yc-ca.pem
RUN npx prisma generate && npm run build
ENV NODE_ENV=production
EXPOSE 3000
# Старт: миграции + идемпотентный сид справочников (города/категории — иначе
# анкета падает city_not_found, урок 2026-07-14) + сервер
# Только запуск сервера. Миграции и сид вынесены в ОТДЕЛЬНЫЙ шаг деплоя
# (аудит 2026-08-01, P1): пока они жили здесь, деплой ждал health 120с и при
# неудаче пересоздавал контейнер, ОБРЫВАЯ идущую миграцию на середине —
# прерванная миграция остаётся failed в _prisma_migrations и блокирует все
# последующие `migrate deploy`, а SSH к VM у оператора нет. Плюс любой рестарт
# (OOM, reboot) прогонял миграции и сид заново: crash-loop на транзиентной
# ошибке вместо быстрого подъёма.
CMD ["sh", "-c", "npm run start"]
