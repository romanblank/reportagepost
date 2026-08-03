import 'dotenv/config';
import { db } from '@/lib/db';
import { storage } from '@/lib/storage';
import sharp from 'sharp';

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
    if (!p.storageKey.endsWith('/original.jpg')) continue;
    const base = p.storageKey.slice(0, -'/original.jpg'.length);
    try {
      const obj = await storage.getStream(p.storageKey);
      if (!obj) continue;
      const chunks: Buffer[] = [];
      for await (const chunk of obj.body as unknown as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
      const input = Buffer.concat(chunks);

      const web = await sharp(input).rotate().resize(2048, 2048, { fit: 'inside' }).webp({ quality: 80 }).toBuffer();
      const thumb = await sharp(input).rotate().resize(640, 640, { fit: 'inside' }).webp({ quality: 76 }).toBuffer();
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
