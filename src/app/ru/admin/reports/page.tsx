import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { ru } from '@/i18n/ru';
import { formatDateRu } from '@/lib/date-format';
import { ReportCard } from './ReportCard';
import { PageHeader } from '@/components/PageHeader';
import { AdminNav } from '@/components/admin/AdminNav';
import { adminCounters } from '@/lib/admin-counters';

// Очередь жалоб (аудит 2026-07-31, P0): без неё жалоба уходила в никуда.
export const metadata: Metadata = { title: ru.adminReports.title };
export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  if (!(await requireAdmin())) redirect('/ru/login');

  // Фидбэк из продукта — история к телеграм-дублю (перепроверка 2026-09-10:
  // кнопка была, а смотреть записи было негде)
  const feedbacks = await db.feedback.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { user: { select: { firstName: true, lastName: true } } },
  });
  const reports = await db.report.findMany({
    where: { status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      reporter: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  const counters = await adminCounters();

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-10">
      <div className="max-w-4xl w-full">
      <AdminNav counters={counters} />
      <PageHeader
        crumbs={[{ href: '/ru/admin', label: ru.adminHome.title }]}
        title={ru.adminReports.title}
        lead={ru.adminNav.reportsLead}
      />
      <p className="mt-1 t-small muted">{ru.adminReports.lead}</p>

      {reports.length === 0 ? (
        <p className="mt-8 t-small muted">{ru.adminReports.empty}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {reports.map((r) => (
            <li key={r.id}>
              <ReportCard
                id={r.id}
                targetType={r.targetType}
                targetId={r.targetId}
                reason={r.reason}
                comment={r.comment}
                contactEmail={r.contactEmail}
                createdAt={formatDateRu(r.createdAt)}
                reporter={
                  r.reporter
                    ? `${r.reporter.firstName} ${r.reporter.lastName}`
                    : ru.adminReports.guestReporter
                }
              />
            </li>
          ))}
        </ul>
      )}

      <section className="mt-10">
        <h2 className="t-h3">{ru.adminFeedback.title}</h2>
        <p className="mt-1 t-small muted">{ru.adminFeedback.lead}</p>
        {feedbacks.length === 0 ? (
          <p className="mt-4 t-small muted">{ru.adminFeedback.empty}</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {feedbacks.map((fb) => (
              <li key={fb.id} className="rounded-sm border border-line bg-surface p-3">
                <p className="t-caption muted">
                  {fb.user ? `${fb.user.firstName} ${fb.user.lastName}` : ru.adminFeedback.guest}
                  {' · '}{formatDateRu(fb.createdAt)}{' · '}{ru.adminFeedback.page}: {fb.page}
                </p>
                <p className="mt-1 t-small whitespace-pre-wrap">{fb.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link href="/ru/admin/moderation" className="mt-8 inline-block t-small underline muted">
        ← {ru.admin.moderationTitle}
      </Link>
      </div>
    </main>
  );
}
