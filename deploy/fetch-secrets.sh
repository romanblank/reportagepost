#!/usr/bin/env bash
# Выполняется НА VM. Тянет секреты из Lockbox через metadata-токен инстансного SA
# (паттерн Verifi: ключей на диске нет) и пишет /opt/reportagepost/.env.prod (0600).
set -euo pipefail
SECRET_ID="e6qko3ipabnucav10op6"
ENV_FILE="/opt/reportagepost/.env.prod"

TOKEN=$(curl -sf -H "Metadata-Flavor: Google" \
  "http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])")

PAYLOAD=$(curl -sf -H "Authorization: Bearer $TOKEN" \
  "https://payload.lockbox.api.cloud.yandex.net/lockbox/v1/secrets/${SECRET_ID}/payload")

umask 177
export PAYLOAD
python3 - "$ENV_FILE" <<'PY'
import json, os, sys
payload = json.loads(os.environ["PAYLOAD"])
entries = {e["key"]: e.get("textValue", "") for e in payload["entries"]}
lines = []
lines.append(f"AUTH_SECRET={entries['AUTH_SECRET']}")
lines.append(f"DATABASE_URL=postgresql://rp:{entries['PG_PASSWORD']}@c-c9qj9lhngr1ic1sg9bd4.rw.mdb.yandexcloud.net:6432/reportagepost?sslmode=verify-full&sslrootcert=/app/yc-ca.pem")
lines.append(f"S3_ACCESS_KEY_ID={entries['S3_ACCESS_KEY_ID']}")
lines.append(f"S3_SECRET_ACCESS_KEY={entries['S3_SECRET_ACCESS_KEY']}")
lines.append("S3_ENDPOINT=https://storage.yandexcloud.net")
lines.append("S3_BUCKET=reportagepost-media")
if "SMSC_LOGIN" in entries:
    lines.append(f"SMSC_LOGIN={entries['SMSC_LOGIN']}")
    lines.append(f"SMSC_PASSWORD={entries.get('SMSC_PASSWORD','')}")
if "SMSC_SENDER" in entries:
    lines.append(f"SMSC_SENDER={entries['SMSC_SENDER']}")
with open(sys.argv[1], "w") as f:
    f.write("\n".join(lines) + "\n")
print(f"wrote {sys.argv[1]} ({len(lines)} vars)")
PY
