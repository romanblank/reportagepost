import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { authorFunnel } from '@/lib/funnel';
import { AdminNav } from '@/components/admin/AdminNav';
import { PageHeader } from '@/components/PageHeader';
import { adminCounters } from '@/lib/admin-counters';
import { ru } from '@/i18n/ru';

export const metadata: Metadata = { title: ru.adminFunnel.title };
export const dynamic = 'force-dynamic';

/**
 * Воронка авторов (оценка 2026-09-10): вопрос второго дня беты — «из 20
 * приглашённых зарегистрировались 14, анкету начали 9, где отваливаются?».
 * На масштабе беты поимённые списки застрявших ценнее процентов: оператор
 * работает с именами — позвонить, помочь, довести.
 */
export default async function AdminFunnelPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/ru/login');

  const [funnel, counters] = await Promise.all([authorFunnel(90), adminCounters()]);
  const total = funnel.steps[0]?.count ?? 0;
  // Ключ типизирован юнионом FunnelStepKey — забытый перевод не пройдёт typecheck
  // (as Record снял бы проверку — грабля из CLAUDE.md про словарные карты)
  const stepLabel = (key: keyof typeof ru.adminFunnel.steps) => ru.adminFunnel.steps[key];

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10">
      <div className="max-w-4xl w-full">
        <PageHeader
          crumbs={[{ href: '/ru/admin', label: ru.adminHome.title }]}
          title={ru.adminFunnel.title}
          lead={ru.adminFunnel.lead}
        />
        <AdminNav counters={counters} />
        <p className="t-small muted mt-6">{ru.adminFunnel.periodNote(funnel.periodDays)}</p>

        {total === 0 ? (
          <p className="t-body mt-8 muted">{ru.adminFunnel.empty}</p>
        ) : (
          <ol className="mt-6 flex flex-col gap-1.5">
            {funnel.steps.map((step) => {
              const width = total > 0 ? Math.max(4, Math.round((step.count / total) * 100)) : 0;
              return (
                <li key={step.key} className="rounded-sm border border-line bg-surface p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="t-small font-medium">{stepLabel(step.key)}</span>
                    <span className="tnum t-small">{step.count}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-surface-2">
                    <div className="h-1.5 rounded-full bg-accent" style={{ width: `${width}%` }} />
                  </div>
                  {step.stuck.length > 0 && (
                    <div className="mt-2">
                      <span className="t-caption muted">{ru.adminFunnel.stuckTitle}:</span>{' '}
                      <span className="t-caption">
                        {step.stuck.map((p, i) => (
                          <span key={`${p.name}-${i}`}>
                            {i > 0 && ', '}
                            {p.username ? (
                              <Link href={`/ru/photographer/${p.username}`} className="underline decoration-line underline-offset-2 hover:text-ink">
                                {p.name}
                              </Link>
                            ) : (
                              p.name
                            )}{' '}
                            <span className="muted">({ru.adminFunnel.stuckDays(p.sinceDays)})</span>
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </main>
  );
}
