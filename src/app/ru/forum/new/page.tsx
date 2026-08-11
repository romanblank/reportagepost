import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { FORUM_SECTIONS, isForumSection } from '@/lib/forum-sections';
import { violationCount, threadQuotaLeft } from '@/lib/forum';
import { NewThreadForm } from '@/components/NewThreadForm';
import { ru } from '@/i18n/ru';

export const metadata: Metadata = { title: ru.forum.newThread };
export const dynamic = 'force-dynamic';

type Params = { searchParams: Promise<{ section?: string }> };

export default async function NewThreadPage({ searchParams }: Params) {
  const session = await getSession();
  if (!session) redirect('/ru/login');

  const { section } = await searchParams;
  const initialSection = section && isForumSection(section) ? section : FORUM_SECTIONS[0].slug;

  const [profile, violations, quota] = await Promise.all([
    db.photographerProfile.findUnique({ where: { userId: session.userId }, select: { status: true } }),
    violationCount(session.userId),
    threadQuotaLeft(session.userId),
  ]);

  // Правило показываем ДО формы, а не после отправки: узнать, что тему завести
  // нельзя, потратив на неё двадцать минут, — худший способ познакомиться с
  // сообществом
  if (profile?.status !== 'APPROVED') {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <h1 className="t-h2">{ru.forum.newThread}</h1>
        <p className="mt-3 text-sm muted">{ru.forum.onlyPhotographers}</p>
        <Link href="/ru/forum" className="btn btn-outline btn-sm mt-6">← {ru.forum.title}</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-12">
      <Link href="/ru/forum" className="text-sm underline muted">← {ru.forum.title}</Link>
      <h1 className="t-h2 mt-3">{ru.forum.newThread}</h1>

      <section className="mt-4 rounded-media border border-line bg-surface px-4 py-3">
        <p className="t-caption muted">{ru.forum.hintsTitle}</p>
        <ul className="mt-2 grid gap-1 text-sm muted">
          {ru.forum.hints.map((h) => <li key={h}>— {h}</li>)}
        </ul>
      </section>

      {violations >= 3 ? <p className="t-caption mt-4 text-warning">{ru.forum.restricted}</p> : null}
      <p className="t-caption mt-4 muted">{ru.forum.quotaNote(quota.left, quota.quota)}</p>

      <NewThreadForm
        sections={FORUM_SECTIONS.map((s) => ({ slug: s.slug, label: ru.forum.sections[s.slug] }))}
        initialSection={initialSection}
      />
    </main>
  );
}
