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
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-10">
      <AdminNav counters={counters} />
      <PageHeader
        crumbs={[{ href: '/ru/admin', label: ru.adminHome.title }]}
        title={ru.adminReports.title}
        lead={ru.adminNav.reportsLead}
      />
      <p className="mt-1 text-sm muted">{ru.adminReports.lead}</p>

      {reports.length === 0 ? (
        <p className="mt-8 text-sm muted">{ru.adminReports.empty}</p>
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

      <Link href="/ru/admin/moderation" className="mt-8 inline-block text-sm underline muted">
        ← {ru.admin.moderationTitle}
      </Link>
    </main>
  );
}
