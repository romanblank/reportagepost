import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { cityNameRu } from '@/lib/geo-data';
import { categoryNameRu } from '@/lib/category-data';
import { thumbVariantUrl } from '@/lib/photos';
import { ru } from '@/i18n/ru';
import { photoModerationQueue } from '@/lib/moderation';
import { webVariantUrl } from '@/lib/photos';
import { ModerationCard } from './ModerationCard';
import { StoryModerationCard } from './StoryModerationCard';
import { PhotoModerationCard } from './PhotoModerationCard';
import { formatDateRu } from '@/lib/date-format';

export const metadata: Metadata = { title: ru.admin.moderationTitle };
export const dynamic = 'force-dynamic';

export default async function ModerationPage() {
  if (!(await requireAdmin())) redirect('/ru/login');

  const [profiles, stories, pendingPhotos] = await Promise.all([
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
    // Кадры одобренных авторов, добавленные после онбординга (аудит P0)
    photoModerationQueue(),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-10">
      <div className="flex items-center justify-between gap-4">
        <Link href="/ru/admin/reports" className="text-sm underline muted">{ru.adminReports.title} →</Link>
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

      {pendingPhotos.length > 0 && (
        <section className="mt-10">
          <h2 className="t-h3">{ru.admin.photosQueue}</h2>
          <p className="mt-1 text-sm muted">{ru.admin.photosQueueHint}</p>
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pendingPhotos.map((ph) => (
              <PhotoModerationCard
                key={ph.photoId}
                photoId={ph.photoId}
                authorName={ph.authorName}
                username={ph.username}
                webUrl={thumbVariantUrl(ph.storageKey)}
                fullUrl={webVariantUrl(ph.storageKey)}
                meta={`${categoryNameRu(ph.categorySlug)} · ${formatDateRu(ph.uploadedAt)}`}
              />
            ))}
          </ul>
        </section>
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
