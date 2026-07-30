import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { cityNameRu } from '@/lib/geo-data';
import { categoryNameRu } from '@/lib/category-data';
import { thumbVariantUrl } from '@/lib/photos';
import { ru } from '@/i18n/ru';
import { ModerationCard } from './ModerationCard';
import { StoryModerationCard } from './StoryModerationCard';

export const metadata: Metadata = { title: ru.admin.moderationTitle };
export const dynamic = 'force-dynamic';

export default async function ModerationPage() {
  if (!(await requireAdmin())) redirect('/ru/login');

  const [profiles, stories] = await Promise.all([
    db.photographerProfile.findMany({
      where: { status: 'PENDING' },
      // Правки Active/Active+ — в первую очередь (перк подписки), затем по дате.
      orderBy: [{ proRank: 'desc' }, { createdAt: 'asc' }],
      include: {
        user: true,
        city: true,
        categories: { include: { category: true } },
        photos: { orderBy: { uploadedAt: 'asc' } },
      },
    }),
    db.story.findMany({
      where: { status: 'PENDING' },
      // Серии Active/Active+ — приоритет модерации (perk), затем по дате
      orderBy: [{ profile: { proRank: 'desc' } }, { createdAt: 'asc' }],
      include: {
        category: true,
        profile: { include: { user: { select: { firstName: true, lastName: true } } } },
        photos: { where: { status: 'APPROVED' }, orderBy: { sortOrder: 'asc' } },
      },
    }),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="t-h1">{ru.admin.moderationTitle}</h1>
        <a href="/api/admin/export" download className="btn btn-outline btn-sm shrink-0">{ru.admin.exportCsv}</a>
      </div>
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

      {stories.length > 0 && (
        <section className="mt-10">
          <h2 className="t-h3">{ru.admin.storiesQueue}</h2>
          <ul className="mt-4 flex flex-col gap-4">
            {stories.map((s) => (
              <StoryModerationCard
                key={s.id}
                storyId={s.id}
                header={`${s.title} — ${s.profile.user.firstName} ${s.profile.user.lastName}`}
                meta={`${categoryNameRu(s.category.slug)} · ${ru.admin.photosCount(s.photos.length)}`}
                description={s.description}
                photoUrls={s.photos.map((ph) => thumbVariantUrl(ph.storageKey))}
              />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
