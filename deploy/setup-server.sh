#!/usr/bin/env bash
# Идемпотентная настройка VM (выполняется деплой-workflow'ом по ssh).
set -euo pipefail
sudo mkdir -p /opt/reportagepost
sudo chown rp:rp /opt/reportagepost

# nginx: конфиг зависит от наличия сертификата (урок 2026-07-13: безусловный
# tee затирал certbot-блок 443 при каждом деплое → SSL умирал, Secure-cookie
# отбрасывались браузером на HTTP)
CERT_DIR="/etc/letsencrypt/live/reportagepost.com"
# Лимит тела: 45m по умолчанию хватает фото (40 МБ + обвязка), но резал
# загрузку видео на периметре — автор получал nginx-овский HTML-413 мимо
# приложения, без i18n-текста и без следа в логах (аудит 2026-08-01, P2).
# Точечно поднимаем ТОЛЬКО на роут видео: общий 210m открыл бы приём
# 200-МБ тел на любой эндпоинт. Значение сверяется с MAX_VIDEO_BYTES тестом
# tests/deploy-limits.test.ts — рассинхрон ловится в гейте, а не жалобой.
# ── Сетевые лимиты запросов (S0, «nginx: rate-limit зоны») ───────────────────
# Приложение уже считает попытки входа и отправки форм, но его лимитер живёт
# ЗА nginx и в базе: флуд доходит до Next.js, тратит соединения и пишет строки
# в PostgreSQL. Периметровый лимит отсекает поток раньше — до приложения.
#
# Зоны разведены по характеру трафика: страница каталога тянет два десятка
# медиа-запросов подряд, и общий лимит уровня «10 r/s» отрубал бы обычного
# заказчика. Поэтому медиа щедрые, API умеренный, вход — жёсткий.
# 10m на зону ≈ 160 тыс. адресов, с запасом.
sudo tee /etc/nginx/conf.d/rp-limits.conf >/dev/null <<'LIM'
limit_req_zone $binary_remote_addr zone=rp_general:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=rp_files:10m   rate=100r/s;
limit_req_zone $binary_remote_addr zone=rp_api:10m     rate=20r/s;
limit_req_zone $binary_remote_addr zone=rp_auth:10m    rate=2r/s;
limit_conn_zone $binary_remote_addr zone=rp_conn:10m;
# 429, а не дефолтный 503: клиент должен понимать, что это лимит, а не поломка
limit_req_status 429;
limit_conn_status 429;
# Активный порт приложения: все локальные пробы и кроны обязаны спрашивать
# его здесь, а не помнить «3000» — после blue-green жёсткий порт означает
# пробу мёртвого цвета (или пустоты)
sudo tee /usr/local/bin/rp-port.sh >/dev/null <<'PRT'
#!/usr/bin/env bash
case "$(cat /opt/reportagepost/.active-color 2>/dev/null)" in
  blue)  echo 3001 ;;
  green) echo 3002 ;;
  *)     echo 3000 ;;
esac
PRT
sudo chmod +x /usr/local/bin/rp-port.sh

# Blue-green upstream: этим файлом УПРАВЛЯЕТ деплой (переключение цвета).
# setup создаёт его только при отсутствии — иначе каждый прогон откатывал бы
# трафик на порт по умолчанию
if [ ! -f /etc/nginx/conf.d/rp-upstream.conf ]; then
  sudo tee /etc/nginx/conf.d/rp-upstream.conf >/dev/null <<'UPS'
upstream rp_upstream { server 127.0.0.1:3000; }
UPS
fi

# Кэш медиа: 10 ГБ на диске, ключи иммутабельны (см. location /files/).
# inactive больше TTL, чтобы горячие объекты не выселялись раньше срока
proxy_cache_path /var/cache/nginx/rp-media levels=1:2 keys_zone=rp_media:50m
                 max_size=10g inactive=30d use_temp_path=off;
# Латентность в логе (аудит 2026-08-16, наблюдаемость трендов): $request_time
# — единственный источник p95, не требующий ни кода в приложении, ни новых
# сервисов. Суточный отчёт считает rp-latency.sh
log_format rp_timing '$time_iso8601 $status $request_time $request_method $uri';
access_log /var/log/nginx/rp-timing.log rp_timing;
LIM

