import { cache } from 'react';
import { APP_NAME } from '@/lib/constants';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { webVariantUrl } from '@/lib/photos';
import { BASE_URL } from '@/lib/sitemap';
import { StoryLikeButton } from './StoryLikeButton';
import { StoryGallery } from './StoryGallery';
import { CommentSection } from './CommentSection';
import { commentsForStory } from '@/lib/comments';
import { ru } from '@/i18n/ru';

export const dynamic = 'force-dynamic';

// Запрос дедуплицируется в пределах одного рендера (аудит 2026-08-01, P2).
// generateMetadata и сам компонент вызывают его независимо, а Prisma-вызовы
// Next не дедуплицирует (в отличие от fetch) — самая посещаемая страница
// платформы делала тяжёлый джойн ДВАЖДЫ на каждый заход. cache() из react
// уже применён так же к getSession (src/lib/auth.ts).
const findStory = cache(async (storyId: string) => {
  return db.story.findFirst({
    // Серия публична только у публичного (APPROVED) автора — иначе прямая ссылка
    // открывала бы контент снятого с публикации профиля (консистентно с дискавери).
    where: { id: storyId, status: 'APPROVED', profile: { status: 'APPROVED' } },
    include: {
      profile: { include: { user: true } },
      photos: { where: { status: 'APPROVED' }, orderBy: { uploadedAt: 'asc' } },
      _count: { select: { likes: true } },
    },
  });
});

export async function generateMetadata(props: { params: Promise<{ storyId: string }> }): Promise<Metadata> {
  const { storyId } = await props.params;
  const story = await findStory(storyId);
  if (!story) return { title: ru.story.notFound };
  const title = story.title;
  const description = story.description ?? `${ru.story.byLabel}: ${story.profile.user.firstName} ${story.profile.user.lastName}`;
  const raw = story.photos[0] ? webVariantUrl(story.photos[0].storageKey) : undefined;
  const ogImage = raw ? (raw.startsWith('http') ? raw : `${BASE_URL}${raw}`) : undefined;
  return {
    title, description,
    openGraph: { type: 'article', title, description, siteName: APP_NAME, images: ogImage ? [ogImage] : undefined },
    twitter: { card: ogImage ? 'summary_large_image' : 'summary', title, description, images: ogImage ? [ogImage] : undefined },
  };
}

export default async function StoryPage(props: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await props.params;
  const story = await findStory(storyId);
  if (!story) notFound();

  const session = await getSession();
  const [myLike, comments] = await Promise.all([
    session
      ? db.like.findUnique({ where: { userId_storyId: { userId: session.userId, storyId } } })
      : Promise.resolve(null),
    commentsForStory(storyId),
  ]);

  const cover = story.photos[0];
  const rest = story.photos.slice(1);
  const authorName = `${story.profile.user.firstName} ${story.profile.user.lastName}`;

  return (
    <main className="flex-1">
      {/* Иммерсивный герой фото-эссе: обложка + заголовок антиквой поверх */}
      <section className="relative isolate flex w-full items-end overflow-hidden bg-paper"
        style={{ minHeight: 'clamp(360px, 62vh, 640px)' }}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={webVariantUrl(cover.storageKey)} alt="" aria-hidden
            className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 50% 20%, var(--recognition) 0%, #241a0e 45%, #0a0a0d 100%)' }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/40" />
        <div className="anim-rise relative mx-auto w-full max-w-4xl px-4 pb-8 sm:pb-12">
          {/* Рубрика и кредит — моноширинным, как подпись под кадром в издании;
              заголовок — типо-ролью, а не зашитым размером (инвариант спеки) */}
          <p className="t-caption text-recognition-hi" style={{ fontFamily: 'var(--font-mono)' }}>{ru.journal.kicker}</p>
          <h1 className="t-display mt-2 max-w-3xl text-balance text-white">
            {story.title}
          </h1>
          <p className="mt-4 t-small text-white/85" style={{ fontFamily: 'var(--font-mono)' }}>
            <Link href={`/ru/photographer/${story.profile.username}`} className="underline underline-offset-2 hover:text-white">
              {authorName}
            </Link>
            {' · '}{ru.story.photosCount(story.photos.length)}
          </p>
        </div>
      </section>

      <article className="mx-auto w-full max-w-4xl px-4 py-8">
        {story.description && (
          <p className="t-body-lg max-w-[58ch] leading-relaxed">{story.description}</p>
        )}
        <div className="mt-5">
          <StoryLikeButton
            storyId={story.id}
            initialLiked={Boolean(myLike)}
            initialCount={story._count.likes}
            authed={Boolean(session)}
          />
        </div>

        {rest.length > 0 && (
          <StoryGallery images={rest.map((p) => ({ src: webVariantUrl(p.storageKey), width: p.width, height: p.height }))} />
        )}

        <CommentSection
          storyId={story.id}
          initial={comments.map((c) => ({
            id: c.id,
            body: c.body,
            createdAt: c.createdAt.toISOString(),
            authorName: c.authorName,
            authorUserId: c.authorUserId,
          }))}
          me={{ userId: session?.userId ?? null, isAdmin: session?.role === 'ADMIN', authed: Boolean(session) }}
        />
      </article>
    </main>
  );
}
