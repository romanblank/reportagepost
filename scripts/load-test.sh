#!/usr/bin/env bash
#
# Нагрузочный минимум: N параллельных клиентов на страницу, замер времени ответа.
#
# Зачем: до 2026-08-03 о поведении под нагрузкой не было известно НИЧЕГО — ни
# сколько платформа держит, ни где она сломается первой. Это не то, что стоит
# выяснять в день, когда амбассадор разошлёт ссылку своей сети.
#
# Использование:
#   npm run build && npx next start -p 3000 &
#   ./scripts/load-test.sh http://127.0.0.1:3000/ru/russia/moscow 30 90
#
# Аргументы: URL, число одновременных клиентов, всего запросов.
# Базовые значения и как их читать — vault/Проект/LOAD-BASELINE.md
URL="$1"; CONC="${2:-10}"; REQS="${3:-60}"
tmp=$(mktemp -d)
per=$(( REQS / CONC ))
start=$(python3 -c "import time;print(time.time())")
for c in $(seq 1 "$CONC"); do
  ( for r in $(seq 1 "$per"); do
      curl -s -o /dev/null -w "%{http_code} %{time_total}\n" -m 30 "$URL" >> "$tmp/out.$c"
    done ) &
done
wait
end=$(python3 -c "import time;print(time.time())")
cat "$tmp"/out.* > "$tmp/all"
python3 - "$tmp/all" "$start" "$end" "$URL" <<'PY'
import sys
rows = [l.split() for l in open(sys.argv[1]) if l.strip()]
codes = [r[0] for r in rows]
times = sorted(float(r[1]) for r in rows)
dur = float(sys.argv[3]) - float(sys.argv[2])
ok = sum(1 for c in codes if c == '200')
def pct(p):
    return times[min(len(times) - 1, int(len(times) * p))]
print(f"{sys.argv[4]}")
print(f"  запросов: {len(rows)}, успешных: {ok}, не-200: {len(rows)-ok}")
print(f"  медиана: {pct(0.5)*1000:.0f} мс, p95: {pct(0.95)*1000:.0f} мс, max: {times[-1]*1000:.0f} мс")
print(f"  пропускная способность: {len(rows)/dur:.1f} запр/с")
PY
rm -rf "$tmp"
