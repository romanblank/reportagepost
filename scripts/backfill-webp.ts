import 'dotenv/config';
import { db } from '@/lib/db';
import { storage } from '@/lib/storage';
import sharp from 'sharp';
import { photoBase } from '@/lib/photos';

/**
 * Догоняет WebP-варианты для кадров, загруженных до появления формата.
 *
 * Нужен ровно один раз. Без него у старых кадров признака `hasWebp` нет, и они
 * показываются JPEG-ом — это не поломка, просто без экономии трафика.
 */
async function main() {
  const photos = await db.photo.findMany({ where: { hasWebp: false }, select: { id: true, storageKey: true } });
  console.log(`кадров без WebP: ${photos.length}`);
  let done = 0;

  for (const p of photos) {
    // Источник — ВЕБ-ВАРИАНТ, а не оригинал: полноразмерных файлов с
    // 2026-08-14 нет, и чтение по старому ключу молча ничего бы не находило.
    // На 2048 px разница между «из оригинала» и «из веба» неразличима
    const base = photoBase(p.storageKey);
    if (!base) continue;
    try {
      const obj = await storage.getStream(`${base}/web.jpg`);
      if (!obj) continue;
      const chunks: Buffer[] = [];
      for await (const chunk of obj.body as unknown as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
      const input = Buffer.concat(chunks);

      const web = await sharp(input).resize(2048, 2048, { fit: 'inside' }).webp({ quality: 80 }).toBuffer();
      // rotate тут не нужен: web-вариант уже ориентирован при загрузке
      const thumb = await sharp(input).resize(640, 640, { fit: 'inside' }).webp({ quality: 76 }).toBuffer();
      await storage.put(`${base}/web.webp`, web, 'image/webp');
      await storage.put(`${base}/thumb.webp`, thumb, 'image/webp');
      await db.photo.update({ where: { id: p.id }, data: { hasWebp: true } });
      done++;
      if (done % 20 === 0) console.log(`  готово ${done}/${photos.length}`);
    } catch (e) {
      console.warn(`  ${p.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`Готово: ${done}`);
}

main();
