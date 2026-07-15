import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { twoFactorStatus } from '@/lib/two-factor';
import { ru } from '@/i18n/ru';
import { TwoFactorManager } from '@/components/TwoFactorManager';

export const metadata: Metadata = { title: ru.settings.title };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect('/ru/login');

  const status = await twoFactorStatus(session.userId);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <Link href="/ru/cabinet" className="text-sm underline muted">← {ru.cabinet.title}</Link>
      <h1 className="t-h2 mt-3">{ru.settings.title}</h1>
      <p className="mt-1 text-sm muted">{ru.settings.securityLead}</p>

      <section className="mt-6 card p-5 sm:p-6">
        <TwoFactorManager initial={status} />
      </section>
    </main>
  );
}
