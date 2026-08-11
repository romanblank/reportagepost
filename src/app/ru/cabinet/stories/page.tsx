import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { tierOf } from '@/lib/subscription';
import { thumbVariantUrl } from '@/lib/photos';
import { ru } from '@/i18n/ru';
import { StoryComposer, type ComposerPhoto } from '@/components/StoryComposer';
import { PageHeader } from '@/components/PageHeader';
import { CabinetNav } from '@/components/CabinetNav';

export const metadata: Metadata = { title: ru.cabinetStories.metaTitle };
export const dynamic = 'force-dynamic';

const STATUS_LABEL = {
  DRAFT: ru.cabinetStories.statusDraft,
  PENDING: ru.cabinetStories.statusPending,
  NEEDS_REVISION: ru.cabinetStories.statusRevision,
  APPROVED: ru.cabinetStories.statusApproved,
  REJECTED: ru.cabinetStories.statusRejected,
} as const;

export default async function CabinetStoriesPage() {
  const session = await getSession();
  if (!session) redirect('/ru/login');
  if (session.role !== 'PHOTOGRAPHER') redirect('/ru/cabinet');

  const profile = await db.photographerProfile.findUnique({
    where: { userId: session.userId },
    select: { id: true, status: true },
  });
  if (!profile) redirect('/ru/cabinet');

  const isPaid = (await tierOf(session.userId)) !== 'FREE';

  const [photos, stories] = await Promise.all([
    db.photo.findMany({
      where: { profileId: profile.id, status: 'APPROVED' },
      orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }],
      select: { id: true, storageKey: true },
    }),
    db.story.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { photos: true } } },
    }),
  ]);

  const composerPhotos: ComposerPhoto[] = photos.map((p) => ({ id: p.id, thumb: thumbVariantUrl(p.storageKey) }));

  // Разделы, требующие одобренной анкеты, до одобрения не показываем:
  // ссылка, ведущая к «дождитесь проверки», — обещание, которое мы сами
  // не выполняем
  const navProfile = await db.photographerProfile.findUnique({
      where: { userId: session.userId },
      select: { status: true },
    });
  const navApproved = navProfile?.status === 'APPROVED';

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <CabinetNav approved={navApproved} hasProfile={Boolean(navProfile)} />
      <PageHeader
        crumbs={[{ href: '/ru/cabinet', label: ru.cabinet.title }]}
        title={ru.cabinetStories.tileTitle}
      />
      <h1 className="t-h2 mt-3">{ru.cabinetStories.title}</h1>
      <p className="mt-2 max-w-2xl text-sm muted">{ru.cabinetStories.subtitle}</p>

      {stories.length > 0 && (
        <section className="mt-6">
          <h2 className="t-caption muted">{ru.cabinetStories.existingTitle}</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {stories.map((s) => (
              <li key={s.id} className="card flex items-center justify-between gap-3 p-3 text-sm">
                <span className="min-w-0">
                  {s.status === 'APPROVED' ? (
                    <Link href={`/ru/story/${s.id}`} className="font-medium hover:underline">{s.title}</Link>
                  ) : (
                    <span className="font-medium">{s.title}</span>
                  )}
                  <span className="ml-2 muted">· {ru.cabinetStories.photosCount(s._count.photos)}</span>
                </span>
                <span className={`t-caption shrink-0 rounded-sm px-2 py-0.5 ${s.status === 'APPROVED' ? 'bg-success-soft text-success' : 'bg-surface-2 muted'}`}>
                  {STATUS_LABEL[s.status]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 border-t border-line pt-6">
        <h2 className="t-h3">{ru.cabinetStories.newTitle}</h2>
        {!isPaid ? (
          <Link href="/ru/pro"
            className="mt-4 flex items-center justify-between gap-3 rounded-media border border-recognition/40 bg-recognition-soft/30 px-4 py-3 text-sm transition hover:border-recognition/70">
            <span className="muted">{ru.cabinetStories.needActive}</span>
            <span className="shrink-0 font-medium text-recognition">{ru.cabinetStories.needActiveCta} →</span>
          </Link>
        ) : (
          <StoryComposer photos={composerPhotos} />
        )}
      </section>
    </main>
  );
}