sudo mkdir -p /var/cache/nginx/rp-media
sudo chown -R www-data:www-data /var/cache/nginx/rp-media

PROXY_BLOCK='
    limit_conn rp_conn 60;

    location = /api/profile/videos {
        proxy_pass http://rp_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 210m;
        proxy_request_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location ^~ /api/auth/ {
        limit_req zone=rp_auth burst=10 nodelay;
        proxy_pass http://rp_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 1m;
    }

    location ^~ /files/ {
        limit_req zone=rp_files burst=200 nodelay;
        # Кэш медиа (аудит 2026-08-16): без него КАЖДЫЙ показ каждой миниатюры
        # шёл через Node и S3 — двойной трафик и event-loop веб-процесса на
        # раздаче байтов. Ключи иммутабельны (uuid в пути, замена = новый ключ),
        # поэтому 30 дней безопасны; инвалидация не нужна — удалённый объект
        # доживает в кэше максимум месяц по TTL, а отклонённые кадры и так
        # убираются из разметки. proxy_cache_lock схлопывает штурм одного ключа.
        proxy_cache rp_media;
        proxy_cache_valid 200 206 30d;
        proxy_cache_valid 404 1m;
        proxy_cache_lock on;
        proxy_cache_use_stale error timeout updating;
        proxy_cache_key $uri$is_args$args$http_range;
        add_header X-Cache-Status $upstream_cache_status;
        proxy_pass http://rp_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location ^~ /api/ {
        limit_req zone=rp_api burst=40 nodelay;
        proxy_pass http://rp_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 45m;
    }

    location / {
        limit_req zone=rp_general burst=60 nodelay;
        proxy_pass http://rp_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 45m;
    }'

# Если сертификат пропал, а HTTPS-конфиг уже был — НЕ откатываемся на голый
# HTTP. Приложение отдаёт HSTS на два года: для всех, кто заходил раньше,
# браузер откажется открывать сайт по HTTP вовсе. Лучше оставить прежний
# конфиг и громко сказать, чем тихо превратить сайт в недоступный.
if ! sudo test -f "$CERT_DIR/fullchain.pem" && sudo grep -q "listen 443" /etc/nginx/sites-available/reportagepost 2>/dev/null; then
  echo "setup-server: сертификата нет, но HTTPS-конфиг уже был — оставляю как есть" >&2
  sudo nginx -t && sudo systemctl reload nginx
elif sudo test -f "$CERT_DIR/fullchain.pem"; then
  sudo tee /etc/nginx/sites-available/reportagepost >/dev/null <<NGINX
server {
    listen 80;
    server_name reportagepost.com www.reportagepost.com _;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://reportagepost.com\$request_uri; }
}
server {
    listen 443 ssl http2;
    server_name reportagepost.com www.reportagepost.com;
    ssl_certificate $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    add_header X-Robots-Tag "noindex, nofollow" always;
$PROXY_BLOCK
}
NGINX
else
  sudo tee /etc/nginx/sites-available/reportagepost >/dev/null <<NGINX
server {
    listen 80;
    server_name reportagepost.com www.reportagepost.com _;
    add_header X-Robots-Tag "noindex, nofollow" always;
$PROXY_BLOCK
}
NGINX
fi
sudo ln -sf /etc/nginx/sites-available/reportagepost /etc/nginx/sites-enabled/reportagepost
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# container-watchdog (урок Verifi: restart-policy не всегда спасает)
# 🔴 АУДИТ 2026-07-31 (P1): watchdog был мёртв с рождения — compose требует
# ${IMAGE:?...}, которого в окружении cron нет (он живёт в .deploy.env), поэтому
# `up -d` падал с «required variable IMAGE is missing» в /dev/null. Теперь IMAGE
# читается из .deploy.env, а сам факт подъёма/провала уходит в Telegram.
sudo tee /usr/local/bin/rp-watchdog.sh >/dev/null <<'WD'
#!/usr/bin/env bash
set -uo pipefail
cd /opt/reportagepost || exit 0

notify() { # $1 — текст; шлём, если заведены токен и чат
  local tok chat
  tok=$(grep -E '^TELEGRAM_BOT_TOKEN=' .env.prod 2>/dev/null | cut -d= -f2-)
  chat=$(grep -E '^TELEGRAM_ALERT_CHAT_ID=' .env.prod 2>/dev/null | cut -d= -f2-)
  [ -n "$tok" ] && [ -n "$chat" ] || return 0
  curl -s -m 15 "https://api.telegram.org/bot${tok}/sendMessage" \
    --data-urlencode "chat_id=${chat}" --data-urlencode "text=$1" >/dev/null || true
}

# 1. Активный цвет жив? (blue-green: имя контейнера зависит от .active-color;
# легаси-имя reportagepost — переходный период до первого blue-green деплоя)
ACTIVE=$(cat .active-color 2>/dev/null || echo none)
case "$ACTIVE" in
  blue)  CONT=reportagepost-blue;  PORT=3001 ;;
  green) CONT=reportagepost-green; PORT=3002 ;;
  *)     CONT=reportagepost;       PORT=3000 ;;
