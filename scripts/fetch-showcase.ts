import 'dotenv/config';
import { mkdir, readdir, writeFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import manifest from './showcase-manifest.json' with { type: 'json' };

/**
 * Готовит набор демонстрационного контента для `seed-showcase.ts`.
 *
 * Кадры не лежат в репозитории (сотни мегабайт), поэтому здесь хранится только
 * манифест «имя файла → идентификатор снимка на Unsplash». Скрипт скачивает по
 * нему картинки и собирает из них шоурил на жанр — так наполнение
 * воспроизводится на чистой машине и на раннере CI, а не только на ноутбуке,
 * где эти файлы однажды оказались.
 *
 * Требуется ffmpeg для сборки роликов; без него кадры всё равно скачаются, а
 * шаг с видео будет пропущен с явным предупреждением.
 */
const run = promisify(execFile);
const DIR = process.env.SHOWCASE_DIR ?? '/tmp/rp-shots';
const WIDTH = 2600;

async function download(file: string, id: string) {
  const dest = path.join(DIR, file);
  const already = await stat(dest).catch(() => null);
  if (already && already.size > 150_000) return false;
  const res = await fetch(`https://images.unsplash.com/${id}?w=${WIDTH}&q=80&fm=jpg`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength < 150_000) throw new Error(`${file}: подозрительно маленький файл`);
  await writeFile(dest, buf);
  return true;
}

/**
 * Шоурил жанра: медленный наезд на каждый кадр, пять кадров по две секунды.
 *
 * Каждый кадр собирается в отдельный сегмент и склеивается копированием —
 * так длительность предсказуема. Через concat одним проходом она «плавала»
 * от 2 до 7 секунд: zoompan с `d=N` РАЗМНОЖАЕТ каждый входной кадр в N, и
 * при `-loop 1` это давало ролики на сотни секунд. Поэтому здесь `d=1`, а
 * наезд задан по номеру выходного кадра (`on`) — единственная форма, где
 * длительность равна заданной.
 */
const SEG_SECONDS = 2;
const SEG_COUNT = 5;

async function buildReel(prefix: string, files: string[]) {
  const out = path.join(DIR, `vid-${prefix}.mp4`);
  if (await stat(out).catch(() => null)) return false;
  const segs: string[] = [];
  for (const [i, f] of files.entries()) {
    const seg = path.join(DIR, `_${prefix}-${i}.mp4`);
    await run('ffmpeg', [
      '-y', '-loglevel', 'error', '-loop', '1', '-framerate', '25', '-t', String(SEG_SECONDS),
      '-i', path.join(DIR, f),
      '-vf', "scale=1920:-2,zoompan=z='min(1+0.0016*on,1.09)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1600x900:fps=25,format=yuv420p",
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '26', seg,
    ]);
    segs.push(seg);
  }
  const list = path.join(DIR, `_${prefix}.txt`);
  await writeFile(list, segs.map((s) => `file '${s}'`).join('\n'));
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
  return true;
}

async function main() {
  await mkdir(DIR, { recursive: true });
  const entries = Object.entries(manifest as Record<string, string>);
  let fetched = 0;
  for (const [file, id] of entries) {
    if (await download(file, id)) fetched++;
  }
  console.log(`Кадров скачано: ${fetched}, всего в наборе: ${entries.length}`);

  const have = (await readdir(DIR)).filter((f) => f.endsWith('.jpg'));
  const byPrefix = new Map<string, string[]>();
  for (const f of have.sort()) {
    const prefix = f.split('-')[0];
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), f]);
  }

  const hasFfmpeg = await run('ffmpeg', ['-version']).then(() => true).catch(() => false);
  if (!hasFfmpeg) {
    console.warn('ffmpeg не найден — шоурилы не собраны, у профилей не будет видео');
    return;
  }
  let reels = 0;
  for (const [prefix, files] of byPrefix) {
    if (await buildReel(prefix, files.slice(0, SEG_COUNT))) reels++;
  }
  console.log(`Шоурилов собрано: ${reels}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
