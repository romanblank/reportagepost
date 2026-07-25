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

async function findStory(storyId: string) {
  return db.story.findFirst({
    where: { id: storyId, status: 'APPROVED' },
    include: {
      profile: { include: { user: true } },
      photos: { where: { status: 'APPROVED' }, orderBy: { uploadedAt: 'asc' } },
      _count: { select: { likes: true } },
    },
  });
}

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
    openGraph: { type: 'article', title, description, siteName: 'Репортаж Пост', images: ogImage ? [ogImage] : undefined },
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
      <section className="relative isolate flex w-full items-end overflow-hidden bg-ink"
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
          <p className="t-caption text-recognition-hi">{ru.journal.kicker}</p>
          <h1 className="mt-2 max-w-3xl text-balance text-3xl font-semibold leading-[1.08] text-white drop-shadow-sm sm:text-5xl"
            style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}>
            {story.title}
          </h1>
          <p className="mt-3 text-sm text-white/85">
            <Link href={`/ru/photographer/${story.profile.username}`} className="font-medium underline underline-offset-2 hover:text-white">
              {authorName}
            </Link>
            {' · '}{ru.story.photosCount(story.photos.length)}
          </p>
        </div>
      </section>

      <article className="mx-auto w-full max-w-4xl px-4 py-8">
        {story.description && (
          <p className="max-w-2xl text-[17px] leading-relaxed sm:text-lg">{story.description}</p>
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
