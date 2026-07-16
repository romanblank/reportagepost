import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import {
  PhotoValidationError,
  analyzePhoto,
  storePhotoVariants,
} from '@/lib/photos';
import { findNearDuplicate } from '@/lib/photo-dedup';
import { premoderate } from '@/lib/premoderation';
import { tierOf } from '@/lib/subscription';
import { portfolioLimit } from '@/lib/pricing';

export const maxDuration = 60; // обработка sharp на больших файлах

const MAX_FILE_BYTES = 40 * 1024 * 1024;

// Онбординг, шаг 2: загрузка фото портфолио (multipart: file, categorySlug)
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const profile = await db.photographerProfile.findUnique({
    where: { userId: session.userId },
    include: { categories: { include: { category: true } } },
  });
  if (!profile) return NextResponse.json({ error: 'no_profile' }, { status: 409 });

  // Лимит портфолио зависит от тарифа (FREE 20 / PRO 300) — граница FREE/PRO.
  const limit = portfolioLimit(await tierOf(session.userId));
  const photoCount = await db.photo.count({ where: { profileId: profile.id } });
  if (photoCount >= limit) {
    return NextResponse.json({ error: 'photo_limit', limit }, { status: 409 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const categorySlug = form?.get('categorySlug');
  if (!(file instanceof File) || typeof categorySlug !== 'string') {
    return NextResponse.json({ error: 'validation' }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
  }

  const profileCategory = profile.categories.find((c) => c.category.slug === categorySlug);
  if (!profileCategory) {
    return NextResponse.json({ error: 'category_not_in_profile' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    // Стадия 1: анализ + phash (без записи в хранилище)
    const analyzed = await analyzePhoto(buffer);

    // Guard дедупа ДО записи: свой повторный кадр → duplicate; совпал с ЧУЖИМ →
    // possible_theft (загрузка чужого портфолио). Отклоняем, файлы не осиротеют.
    const dup = await findNearDuplicate(analyzed.phash, profile.id);
    if (dup) {
      const error = dup.kind === 'foreign' ? 'duplicate_foreign' : 'duplicate_own';
      return NextResponse.json({ error }, { status: 409 });
    }

    // AI-премодерация: ПОДСКАЗКА модератору (aiVerdict), не решение. Без ключа
    // модели — null (тихо), статус всё равно PENDING → ручная модерация.
    const verdict = await premoderate(buffer);

    // Стадия 2: запись вариантов + строка Photo
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
        // Prisma Json-поле требует индекс-сигнатуру — типизированный вердикт
        // сериализуем через каст (структура плоская, JSON-совместимая).
        aiVerdict: verdict ? (verdict as unknown as Prisma.InputJsonObject) : undefined,
        // status: PENDING по умолчанию — публикация только после модерации
      },
    });

    return NextResponse.json(
      { photoId: photo.id, uploaded: photoCount + 1, limit },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof PhotoValidationError) {
      return NextResponse.json({ error: e.code, message: e.message }, { status: 422 });
    }
    throw e;
  }
}
