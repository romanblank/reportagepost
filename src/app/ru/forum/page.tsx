import type { Metadata } from 'next';
import Link from 'next/link';
import { FORUM_SECTIONS } from '@/lib/forum-sections';
import { forumOverview } from '@/lib/forum';
import { formatDateRu } from '@/lib/date-format';
import { ru } from '@/i18n/ru';
import { BASE_URL } from '@/lib/sitemap';

export const metadata: Metadata = {
  title: ru.forum.title,
  description: ru.forum.lead,
  alternates: { canonical: `${BASE_URL}/ru/forum` },
};
export const dynamic = 'force-dynamic';

export default async function ForumPage() {
  const overview = await forumOverview();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:py-12">
      <header className="max-w-2xl">
        <h1 className="t-h1">{ru.forum.title}</h1>
        <p className="mt-3 t-body-lg muted">{ru.forum.lead}</p>
      </header>

      <ul className="mt-8 grid gap-2">
        {FORUM_SECTIONS.map((s) => {
          const stat = overview[s.slug];
          return (
            <li key={s.slug}>
              <Link
                href={`/ru/forum/${s.slug}`}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 rounded-media border border-line bg-surface-2 px-4 py-4 transition-colors hover:border-accent"
              >
                <span className="min-w-0">
                  <span className="t-small block">{ru.forum.sections[s.slug]}</span>
                  <span className="t-caption muted">{ru.forum.sectionLead[s.slug]}</span>
                </span>
                <span className="t-caption shrink-0 muted">
                  {stat ? ru.forum.threadCount(stat.threads) : ru.forum.threadCount(0)}
                  {stat?.lastPostAt ? ` · ${formatDateRu(stat.lastPostAt)}` : ''}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <section className="mt-10 rounded-media border border-line bg-surface px-4 py-4">
        <p className="t-caption muted">{ru.forum.hintsTitle}</p>
        <ul className="mt-2 grid gap-1 text-sm muted">
          {ru.forum.hints.map((h) => <li key={h}>— {h}</li>)}
        </ul>
      </section>
    </main>
  );
}
