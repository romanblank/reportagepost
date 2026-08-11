import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { myRejected, violationCount } from '@/lib/forum';
import { formatDateTimeRu } from '@/lib/date-format';
import { RejectedItem } from '@/components/RejectedItem';
import { PageHeader } from '@/components/PageHeader';
import { ru } from '@/i18n/ru';
import { CabinetNav } from '@/components/CabinetNav';
import { db } from '@/lib/db';

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

  // Разделы, требующие одобренной анкеты, до одобрения не показываем:
  // ссылка, ведущая к «дождитесь проверки», — обещание, которое мы сами
  // не выполняем
  const navProfile = await db.photographerProfile.findUnique({
      where: { userId: session.userId },
      select: { status: true },
    });
  const navApproved = navProfile?.status === 'APPROVED';

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-12">
      <CabinetNav approved={navApproved} hasProfile={Boolean(navProfile)} />
      <PageHeader
        crumbs={[{ href: '/ru/cabinet', label: ru.cabinet.title }]}
        title={ru.forum.myRejected}
      />

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
