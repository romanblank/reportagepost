import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { invitesList } from '@/lib/invites';
import { APP_DOMAIN } from '@/lib/constants';
import { ru } from '@/i18n/ru';
import { formatDateRu } from '@/lib/date-format';
import { InviteCreator } from './InviteCreator';
import { CopyLink } from './CopyLink';

export const metadata: Metadata = { title: ru.adminInvites.title };
export const dynamic = 'force-dynamic';

export default async function AdminInvitesPage() {
  if (!(await requireAdmin())) redirect('/ru/login');
  const invites = await invitesList();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-semibold sm:text-3xl">{ru.adminInvites.title}</h1>

      <h2 className="mt-6 text-lg font-medium">{ru.adminInvites.createTitle}</h2>
      <InviteCreator />

      <h2 className="mt-8 text-lg font-medium">{ru.adminInvites.listTitle}</h2>
      {invites.length === 0 ? (
        <p className="mt-3 text-sm muted">{ru.adminInvites.empty}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-line text-left muted">
                <th className="py-2 pr-3 font-medium">{ru.adminInvites.colNote}</th>
                <th className="py-2 pr-3 font-medium">{ru.adminInvites.colCode}</th>
                <th className="py-2 pr-3 font-medium">{ru.adminInvites.colUsed}</th>
                <th className="py-2 pr-3 font-medium">{ru.adminInvites.colRegistered}</th>
                <th className="py-2 pr-3 font-medium">{ru.adminInvites.colExpires}</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.id} className="border-b border-line/50">
                  <td className="py-2 pr-3">{inv.note ?? '—'}</td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-col gap-0.5">
                      <code className="text-xs">{inv.code}</code>
                      <CopyLink link={`https://${APP_DOMAIN}/ru/register?invite=${inv.code}`} />
                    </div>
                  </td>
                  <td className="py-2 pr-3">{inv.usedCount} / {inv.maxUses}</td>
                  <td className="py-2 pr-3">{inv.registered}</td>
                  <td className="py-2 pr-3">
                    {inv.expiresAt ? formatDateRu(inv.expiresAt) : ru.adminInvites.noExpiry}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
