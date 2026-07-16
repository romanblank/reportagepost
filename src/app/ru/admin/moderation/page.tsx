import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { cityNameRu } from '@/lib/geo-data';
import { categoryNameRu } from '@/lib/category-data';
import { thumbVariantUrl } from '@/lib/photos';
import { ru } from '@/i18n/ru';
import { ModerationCard } from './ModerationCard';

export const metadata: Metadata = { title: ru.admin.moderationTitle };
export const dynamic = 'force-dynamic';

export default async function ModerationPage() {
  if (!(await requireAdmin())) redirect('/ru/login');

  const profiles = await db.photographerProfile.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    include: {
      user: true,
      city: true,
      categories: { include: { category: true } },
      photos: { orderBy: { uploadedAt: 'asc' } },
    },
  });

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="t-h1">{ru.admin.moderationTitle}</h1>
      {profiles.length === 0 ? (
        <p className="mt-4 opacity-60">{ru.admin.empty}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {profiles.map((p) => (
            <ModerationCard
              key={p.id}
              profileId={p.id}
              header={`${p.user.firstName} ${p.user.lastName} (@${p.username})`}
              meta={`${cityNameRu(p.city.slug)} · ${p.categories
                .map((c) => categoryNameRu(c.category.slug))
                .join(', ')} · ${ru.admin.photosCount(p.photos.length)}`}
              photoUrls={p.photos.map((ph) => thumbVariantUrl(ph.storageKey))}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
