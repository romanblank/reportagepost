import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import {
  analyzePhoto,
  storePhotoVariants,
} from '@/lib/photos';
import { findNearDuplicate } from '@/lib/photo-dedup';
import { premoderate } from '@/lib/premoderation';
import { tierOf } from '@/lib/subscription';
import { portfolioLimit } from '@/lib/pricing';
import { rateLimit } from '@/lib/rate-limit';
import { storage } from '@/lib/storage';
import { DomainError, handleRoute } from '@/lib/errors';

export const maxDuration = 60; // обработка sharp на больших файлах

const MAX_FILE_BYTES = 40 * 1024 * 1024;

/** Лимит выбран параллельной загрузкой — отдельный тип, чтобы отличить от
 *  ошибок валидации и корректно откатить уже записанные файлы. */
class PhotoLimitError extends DomainError {
  constructor(public limit: number) {
    super('photo_limit', 409);
  }
}

// Онбординг, шаг 2: загрузка фото портфолио (multipart: file, categorySlug)
export function POST(req: Request) {
  return handleRoute(async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Лимит частоты (аудит 2026-07-31, P1): на каждый файл до 40МБ идут несколько
  // декодирований sharp — это CPU и память единственного контейнера. У аватара
  // лимит стоял с самого начала, у портфолио его не было вовсе, а лимит по
  // КОЛИЧЕСТВУ фото не мешает (удалил → загрузил снова). 60/час — вдвое выше
  // реального пакета съёмки, но обрубает цикл.
  // 429 отдаёт handleRoute по DomainError. Прежний catch ловил и падение БД,
  // выдавая «слишком много попыток» вместо 500 (аудит 2026-08-01, P2).
  await rateLimit(`photo-upload:user:${session.userId}`, 60, 3600);

  const profile = await db.photographerProfile.findUnique({
    where: { userId: session.userId },
    include: { categories: { include: { category: true } } },
  });
  if (!profile) return NextResponse.json({ error: 'no_profile' }, { status: 409 });

  // Лимит портфолио зависит от тарифа (FREE 20 / PRO 300) — граница FREE/PRO.
  // Ранняя проверка отсекает заведомо лишнее ДО дорогой обработки; финальная,
  // защищённая от гонки, — в транзакции при вставке (см. ниже).
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

    // Повторная проверка лимита В ТРАНЗАКЦИИ (аудит 2026-07-31, P1 TOCTOU):
    // между ранней проверкой и вставкой проходят секунды тяжёлой обработки, а
    // браузер шлёт файлы пачками параллельно — все запросы видели «лимит не
    // достигнут» и вставлялись, пробивая тариф. Здесь окно гонки — миллисекунды.
    const photo = await db.$transaction(async (tx) => {
      const current = await tx.photo.count({ where: { profileId: profile.id } });
      if (current >= limit) throw new PhotoLimitError(limit);
      return tx.photo.create({
      data: {
        profileId: profile.id,
        categoryId: profileCategory.categoryId,
        storageKey: stored.storageKey,
        width: analyzed.width,
        height: analyzed.height,
        phash: analyzed.phash,
        blurhash: analyzed.blurData,
        hasWebp: true, // storePhotoVariants кладёт web.webp/thumb.webp рядом
        // Prisma Json-поле требует индекс-сигнатуру — типизированный вердикт
        // сериализуем через каст (структура плоская, JSON-совместимая).
        aiVerdict: verdict ? (verdict as unknown as Prisma.InputJsonObject) : undefined,
        // status: PENDING по умолчанию — публикация только после модерации
      },
      });
    }).catch(async (e) => {
      // Лимит выбрали параллельные загрузки — убираем уже записанные варианты,
      // иначе в хранилище останутся осиротевшие файлы, за которые платим.
      if (e instanceof PhotoLimitError) {
        const base = stored.storageKey.replace(/\/original\.jpg$/, '');
        await Promise.all([
          storage.delete(`${base}/original.jpg`),
          storage.delete(`${base}/web.jpg`),
          storage.delete(`${base}/thumb.jpg`),
        ]).catch(() => {});
      }
      throw e;
    });

    return NextResponse.json(
      { photoId: photo.id, uploaded: photoCount + 1, limit },
      { status: 201 },
    );
  } catch (e) {
    // PhotoValidationError теперь сам несёт код и статус — его разбирает
    // handleRoute; здесь остаётся только лимит с его полем limit в теле.
    if (e instanceof PhotoLimitError) {
      return NextResponse.json({ error: 'photo_limit', limit: e.limit }, { status: 409 });
    }
    throw e;
  }
  });
}
