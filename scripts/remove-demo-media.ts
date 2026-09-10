import 'dotenv/config';
import { db } from '@/lib/db';
import { storage } from '@/lib/storage';
import { photoStorageKeys } from '@/lib/photos';
import { videoStorageKeys } from '@/lib/videos';

/**
 * Точечное удаление медиа ДЕМО-профиля (design-polish, волна 2): из
 * витринного набора выпал стоковый мусор («VOTE»-фото и ролик с белым
 * постером) — он держал «кадр недели» на герое и дырявил страницу автора.
 *
 * Жёсткий гард: работает ТОЛЬКО с профилями futazh-* — живые данные
 * недостижимы по построению. Файлы чистятся полными списками вариантов
 * (photoStorageKeys/videoStorageKeys — единственный источник, см. CLAUDE.md).
 *
 * Запуск: npx tsx scripts/remove-demo-media.ts photo <photoId>
 *         npx tsx scripts/remove-demo-media.ts videos <username>
 */
async function main() {
  const [mode, arg] = process.argv.slice(2);
  if (mode === 'photo' && arg) {
    const photo = await db.photo.findUnique({
      where: { id: arg },
      select: { id: true, storageKey: true, profile: { select: { username: true } } },
    });
    if (!photo) { console.log('Кадр не найден'); return; }
    if (!photo.profile.username.startsWith('futazh-')) {
      console.error('ОТКАЗ: кадр принадлежит не демо-профилю'); process.exit(1);
    }
    await db.like.deleteMany({ where: { photoId: photo.id } });
    await db.savedPhoto.deleteMany({ where: { photoId: photo.id } });
    await db.comment.deleteMany({ where: { photoId: photo.id } });
    await db.photo.delete({ where: { id: photo.id } });
    for (const key of photoStorageKeys(photo.storageKey)) {
      await storage.delete(key).catch(() => {});
    }
    console.log(`Удалён демо-кадр ${photo.id} (${photo.profile.username})`);
    return;
  }
  if (mode === 'videos' && arg) {
    if (!arg.startsWith('futazh-')) {
      console.error('ОТКАЗ: не демо-профиль'); process.exit(1);
    }
    const vids = await db.profileVideo.findMany({
      where: { profile: { username: arg } },
      select: { id: true, storageKey: true, hdKey: true, sdKey: true, posterKey: true },
    });
    for (const v of vids) {
      await db.profileVideo.delete({ where: { id: v.id } });
      for (const key of videoStorageKeys(v)) {
        await storage.delete(key).catch(() => {});
      }
    }
    console.log(`Удалено демо-роликов у ${arg}: ${vids.length}`);
    return;
  }
  console.error('Использование: remove-demo-media.ts photo <photoId> | videos <username>');
  process.exit(1);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
