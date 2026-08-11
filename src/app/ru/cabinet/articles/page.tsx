import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { tierOf } from '@/lib/subscription';
import { articleQuota, articlesThisMonth } from '@/lib/articles';
import { ArticleForm } from '@/components/ArticleForm';
import { formatDateRu } from '@/lib/date-format';
import { PageHeader } from '@/components/PageHeader';
import { ru } from '@/i18n/ru';
import { CabinetNav } from '@/components/CabinetNav';

export const metadata: Metadata = { title: ru.articles.title };
export const dynamic = 'force-dynamic';

export default async function CabinetArticlesPage() {
  const session = await getSession();
  if (!session) redirect('/ru/login');
  if (session.role !== 'PHOTOGRAPHER') redirect('/ru/cabinet');

  const [profile, tier, used, mine] = await Promise.all([
    db.photographerProfile.findUnique({ where: { userId: session.userId }, select: { status: true } }),
    tierOf(session.userId),
    articlesThisMonth(session.userId),
    db.article.findMany({
      where: { authorUserId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, title: true, slug: true, status: true, reasonCode: true, createdAt: true },
    }),
  ]);

  const quota = articleQuota(tier);
  const left = Math.max(0, quota - used);
  const approved = profile?.status === 'APPROVED';

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:py-12">
      <div className="max-w-2xl w-full">
      <CabinetNav approved={approved} hasProfile={Boolean(profile)} />
      <PageHeader
        crumbs={[{ href: '/ru/cabinet', label: ru.cabinet.title }]}
        title={ru.articles.title}
        lead={ru.articles.lead}
      />

      {!approved ? (
        <p className="mt-6 text-sm muted">{ru.articles.needApproval}</p>
      ) : (
        <>
          <p className="t-caption mt-4 muted">{ru.articles.quotaNote(left, quota)}</p>
          {left > 0 ? <ArticleForm /> : <p className="mt-4 text-sm muted">{ru.articles.quotaSpent}</p>}
        </>
      )}

      {mine.length > 0 ? (
        <section className="mt-10">
          <p className="t-caption muted">{ru.articles.mine}</p>
          <ul className="mt-2 grid gap-2">
            {mine.map((a) => (
              <li key={a.id} className="rounded-media border border-line bg-surface-2 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="t-small">
                    {a.status === 'PUBLISHED' ? (
                      <Link href={`/ru/journal/${a.slug}`} className="underline">{a.title}</Link>
                    ) : (
                      a.title
                    )}
                  </span>
                  <span className="t-caption muted">{ru.articles.statuses[a.status]}</span>
                </div>
                {a.reasonCode ? (
                  <p className="t-caption mt-1 muted">{ru.moderation.reasons[a.reasonCode] ?? a.reasonCode}</p>
                ) : null}
                <p className="t-caption mt-1 muted">{formatDateRu(a.createdAt)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      </div>
    </main>
  );
}
