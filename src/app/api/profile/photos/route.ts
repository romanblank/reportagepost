import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import {
  ONBOARDING_PHOTOS_MAX,
  PhotoValidationError,
  processAndStorePhoto,
} from '@/lib/photos';

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

  const photoCount = await db.photo.count({ where: { profileId: profile.id } });
  if (photoCount >= ONBOARDING_PHOTOS_MAX) {
    return NextResponse.json({ error: 'photo_limit', limit: ONBOARDING_PHOTOS_MAX }, { status: 409 });
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
    const processed = await processAndStorePhoto(buffer);

    const photo = await db.photo.create({
      data: {
        profileId: profile.id,
        categoryId: profileCategory.categoryId,
        storageKey: processed.storageKey,
        width: processed.width,
        height: processed.height,
        // status: PENDING по умолчанию — публикация только после модерации
      },
    });

    return NextResponse.json(
      { photoId: photo.id, uploaded: photoCount + 1, limit: ONBOARDING_PHOTOS_MAX },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof PhotoValidationError) {
      return NextResponse.json({ error: e.code, message: e.message }, { status: 422 });
    }
    throw e;
  }
}
