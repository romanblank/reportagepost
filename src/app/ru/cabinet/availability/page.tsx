import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { ru } from '@/i18n/ru';
import { AvailabilityCalendar } from '@/components/AvailabilityCalendar';

export const metadata: Metadata = { title: ru.availability.title };
export const dynamic = 'force-dynamic';

export default async function AvailabilityPage() {
  const session = await getSession();
  if (!session) redirect('/ru/login');
  if (session.role !== 'PHOTOGRAPHER') redirect('/ru/cabinet');

  const profile = await db.photographerProfile.findUnique({
    where: { userId: session.userId },
    select: { id: true, status: true },
  });

  const busy =
    profile?.status === 'APPROVED'
      ? await db.busyDate.findMany({
          where: { profileId: profile.id, date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
          orderBy: { date: 'asc' },
          select: { date: true },
        })
      : [];

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">
      <Link href="/ru/cabinet" className="text-sm underline muted">← {ru.cabinet.title}</Link>
      <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">{ru.availability.title}</h1>

      {profile?.status !== 'APPROVED' ? (
        <p className="mt-4 text-sm muted">{ru.availability.locked}</p>
      ) : (
        <>
          <p className="mt-2 text-sm muted">{ru.availability.lead}</p>
          <div className="mt-6 card p-4">
            <AvailabilityCalendar initialBusy={busy.map((b) => b.date.toISOString().slice(0, 10))} />
          </div>
        </>
      )}
    </main>
  );
}
