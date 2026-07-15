import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { ru } from '@/i18n/ru';

export const metadata: Metadata = { title: ru.adminAudit.title };
export const dynamic = 'force-dynamic';

export default async function AdminAuditPage() {
  if (!(await requireAdmin())) redirect('/ru/login');

  const rows = await db.adminAudit.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { actor: { select: { firstName: true, lastName: true } } },
  });

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="t-h2">{ru.adminAudit.title}</h1>
      <p className="mt-1 text-sm muted">{ru.adminAudit.lead}</p>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm muted">{ru.adminAudit.empty}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase muted">
                <th className="py-2 pr-3">{ru.adminAudit.colTime}</th>
                <th className="py-2 pr-3">{ru.adminAudit.colActor}</th>
                <th className="py-2 pr-3">{ru.adminAudit.colAction}</th>
                <th className="py-2 pr-3">{ru.adminAudit.colTarget}</th>
                <th className="py-2">{ru.adminAudit.colMeta}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)} className="border-b border-line/60 align-top">
                  <td className="tnum py-2 pr-3 whitespace-nowrap muted">{r.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{r.actor.firstName} {r.actor.lastName}</td>
                  <td className="py-2 pr-3 whitespace-nowrap font-medium">{r.action}</td>
                  <td className="py-2 pr-3 whitespace-nowrap muted">{r.targetType} · {r.targetId.slice(0, 8)}</td>
                  <td className="py-2 font-mono text-xs muted">{r.meta ? JSON.stringify(r.meta) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
