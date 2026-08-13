import 'dotenv/config';
import { db } from '@/lib/db';
import { storage } from '@/lib/storage';
import { LEGACY_ORIGINAL } from '@/lib/photos';

/**
 * Удаление полноразмерных оригиналов у кадров, залитых до 2026-08-14.
 *
 * Новые загрузки оригинал не создают (решение в `storePhotoVariants`), но в
 * бакете лежит накопленное: 84% объёма хранилища в файлах, которые не читает
 * ни одна страница.
 *
 * Осторожность здесь не формальность — операция необратима. Оригинал
 * удаляется ТОЛЬКО после того, как подтверждено наличие веб-варианта: если у
 * кадра его почему-то нет (сбой на загрузке, ручная правка), удаление
 * оригинала оставило бы в каталоге битую картинку без возможности
 * восстановления. Такие кадры пропускаются и печатаются списком.
 *
 * Без `--apply` ничего не удаляет — только считает и показывает, что будет.
 *
 * Запуск:  npx tsx scripts/drop-photo-originals.ts [--apply]
 */
const APPLY = process.argv.includes('--apply');
const BATCH = 200;

async function main() {
  let cursor: string | undefined;
  let seen = 0;
  let freedBytes = 0;
  let dropped = 0;
  const skipped: string[] = [];

  for (;;) {
    // Курсором, а не одним запросом: на тысячах кадров выборка целиком —
    // это сотни мегабайт в контейнере (урок планового пересчёта рейтингов)
    const batch = await db.photo.findMany({
      where: { storageKey: { endsWith: `/${LEGACY_ORIGINAL}` } },
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: BATCH,
      select: { id: true, storageKey: true },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (const photo of batch) {
      seen += 1;
      const base = photo.storageKey.slice(0, -`/${LEGACY_ORIGINAL}`.length);
      const webKey = `${base}/web.jpg`;

      // Главный гард: без веб-варианта кадр после удаления станет битым
      const webSize = await storage.size(webKey);
      if (webSize === null) {
        skipped.push(photo.storageKey);
        continue;
      }

      const originalSize = await storage.size(photo.storageKey);
      if (originalSize === null) {
        // Объекта уже нет — остаётся только перевести ссылку на веб-вариант
        if (APPLY) {
          await db.photo.update({ where: { id: photo.id }, data: { storageKey: webKey } });
        }
        continue;
      }

      freedBytes += originalSize;
      dropped += 1;
      if (APPLY) {
        await storage.delete(photo.storageKey);
        await db.photo.update({ where: { id: photo.id }, data: { storageKey: webKey } });
      }
    }
    process.stdout.write(`  просмотрено ${seen}\n`);
  }

  const gb = (freedBytes / 1024 / 1024 / 1024).toFixed(2);
  console.log(APPLY ? '\nВыполнено:' : '\nПробный проход (ничего не удалено):');
  console.log(`  кадров со старым ключом: ${seen}`);
  console.log(`  оригиналов ${APPLY ? 'удалено' : 'к удалению'}: ${dropped} (${gb} ГБ)`);
  if (skipped.length > 0) {
    console.log(`  ПРОПУЩЕНО без веб-варианта: ${skipped.length}`);
    for (const key of skipped.slice(0, 20)) console.log(`    ${key}`);
    if (skipped.length > 20) console.log(`    …ещё ${skipped.length - 20}`);
  }
  if (!APPLY && dropped > 0) console.log('\nДля выполнения: --apply');
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
