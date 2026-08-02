import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/lib/db';
import { analyzePhoto } from '@/lib/photos';
import { storage } from '@/lib/storage';

/**
 * Убирает с витрины кадры, которых больше нет в наборе исходников.
 *
 * Понадобилось, когда из набора исключили свадебные кадры: платформа про
 * репортаж событий, свадебная съёмка — чужая территория, и показывать её мы
 * не будем. Сверка идёт по перцептивному хешу, а не по имени файла: имя после
 * заливки нигде не хранится.
 *
 * Трогает только демонстрационные профили (futazh-*).
 */
const DIR = process.env.SHOWCASE_DIR ?? '/tmp/rp-shots';

async function main() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.jpg'));
  const allowed = new Set<string>();
  for (const f of files) {
    const a = await analyzePhoto(await readFile(path.join(DIR, f)));
    allowed.add(a.phash);
  }
  console.log(`Разрешённых кадров в наборе: ${allowed.size}`);

  const photos = await db.photo.findMany({
    where: { profile: { username: { startsWith: 'futazh-' } } },
    select: { id: true, phash: true, storageKey: true, storyId: true },
  });
  const stale = photos.filter((p) => !p.phash || !allowed.has(p.phash));
  console.log(`Не из набора (удаляем): ${stale.length}`);

  for (const p of stale) {
    await db.like.deleteMany({ where: { photoId: p.id } });
    await db.comment.deleteMany({ where: { photoId: p.id } });
    await db.photographerProfile.updateMany({ where: { coverPhotoId: p.id }, data: { coverPhotoId: null } });
    await db.photo.delete({ where: { id: p.id } });
    const base = p.storageKey.replace(/\/original\.jpg$/, '');
    for (const v of ['original', 'web', 'thumb']) await storage.delete(`${base}/${v}.jpg`).catch(() => {});
  }

  // Серии, оставшиеся без кадров, тоже убираем — пустая серия хуже отсутствия
  const empty = await db.story.findMany({
    where: { profile: { username: { startsWith: 'futazh-' } }, photos: { none: {} } },
    select: { id: true },
  });
  if (empty.length > 0) {
    await db.like.deleteMany({ where: { storyId: { in: empty.map((e) => e.id) } } });
    await db.comment.deleteMany({ where: { storyId: { in: empty.map((e) => e.id) } } });
    await db.story.deleteMany({ where: { id: { in: empty.map((e) => e.id) } } });
    console.log(`Убрано пустых серий: ${empty.length}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
