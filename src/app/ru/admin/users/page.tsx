import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { searchUsers, realUserCount, USERS_PER_PAGE } from '@/lib/admin-users';
import { formatDateRu } from '@/lib/date-format';
import { ru } from '@/i18n/ru';
import { PageHeader } from '@/components/PageHeader';
import { Pager } from '@/components/Pager';
import { AdminNav } from '@/components/admin/AdminNav';
import { adminCounters } from '@/lib/admin-counters';

export const metadata: Metadata = { title: ru.adminUsers.title };
export const dynamic = 'force-dynamic';

/**
 * Люди на платформе.
 *
 * Раньше администратор мог работать только с контентом: найти человека,
 * посмотреть, что он делал, и закрыть доступ спамеру было нечем — единственным
 * рычагом оставалось гашение анкеты, то есть наказание за поведение решалось
 * через контент.
 */
export default async function AdminUsersPage(props: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  if (!(await requireAdmin())) redirect('/ru/login');
  const { q, page: rawPage } = await props.searchParams;
  const page = Math.max(1, Number(rawPage ?? 1) || 1);

  const counters = await adminCounters();
  const [{ items: rows, total: found }, total] = await Promise.all([
    searchUsers(q ?? '', page),
    realUserCount(),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
      <AdminNav counters={counters} />
      <PageHeader
        crumbs={[{ href: '/ru/admin', label: ru.adminHome.title }]}
        title={ru.adminUsers.title}
        lead={ru.adminNav.usersLead}
      />
      <h1 className="t-h2 mt-3">{ru.adminUsers.title}</h1>
      <p className="mt-1 text-sm muted">{ru.adminUsers.lead(total)}</p>

      <form method="get" className="mt-5 flex flex-wrap gap-2">
        <label className="min-w-[240px] flex-1">
          <span className="sr-only">{ru.adminUsers.searchLabel}</span>
          <input name="q" defaultValue={q ?? ''} placeholder={ru.adminUsers.searchPlaceholder}
            className="field-input" />
        </label>
        <button type="submit" className="btn btn-outline">{ru.adminUsers.searchCta}</button>
      </form>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm muted">{ru.adminUsers.empty}</p>
      ) : (
        <ul className="mt-5 divide-y divide-line rounded-media border border-line bg-surface-2">
          {rows.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <Link href={`/ru/admin/users/${u.id}`} className="t-small underline">
                  {u.firstName} {u.lastName}
                </Link>
                <p className="t-caption muted">
                  {u.email ?? '—'} · {ru.adminUsers.role[u.role] ?? u.role}
                  {u.username && <> · {u.username}</>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {u.status === 'BANNED' && (
                  <span className="t-caption text-danger">{ru.adminUsers.blocked}</span>
                )}
                <time className="t-caption muted tabular-nums">{formatDateRu(u.createdAt)}</time>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager
        base={q ? `/ru/admin/users?q=${encodeURIComponent(q)}` : '/ru/admin/users'}
        page={page}
        total={found}
        perPage={USERS_PER_PAGE}
      />
    </main>
  );
}
