import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { analyzePhoto, storePhotoVariants, thumbVariantUrl } from '@/lib/photos';
import { findNearDuplicate } from '@/lib/photo-dedup';
import { premoderate } from '@/lib/premoderation';
import { tierOf } from '@/lib/subscription';
import { portfolioLimit } from '@/lib/pricing';
import { rateLimit } from '@/lib/rate-limit';
import { handleRoute, jsonError } from '@/lib/errors';
import {
  assertPublicUrl, extractImageUrls, fetchImage, fetchPage, ImportError, MAX_PULL_AT_ONCE,
} from '@/lib/import-portfolio';

export const maxDuration = 120; // перенос пачки кадров: скачивание + sharp

/**
 * Импорт портфолио по ссылке: разведка страницы и перенос выбранных кадров.
 *
 * `GET ?url=` — что нашлось на странице (ничего не сохраняем).
 * `POST {urls}` — перенести выбранное в портфолио автора.
 *
 * Перенесённые кадры идут ровно тем же путём, что и загруженные вручную:
 * дедуп (в том числе на совпадение с ЧУЖИМ портфолио), премодерация, статус
 * PENDING до решения редакции. Импорт — это способ доставки файла, а не
 * обходной путь мимо проверок.
 */
async function currentProfile(userId: string) {
  return db.photographerProfile.findUnique({
    where: { userId },
    include: { categories: { include: { category: true } } },
  });
}

export function GET(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const profile = await currentProfile(session.userId);
    if (!profile) return jsonError('no_profile', 409);

    // Разведка дешевле переноса, но это всё равно наш сервер ходит по чужому
    // адресу — без лимита получился бы бесплатный сканер чужих сайтов
    await rateLimit(`import-scan:user:${session.userId}`, 20, 3600);

    const raw = new URL(req.url).searchParams.get('url') ?? '';
    const url = await assertPublicUrl(raw);
    const html = await fetchPage(url);
    const images = extractImageUrls(html, url.toString());
    if (images.length === 0) throw new ImportError('import_no_images');

    return NextResponse.json({ source: url.toString(), images });
  });
}

export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const profile = await currentProfile(session.userId);
    if (!profile) return jsonError('no_profile', 409);

    await rateLimit(`import-pull:user:${session.userId}`, 60, 3600);

    const body = await req.json().catch(() => null);
    const urls = Array.isArray(body?.urls) ? body.urls.filter((u: unknown): u is string => typeof u === 'string') : [];
    const categorySlug = typeof body?.categorySlug === 'string' ? body.categorySlug : null;
    if (urls.length === 0 || !categorySlug) return jsonError('validation', 400);
    if (urls.length > MAX_PULL_AT_ONCE) return jsonError('import_too_many', 400);

    const profileCategory = profile.categories.find((c) => c.category.slug === categorySlug);
    if (!profileCategory) return jsonError('category_not_in_profile', 400);

    const limit = portfolioLimit(await tierOf(session.userId));

    const added: { photoId: string; thumbUrl: string }[] = [];
    const skipped: { url: string; reason: string }[] = [];

    for (const rawUrl of urls) {
      // Лимит проверяем перед КАЖДЫМ кадром: пачка может упереться в потолок
      // на середине, и остаток должен быть отклонён, а не втиснут
      const count = await db.photo.count({ where: { profileId: profile.id } });
      if (count >= limit) {
        skipped.push({ url: rawUrl, reason: 'photo_limit' });
        continue;
      }

      try {
        const buffer = await fetchImage(rawUrl);
        const analyzed = await analyzePhoto(buffer);

        // Тот же guard, что при ручной загрузке: совпадение с чужим портфолио
        // здесь особенно вероятно — импортируют по ссылке, а ссылка может быть
        // на чей угодно сайт
        const dup = await findNearDuplicate(analyzed.phash, profile.id);
        if (dup) {
          skipped.push({ url: rawUrl, reason: dup.kind === 'foreign' ? 'duplicate_foreign' : 'duplicate_own' });
          continue;
        }

        const verdict = await premoderate(buffer);
        const stored = await storePhotoVariants(buffer);
        const photo = await db.photo.create({
          data: {
            profileId: profile.id,
            categoryId: profileCategory.categoryId,
            storageKey: stored.storageKey,
            width: analyzed.width,
            height: analyzed.height,
            phash: analyzed.phash,
            blurhash: analyzed.blurData,
            aiVerdict: verdict ? (verdict as unknown as Prisma.InputJsonObject) : undefined,
            // status PENDING по умолчанию — импорт не публикует ничего сам
          },
        });
        added.push({ photoId: photo.id, thumbUrl: thumbVariantUrl(stored.storageKey) });
      } catch (e) {
        // Один недоступный кадр не должен обрывать перенос остальных: автор
        // выбрал пачку, и молчаливый обрыв на третьем выглядел бы поломкой
        skipped.push({ url: rawUrl, reason: e instanceof ImportError ? e.code : 'import_failed' });
      }
    }

    return NextResponse.json({ added, skipped, limit }, { status: added.length > 0 ? 201 : 200 });
  });
}
