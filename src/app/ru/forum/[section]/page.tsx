import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isForumSection } from '@/lib/forum-sections';
import { threadsInSection } from '@/lib/forum';
import { getSession } from '@/lib/auth';
import { formatDateRu } from '@/lib/date-format';
import { ru } from '@/i18n/ru';
import { BASE_URL } from '@/lib/sitemap';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ section: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { section } = await params;
  if (!isForumSection(section)) return {};
  return {
    title: `${ru.forum.sections[section]} — ${ru.forum.title}`,
    description: ru.forum.sectionLead[section],
    alternates: { canonical: `${BASE_URL}/ru/forum/${section}` },
  };
}

export default async function SectionPage({ params }: Params) {
  const { section } = await params;
  if (!isForumSection(section)) notFound();

  const [threads, session] = await Promise.all([threadsInSection(section), getSession()]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:py-12">
      <Link href="/ru/forum" className="text-sm underline muted">← {ru.forum.title}</Link>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="t-h2">{ru.forum.sections[section]}</h1>
          <p className="mt-1 text-sm muted">{ru.forum.sectionLead[section]}</p>
        </div>
        {session ? (
          <Link href={`/ru/forum/new?section=${section}`} className="btn btn-outline btn-sm">
            {ru.forum.newThread}
          </Link>
        ) : null}
      </div>

      {threads.length === 0 ? (
        <p className="mt-8 text-sm muted">{ru.forum.empty}</p>
      ) : (
        <ul className="mt-6 grid gap-2">
          {threads.map((t) => (
            <li key={t.id}>
              <Link
                href={`/ru/forum/${section}/${t.slug}`}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 rounded-media border border-line bg-surface-2 px-4 py-3 transition-colors hover:border-accent"
              >
                <span className="min-w-0">
                  <span className="t-small block">{t.title}</span>
                  <span className="t-caption muted">{t.authorName}</span>
                </span>
                <span className="t-caption shrink-0 muted">
                  {ru.forum.postCount(t.postCount)} · {formatDateRu(t.lastPostAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
