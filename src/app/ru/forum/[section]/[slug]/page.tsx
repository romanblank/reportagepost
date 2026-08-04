import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { threadBySlug } from '@/lib/forum';
import { isForumSection } from '@/lib/forum-sections';
import { getSession } from '@/lib/auth';
import { formatDateTimeRu } from '@/lib/date-format';
import { ForumComposer } from '@/components/ForumComposer';
import { ru } from '@/i18n/ru';
import { BASE_URL } from '@/lib/sitemap';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ section: string; slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { section, slug } = await params;
  const thread = await threadBySlug(slug);
  if (!thread) return {};
  return {
    title: thread.title,
    // Описание — начало первого сообщения: оно и есть суть темы
    description: thread.posts[0]?.body.slice(0, 160),
    alternates: { canonical: `${BASE_URL}/ru/forum/${section}/${slug}` },
  };
}

export default async function ThreadPage({ params }: Params) {
  const { section, slug } = await params;
  if (!isForumSection(section)) notFound();

  const [thread, session] = await Promise.all([threadBySlug(slug), getSession()]);
  if (!thread || thread.sectionSlug !== section) notFound();

  // Разметка обсуждения для поисковиков: тема с ответами — ровно то, что
  // описывает DiscussionForumPosting, и без неё сотни страниц форума выглядят
  // для робота как случайный текст
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline: thread.title,
    datePublished: thread.createdAt.toISOString(),
    url: `${BASE_URL}/ru/forum/${section}/${slug}`,
    author: { '@type': 'Person', name: thread.posts[0]?.authorName ?? '' },
    articleBody: thread.posts[0]?.body ?? '',
    interactionStatistic: {
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/CommentAction',
      userInteractionCount: Math.max(0, thread.posts.length - 1),
    },
    comment: thread.posts.slice(1, 20).map((p) => ({
      '@type': 'Comment',
      text: p.body.slice(0, 500),
      datePublished: p.createdAt.toISOString(),
      author: { '@type': 'Person', name: p.authorName },
    })),
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Link href={`/ru/forum/${section}`} className="text-sm underline muted">
        ← {ru.forum.sections[section]}
      </Link>
      <h1 className="t-h2 mt-3 text-balance">{thread.title}</h1>

      <ol className="mt-6 grid gap-3">
        {thread.posts.map((p) => (
          <li key={p.id} className="rounded-media border border-line bg-surface-2 px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="t-small">
                {p.authorUsername ? (
                  <Link href={`/ru/photographer/${p.authorUsername}`} className="underline">{p.authorName}</Link>
                ) : (
                  p.authorName
                )}
              </span>
              <span className="t-caption muted">{formatDateTimeRu(p.createdAt)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{p.body}</p>
          </li>
        ))}
      </ol>

      {thread.closed ? (
        <p className="mt-6 text-sm muted">{ru.forum.closed}</p>
      ) : session ? (
        <ForumComposer threadId={thread.id} />
      ) : (
        <p className="mt-6 text-sm muted">
          <Link href="/ru/login" className="underline">{ru.forum.loginToReply}</Link>
        </p>
      )}
    </main>
  );
}