esac
export COMPOSE_IGNORE_ORPHANS=1
if ! docker ps --format '{{.Names}}' | grep -q "^${CONT}$"; then
  IMAGE=$(grep -E '^IMAGE=' .deploy.env 2>/dev/null | cut -d= -f2-)
  if [ -z "$IMAGE" ]; then
    notify "🔴 Reportage Post: контейнер $CONT лежит, а .deploy.env без IMAGE — watchdog поднять не может"
    exit 1
  fi
  if [ "$ACTIVE" = "none" ]; then
    UPCMD=(docker compose --env-file .env.prod -f docker-compose.prod.yml up -d app)
    IMAGE="$IMAGE" "${UPCMD[@]}" >/tmp/rp-watchdog.log 2>&1 && UP_OK=1 || UP_OK=0
  else
    COLOR="$ACTIVE" APP_PORT="$PORT" IMAGE="$IMAGE" \
      docker compose --env-file .env.prod -f docker-compose.prod.yml -p "rp-$ACTIVE" up -d app >/tmp/rp-watchdog.log 2>&1 && UP_OK=1 || UP_OK=0
  fi
  if [ "${UP_OK:-0}" = "1" ]; then
    notify "⚠️ Reportage Post: контейнер $CONT был мёртв — watchdog поднял его заново ($IMAGE)"
  else
    notify "🔴 Reportage Post: контейнер $CONT мёртв, watchdog поднять НЕ СМОГ. $(tail -3 /tmp/rp-watchdog.log)"
  fi
fi

# 1б. Воркер транскода жив? Падение воркера не роняет сайт, но очередь видео
# молча встаёт — heartbeat задачи video покажет stale через час, watchdog
# реагирует за пять минут
if ! docker ps --format '{{.Names}}' | grep -q '^reportagepost-worker$'; then
  IMAGE=$(grep -E '^IMAGE=' .deploy.env 2>/dev/null | cut -d= -f2-)
  if [ -n "$IMAGE" ]; then
    IMAGE="$IMAGE" docker compose --env-file .env.prod -f docker-compose.prod.yml -p rp-worker up -d worker >/tmp/rp-watchdog-worker.log 2>&1 \
      && notify "⚠️ Reportage Post: воркер транскода был мёртв — watchdog поднял" \
      || notify "🔴 Reportage Post: воркер транскода мёртв, поднять не смог"
  fi
fi

# 2. Диск (инциденты 2026-07-13 и 2026-07-24 — оба по переполнению).
# Раньше о росте узнавали только по факту падения прода: внешняя проба видит /health,
# а не 85% занятого диска. Порог 80% даёт запас на реакцию.
USED=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [ -n "$USED" ] && [ "$USED" -ge 80 ]; then
  STAMP=/var/tmp/rp-disk-alerted
  # не спамим: не чаще раза в 6 часов
  if [ ! -f "$STAMP" ] || [ $(( $(date +%s) - $(stat -c %Y "$STAMP") )) -gt 21600 ]; then
    notify "⚠️ Reportage Post: диск VM занят на ${USED}% (порог 80%). docker system df / логи — проверить до падения."
    touch "$STAMP"
  fi
fi
WD
sudo chmod +x /usr/local/bin/rp-watchdog.sh
echo '*/5 * * * * root /usr/local/bin/rp-watchdog.sh >/dev/null 2>&1' | sudo tee /etc/cron.d/rp-watchdog >/dev/null

