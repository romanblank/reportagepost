import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { moderationQueue } from '@/lib/moderation-queue';
import { formatDateTimeRu } from '@/lib/date-format';
import { QueueDecision } from '@/components/QueueDecision';
import { ru } from '@/i18n/ru';
import { PageHeader } from '@/components/PageHeader';

export const metadata: Metadata = { title: ru.adminQueue.title };
export const dynamic = 'force-dynamic';

/**
 * Очередь к человеку: спорное и переотправленное после правки.
 *
 * Первичный поток сюда не попадает вовсе — он разбирается автоматом. Если этот
 * список начнёт расти, значит пороги автомодерации выставлены слишком робко, и
 * чинить надо их, а не нанимать людей.
 */
export default async function AdminQueuePage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/ru/cabinet');

  const items = await moderationQueue();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <PageHeader
        crumbs={[{ href: '/ru/admin', label: ru.adminHome.title }]}
        title={ru.adminQueue.title}
        lead={ru.adminQueue.lead}
      />
      <h1 className="t-h2 mt-3">{ru.adminQueue.title}</h1>

      {items.length === 0 ? (
        <p className="mt-8 text-sm muted">{ru.adminQueue.empty}</p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="rounded-media border border-line bg-surface-2 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="t-caption muted">
                  {ru.adminQueue.kinds[item.kind]} · {item.authorName} · {formatDateTimeRu(item.createdAt)}
                </span>
                {item.resubmitted ? (
                  <span className="t-caption text-warning">{ru.adminQueue.resubmitted}</span>
                ) : null}
              </div>
              {item.title ? <p className="t-small mt-1">{item.title}</p> : null}
              <p className="mt-2 whitespace-pre-wrap text-sm">{item.body.slice(0, 2000)}</p>
              {item.reasonCode ? (
                <p className="t-caption mt-2 muted">
                  {ru.moderation.reasons[item.reasonCode] ?? item.reasonCode}
                  {item.reasonQuote ? ` — «${item.reasonQuote}»` : ''}
                </p>
              ) : null}
              <QueueDecision kind={item.kind} id={item.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
