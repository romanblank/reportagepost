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
PROXY_BLOCK='
    location = /api/profile/videos {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 210m;
        proxy_request_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 45m;
    }'

if sudo test -f "$CERT_DIR/fullchain.pem"; then
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

# 1. Контейнер жив?
if ! docker ps --format '{{.Names}}' | grep -q '^reportagepost$'; then
  IMAGE=$(grep -E '^IMAGE=' .deploy.env 2>/dev/null | cut -d= -f2-)
  if [ -z "$IMAGE" ]; then
    notify "🔴 Reportage Post: контейнер лежит, а .deploy.env без IMAGE — watchdog поднять не может"
    exit 1
  fi
  if IMAGE="$IMAGE" docker compose --env-file .env.prod -f docker-compose.prod.yml up -d >/tmp/rp-watchdog.log 2>&1; then
    notify "⚠️ Reportage Post: контейнер был мёртв — watchdog поднял его заново ($IMAGE)"
  else
    notify "🔴 Reportage Post: контейнер мёртв, watchdog поднять НЕ СМОГ. $(tail -3 /tmp/rp-watchdog.log)"
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

RESP=$(curl -s -m 300 -w '\n%{http_code}' -X POST \
  -H "Authorization: Bearer ${SECRET}" \
  http://127.0.0.1:3000/api/jobs/maintenance)
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

echo "setup-server: ok"