# ── Плановое обслуживание: пересчёт рейтингов + чистка (аудит 2026-07-31) ─────
# Запускаем НА VM, а не из GitHub Actions: секрет уже лежит в .env.prod после
# деплоя (не нужен GitHub Secret и права на его запись), задача не зависит от
# квоты минут Actions и не ходит через интернет — стучимся в localhost.
# Затухание лайков — функция времени, без периодического прохода merit-порядок
# каталога отражает вчерашний день.
sudo tee /usr/local/bin/rp-maintenance.sh >/dev/null <<'MNT'
#!/usr/bin/env bash
set -uo pipefail
cd /opt/reportagepost || exit 0
SECRET=$(grep -E '^JOBS_SECRET=' .env.prod 2>/dev/null | cut -d= -f2-)
[ -z "$SECRET" ] && exit 0   # секрет ещё не заведён — тихо выходим

# Один прогон зараз: полный пересчёт рейтингов на выросшем каталоге может
# длиться дольше суток, и тогда два прогона наложились бы друг на друга
exec 9>/var/lock/rp-maintenance.lock
flock -n 9 || exit 0

RESP=$(curl -s -m 300 -w '\n%{http_code}' -X POST \
  -H "Authorization: Bearer ${SECRET}" \
  http://127.0.0.1:$(/usr/local/bin/rp-port.sh)/api/jobs/maintenance)
CODE=$(printf '%s' "$RESP" | tail -1)
[ "$CODE" = "200" ] && exit 0

# Провалилось — сообщаем оператору (тем же каналом, что watchdog)
tok=$(grep -E '^TELEGRAM_BOT_TOKEN=' .env.prod 2>/dev/null | cut -d= -f2-)
chat=$(grep -E '^TELEGRAM_ALERT_CHAT_ID=' .env.prod 2>/dev/null | cut -d= -f2-)
if [ -n "$tok" ] && [ -n "$chat" ]; then
  curl -s -m 15 "https://api.telegram.org/bot${tok}/sendMessage" \
    --data-urlencode "chat_id=${chat}" \
    --data-urlencode "text=⚠️ Reportage Post: плановое обслуживание (пересчёт рейтингов) вернуло HTTP ${CODE}" >/dev/null || true
fi
MNT
sudo chmod +x /usr/local/bin/rp-maintenance.sh
echo '30 2 * * * root /usr/local/bin/rp-maintenance.sh >/dev/null 2>&1' | sudo tee /etc/cron.d/rp-maintenance >/dev/null

# ── Воркер транскода видео ───────────────────────────────────────────────────
# Транскод не может жить в HTTP-запросе загрузки: минутный ролик занимает
# десятки секунд процессора, соединение столько не держат ни периметр, ни
# браузер. Поэтому загрузка кладёт исходник и уходит, а очередь разбирает этот
# cron — раз в две минуты, партией в два ролика (ffmpeg съедает ядро целиком).
# Транскод переехал в отдельный контейнер-воркер (аудит 2026-08-16):
# cron+HTTP-звено убрано, heartbeat пишет сам воркер. Старый cron вычищаем,
# чтобы два пути не жили параллельно
sudo rm -f /etc/cron.d/rp-video /usr/local/bin/rp-video.sh

# ── Волны доставки заявок ────────────────────────────────────────────────────
# Фора подписчиков измеряется часами, поэтому задача ходит каждые 15 минут:
# в суточном обслуживании «фора в два часа» растянулась бы на сутки.
sudo tee /usr/local/bin/rp-inquiries.sh >/dev/null <<'INQ'
#!/usr/bin/env bash
set -uo pipefail
cd /opt/reportagepost || exit 0
SECRET=$(grep -E '^JOBS_SECRET=' .env.prod 2>/dev/null | cut -d= -f2-)
[ -z "$SECRET" ] && exit 0
exec 9>/var/lock/rp-inquiries.lock
flock -n 9 || exit 0
curl -s -m 120 -o /dev/null -X POST -H "Authorization: Bearer ${SECRET}" \
  http://127.0.0.1:$(/usr/local/bin/rp-port.sh)/api/jobs/inquiries
INQ
sudo chmod +x /usr/local/bin/rp-inquiries.sh
echo '*/15 * * * * root /usr/local/bin/rp-inquiries.sh >/dev/null 2>&1' | sudo tee /etc/cron.d/rp-inquiries >/dev/null

# ── Суточный отчёт латентности (аудит 2026-08-16) ────────────────────────────
# Первый симптом роста — «сайт стал подтормаживать» — раньше не имел ни
# подтверждения, ни адреса: наблюдаемость была бинарной (up/down). p95 по
# префиксам роутов из nginx-лога отвечает и «стало ли хуже», и «где именно».
sudo tee /usr/local/bin/rp-latency.sh >/dev/null <<'LAT'
#!/usr/bin/env bash
set -uo pipefail
LOG=/var/log/nginx/rp-timing.log
[ -s "$LOG" ] || exit 0
# p95 без gawk-измов (в Ubuntu mawk): группировка awk-ом, перцентиль — sort-ом.
# Формат строки лога: time status request_time method uri
REPORT=$(awk '{
    p = $5
    if (p ~ /^\/files\//) grp = "files"
    else if (p ~ /^\/api\//) grp = "api"
    else if (p ~ /^\/ru\//) { split(p, a, "/"); grp = "ru-" a[3] }
    else grp = "other"
    print grp, $3, ($2 >= 500 ? 1 : 0)
  }' "$LOG" | sort -k1,1 -k2,2n | awk '
  function flush() {
    if (cnt > 0) {
      idx = int(cnt * 0.95); if (idx < 1) idx = 1
      printf "%s: n=%d p95=%ss 5xx=%d\n", cur, cnt, t[idx], errs
    }
  }
  $1 != cur { flush(); cur = $1; cnt = 0; errs = 0; delete t }
  { t[++cnt] = $2; errs += $3 }
  END { flush() }')
cd /opt/reportagepost
TG_TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' .env.prod | cut -d= -f2- || true)
TG_CHAT=$(grep -E '^TELEGRAM_ALERT_CHAT_ID=' .env.prod | cut -d= -f2- || true)
if [ -n "${TG_TOKEN:-}" ] && [ -n "${TG_CHAT:-}" ] && [ -n "$REPORT" ]; then
  curl -s -m 15 "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TG_CHAT}" \
    --data-urlencode "text=📈 Латентность за сутки (p95):
${REPORT}" >/dev/null || true
fi
# Ротация своими руками: логом владеем мы, logrotate про него не знает.
# copytruncate-семантика: nginx держит дескриптор, truncate безопасен
: > "$LOG"
LAT
sudo chmod +x /usr/local/bin/rp-latency.sh
echo '15 3 * * * root /usr/local/bin/rp-latency.sh >/dev/null 2>&1' | sudo tee /etc/cron.d/rp-latency >/dev/null

# ── Сторож самих сторожей (аудит 2026-08-01) ─────────────────────────────────
# Проблема: ВСЯ система наблюдения жила в GitHub Actions, а GitHub отключает
# scheduled workflows после 60 дней без коммитов в репозиторий — молча. Плюс
# минуты Actions однажды кончились, и встал не только деплой, но и бэкап с
# uptime-пробой. Итог: «тишина» неотличима от «всё хорошо».
#
# Этот сторож живёт НА VM и раз в сутки проверяет, что ночной бэкап реально
# случился: смотрит возраст последнего дампа в бакете. Не пришёл за 36 часов —
# значит цепочка Actions встала, и оператор узнаёт об этом сам, а не когда
# понадобится восстановление.
sudo tee /usr/local/bin/rp-heartbeat.sh >/dev/null <<'HB'
#!/usr/bin/env bash
set -uo pipefail
cd /opt/reportagepost || exit 0

notify() {
  local tok chat
  tok=$(grep -E '^TELEGRAM_BOT_TOKEN=' .env.prod 2>/dev/null | cut -d= -f2-)
  chat=$(grep -E '^TELEGRAM_ALERT_CHAT_ID=' .env.prod 2>/dev/null | cut -d= -f2-)
  [ -n "$tok" ] && [ -n "$chat" ] || return 0
  curl -s -m 15 "https://api.telegram.org/bot${tok}/sendMessage" \
    --data-urlencode "chat_id=${chat}" --data-urlencode "text=$1" >/dev/null || true
}

ID=$(grep -E '^S3_ACCESS_KEY_ID=' .env.prod | cut -d= -f2-)
SEC=$(grep -E '^S3_SECRET_ACCESS_KEY=' .env.prod | cut -d= -f2-)
EP=$(grep -E '^S3_ENDPOINT=' .env.prod | cut -d= -f2-)
BUCKET=$(grep -E '^S3_BUCKET=' .env.prod | cut -d= -f2-)
[ -n "$ID" ] && [ -n "$BUCKET" ] || exit 0

LAST=$(docker run --rm -e AWS_ACCESS_KEY_ID="$ID" -e AWS_SECRET_ACCESS_KEY="$SEC" \
  -e AWS_DEFAULT_REGION=ru-central1 amazon/aws-cli --endpoint-url "$EP" \
  s3 ls "s3://${BUCKET}/db-backups/" 2>/dev/null | sort | tail -1 | awk '{print $1" "$2}')

if [ -z "$LAST" ]; then
  notify "🔴 Reportage Post: в бакете НЕТ НИ ОДНОГО дампа БД. Бэкапы не работают."
  exit 1
fi

AGE_H=$(( ( $(date -u +%s) - $(date -u -d "$LAST" +%s 2>/dev/null || echo 0) ) / 3600 ))
if [ "$AGE_H" -gt 36 ]; then
  notify "🔴 Reportage Post: последний бэкап БД сделан ${AGE_H} ч назад (норма — сутки). Ночная задача в GitHub Actions, похоже, встала."
fi
HB
sudo chmod +x /usr/local/bin/rp-heartbeat.sh
echo '0 12 * * * root /usr/local/bin/rp-heartbeat.sh >/dev/null 2>&1' | sudo tee /etc/cron.d/rp-heartbeat >/dev/null

# ── Прививка от переполнения диска (инцидент 2026-07-24) ──────────────────────
# Корень был в деплое (образы не чистились после подмены — фикс в deploy.yml).
# Здесь — belt-and-suspenders, чтобы диск не забился НИКОГДА:
# 1) systemd-журнал — жёсткий кап (по умолчанию мог расти до 10% FS)
sudo mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=200M\nMaxRetentionSec=7day\n' | sudo tee /etc/systemd/journald.conf.d/rp-cap.conf >/dev/null
sudo systemctl restart systemd-journald 2>/dev/null || true
# 2) docker-логи по умолчанию (даже если у сервиса нет logging в compose)
sudo mkdir -p /etc/docker
printf '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}\n' | sudo tee /etc/docker/daemon.json >/dev/null
# (docker не рестартим в setup — избежать downtime; compose уже имеет logging;
#  daemon.json применится при следующем штатном рестарте демона)
# 3) еженедельная авто-чистка (cron) — на случай долгого простоя без деплоев
printf '0 4 * * 0 root docker system prune -af >/dev/null 2>&1; journalctl --vacuum-size=100M >/dev/null 2>&1; sudo apt-get clean >/dev/null 2>&1\n' | sudo tee /etc/cron.d/rp-diskclean >/dev/null

# ── Харденинг sshd против сканеров (S0, урок инцидентов Verifi) ──────────────
# Публичный 22-й порт непрерывно перебирают. Пароли и так выключены, но каждая
# попытка съедает слот подключения: при заливке сканером sshd перестаёт
# принимать НОВЫЕ соединения — включая деплой, а другого доступа к VM нет.
# MaxStartups/PerSourceMaxStartups ограничивают именно недоаутентифицированные
# соединения, легальный деплой (одно подключение) не задевают.
#
# Конфиг кладём отдельным файлом и применяем ТОЛЬКО если sshd его принял:
# PerSourceMaxStartups есть с OpenSSH 9.2, и на более старой системе нерабочий
# конфиг убил бы единственный способ попасть на машину.
SSHD_DROPIN=/etc/ssh/sshd_config.d/rp-harden.conf
if [ -d /etc/ssh/sshd_config.d ]; then
  sudo tee "$SSHD_DROPIN" >/dev/null <<'SSHD'
PasswordAuthentication no
PermitRootLogin no
MaxAuthTries 3
LoginGraceTime 20
MaxStartups 10:30:60
PerSourceMaxStartups 5
SSHD
  if sudo sshd -t 2>/dev/null; then
    sudo systemctl reload ssh 2>/dev/null || sudo systemctl reload sshd 2>/dev/null || true
  else
    # Конфиг не принят — откатываем, чтобы не остаться без доступа
    sudo rm -f "$SSHD_DROPIN"
    echo "setup-server: sshd отверг харденинг, оставлен прежний конфиг" >&2
  fi
fi

echo "setup-server: ok"
