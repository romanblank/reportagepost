import 'dotenv/config';
import { processVideoQueue } from '@/lib/video-pipeline';
import { startJobRun, finishJobRun } from '@/lib/job-run';
import { ru } from '@/i18n/ru';

/**
 * Воркер транскода — отдельный процесс в отдельном контейнере (аудит
 * 2026-08-16, P0 №2: ffmpeg жил в одном cgroup с сайтом, и два транскода
 * забирали полтора ядра из полутора — на время чужого шоурила вставал
 * каталог; превышение общего лимита памяти убивало ВЕСЬ контейнер).
 *
 * Свой cgroup (cpus 0.5 / memory 700m в compose) означает: захлебнётся —
 * упадёт и перезапустится ОДИН воркер, сайт не заметит.
 *
 * Цикл вместо cron+HTTP: захват задачи в базе (`claimedAt`) уже защищает от
 * параллельных воркеров, поэтому цикл безопасен, а исчезновение HTTP-звена
 * убирает и таймаут curl -m 900, который обрывал длинные партии. JobRun
 * пишется так же, как писал роут, — /health и панель ничего не заметили.
 */
const INTERVAL_MS = 120_000;

async function tick(): Promise<void> {
  const runId = await startJobRun('video');
  try {
    const results = await processVideoQueue();
    const failed = results.filter((r) => !r.ok).length;
    await finishJobRun(runId, failed === 0, ru.operatorAlerts.videoNote(results.length, failed));
  } catch (e) {
    await finishJobRun(runId, false, e instanceof Error ? e.message.slice(0, 180) : 'unknown').catch(() => {});
  }
}

async function main() {
  console.log('[video-worker] started');
  for (;;) {
    const started = Date.now();
    await tick().catch((e) => console.error('[video-worker] tick failed:', e));
    const elapsed = Date.now() - started;
    // Пауза от КОНЦА прогона: длинная партия не должна накладываться на следующую
    await new Promise((r) => setTimeout(r, Math.max(15_000, INTERVAL_MS - elapsed)));
  }
}

main();
