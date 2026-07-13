import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { webVariantUrl } from '@/lib/photos';
import { StoryLikeButton } from './StoryLikeButton';
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
  return { title: story?.title ?? ru.story.notFound };
}

export default async function StoryPage(props: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await props.params;
  const story = await findStory(storyId);
  if (!story) notFound();

  const session = await getSession();
  const myLike = session
    ? await db.like.findUnique({ where: { userId_storyId: { userId: session.userId, storyId } } })
    : null;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{story.title}</h1>
      <p className="mt-1 text-sm opacity-60">
        {ru.story.byLabel}:{' '}
        <Link href={`/ru/photographer/${story.profile.username}`} className="underline">
          {story.profile.user.firstName} {story.profile.user.lastName}
        </Link>{' '}
        · {ru.story.photosCount(story.photos.length)}
      </p>
      {story.description && <p className="mt-3 max-w-2xl">{story.description}</p>}

      <div className="mt-4">
        <StoryLikeButton
          storyId={story.id}
          initialLiked={Boolean(myLike)}
          initialCount={story._count.likes}
          authed={Boolean(session)}
        />
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {story.photos.map((photo) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={photo.id} src={webVariantUrl(photo.storageKey)} alt="" loading="lazy"
            width={photo.width} height={photo.height} className="w-full rounded-lg" />
        ))}
      </div>
    </main>
  );
}
