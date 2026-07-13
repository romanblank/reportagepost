#!/usr/bin/env bash
# Идемпотентная настройка VM (выполняется деплой-workflow'ом по ssh).
set -euo pipefail
sudo mkdir -p /opt/reportagepost
sudo chown rp:rp /opt/reportagepost

# nginx: конфиг зависит от наличия сертификата (урок 2026-07-13: безусловный
# tee затирал certbot-блок 443 при каждом деплое → SSL умирал, Secure-cookie
# отбрасывались браузером на HTTP)
CERT_DIR="/etc/letsencrypt/live/reportagepost.com"
PROXY_BLOCK='
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
sudo tee /usr/local/bin/rp-watchdog.sh >/dev/null <<'WD'
#!/usr/bin/env bash
if ! docker ps --format '{{.Names}}' | grep -q '^reportagepost$'; then
  cd /opt/reportagepost && docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
fi
WD
sudo chmod +x /usr/local/bin/rp-watchdog.sh
echo '*/5 * * * * root /usr/local/bin/rp-watchdog.sh >/dev/null 2>&1' | sudo tee /etc/cron.d/rp-watchdog >/dev/null
echo "setup-server: ok"
