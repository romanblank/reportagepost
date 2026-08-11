import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { subscriptionStatus } from '@/lib/subscription';
import { PLAN_FEATURES, featureInTier } from '@/lib/pricing';
import { formatRubMinor } from '@/lib/money';
import { formatDateRu, formatDateTimeRu } from '@/lib/date-format';
import { CabinetNav } from '@/components/CabinetNav';
import { PageHeader } from '@/components/PageHeader';
import { ru } from '@/i18n/ru';

export const metadata: Metadata = { title: ru.cabinetSubscription.title };
export const dynamic = 'force-dynamic';

/**
 * Подписка глазами того, кто платит.
 *
 * Раньше в кабинете была только строка «уровень такой-то». Человек, отдавший
 * деньги, вправе видеть три вещи: что именно у него подключено, до какого числа
 * и какие платежи прошли. Без последнего спорить не о чем — у нас есть данные,
 * у него нет ничего.
 */
export default async function CabinetSubscriptionPage() {
  const session = await getSession();
  if (!session) redirect('/ru/login');
  if (session.role !== 'PHOTOGRAPHER') redirect('/ru/cabinet');

  const [status, payments, profile] = await Promise.all([
    subscriptionStatus(session.userId),
    db.payment.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 24,
      select: { id: true, createdAt: true, amountMinor: true, tier: true, status: true, orderId: true },
    }),
    db.photographerProfile.findUnique({
      where: { userId: session.userId },
      select: { status: true },
    }),
  ]);

  const mine = PLAN_FEATURES.filter((f) => featureInTier(f, status.tier));
  // «Что дальше» показываем ПО УРОВНЯМ, а не одной кучей: человеку на
  // бесплатном важно, что даст ближайший шаг, а не всё сразу — иначе список
  // выглядит недостижимым и не помогает выбрать
  const nextTier: 'PRIME' | 'ELITE' | null =
    status.tier === 'FREE' ? 'PRIME' : status.tier === 'PRIME' ? 'ELITE' : null;
  const next = nextTier
    ? PLAN_FEATURES.filter((f) => f.minTier === nextTier)
    : [];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
      <CabinetNav approved={profile?.status === 'APPROVED'} hasProfile={Boolean(profile)} />
      <PageHeader
        crumbs={[{ href: '/ru/cabinet', label: ru.cabinet.title }]}
        title={ru.cabinetSubscription.title}
        lead={ru.cabinetSubscription.lead}
      />

      <section className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="t-h3">{ru.pro.tierName[status.tier] ?? ru.cabinetSubscription.freeTier}</span>
          {status.isFounding ? (
            <span className="t-caption text-recognition">{ru.cabinetSubscription.founding}</span>
          ) : null}
        </div>

        <p className="mt-2 text-sm muted">
          {status.currentPeriodEnd
            ? ru.cabinetSubscription.until(formatDateRu(status.currentPeriodEnd))
            : status.tier === 'FREE'
              ? ru.cabinetSubscription.freeNote
              : ru.cabinetSubscription.noEnd}
        </p>

        {status.proRequested && status.tier === 'FREE' ? (
          <p className="t-caption mt-2 text-warning">{ru.cabinetSubscription.requested}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/ru/pro" className="btn btn-outline btn-sm">
            {status.tier === 'FREE' ? ru.cabinetSubscription.compare : ru.cabinetSubscription.changePlan}
          </Link>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="t-h3">{ru.cabinetSubscription.includedTitle}</h2>
        <ul className="mt-3 grid gap-1.5 text-sm">
          {mine.map((f) => (
            <li key={f.key} className="flex gap-2">
              <span aria-hidden className="text-success">✓</span>
              <span>{ru.pro.features[f.key]}</span>
            </li>
          ))}
        </ul>

        {next.length > 0 && (
          <>
            <h3 className="t-caption mt-6 muted">
              {ru.cabinetSubscription.nextTitle(ru.pro.tierName[nextTier ?? 'PRIME'])}
            </h3>
            <ul className="mt-2 grid gap-1.5 text-sm muted">
              {next.map((f) => (
                <li key={f.key} className="flex gap-2">
                  <span aria-hidden>·</span>
                  <span>{ru.pro.features[f.key]}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="mt-8">
        <h2 className="t-h3">{ru.cabinetSubscription.paymentsTitle}</h2>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm muted">{ru.cabinetSubscription.paymentsEmpty}</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {payments.map((p) => (
              <li key={p.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-media border border-line bg-surface-2 px-4 py-3">
                <span className="t-small">{formatDateTimeRu(p.createdAt)}</span>
                <span className="t-caption muted">{ru.pro.tierName[p.tier] ?? p.tier}</span>
                <span className="tnum text-sm">{formatRubMinor(p.amountMinor)}</span>
                <span className="t-caption muted">{ru.adminBilling.status[p.status] ?? p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
