import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/errors';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { PhotoValidationError, analyzePhoto, storePhotoVariants, thumbVariantUrl } from '@/lib/photos';
import { findNearDuplicate } from '@/lib/photo-dedup';
import { premoderate } from '@/lib/premoderation';
import { logAudit } from '@/lib/audit';

export const maxDuration = 60;
const MAX_FILE_BYTES = 40 * 1024 * 1024;

// Загрузка фото за фотографа (админ). Кадр публикуется сразу (APPROVED) — оператор
// курирует. Категория должна быть среди жанров профиля.
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { id } = await ctx.params;
    const profile = await db.photographerProfile.findUnique({
      where: { id },
      include: { categories: { include: { category: true } } },
    });
    if (!profile) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    const categorySlug = form?.get('categorySlug');
    if (!(file instanceof File) || typeof categorySlug !== 'string') {
      return NextResponse.json({ error: 'validation' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'file_too_large' }, { status: 413 });

    const profileCategory = profile.categories.find((c) => c.category.slug === categorySlug);
    if (!profileCategory) return NextResponse.json({ error: 'category_not_in_profile' }, { status: 400 });

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const analyzed = await analyzePhoto(buffer);
      const dup = await findNearDuplicate(analyzed.phash, profile.id);
      if (dup) {
        return NextResponse.json({ error: dup.kind === 'foreign' ? 'duplicate_foreign' : 'duplicate_own' }, { status: 409 });
      }
      const verdict = await premoderate(buffer);
      const stored = await storePhotoVariants(buffer);

      const photo = await db.$transaction(async (tx) => {
        const p = await tx.photo.create({
          data: {
            profileId: profile.id,
            categoryId: profileCategory.categoryId,
            storageKey: stored.storageKey,
            width: analyzed.width,
            height: analyzed.height,
            phash: analyzed.phash,
            blurhash: analyzed.blurData,
            aiVerdict: verdict ? (verdict as unknown as Prisma.InputJsonObject) : undefined,
            status: 'APPROVED', // оператор курирует — публикуем сразу
            publishedAt: new Date(),
          },
        });
        await logAudit(tx, admin.userId, 'photo.upload_by_admin', 'PHOTO', p.id, { profileId: profile.id });
        return p;
      });

      return NextResponse.json({ photoId: photo.id, thumbUrl: thumbVariantUrl(stored.storageKey) }, { status: 201 });
    } catch (e) {
      if (e instanceof PhotoValidationError) {
        return NextResponse.json({ error: e.code, message: e.message }, { status: 422 });
      }
      throw e;
    }
  });
}
