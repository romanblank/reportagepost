import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { myRejected, violationCount } from '@/lib/forum';
import { formatDateTimeRu } from '@/lib/date-format';
import { RejectedItem } from '@/components/RejectedItem';
import { ru } from '@/i18n/ru';

export const metadata: Metadata = { title: ru.forum.myRejected };
export const dynamic = 'force-dynamic';

/**
 * Мои неопубликованные тексты.
 *
 * Без этой страницы отказ живёт ровно до закрытия вкладки: человек видел
 * объяснение один раз и больше не имел к нему доступа — то есть обещание
 * «объясним и дадим исправить» выполнялось наполовину.
 */
export default async function MyModerationPage() {
  const session = await getSession();
  if (!session) redirect('/ru/login');

  const [{ posts, threads }, violations] = await Promise.all([
    myRejected(session.userId),
    violationCount(session.userId),
  ]);

  const empty = posts.length === 0 && threads.length === 0;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-12">
      <Link href="/ru/cabinet" className="text-sm underline muted">← {ru.cabinet.title}</Link>
      <h1 className="t-h2 mt-3">{ru.forum.myRejected}</h1>

      {violations >= 3 ? <p className="t-caption mt-3 text-warning">{ru.forum.restricted}</p> : null}

      {empty ? (
        <p className="mt-6 text-sm muted">{ru.forum.noRejected}</p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {threads.map((t) => (
            <li key={t.id} className="rounded-media border border-line bg-surface-2 px-4 py-3">
              <p className="t-caption muted">
                {ru.adminQueue.kinds.thread} · {formatDateTimeRu(t.createdAt)}
              </p>
              <p className="t-small mt-1">{t.title}</p>
              <RejectedItem
                kind="thread"
                id={t.id}
                title={t.title}
                body=""
                status={t.status}
                reasonCode={t.reasonCode}
                reasonQuote={t.reasonQuote}
              />
            </li>
          ))}
          {posts.map((p) => (
            <li key={p.id} className="rounded-media border border-line bg-surface-2 px-4 py-3">
              <p className="t-caption muted">
                {ru.adminQueue.kinds.post} · {p.thread.title} · {formatDateTimeRu(p.createdAt)}
              </p>
              <RejectedItem
                kind="post"
                id={p.id}
                body={p.body}
                status={p.status}
                reasonCode={p.reasonCode}
                reasonQuote={p.reasonQuote}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
