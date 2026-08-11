import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { adminDashboard, adminActivity } from '@/lib/admin-dashboard';
import { adminAnalysis } from '@/lib/admin-analysis';
import { formatDateTimeRu } from '@/lib/date-format';
import { ru } from '@/i18n/ru';
import { AdminNav } from '@/components/admin/AdminNav';
import { adminCounters } from '@/lib/admin-counters';

export const metadata: Metadata = { title: ru.adminHome.title };
export const dynamic = 'force-dynamic';

/**
 * Командный центр администратора.
 *
 * Порядок блоков — это ответ на вопрос «если у владельца десять секунд, что он
 * должен увидеть первым»: деньги, затем спрос, затем то, что ждёт его решения,
 * и только потом машинерия. Инфраструктура внизу не потому, что неважна, а
 * потому что она либо работает молча, либо кричит сама.
 *
 * Каждый блок, показывающий проблему, ведёт туда, где её решают, — «увидел и
 * пошёл искать вручную» здесь не считается работающим интерфейсом.
 */
function KpiCard({ labelKey, value, delta }: { labelKey: string; value: number; delta: number | null }) {
  const up = delta !== null && delta > 0;
  const down = delta !== null && delta < 0;
  return (
    <div className="rounded-media border border-line bg-surface-2 p-4">
      <p className="t-caption muted">{ru.adminHome.kpi[labelKey] ?? labelKey}</p>
      <p className="t-display mt-1 tabular-nums">{value}</p>
      {delta !== null && (
        <p className={`t-caption mt-1 ${up ? 'text-verified' : down ? 'text-danger' : 'muted'}`}>
          {up ? '+' : ''}{delta}% {ru.adminHome.toPrevPeriod}
        </p>
      )}
    </div>
  );
}

