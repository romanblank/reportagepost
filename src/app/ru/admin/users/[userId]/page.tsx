import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { userCard } from '@/lib/admin-users';
import { UserActions } from '@/components/admin/UserActions';
import { formatDateTimeRu } from '@/lib/date-format';
import { ru } from '@/i18n/ru';
import { PageHeader } from '@/components/PageHeader';

export const metadata: Metadata = { title: ru.adminUsers.cardTitle };
export const dynamic = 'force-dynamic';

/**
 * Карточка человека: всё, что нужно для решения, в одном месте.
 *
 * Здесь намеренно видны и контакты, и активность: администратор разбирает
 * жалобы, и решение «спамер или живой автор» принимается по совокупности, а не
 * по одному сигналу. Каждое действие отсюда пишется в аудит-лог.
 */
export default async function AdminUserPage(props: { params: Promise<{ userId: string }> }) {
  if (!(await requireAdmin())) redirect('/ru/login');
  const { userId } = await props.params;
  const u = await userCard(userId);
  if (!u) notFound();

  const facts: [string, string][] = [
    [ru.adminUsers.fieldEmail, u.email ?? '—'],
    [ru.adminUsers.fieldEmailVerified, u.emailVerifiedAt ? formatDateTimeRu(u.emailVerifiedAt) : ru.adminUsers.no],
    [ru.adminUsers.fieldPhone, u.phone ?? '—'],
    [ru.adminUsers.fieldRole, ru.adminUsers.role[u.role] ?? u.role],
    [ru.adminUsers.fieldStatus, u.status === 'BANNED' ? ru.adminUsers.blocked : ru.adminUsers.active],
    [ru.adminUsers.fieldRegistered, formatDateTimeRu(u.createdAt)],
    [ru.adminUsers.fieldLastSeen, u.lastSeenAt ? formatDateTimeRu(u.lastSeenAt) : '—'],
    [ru.adminUsers.field2fa, u.twoFactorEnabled ? ru.adminUsers.yes : ru.adminUsers.no],
    [ru.adminUsers.fieldSubscription, u.subscription ? u.subscription.tier : '—'],
  ];

  const activity: [string, number][] = [
    [ru.adminUsers.actPhotos, u.counts.photos],
    [ru.adminUsers.actVideos, u.counts.videos],
    [ru.adminUsers.actReviews, u.counts.reviewsWritten],
    [ru.adminUsers.actMessages, u.counts.messagesSent],
    [ru.adminUsers.actInquiries, u.counts.inquiries],
    [ru.adminUsers.actReports, u.counts.reportsAgainst],
  ];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <PageHeader
        crumbs={[{ href: '/ru/admin', label: ru.adminHome.title }, { href: '/ru/admin/users', label: ru.adminUsers.title }]}
        title={`${u.firstName} ${u.lastName}`}
      />
      {u.profile && (
        <p className="mt-1 text-sm">
          <Link href={`/ru/photographer/${u.profile.username}`} className="underline">
            {ru.adminUsers.openProfile}
          </Link>
          <span className="muted"> · {u.profile.status}</span>
        </p>
      )}

      <dl className="mt-6 grid gap-2 rounded-media border border-line bg-surface-2 p-4 text-sm">
        {facts.map(([k, v]) => (
          <div key={k} className="flex flex-wrap justify-between gap-3">
            <dt className="muted">{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>

      <h2 className="t-title mt-8">{ru.adminUsers.activityTitle}</h2>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {activity.map(([k, v]) => (
          <div key={k} className="rounded-media border border-line bg-surface-2 p-3">
            <dt className="t-caption muted">{k}</dt>
            <dd className="t-title tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 border-t border-line pt-6">
        <UserActions userId={u.id} blocked={u.status === 'BANNED'} isAdmin={u.role === 'ADMIN'} />
      </div>
    </main>
  );
}
