#!/usr/bin/env bash
# Идемпотентная настройка VM (выполняется деплой-workflow'ом по ssh).
set -euo pipefail
sudo mkdir -p /opt/reportagepost
sudo chown rp:rp /opt/reportagepost

# nginx: сайт (HTTP; SSL добавит certbot после DNS-делегации)
sudo tee /etc/nginx/sites-available/reportagepost >/dev/null <<'NGINX'
server {
    listen 80;
    server_name reportagepost.com www.reportagepost.com _;

    # Пре-запуск: закрытость (дублирует X-Robots-Tag приложения)
    add_header X-Robots-Tag "noindex, nofollow" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # анти-спуфинг (урок Verifi): только реальный адрес
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 45m;
    }
}
NGINX
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