export default async function AdminHomePage() {
  if (!(await requireAdmin())) redirect('/ru/login');

  const counters = await adminCounters();
  const [data, activity, analysis] = await Promise.all([adminDashboard(30), adminActivity(40), adminAnalysis(30)]);
  const queueTotal =
    data.queues.profiles + data.queues.photos + data.queues.videos +
    data.queues.stories + data.queues.reports + data.queues.proRequests;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-10">
      <AdminNav counters={counters} />
      <h1 className="t-h2">{ru.adminHome.title}</h1>
      <p className="mt-1 text-sm muted">{ru.adminHome.lead(data.periodDays)}</p>

      {/* Деньги — то, ради чего всё строится. Стоит первым и остаётся первым,
          даже когда цифра нулевая: это и есть честный ответ «где мы» */}
      <section className="mt-6">
        <h2 className="t-title">{ru.adminHome.moneyTitle}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {data.money.map((k) => <KpiCard key={k.key} labelKey={k.key} value={k.value} delta={k.delta} />)}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="t-title">{ru.adminHome.demandTitle}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {data.demand.map((k) => <KpiCard key={k.key} labelKey={k.key} value={k.value} delta={k.delta} />)}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="t-title">{ru.adminHome.supplyTitle}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {data.supply.map((k) => <KpiCard key={k.key} labelKey={k.key} value={k.value} delta={k.delta} />)}
        </div>
      </section>

      {/* Воронка: панель отвечает «что происходит», воронка — «где рвётся».
          Без неё «заявок 40, съёмок 2» это цифры без вывода. */}
      <section className="mt-8">
        <h2 className="t-title">{ru.adminHome.funnelTitle}</h2>
        <p className="mt-1 t-caption muted">{ru.adminHome.funnelHint}</p>
        <ol className="mt-3 grid gap-2">
          {analysis.funnel.map((f) => (
            <li key={f.key}
              className="flex items-center justify-between gap-3 rounded-media border border-line bg-surface-2 px-4 py-3">
              <span className="t-small">{ru.adminHome.funnel[f.key] ?? f.key}</span>
              <span className="flex items-baseline gap-3">
                <span className="t-title tabular-nums">{f.count}</span>
                {f.ofPrev !== null && <span className="t-caption muted tabular-nums">{f.ofPrev}%</span>}
              </span>
            </li>
          ))}
        </ol>
        <dl className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-media border border-line bg-surface-2 p-3">
            <dt className="t-caption muted">{ru.adminHome.responseTime}</dt>
            <dd className="t-title tabular-nums">
              {analysis.medianResponseHours === null
                ? '—'
                : ru.adminHome.hours(Math.round(analysis.medianResponseHours))}
            </dd>
          </div>
          <div className="rounded-media border border-line bg-surface-2 p-3">
            <dt className="t-caption muted">{ru.adminHome.activation}</dt>
            <dd className="t-title tabular-nums">
              {analysis.activation.published} / {analysis.activation.approved}
            </dd>
          </div>
          <div className="rounded-media border border-line bg-surface-2 p-3">
            <dt className="t-caption muted">{ru.adminHome.returning}</dt>
            <dd className="t-title tabular-nums">
              {analysis.repeatClients.returning} / {analysis.repeatClients.withShoot}
            </dd>
          </div>
        </dl>
      </section>

      {/* Очереди — единственное место, где нужен именно администратор */}
      <section className="mt-10">
        <h2 className="t-title">{ru.adminHome.queuesTitle}</h2>
        {queueTotal === 0 ? (
          <p className="mt-2 text-sm muted">{ru.adminHome.queuesEmpty}</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              { n: data.queues.profiles, key: 'profiles', href: '/ru/admin/moderation' },
              { n: data.queues.photos, key: 'photos', href: '/ru/admin/moderation' },
              { n: data.queues.videos, key: 'videos', href: '/ru/admin/moderation' },
              { n: data.queues.stories, key: 'stories', href: '/ru/admin/moderation' },
              { n: data.queues.reports, key: 'reports', href: '/ru/admin/reports' },
              { n: data.queues.proRequests, key: 'proRequests', href: '/ru/admin/photographers' },
            ].filter((q) => q.n > 0).map((q) => (
              <li key={q.key}>
                {/* Блок с проблемой ведёт туда, где её решают */}
                <Link href={q.href}
                  className="flex items-center justify-between rounded-media border border-line bg-surface-2 px-4 py-3 hover:border-recognition">
                  <span className="t-small">{ru.adminHome.queue[q.key] ?? q.key}</span>
                  <span className="t-title tabular-nums">{q.n}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Лента: разнородные события одним списком, а не вкладкой на каждый тип */}
      <section className="mt-10">
        <h2 className="t-title">{ru.adminHome.activityTitle}</h2>
        {activity.length === 0 ? (
          <p className="mt-2 text-sm muted">{ru.adminHome.activityEmpty}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-media border border-line bg-surface-2">
            {activity.map((a, i) => (
              <li key={`${a.kind}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="t-small truncate">
                  {a.href ? <Link href={a.href} className="underline">{a.title}</Link> : a.title}
                </span>
                <time className="t-caption shrink-0 muted tabular-nums">{formatDateTimeRu(a.at)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Машинерия — внизу: она либо работает молча, либо кричит сама */}
      <section className="mt-10">
        <h2 className="t-title">{ru.adminHome.jobsTitle}</h2>
        <ul className="mt-3 grid gap-2">
          {data.jobs.map((j) => (
            <li key={j.name}
              className={`flex items-center justify-between gap-3 rounded-media border px-4 py-3 ${j.stale ? 'border-danger' : 'border-line'} bg-surface-2`}>
              <span className="t-small">{ru.adminHome.job[j.name] ?? j.name}</span>
              <span className={`t-caption ${j.stale ? 'text-danger' : 'muted'}`}>
                {j.lastRunAt
                  ? `${formatDateTimeRu(j.lastRunAt)}${j.ok === false ? ` — ${ru.adminHome.jobFailed}` : ''}`
                  : ru.adminHome.jobNever}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 t-caption muted">{ru.adminHome.jobsHint}</p>
      </section>

      <section className="mt-10 border-t border-line pt-6">
        <h2 className="t-title">{ru.adminHome.toolsTitle}</h2>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link href="/ru/admin/users" className="underline">{ru.adminUsers.title}</Link>
          <Link href="/ru/admin/moderation" className="underline">{ru.admin.moderationTitle}</Link>
          <Link href="/ru/admin/reports" className="underline">{ru.adminReports.title}</Link>
          <Link href="/ru/admin/audit" className="underline">{ru.adminAudit.title}</Link>
          <Link href="/ru/admin/mail" className="underline">{ru.adminMail.title}</Link>
          <Link href="/ru/admin/photographers/new" className="underline">{ru.adminHome.newPhotographer}</Link>
        </div>
      </section>

      {/* Глоссарий: в интерфейсе живут внутренние термины, и без расшифровки
          они читаются как шум даже для того, кто их же и завёл */}
      <section className="mt-10 border-t border-line pt-6">
        <h2 className="t-title">{ru.adminHome.glossaryTitle}</h2>
        <dl className="mt-3 grid gap-2 text-sm">
          {ru.adminHome.glossary.map(([term, meaning]) => (
            <div key={term} className="flex flex-wrap gap-x-2">
              <dt className="font-medium">{term}</dt>
              <dd className="muted">— {meaning}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
