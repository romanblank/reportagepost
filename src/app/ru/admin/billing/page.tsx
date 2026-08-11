import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { adminPayments, adminSubscriptions, billingOverview } from '@/lib/admin-billing';
import { formatDateTimeRu, formatDateRu } from '@/lib/date-format';
import { formatRubMinor } from '@/lib/money';
import { AdminNav } from '@/components/admin/AdminNav';
import { PageHeader } from '@/components/PageHeader';
import { ru } from '@/i18n/ru';

export const metadata: Metadata = { title: ru.adminBilling.title };
export const dynamic = 'force-dynamic';

/**
 * Деньги: платежи и подписки.
 *
 * Раздел нужен до первого платежа, а не после: проверить приём оплаты, не видя
 * платежей, невозможно — остаётся смотреть в базу. Плюс очередь запросов на
 * подключение: пока оплата не работает, подписку выдаёт человек, и забыть об
 * этом означает не выдать оплаченное.
 */
export default async function AdminBillingPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/ru/cabinet');

  const [payments, subs, overview] = await Promise.all([
    adminPayments(),
    adminSubscriptions(),
    billingOverview(),
  ]);

  const waiting = subs.filter((s) => s.requestedAt && s.activeTier === 'FREE');

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-10">
      <AdminNav />
      <PageHeader
        crumbs={[{ href: '/ru/admin', label: ru.adminHome.title }]}
        title={ru.adminBilling.title}
        lead={ru.adminBilling.lead}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: ru.adminBilling.statPaid, value: formatRubMinor(overview.paidMinor) },
          { label: ru.adminBilling.statPayments, value: String(overview.paidCount) },
          { label: ru.adminBilling.statActive, value: String(overview.activeSubs) },
          { label: ru.adminBilling.statRequests, value: String(overview.pendingRequests) },
        ].map((s) => (
          <div key={s.label} className="rounded-media border border-line bg-surface-2 px-4 py-3">
            <div className="tnum text-2xl">{s.value}</div>
            <div className="t-caption mt-1 muted">{s.label}</div>
          </div>
        ))}
      </div>

      {waiting.length > 0 && (
        <section className="mt-8">
          <h2 className="t-h3">{ru.adminBilling.waitingTitle}</h2>
          <p className="t-caption mt-1 muted">{ru.adminBilling.waitingHint}</p>
          <ul className="mt-3 grid gap-2">
            {waiting.map((s) => (
              <li key={s.userId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-media border border-warning/40 bg-warning-soft px-4 py-3">
                <span className="t-small">{s.name}</span>
                <span className="t-caption muted">
                  {s.requestedAt ? formatDateRu(s.requestedAt) : ''}
                </span>
                {s.username ? (
                  <Link href={`/ru/photographer/${s.username}`} className="t-caption underline muted">
                    {ru.adminBilling.openProfile}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="t-h3">{ru.adminBilling.subsTitle}</h2>
        {subs.length === 0 ? (
          <p className="mt-2 text-sm muted">{ru.adminBilling.subsEmpty}</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {subs.map((s) => (
              <li key={s.userId} className="rounded-media border border-line bg-surface-2 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="t-small">{s.name}</span>
                  <span className="t-caption muted">
                    {ru.pro.tierName[s.activeTier] ?? s.activeTier}
                    {/* Уровень «на бумаге» мог истечь — это видно сразу */}
                    {s.activeTier !== s.tier ? ` · ${ru.adminBilling.expired}` : ''}
                    {s.grandfathered ? ` · ${ru.adminBilling.founding}` : ''}
                  </span>
                </div>
                <p className="t-caption mt-1 muted">
                  {s.until ? ru.adminBilling.until(formatDateRu(s.until)) : ru.adminBilling.noEnd}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="t-h3">{ru.adminBilling.paymentsTitle}</h2>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm muted">{ru.adminBilling.paymentsEmpty}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="t-caption muted">
                <tr className="border-b border-line text-left">
                  <th className="py-2 pr-4">{ru.adminBilling.colWhen}</th>
                  <th className="py-2 pr-4">{ru.adminBilling.colWho}</th>
                  <th className="py-2 pr-4">{ru.adminBilling.colAmount}</th>
                  <th className="py-2 pr-4">{ru.adminBilling.colTier}</th>
                  <th className="py-2 pr-4">{ru.adminBilling.colStatus}</th>
                  <th className="py-2">{ru.adminBilling.colOrder}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-line/60">
                    <td className="py-2 pr-4 whitespace-nowrap">{formatDateTimeRu(p.createdAt)}</td>
                    <td className="py-2 pr-4">{p.who ?? ru.adminBilling.anonymised}</td>
                    <td className="py-2 pr-4 tnum whitespace-nowrap">{formatRubMinor(p.amountMinor)}</td>
                    <td className="py-2 pr-4">{ru.pro.tierName[p.tier] ?? p.tier}</td>
                    <td className="py-2 pr-4">{ru.adminBilling.status[p.status] ?? p.status}</td>
                    <td className="py-2 font-mono text-xs muted">{p.orderId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
