import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { tierOf } from '@/lib/subscription';
import { PDF_PHOTO_LIMIT } from '@/lib/pricing';
import { buildPortfolioPdf, type PdfAuthor, type PdfPhoto } from '@/lib/portfolio-pdf';
import { reviewsForProfile } from '@/lib/reviews';
import { shootStats } from '@/lib/shoots';
import { rateLimit } from '@/lib/rate-limit';
import { handleRoute, jsonError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { cityNameRu } from '@/lib/geo-data';
import { categoryNameRu } from '@/lib/category-data';
import { APP_DOMAIN } from '@/lib/constants';
import { webVariantKey } from '@/lib/photos';

export const maxDuration = 120; // сорок кадров: чтение из хранилища + sharp
export const dynamic = 'force-dynamic';

/**
 * Презентация портфолио своей страницы.
 *
 * Отдаём только автору и только про него самого: файл собирается из кадров,
 * контактов и подтверждённых съёмок — то есть ровно из того, чем человек уже
 * распоряжается сам. Скачать чужую презентацию через подстановку id нельзя,
 * потому что id тут вообще нет.
 */
export function GET() {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);

    const profile = await db.photographerProfile.findUnique({
      where: { userId: session.userId },
      select: {
        id: true, username: true, coverPhotoId: true,
        city: { select: { slug: true } },
        categories: { select: { category: { select: { slug: true } } } },
        user: { select: { firstName: true, lastName: true, phone: true, email: true } },
        siteUrl: true, status: true,
      },
    });
    if (!profile) return jsonError('no_profile', 409);
    // Страница до одобрения — черновик, и презентация из неё создавала бы
    // впечатление, что автор уже в каталоге
    if (profile.status !== 'APPROVED') return jsonError('profile_not_approved', 409);

    // Сборка тяжёлая (десятки кадров через sharp), и она же — единственный
    // способ занять контейнер надолго из-под обычной сессии
    await rateLimit(`portfolio-pdf:user:${session.userId}`, 10, 3600);

    const tier = await tierOf(session.userId);
    const limit = PDF_PHOTO_LIMIT[tier];

    const photos = await db.photo.findMany({
      where: { profileId: profile.id, status: 'APPROVED' },
      orderBy: [{ sortOrder: 'asc' }, { uploadedAt: 'desc' }],
      take: limit,
      select: { id: true, storageKey: true, category: { select: { slug: true } } },
    });
    if (photos.length === 0) return jsonError('no_photos', 409);

    const load = async (storageKey: string): Promise<Buffer | null> => {
      // Ключ варианта, а не URL: раздатчик тут лишнее звено, и его формат
      // (dev-роут против CDN) не должен влиять на сборку файла
      return storage.get(webVariantKey(storageKey)).catch(() => null);
    };

    const items: PdfPhoto[] = [];
    for (const p of photos) {
      const buffer = await load(p.storageKey);
      // Пропавший в хранилище кадр не должен ронять всю презентацию: автор
      // получит файл без него и заметит пропажу сам
      if (buffer) items.push({ buffer, categoryName: p.category ? categoryNameRu(p.category.slug) : null });
    }
    if (items.length === 0) return jsonError('no_photos', 409);

    const coverPhoto = profile.coverPhotoId
      ? await db.photo.findUnique({ where: { id: profile.coverPhotoId }, select: { storageKey: true } })
      : null;
    const cover = coverPhoto ? await load(coverPhoto.storageKey) : items[0].buffer;

    // Отзывы и подтверждённые съёмки — верхний уровень: на встрече с компанией
    // именно они отличают презентацию от папки со снимками
    const rich = tier === 'ELITE';
    const reviews = rich
      ? (await reviewsForProfile(profile.id, 4)).items.map((r) => ({
          author: r.authorName,
          body: r.body,
          verified: r.verified,
        }))
      : [];

    const author: PdfAuthor = {
      firstName: profile.user.firstName,
      lastName: profile.user.lastName,
      cityName: profile.city ? cityNameRu(profile.city.slug) : '',
      categories: profile.categories.map((c) => categoryNameRu(c.category.slug)),
      phone: profile.user.phone,
      email: profile.user.email,
      siteUrl: profile.siteUrl,
      profileUrl: `${APP_DOMAIN}/ru/photographer/${profile.username}`,
      cover,
      shoots: rich ? await shootStats(profile.id) : null,
      reviews,
    };

    const pdf = await buildPortfolioPdf(author, items, tier);
    // Имя файла — из username: он латиницей и уникален, а кириллица в
    // Content-Disposition требует отдельного кодирования ради нулевой пользы
    const name = `${profile.username}-portfolio.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'no-store',
      },
    });
  });
}
