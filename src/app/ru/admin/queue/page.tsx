import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { moderationQueue } from '@/lib/moderation-queue';
import { db } from '@/lib/db';
import { formatDateTimeRu, hoursSince } from '@/lib/date-format';
import { QueueDecision } from '@/components/QueueDecision';
import { ShootReviewDecision } from '@/components/admin/ShootReviewDecision';
import { ru } from '@/i18n/ru';
import { PageHeader } from '@/components/PageHeader';
import { AdminNav } from '@/components/admin/AdminNav';
import { adminCounters } from '@/lib/admin-counters';

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

  // Спорные подтверждения съёмок: до 2026-08-17 needsReview существовал
  // только как телеграм-алерт — «уйдёт к человеку» вело в никуда
  const shootsToReview = await db.shootConfirmation.findMany({
    where: { needsReview: true, state: 'CONFIRMED' },
    orderBy: { createdAt: 'asc' },
    take: 50,
    select: {
      id: true, createdAt: true, eventDate: true,
      client: { select: { firstName: true, lastName: true, emailVerifiedAt: true, createdAt: true } },
      profile: { select: { username: true, user: { select: { firstName: true, lastName: true } } } },
    },
  });

  const counters = await adminCounters();
  // Возраст аккаунта — через lib-хелпер: react-compiler запрещает Date.now()
  // в рендере, а внутрь импортов не заглядывает
  const shootsReview = shootsToReview.map((sh) => ({
    ...sh,
    ageHours: hoursSince(sh.client.createdAt),
  }));

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <div className="max-w-4xl w-full">
      <AdminNav counters={counters} />
      <PageHeader
        crumbs={[{ href: '/ru/admin', label: ru.adminHome.title }]}
        title={ru.adminQueue.title}
        lead={ru.adminQueue.lead}
      />
      <h1 className="t-h2 mt-3">{ru.adminQueue.title}</h1>

      {items.length === 0 ? (
        <p className="mt-8 t-small muted">{ru.adminQueue.empty}</p>
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
              <p className="mt-2 whitespace-pre-wrap t-small">{item.body.slice(0, 2000)}</p>
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

      {shootsToReview.length > 0 && (
        <section className="mt-10">
          <h2 className="t-h3">{ru.adminShoots.title}</h2>
          <p className="mt-1 t-small muted">{ru.adminShoots.lead}</p>
          <ul className="mt-4 grid gap-3">
            {shootsReview.map((sh) => (
              <li key={sh.id} className="rounded-media border border-line bg-surface-2 px-4 py-3">
                <span className="t-caption muted">
                  {ru.adminShoots.meta(
                    `${sh.client.firstName} ${sh.client.lastName}`,
                    `${sh.profile.user.firstName} ${sh.profile.user.lastName}`,
                  )}
                  {' · '}{formatDateTimeRu(sh.createdAt)}
                  {sh.eventDate ? ` · ${ru.adminShoots.shotOn(formatDateTimeRu(sh.eventDate))}` : ''}
                </span>
                <p className="mt-1 t-fine muted">
                  {sh.client.emailVerifiedAt ? ru.adminShoots.emailVerified : ru.adminShoots.emailNot}
                  {' · '}
                  {ru.adminShoots.accountAge(sh.ageHours)}
                  {' · '}
                  <a href={`/ru/photographer/${sh.profile.username}`} className="underline">{sh.profile.username}</a>
                </p>
                <ShootReviewDecision shootId={sh.id} />
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </main>
  );
}
